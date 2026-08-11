from __future__ import annotations

from Agent.nodecanvas_agent.models import AgentRunRequest
from Agent.nodecanvas_agent.provider import DeterministicProvider, _load_model_json
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
    assert result.context.focus_node is not None
    assert result.context.focus_node.node_id == "agent-1"
    assert len(result.candidates) == 4
    assert len(result.operations) == 4
    assert all(operation.format == "markdown" for operation in result.operations)
    assert result.usage.total_tokens > 0
    assert result.usage.estimated is True
    assert result.summary == [
        "读取当前节点原文及 1 个直接上下文。",
        "deterministic-local 已生成并校验 4 个关联节点。",
        "已编排 4 个新增节点。",
    ]
    assert all(operation.kind == "create_node" for operation in result.operations)
    assert {(operation.position.x, operation.position.y) for operation in result.operations} == {
        (1066.0, 0.0),
        (1474.0, 0.0),
        (1066.0, 288.0),
        (1474.0, 288.0),
    }
    assert [operation.source_node_id for operation in result.operations] == [
        "agent-1",
        result.operations[0].node_id,
        "agent-1",
        result.operations[2].node_id,
    ]
    assert {"resolve_context", "generate_candidates", "validate_candidates", "compile_operations"}.issubset(workflow.graph.get_graph().nodes)


def test_workflow_exposes_project_title_as_theme_context() -> None:
    request = make_request().model_copy(update={"project_title": "磁轴键盘上市策划"})
    result = AgentWorkflow(provider=DeterministicProvider()).run(request)

    assert result.context.project_title == "磁轴键盘上市策划"
    assert "磁轴键盘上市策划" in result.candidates[0].content


def test_single_row_titles_name_the_strategy_and_its_thought_steps() -> None:
    result = AgentWorkflow(provider=DeterministicProvider()).run(make_request(rows=1, columns=4))

    assert [candidate.title for candidate in result.candidates] == [
        "1.0 新品方案 · 核心主张",
        "1.1 新品方案 · 受众洞察",
        "1.2 新品方案 · 场景表达",
        "1.3 新品方案 · 渠道转化",
    ]
    assert all(candidate.title != f"方案 1 · 步骤 {index}" for index, candidate in enumerate(result.candidates, start=1))
    assert all(len(candidate.title) <= 20 for candidate in result.candidates)


def test_multi_plan_titles_use_hierarchical_numbers_not_plan_one() -> None:
    result = AgentWorkflow(provider=DeterministicProvider()).run(make_request(rows=2, columns=1))

    assert [candidate.title for candidate in result.candidates] == ["1.0核心主张 · 步骤 1", "2.0受众洞察 · 步骤 1"]
    assert all("方案" not in candidate.title for candidate in result.candidates)


def test_new_plan_titles_describe_the_request_not_the_context_node() -> None:
    payload = make_request(rows=1, columns=2).model_dump(mode="json")
    payload["prompt"] = "输出 PRD 与原型"
    payload["graph"]["nodes"][2]["data"]["title"] = "3.3 MVP人机协同实现与验证"

    result = AgentWorkflow(provider=DeterministicProvider()).run(AgentRunRequest.model_validate(payload))

    assert [candidate.title for candidate in result.candidates] == [
        "1.0 PRD 与原型方案 · 核心主张",
        "1.1 PRD 与原型方案 · 受众洞察",
    ]
    assert all("3.3" not in candidate.title for candidate in result.candidates)


def test_provider_repairs_common_model_json_string_errors() -> None:
    parsed = _load_model_json('''```json
{"candidates":[{"title":"1.0 测试","content":"第一行
他说"你好"","tags":[],"reason":"测试"}],}
```''')

    assert parsed["candidates"][0]["content"] == '第一行\n他说"你好"'


def test_all_grid_shapes_keep_the_selected_context() -> None:
    payload = make_request(rows=4, columns=1).model_dump(mode="json")
    payload["graph"]["nodes"].append({
        "id": "audience-1",
        "type": "text",
        "position": {"x": 0, "y": 160},
        "data": {"title": "目标人群", "content": "在校大学生，关注宿舍与图书馆场景"},
    })
    payload["graph"]["edges"].append({
        "id": "audience-agent",
        "source": "audience-1",
        "sourceHandle": "right-source",
        "target": "agent-1",
        "targetHandle": "left-target",
    })

    for rows, columns in ((1, 4), (4, 1), (2, 2)):
        payload["grid"] = {"rows": rows, "columns": columns}
        result = AgentWorkflow(provider=DeterministicProvider()).run(AgentRunRequest.model_validate(payload))

        assert len(result.candidates) == rows * columns
        assert all("在校大学生，关注宿舍与图书馆场景" in candidate.content for candidate in result.candidates)


def test_context_includes_current_node_and_every_left_linked_node() -> None:
    payload = make_request(rows=1, columns=1).model_dump(mode="json")
    payload["graph"]["nodes"].extend([
        {"id": "budget-1", "type": "text", "position": {"x": 0, "y": 160}, "data": {"title": "预算", "content": "1500 元"}},
        {"id": "schedule-1", "type": "text", "position": {"x": 0, "y": 320}, "data": {"title": "时间", "content": "三天"}},
        {"id": "output-1", "type": "text", "position": {"x": 1000, "y": 0}, "data": {"title": "旧输出", "content": "不应作为输入"}},
    ])
    payload["graph"]["edges"].extend([
        {"id": "budget-agent", "source": "budget-1", "sourceHandle": "right-source", "target": "agent-1", "targetHandle": "left-target"},
        {"id": "schedule-agent", "source": "schedule-1", "sourceHandle": "right-source", "target": "agent-1", "targetHandle": "left-target"},
        {"id": "agent-output", "source": "agent-1", "sourceHandle": "right-source", "target": "output-1", "targetHandle": "left-target"},
    ])

    result = AgentWorkflow(provider=DeterministicProvider()).run(AgentRunRequest.model_validate(payload))

    assert result.context.focus_node is not None
    assert result.context.focus_node.node_id == "agent-1"
    assert [item.node_id for item in result.context.direct_inputs] == ["brief-1", "budget-1", "schedule-1"]
    assert "output-1" not in {item.node_id for item in result.context.direct_inputs}


