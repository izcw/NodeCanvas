from __future__ import annotations

from pathlib import Path
import json
from concurrent.futures import ThreadPoolExecutor
from threading import Event

from fastapi.testclient import TestClient

from Agent.nodecanvas_agent.provider import DeterministicProvider
from Agent.nodecanvas_agent.workflow import AgentWorkflow
from Backend.nodecanvas_backend import main
from Backend.nodecanvas_backend.api_models import ModelConnectionTestResponse
from Backend.nodecanvas_backend.repository import SQLiteRepository


class ReasoningStreamProvider(DeterministicProvider):
    def stream_chat_events(self, **kwargs):
        yield "reasoning", "先识别目标受众，再整理交付要求。"
        yield "content", "面向职业 FPS 玩家，"
        yield "content", "交付一套可量化的传播方案。"


class BlockingProvider(DeterministicProvider):
    def __init__(self, started: Event, release: Event):
        self.started = started
        self.release = release

    def generate(self, **kwargs):
        self.started.set()
        if not self.release.wait(timeout=3):
            raise RuntimeError("blocking provider timed out")
        return super().generate(**kwargs)


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
        history = client.get("/api/projects/test/agent/runs").json()["items"]
        assert len(history) == 1
        assert history[0]["prompt"] == "生成两个传播方向"
        assert history[0]["operation_mode"] == "agent"
        assert history[0]["title"] == "Agent"
        assert history[0]["response"]


def test_cancelled_agent_run_never_writes_generated_nodes(tmp_path: Path) -> None:
    main.repository = SQLiteRepository(tmp_path / "cancel-agent.db")
    main.workflow = AgentWorkflow(provider=DeterministicProvider())
    main.cancelled_runs.clear()
    graph = {
        "nodes": [
            {"id": "brief-1", "type": "text", "position": {"x": 0, "y": 0}, "data": {"title": "旅游需求", "content": "北京三日游"}},
            {"id": "agent-1", "type": "agent", "position": {"x": 500, "y": 0}, "data": {"title": "Agent"}},
        ],
        "edges": [{"id": "e1", "source": "brief-1", "target": "agent-1", "sourceHandle": "right-source", "targetHandle": "left-target"}],
    }
    with TestClient(main.app) as client:
        assert client.put("/api/projects/travel/graph", json=graph).status_code == 200
        assert client.post("/api/projects/travel/agent/runs/ui-run-1/cancel").json() == {"cancelled": True}
        response = client.post("/api/projects/travel/agent/runs", json={
            "client_run_id": "ui-run-1",
            "source_node_id": "agent-1",
            "prompt": "帮我规划一下",
            "model": "test-model",
            "generation_type": "文本",
            "grid": {"rows": 2, "columns": 2},
            "graph": graph,
        })

        assert response.status_code == 409
        stored = client.get("/api/projects/travel/graph").json()
        assert [node["id"] for node in stored["nodes"]] == ["brief-1", "agent-1"]
        assert client.get("/api/projects/travel/agent/runs").json()["items"] == []


def test_agent_can_be_cancelled_while_model_is_still_generating(tmp_path: Path) -> None:
    started, release = Event(), Event()
    main.repository = SQLiteRepository(tmp_path / "cancel-during-run.db")
    main.workflow = AgentWorkflow(provider=BlockingProvider(started, release))
    main.cancelled_runs.clear()
    graph = {
        "nodes": [
            {"id": "brief-1", "type": "text", "position": {"x": 0, "y": 0}, "data": {"title": "需求", "content": "原始需求"}},
            {"id": "agent-1", "type": "agent", "position": {"x": 500, "y": 0}, "data": {"title": "Agent"}},
        ],
        "edges": [{"id": "e1", "source": "brief-1", "target": "agent-1"}],
    }
    payload = {
        "client_run_id": "live-ui-run",
        "source_node_id": "agent-1",
        "prompt": "生成新的规划",
        "model": "test-model",
        "generation_type": "文本",
        "grid": {"rows": 1, "columns": 2},
        "graph": graph,
    }
    with TestClient(main.app) as client, ThreadPoolExecutor(max_workers=1) as executor:
        assert client.put("/api/projects/live/graph", json=graph).status_code == 200
        future = executor.submit(client.post, "/api/projects/live/agent/runs", json=payload)
        assert started.wait(timeout=1), "model generation did not start"
        assert client.post("/api/projects/live/agent/runs/live-ui-run/cancel").json() == {"cancelled": True}
        release.set()
        response = future.result(timeout=3)

        assert response.status_code == 409
        stored = client.get("/api/projects/live/graph").json()
        assert [node["id"] for node in stored["nodes"]] == ["brief-1", "agent-1"]
        assert client.get("/api/projects/live/agent/runs").json()["items"] == []


def test_cancelled_node_chat_discards_stream_and_keeps_original_content(tmp_path: Path) -> None:
    main.repository = SQLiteRepository(tmp_path / "cancel-node-chat.db")
    main.workflow = AgentWorkflow(provider=DeterministicProvider())
    main.cancelled_runs.clear()
    graph = {
        "nodes": [{"id": "brief-1", "type": "text", "position": {"x": 0, "y": 0}, "data": {"title": "旅游需求", "content": "原始内容"}}],
        "edges": [],
    }
    with TestClient(main.app) as client:
        assert client.put("/api/projects/travel/graph", json=graph).status_code == 200
        assert client.post("/api/projects/travel/agent/runs/ui-chat-1/cancel").status_code == 200
        response = client.post("/api/projects/travel/agent/node-chat/stream", json={
            "client_run_id": "ui-chat-1",
            "source_node_id": "brief-1",
            "prompt": "改写内容",
            "model": "test-model",
            "generation_type": "文本",
            "operation_mode": "update_source",
            "grid": {"rows": 1, "columns": 1},
            "graph": graph,
        })

        assert response.status_code == 200
        assert response.text == ""
        stored = client.get("/api/projects/travel/graph").json()
        assert stored["nodes"][0]["data"]["content"] == "原始内容"
        assert client.get("/api/projects/travel/agent/runs").json()["items"] == []


