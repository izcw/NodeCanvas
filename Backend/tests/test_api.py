from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from Agent.nodecanvas_agent.provider import DeterministicProvider
from Agent.nodecanvas_agent.workflow import AgentWorkflow
from Backend.nodecanvas_backend import main
from Backend.nodecanvas_backend.api_models import ModelConnectionTestResponse
from Backend.nodecanvas_backend.repository import SQLiteRepository


def test_agent_endpoint_persists_run_and_graph(tmp_path: Path) -> None:
    main.repository = SQLiteRepository(tmp_path / "api.db")
    main.workflow = AgentWorkflow(provider=DeterministicProvider())
    with TestClient(main.app) as client:
        payload = {
            "source_node_id": "agent-1",
            "prompt": "生成两个传播方向",
            "model": "test-model",
            "generation_type": "文本",
            "grid": {"rows": 1, "columns": 2},
            "graph": {
                "nodes": [
                    {"id": "brief-1", "type": "text", "position": {"x": 0, "y": 0}, "data": {"title": "简报", "content": "磁轴键盘"}},
                    {"id": "agent-1", "type": "agent", "position": {"x": 500, "y": 0}, "data": {"title": "Agent"}},
                ],
                "edges": [{"id": "e1", "source": "brief-1", "target": "agent-1", "sourceHandle": "right-source", "targetHandle": "left-target"}],
            },
        }
        response = client.post("/api/projects/test/agent/runs", json=payload)

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["run"]["provider"] == "deterministic-local"
        assert len(body["run"]["candidates"]) == 2
        assert len(body["graph"]["nodes"]) == 4
        assert len(client.get("/api/projects/test/agent/runs").json()["items"]) == 1


def test_model_connection_endpoint_does_not_persist_credentials(tmp_path: Path, monkeypatch) -> None:
    main.repository = SQLiteRepository(tmp_path / "models.db")
    monkeypatch.setattr(main, "test_model_connection", lambda _: ModelConnectionTestResponse(ok=True, latency_ms=12, message="模型连接成功"))
    with TestClient(main.app) as client:
        response = client.post("/api/models/test", json={
            "name": "Test",
            "model_id": "test-model",
            "base_url": "https://example.com/v1",
            "api_key": "secret-only-for-request",
            "protocol": "openai-chat",
        })
        assert response.status_code == 200
        assert response.json() == {"ok": True, "latency_ms": 12, "message": "模型连接成功"}
        with main.repository.connect() as connection:
            tables = connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        assert all("model" not in row["name"] for row in tables)


def test_share_link_returns_a_read_only_graph_snapshot(tmp_path: Path) -> None:
    main.repository = SQLiteRepository(tmp_path / "share.db")
    with TestClient(main.app) as client:
        graph = {
            "nodes": [{"id": "n1", "type": "text", "position": {"x": 0, "y": 0}, "data": {"title": "Shared"}}],
            "edges": [],
        }
        created = client.post("/api/projects/test/shares", json=graph)
        assert created.status_code == 200, created.text
        shared = client.get(f"/api/shares/{created.json()['id']}")
        assert shared.status_code == 200, shared.text
        assert shared.json()["nodes"][0]["data"]["title"] == "Shared"


def test_project_directory_lists_existing_and_new_projects(tmp_path: Path) -> None:
    main.repository = SQLiteRepository(tmp_path / "projects.db")
    with TestClient(main.app) as client:
        created = client.post("/api/projects", json={"id": "launch", "title": "发布策划"})
        assert created.status_code == 201, created.text
        assert created.json()["title"] == "发布策划"

        image_url = "https://example.com/cover.png"
        graph = {"nodes": [{"id": "image-1", "type": "image", "position": {"x": 0, "y": 0}, "data": {"title": "封面", "imageUrl": image_url}}], "edges": []}
        assert client.put("/api/projects/launch/graph", json=graph).status_code == 200
        listed_launch = next(item for item in client.get("/api/projects").json() if item["id"] == "launch")
        assert listed_launch["cover_url"] == image_url

        cover = "data:image/png;base64,cHJvamVjdC1jb3Zlcg=="
        updated_cover = client.patch("/api/projects/launch/cover", json={"cover": cover})
        assert updated_cover.status_code == 200, updated_cover.text
        assert updated_cover.json()["cover_url"] == cover

        projects = client.get("/api/projects")
        assert projects.status_code == 200
        assert {item["id"] for item in projects.json()} >= {"default", "launch"}

        renamed = client.patch("/api/projects/launch", json={"title": "发布策划 V2"})
        assert renamed.status_code == 200
        assert renamed.json()["title"] == "发布策划 V2"
        copied = client.post("/api/projects/launch/copies", json={"id": "launch-copy", "title": "发布策划 V2 副本"})
        assert copied.status_code == 201, copied.text
        assert copied.json()["title"] == "发布策划 V2 副本"
        assert copied.json()["cover_url"] == cover
        assert client.delete("/api/projects/launch").status_code == 204