def test_only_adopted_input_edge_becomes_context() -> None:
    payload = make_request(rows=1, columns=1).model_dump(mode="json")
    payload["graph"]["nodes"].extend([
        {"id": "plan-a", "type": "text", "position": {"x": 0, "y": 160}, "data": {"title": "人群方案A", "content": "都市通勤女性"}},
        {"id": "plan-b", "type": "text", "position": {"x": 0, "y": 320}, "data": {"title": "人群方案B", "content": "新能源科技先锋"}},
    ])
    payload["graph"]["edges"].extend([
        {"id": "plan-a-agent", "source": "plan-a", "sourceHandle": "right-source", "target": "agent-1", "targetHandle": "left-target", "data": {"selected": True}},
        {"id": "plan-b-agent", "source": "plan-b", "sourceHandle": "right-source", "target": "agent-1", "targetHandle": "left-target"},
    ])

    result = AgentWorkflow(provider=DeterministicProvider()).run(AgentRunRequest.model_validate(payload))

    # 多方案分支下只采纳被标记的连线，未标记的方案不作为上下文
    assert [item.node_id for item in result.context.direct_inputs] == ["plan-a"]


def test_grid_is_limited_to_four_by_four() -> None:
    payload = make_request().model_dump(mode="json")
    payload["grid"] = {"rows": 5, "columns": 4}

    try:
        AgentRunRequest.model_validate(payload)
    except ValueError:
        pass
    else:
        raise AssertionError("5x4 grid must be rejected")


def test_travel_grid_is_one_connected_row_major_itinerary() -> None:
    payload = make_request(rows=4, columns=4).model_dump(mode="json")
    payload["prompt"] = "帮我规划一下"
    payload["graph"]["nodes"][0]["data"] = {
        "title": "北京旅游预算",
        "content": "四天三晚，总预算 5000 元，希望包含故宫和长城",
    }

    result = AgentWorkflow(provider=DeterministicProvider()).run(AgentRunRequest.model_validate(payload))

    assert len(result.candidates) == 16
    assert [candidate.title for candidate in result.candidates[:4]] == [
        "第 1 天 · 上午",
        "第 1 天 · 中午",
        "第 1 天 · 下午",
        "第 1 天 · 晚上",
    ]
    assert result.candidates[4].title == "第 2 天 · 上午"
    assert result.candidates[-1].title == "第 4 天 · 晚上"
    assert "从出发地开始" in result.candidates[0].content
    assert all("承接上一个节点的地点与时间" in candidate.content for candidate in result.candidates[1:])
    assert result.candidates[5].tags == ["文本", "row-2", "column-2"]


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


def test_ask_mode_returns_content_without_graph_operations() -> None:
    payload = make_request(rows=1, columns=1).model_dump(mode="json")
    payload["source_node_id"] = "brief-1"
    payload["operation_mode"] = "chat"
    payload["prompt"] = "这个卖点适合什么人群？"

    result = AgentWorkflow(provider=DeterministicProvider()).run(AgentRunRequest.model_validate(payload))

    assert result.operations == []
    assert result.context.current_node is None
    assert result.context.focus_node is not None
    assert result.context.focus_node.node_id == "brief-1"
    assert result.candidates[0].content
    assert result.summary[-1] == "本次为纯聊天，未修改画布。"


def test_agent_generation_uses_selected_text_node_as_primary_context() -> None:
    payload = make_request(rows=1, columns=1).model_dump(mode="json")
    payload["source_node_id"] = "brief-1"
    payload["prompt"] = "规划一下"

    result = AgentWorkflow(provider=DeterministicProvider()).run(AgentRunRequest.model_validate(payload))

    assert result.context.focus_node is not None
    assert result.context.focus_node.title == "产品简报"
    assert result.context.focus_node.content == "轻盈、快速、适合电竞玩家"
    assert "轻盈、快速、适合电竞玩家" in result.candidates[0].content
    assert result.operations[0].source_node_id == "brief-1"


def test_chat_provider_streams_markdown_content_in_chunks() -> None:
    payload = make_request(rows=1, columns=1).model_dump(mode="json")
    payload["source_node_id"] = "brief-1"
    payload["operation_mode"] = "chat"
    request = AgentRunRequest.model_validate(payload)

    _context, provider_name, chunks = AgentWorkflow(provider=DeterministicProvider()).stream_chat(request)
    streamed = list(chunks)

    assert provider_name == "deterministic-local"
    assert len(streamed) > 1
    assert "轻盈、快速、适合电竞玩家" in "".join(streamed)


def test_response_language_defaults_to_chinese_and_supports_english() -> None:
    chinese = AgentWorkflow(provider=DeterministicProvider()).run(make_request(rows=1, columns=1))
    assert chinese.context.response_language == "zh-CN"

    payload = make_request(rows=1, columns=1).model_dump(mode="json")
    payload["response_language"] = "en-US"
    english = AgentWorkflow(provider=DeterministicProvider()).run(AgentRunRequest.model_validate(payload))
    assert english.candidates[0].title.endswith(" · Core Message")
    assert len(english.candidates[0].title) <= 20
    assert "independent plan" in english.candidates[0].content
