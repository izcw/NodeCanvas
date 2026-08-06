from __future__ import annotations

from .models import AgentRunRequest, ContextItem, ContextSnapshot, GraphNode


def _node_content(node: GraphNode) -> str:
    data = node.data
    return str(
        data.get("content")
        or data.get("fileName")
        or data.get("imageUrl")
        or ""
    )


class ContextGraphResolver:
    """Builds the bounded context visible to a single Agent node.

    Product-canvas traversal is deliberately kept separate from execution flow.
    The first version follows the UI contract: only direct incoming neighbours
    are context; unrelated branches and the Agent's outgoing results are not.
    """

    def resolve(self, request: AgentRunRequest, knowledge: list[str] | None = None) -> ContextSnapshot:
        nodes_by_id = {node.id: node for node in request.graph.nodes}
        source = nodes_by_id[request.source_node_id]
        input_edges = [
            edge
            for edge in request.graph.edges
            if edge.target == request.source_node_id
            and (edge.targetHandle in (None, "left-target"))
        ]
        # 多方案分支下，仅被“采纳”连线（data.selected）的来源节点进入上下文；
        # 未标记任何采纳线时保持原有行为：全部直接输入都是上下文。
        adopted_edges = [edge for edge in input_edges if (edge.data or {}).get("selected") is True]
        input_ids = [edge.source for edge in (adopted_edges or input_edges)]
        items = []
        for node_id in dict.fromkeys(input_ids):
            node = nodes_by_id.get(node_id)
            if not node or node.type == "comment":
                continue
            items.append(
                ContextItem(
                    node_id=node.id,
                    title=str(node.data.get("title") or "未命名节点"),
                    kind=node.type,
                    content=_node_content(node),
                )
            )
        focus_node = (
            ContextItem(
                node_id=source.id,
                title=str(source.data.get("title") or "未命名节点"),
                kind=source.type,
                content=_node_content(source),
            )
            if source.type != "comment"
            else None
        )
        knowledge_items = knowledge or []
        serialized = request.prompt + "\n" + (focus_node.content if focus_node else "") + "\n" + "\n".join(
            f"{item.title}: {item.content}" for item in items
        ) + "\n" + "\n".join(knowledge_items)
        return ContextSnapshot(
            source_node_id=request.source_node_id,
            goal=request.prompt,
            direct_inputs=items,
            focus_node=focus_node,
            current_node=(
                focus_node
                if request.operation_mode == "update_source"
                else None
            ),
            knowledge=knowledge_items,
            response_language=request.response_language,
            token_estimate=max(1, len(serialized) // 3),
        )
