from __future__ import annotations

from Backend.nodecanvas_backend.vector_store import EmbeddingProvider, PgvectorKnowledgeIndex


def test_local_embedding_is_deterministic_and_normalized() -> None:
    provider = EmbeddingProvider(base_url=None, api_key=None, model="offline", dimensions=32)

    first = provider.embed("磁轴键盘 响应速度")
    second = provider.embed("磁轴键盘 响应速度")

    assert first == second
    assert len(first) == 32
    assert round(sum(value * value for value in first), 6) == 1.0


def test_pgvector_index_is_explicitly_opt_in() -> None:
    provider = EmbeddingProvider(base_url=None, api_key=None, model="offline", dimensions=32)
    index = PgvectorKnowledgeIndex(None, provider)

    assert index.enabled is False
    assert index.search("project", "query") == []
