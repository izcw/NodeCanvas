from __future__ import annotations

import json
import secrets
import sqlite3
from pathlib import Path
from threading import Lock
from typing import Any

from Agent.nodecanvas_agent.models import AgentRunResult, GraphSnapshot, utc_now


class SQLiteRepository:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = Lock()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS graph_snapshots (
                    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
                    revision INTEGER NOT NULL,
                    graph_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS agent_runs (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    source_node_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS context_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
                    snapshot_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS knowledge_documents (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    content TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'indexed',
                    index_error TEXT,
                    indexed_at TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS knowledge_chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
                    ordinal INTEGER NOT NULL,
                    content TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS share_links (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    graph_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id, ordinal);
                CREATE INDEX IF NOT EXISTS idx_share_links_project ON share_links(project_id, created_at DESC);
                """
            )
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(projects)").fetchall()}
            if "cover_url" not in columns:
                connection.execute("ALTER TABLE projects ADD COLUMN cover_url TEXT")
            knowledge_columns = {row["name"] for row in connection.execute("PRAGMA table_info(knowledge_documents)").fetchall()}
            if "status" not in knowledge_columns:
                connection.execute("ALTER TABLE knowledge_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'indexed'")
            if "index_error" not in knowledge_columns:
                connection.execute("ALTER TABLE knowledge_documents ADD COLUMN index_error TEXT")
            if "indexed_at" not in knowledge_columns:
                connection.execute("ALTER TABLE knowledge_documents ADD COLUMN indexed_at TEXT")

    def ensure_project(self, project_id: str, title: str = "NodeCanvas 项目") -> None:
        now = utc_now()
        with self.connect() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO projects (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (project_id, title, now, now),
            )

    def list_projects(self) -> list[dict[str, str]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT p.id, p.title, p.created_at, p.updated_at, p.cover_url, g.graph_json
                FROM projects p
                LEFT JOIN graph_snapshots g ON g.project_id = p.id
                ORDER BY p.updated_at DESC
                """
            ).fetchall()
        projects: list[dict[str, str | None]] = []
        for row in rows:
            project = dict(row)
            cover = project.pop("cover_url", None) or self._first_image_url(project.pop("graph_json", None))
            project["cover_url"] = cover
            projects.append(project)
        return projects  # type: ignore[return-value]

    @staticmethod
    def _first_image_url(graph_json: str | None) -> str | None:
        if not graph_json:
            return None
        try:
            nodes = json.loads(graph_json).get("nodes", [])
        except (TypeError, json.JSONDecodeError):
            return None
        for node in nodes:
            if node.get("type") != "image":
                continue
            image_url = node.get("data", {}).get("imageUrl")
            if isinstance(image_url, str) and image_url:
                return image_url
        return None

    def create_project(self, project_id: str, title: str) -> dict[str, str]:
        now = utc_now()
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO projects (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (project_id, title, now, now),
            )
        return {"id": project_id, "title": title, "created_at": now, "updated_at": now, "cover_url": None}

    def rename_project(self, project_id: str, title: str) -> dict[str, str] | None:
        now = utc_now()
        with self.connect() as connection:
            connection.execute("UPDATE projects SET title = ?, updated_at = ? WHERE id = ?", (title, now, project_id))
            row = connection.execute("SELECT id, title, created_at, updated_at, cover_url FROM projects WHERE id = ?", (project_id,)).fetchone()
        return dict(row) if row else None

    def delete_project(self, project_id: str) -> bool:
        with self.connect() as connection:
            return connection.execute("DELETE FROM projects WHERE id = ?", (project_id,)).rowcount > 0

    def update_project_cover(self, project_id: str, cover: str | None) -> dict[str, str | None] | None:
        now = utc_now()
        with self.connect() as connection:
            connection.execute("UPDATE projects SET cover_url = ?, updated_at = ? WHERE id = ?", (cover, now, project_id))
            row = connection.execute("SELECT id, title, created_at, updated_at, cover_url FROM projects WHERE id = ?", (project_id,)).fetchone()
        return dict(row) if row else None

    def copy_project(self, source_id: str, project_id: str, title: str) -> dict[str, str] | None:
        now = utc_now()
        with self._write_lock, self.connect() as connection:
            source = connection.execute("SELECT id, cover_url FROM projects WHERE id = ?", (source_id,)).fetchone()
            if not source:
                return None
            connection.execute(
                "INSERT INTO projects (id, title, created_at, updated_at, cover_url) VALUES (?, ?, ?, ?, ?)",
                (project_id, title, now, now, source["cover_url"]),
            )
            graph = connection.execute(
                "SELECT revision, graph_json FROM graph_snapshots WHERE project_id = ?", (source_id,)
            ).fetchone()
            if graph:
                connection.execute(
                    "INSERT INTO graph_snapshots (project_id, revision, graph_json, updated_at) VALUES (?, ?, ?, ?)",
                    (project_id, graph["revision"], graph["graph_json"], now),
                )
        return {"id": project_id, "title": title, "created_at": now, "updated_at": now, "cover_url": source["cover_url"]}

    def get_graph(self, project_id: str) -> GraphSnapshot | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT revision, graph_json FROM graph_snapshots WHERE project_id = ?",
                (project_id,),
            ).fetchone()
        if not row:
            return None
        payload = json.loads(row["graph_json"])
        payload["revision"] = row["revision"]
        return GraphSnapshot.model_validate(payload)

    def save_graph(self, project_id: str, graph: GraphSnapshot) -> GraphSnapshot:
        self.ensure_project(project_id)
        now = utc_now()
        with self._write_lock, self.connect() as connection:
            row = connection.execute(
                "SELECT revision FROM graph_snapshots WHERE project_id = ?",
                (project_id,),
            ).fetchone()
            revision = (row["revision"] if row else 0) + 1
            stored = graph.model_copy(update={"revision": revision})
            payload = stored.model_dump(mode="json", exclude={"revision"})
            connection.execute(
                """
                INSERT INTO graph_snapshots (project_id, revision, graph_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET
                    revision = excluded.revision,
                    graph_json = excluded.graph_json,
                    updated_at = excluded.updated_at
                """,
                (project_id, revision, json.dumps(payload, ensure_ascii=False), now),
            )
            connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
        return stored

    def save_run(self, project_id: str, prompt: str, result: AgentRunResult) -> None:
        self.ensure_project(project_id)
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO agent_runs
                    (id, project_id, source_node_id, status, provider, prompt, result_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    result.run_id,
                    project_id,
                    result.context.source_node_id,
                    result.status,
                    result.provider,
                    prompt,
                    result.model_dump_json(),
                    result.created_at,
                ),
            )
            connection.execute(
                "INSERT INTO context_snapshots (run_id, snapshot_json, created_at) VALUES (?, ?, ?)",
                (result.run_id, result.context.model_dump_json(), result.context.created_at),
            )

    def create_share_link(self, project_id: str, graph: GraphSnapshot) -> str:
        self.ensure_project(project_id)
        share_id = secrets.token_urlsafe(10)
        payload = graph.model_dump_json(exclude={"revision"})
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO share_links (id, project_id, graph_json, created_at) VALUES (?, ?, ?, ?)",
                (share_id, project_id, payload, utc_now()),
            )
        return share_id

    def get_shared_graph(self, share_id: str) -> GraphSnapshot | None:
        with self.connect() as connection:
            row = connection.execute("SELECT graph_json FROM share_links WHERE id = ?", (share_id,)).fetchone()
        return GraphSnapshot.model_validate_json(row["graph_json"]) if row else None

    def list_runs(self, project_id: str, limit: int = 20) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, source_node_id, status, provider, prompt, created_at
                FROM agent_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?
                """,
                (project_id, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def add_knowledge_document(self, project_id: str, document_id: str, name: str, kind: str, content: str, status: str = "indexed") -> None:
        self.ensure_project(project_id)
        chunks = chunk_text(content)
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO knowledge_documents (id, project_id, name, kind, content, status, indexed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (document_id, project_id, name, kind, content, status, utc_now() if status == "indexed" else None, utc_now()),
            )
            connection.executemany(
                "INSERT INTO knowledge_chunks (document_id, ordinal, content) VALUES (?, ?, ?)",
                [(document_id, index, chunk) for index, chunk in enumerate(chunks)],
            )

    def list_knowledge_documents(self, project_id: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT id, name, kind, length(content) AS size, status, created_at FROM knowledge_documents WHERE project_id = ? ORDER BY created_at DESC",
                (project_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def knowledge_document(self, project_id: str, document_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT id, name, kind, content, status FROM knowledge_documents WHERE project_id = ? AND id = ?",
                (project_id, document_id),
            ).fetchone()
        return dict(row) if row else None

    def set_knowledge_index_status(self, project_id: str, document_id: str, status: str, error: str | None = None) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE knowledge_documents SET status = ?, index_error = ?, indexed_at = ? WHERE project_id = ? AND id = ?",
                (status, error, utc_now() if status == "indexed" else None, project_id, document_id),
            )

    def knowledge_chunks(self, project_id: str, document_id: str) -> list[str]:
        """Return canonical chunks so a derived vector index can be rebuilt."""
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT kc.content FROM knowledge_chunks kc
                JOIN knowledge_documents kd ON kd.id = kc.document_id
                WHERE kd.project_id = ? AND kd.id = ? ORDER BY kc.ordinal
                """,
                (project_id, document_id),
            ).fetchall()
        return [row["content"] for row in rows]

    def all_knowledge_chunks(self) -> list[tuple[str, str, list[str]]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT kd.project_id, kc.document_id, kc.ordinal, kc.content
                FROM knowledge_chunks kc JOIN knowledge_documents kd ON kd.id = kc.document_id
                ORDER BY kd.project_id, kc.document_id, kc.ordinal
                """
            ).fetchall()
        grouped: dict[tuple[str, str], list[str]] = {}
        for row in rows:
            grouped.setdefault((row["project_id"], row["document_id"]), []).append(row["content"])
        return [(project_id, document_id, chunks) for (project_id, document_id), chunks in grouped.items()]

    def delete_knowledge_document(self, project_id: str, document_id: str) -> bool:
        """Remove a document and its indexed chunks (via the FK cascade)."""
        with self.connect() as connection:
            return connection.execute(
                "DELETE FROM knowledge_documents WHERE project_id = ? AND id = ?",
                (project_id, document_id),
            ).rowcount > 0

    def search_knowledge(self, project_id: str, query: str, limit: int = 6) -> list[str]:
        terms = [term for term in re_split(query.lower()) if len(term) > 1][:12]
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT kd.name, kc.content
                FROM knowledge_chunks kc
                JOIN knowledge_documents kd ON kd.id = kc.document_id
                WHERE kd.project_id = ?
                ORDER BY kc.id DESC
                LIMIT 200
                """,
                (project_id,),
            ).fetchall()
        scored = []
        for row in rows:
            content = row["content"]
            lowered = content.lower()
            score = sum(lowered.count(term) for term in terms)
            if score or not terms:
                scored.append((score, row["name"], content))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [f"[{name}] {content}" for _, name, content in scored[:limit]]


def chunk_text(content: str, chunk_size: int = 900, overlap: int = 120) -> list[str]:
    normalized = "\n".join(line.strip() for line in content.splitlines() if line.strip())
    if not normalized:
        return []
    chunks = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + chunk_size)
        chunks.append(normalized[start:end])
        if end == len(normalized):
            break
        start = max(start + 1, end - overlap)
    return chunks


def re_split(value: str) -> list[str]:
    import re

    return re.findall(r"[\w\u4e00-\u9fff]+", value)
