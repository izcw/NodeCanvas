from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Iterable

import httpx


class EmbeddingProvider:
    """OpenAI-compatible embeddings with a deterministic offline fallback.

    The fallback keeps local development and tests runnable. Production should
    set NODECANVAS_EMBEDDING_BASE_URL and credentials for a real embedding model.
    """

    def __init__(self, *, base_url: str | None, api_key: str | None, model: str, dimensions: int):
        self.base_url = base_url
        self.api_key = api_key
        self.model = model
        self.dimensions = dimensions

    @property
    def provider_name(self) -> str:
        return "openai-compatible" if self.base_url else "local-hash"

    def embed(self, text: str) -> list[float]:
        if self.base_url:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            response = httpx.post(
                f"{self.base_url}/embeddings",
                headers=headers,
                json={"model": self.model, "input": text, "dimensions": self.dimensions},
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
            vector = payload["data"][0]["embedding"]
            if not isinstance(vector, list) or len(vector) != self.dimensions:
                raise RuntimeError(f"embedding dimensions must equal {self.dimensions}")
            return [float(value) for value in vector]
        return self._hash_embed(text)

    def _hash_embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        terms = re.findall(r"[\w\u4e00-\u9fff]+", text.lower())
        for term in terms:
            digest = hashlib.blake2b(term.encode("utf-8"), digest_size=8).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            vector[index] += 1.0 if digest[4] & 1 else -1.0
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]


class PgvectorKnowledgeIndex:
    """Derived pgvector index; SQLite remains the transactional project store."""

    def __init__(self, database_url: str | None, embeddings: EmbeddingProvider):
        self.database_url = database_url
        self.embeddings = embeddings

    @property
    def enabled(self) -> bool:
        return bool(self.database_url)

    def _connect(self):
        if not self.database_url:
            raise RuntimeError("pgvector is not configured")
        try:
            import psycopg
        except ImportError as exc:  # pragma: no cover - dependency installation error
            raise RuntimeError("psycopg is required for pgvector retrieval") from exc
        return psycopg.connect(self.database_url)

    def initialize(self) -> None:
        if not self.enabled:
            return
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS nodecanvas_knowledge_vectors (
                    project_id TEXT NOT NULL,
                    document_id TEXT NOT NULL,
                    document_name TEXT NOT NULL,
                    ordinal INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    embedding vector({self.embeddings.dimensions}) NOT NULL,
                    PRIMARY KEY (project_id, document_id, ordinal)
                )
                """
            )
            cursor.execute(
                "ALTER TABLE nodecanvas_knowledge_vectors "
                "ADD COLUMN IF NOT EXISTS document_name TEXT NOT NULL DEFAULT ''"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_nodecanvas_knowledge_vectors_project "
                "ON nodecanvas_knowledge_vectors (project_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_nodecanvas_knowledge_vectors_embedding "
                "ON nodecanvas_knowledge_vectors USING hnsw (embedding vector_cosine_ops)"
            )

    @staticmethod
    def _literal(vector: list[float]) -> str:
        return "[" + ",".join(f"{value:.8f}" for value in vector) + "]"

    def index_document(self, project_id: str, document_id: str, document_name: str, chunks: Iterable[str]) -> None:
        if not self.enabled:
            return
        rows = [(project_id, document_id, document_name, ordinal, chunk, self._literal(self.embeddings.embed(chunk))) for ordinal, chunk in enumerate(chunks)]
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM nodecanvas_knowledge_vectors WHERE project_id = %s AND document_id = %s",
                (project_id, document_id),
            )
            if rows:
                cursor.executemany(
                    "INSERT INTO nodecanvas_knowledge_vectors "
                    "(project_id, document_id, document_name, ordinal, content, embedding) VALUES (%s, %s, %s, %s, %s, %s::vector)",
                    rows,
                )

    def delete_document(self, project_id: str, document_id: str) -> None:
        if not self.enabled:
            return
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM nodecanvas_knowledge_vectors WHERE project_id = %s AND document_id = %s",
                (project_id, document_id),
            )

    def search(self, project_id: str, query: str, limit: int = 6) -> list[str]:
        if not self.enabled:
            return []
        embedding = self._literal(self.embeddings.embed(query))
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT document_name, content FROM nodecanvas_knowledge_vectors WHERE project_id = %s "
                "ORDER BY embedding <=> %s::vector LIMIT %s",
                (project_id, embedding, limit),
            )
            return [f"[{row[0]}] {row[1]}" for row in cursor.fetchall()]
