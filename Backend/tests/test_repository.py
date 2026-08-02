from __future__ import annotations

from pathlib import Path

from Agent.nodecanvas_agent.models import GraphSnapshot
from Backend.nodecanvas_backend.repository import SQLiteRepository


def test_graph_round_trip_and_knowledge_search(tmp_path: Path) -> None:
    repository = SQLiteRepository(tmp_path / "nodecanvas.db")
    repository.initialize()
    repository.ensure_project("test")
    graph = GraphSnapshot.model_validate(
        {
            "nodes": [
                {"id": "n1", "type": "text", "position": {"x": 1, "y": 2}, "data": {"title": "Brief"}}
            ],
            "edges": [],
        }
    )

    stored = repository.save_graph("test", graph)
    loaded = repository.get_graph("test")
    assert stored.revision == 1
    assert loaded is not None
    assert loaded.nodes[0].id == "n1"

    repository.add_knowledge_document("test", "doc-1", "guide.md", "MD", "电竞键盘需要强调磁轴响应速度和触发精度。")
    results = repository.search_knowledge("test", "磁轴响应")
    assert results
    assert "磁轴" in results[0]