def test_agent_chat_streams_deltas_and_persists_complete_markdown(tmp_path: Path) -> None:
    main.repository = SQLiteRepository(tmp_path / "stream.db")
    main.workflow = AgentWorkflow(provider=DeterministicProvider())
    with TestClient(main.app) as client:
        payload = {
            "source_node_id": "idea-1",
            "prompt": "规划一下",
            "model": "test-model",
            "generation_type": "文本",
            "operation_mode": "chat",
            "grid": {"rows": 1, "columns": 1},
            "graph": {
                "nodes": [{"id": "idea-1", "type": "text", "position": {"x": 0, "y": 0}, "data": {"title": "旅游想法", "content": "北京三日游：故宫、长城、颐和园"}}],
                "edges": [],
            },
        }
        response = client.post("/api/projects/travel/agent/chat/stream", json=payload)

        assert response.status_code == 200, response.text
        events = [json.loads(line) for line in response.text.splitlines()]
        assert len([event for event in events if event["type"] == "delta"]) > 1
        assert events[-1]["type"] == "done"
        answer = "".join(event["content"] for event in events if event["type"] == "delta")
        assert "北京三日游" in answer
        history = client.get("/api/projects/travel/agent/runs").json()["items"]
        assert history[0]["operation_mode"] == "chat"
        assert history[0]["response"] == answer


def test_node_chat_streams_content_then_updates_graph(tmp_path: Path) -> None:
    main.repository = SQLiteRepository(tmp_path / "node-stream.db")
    main.workflow = AgentWorkflow(provider=DeterministicProvider())
    with TestClient(main.app) as client:
        payload = {
            "source_node_id": "brief-1",
            "prompt": "补充目标受众与交付要求",
            "model": "test-model",
            "generation_type": "文本",
            "operation_mode": "update_source",
            "grid": {"rows": 1, "columns": 1},
            "graph": {
                "nodes": [{"id": "brief-1", "type": "text", "position": {"x": 0, "y": 0}, "data": {"title": "产品需求", "content": "策划新品传播"}}],
                "edges": [],
            },
        }
        response = client.post("/api/projects/test/agent/node-chat/stream", json=payload)

        assert response.status_code == 200, response.text
        events = [json.loads(line) for line in response.text.splitlines()]
        deltas = [event["content"] for event in events if event["type"] == "delta"]
        assert len(deltas) > 1
        assert events[-1]["type"] == "done"
        streamed_content = "".join(deltas).strip()
        assert events[-1]["graph"]["nodes"][0]["data"]["content"] == streamed_content
        assert events[-1]["run"]["candidates"][0]["content"] == streamed_content
        history = client.get("/api/projects/test/agent/runs").json()["items"]
        assert history[0]["operation_mode"] == "update_source"


def test_node_chat_keeps_reasoning_events_out_of_final_content(tmp_path: Path) -> None:
    main.repository = SQLiteRepository(tmp_path / "reasoning-stream.db")
    main.workflow = AgentWorkflow(provider=ReasoningStreamProvider())
    with TestClient(main.app) as client:
        payload = {
            "source_node_id": "brief-1",
            "prompt": "完善需求",
            "model": "reasoning-model",
            "generation_type": "文本",
            "operation_mode": "update_source",
            "grid": {"rows": 1, "columns": 1},
            "graph": {"nodes": [{"id": "brief-1", "type": "text", "position": {"x": 0, "y": 0}, "data": {"title": "需求", "content": "原始内容"}}], "edges": []},
        }
        events = [json.loads(line) for line in client.post("/api/projects/test/agent/node-chat/stream", json=payload).text.splitlines()]

        assert events[0] == {"type": "reasoning", "content": "先识别目标受众，再整理交付要求。"}
        final_content = events[-1]["graph"]["nodes"][0]["data"]["content"]
        assert final_content == "面向职业 FPS 玩家，交付一套可量化的传播方案。"
        assert "先识别目标受众" not in final_content


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


def test_knowledge_document_can_be_listed_and_deleted(tmp_path: Path) -> None:
    main.repository = SQLiteRepository(tmp_path / "knowledge.db")
    with TestClient(main.app) as client:
        created = client.post("/api/projects/test/knowledge/documents", json={
            "id": "brief", "name": "brief.md", "kind": "MD", "content": "磁轴键盘卖点",
        })
        assert created.status_code == 201, created.text
        listed = client.get("/api/projects/test/knowledge/documents")
        assert listed.status_code == 200
        assert listed.json()["items"][0]["name"] == "brief.md"
        assert client.delete("/api/projects/test/knowledge/documents/brief").status_code == 204
        assert client.get("/api/projects/test/knowledge/documents").json()["items"] == []


def test_knowledge_document_can_be_reindexed(tmp_path: Path) -> None:
    main.repository = SQLiteRepository(tmp_path / "knowledge-retry.db")
    with TestClient(main.app) as client:
        created = client.post("/api/projects/test/knowledge/documents", json={
            "id": "brief", "name": "brief.md", "kind": "MD", "content": "磁轴键盘需要低延迟响应。",
        })
        assert created.status_code == 201, created.text
        retried = client.post("/api/projects/test/knowledge/documents/brief/retry")
        assert retried.status_code == 200, retried.text
        assert retried.json() == {"id": "brief", "status": "indexed"}


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
