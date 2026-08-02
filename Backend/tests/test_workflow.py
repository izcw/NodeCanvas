from __future__ import annotations

from Agent.nodecanvas_agent.models import AgentRunRequest
from Agent.nodecanvas_agent.provider import DeterministicProvider
from Agent.nodecanvas_agent.workflow import AgentWorkflow


def make_request(rows: int = 2, columns: int = 2) -> AgentRunRequest:
    return AgentRunRequest.model_validate(
        {
            "source_node_id": "agent-1",
            "prompt": "为新品生成四个不同的营销方向",
            "model": "test-model",
            "generation_type": "文本",
            "grid": {"rows": rows, "columns": columns},
            "graph": {
                "nodes": [
                    {
                        "id": "brief-1",
                        "type": "text",
                        "position": {"x": 0, "y": 0},
                        "data": {"title": "产品简报", "content": "轻盈、快速、适合电竞玩家"},
                    },
                    {
                        "id": "unrelated-1",
                        "type": "text",
                        "position": {"x": 0, "y": 400},
                        "data": {"title": "无关分支", "content": "不应进入上下文"},
                    },
                    {
                        "id": "agent-1",
                        "type": "agent",
                        "position": {"x": 500, "y": 0},
                        "style": {"width": 470, "height": 360},
                        "data": {"title": "营销 Agent"},
                    },
                ],
                "edges": [
                    {
                        "id": "brief-agent",
                        "source": "brief-1",
                        "sourceHandle": "right-source",
                        "target": "agent-1",
                        "targetHandle": "left-target",
                    }
                ],
            },
        }
    )


def test_workflow_uses_direct_context_and_grid_count() -> None:
    workflow = AgentWorkflow(provider=DeterministicProvider())
    result = workflow.run(make_request())

    assert [item.node_id for item in result.context.direct_inputs] == ["brief-1"]
    assert len(result.candidates) == 4
    assert len(result.operations) == 4
    assert all(operation.format == "markdown" for operation in result.operations)
    assert result.usage.total_tokens > 0
    assert result.usage.estimated is True
    assert result.summary == [
        "读取 1 个直接上下文，检索 0 条知识。",
        "deterministic-local 已生成并校验 4 个候选结果。",
        "已编排 4 个新增节点。",
    ]
    assert all(operation.kind == "create_node" for operation in result.operations)
    assert {(operation.position.x, operation.position.y) for operation in result.operations} == {
        (1066.0, 0.0),
        (1474.0, 0.0),
        (1066.0, 288.0),
        (1474.0, 288.0),
    }
    assert {"resolve_context", "generate_candidates", "validate_candidates", "compile_operations"}.issubset(workflow.graph.get_graph().nodes)


def test_grid_is_limited_to_four_by_four() -> None:
    payload = make_request().model_dump(mode="json")
    payload["grid"] = {"rows": 5, "columns": 4}

    try:
        AgentRunRequest.model_validate(payload)
    except ValueError:
        pass
    else:
        raise AssertionError("5x4 grid must be rejected")


def test_node_chat_updates_the_source_node_from_its_original_content() -> None:
    payload = make_request(rows=1, columns=1).model_dump(mode="json")
    payload["source_node_id"] = "brief-1"
    payload["operation_mode"] = "update_source"
    payload["prompt"] = "优化一下，让表达更简洁"
    request = AgentRunRequest.model_validate(payload)

    result = AgentWorkflow(provider=DeterministicProvider()).run(request)

    assert result.context.current_node is not None
    assert result.context.current_node.content == "轻盈、快速、适合电竞玩家"
    assert len(result.operations) == 1
    assert result.operations[0].kind == "update_node"
    assert result.operations[0].node_id == "brief-1"
    assert result.operations[0].content.startswith("轻盈、快速、适合电竞玩家")
    assert "使用 test-model" not in result.operations[0].content
    assert all("test-model" not in line and "deterministic-local" not in line for line in result.summary)


def test_response_language_defaults_to_chinese_and_supports_english() -> None:
    chinese = AgentWorkflow(provider=DeterministicProvider()).run(make_request(rows=1, columns=1))
    assert chinese.context.response_language == "zh-CN"

    payload = make_request(rows=1, columns=1).model_dump(mode="json")
    payload["response_language"] = "en-US"
    english = AgentWorkflow(provider=DeterministicProvider()).run(AgentRunRequest.model_validate(payload))
    assert english.candidates[0].title.startswith("Core Message")
    assert "Recommendation:" in english.candidates[0].content
