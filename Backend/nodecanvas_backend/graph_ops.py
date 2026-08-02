from __future__ import annotations

from Agent.nodecanvas_agent.models import AgentRunResult, GraphEdge, GraphNode, GraphSnapshot


def apply_agent_result(graph: GraphSnapshot, result: AgentRunResult) -> GraphSnapshot:
    nodes = [node.model_copy(deep=True) for node in graph.nodes]
    edges = [edge.model_copy(deep=True) for edge in graph.edges]
    nodes_by_id = {node.id: node for node in nodes}

    for operation in result.operations:
        if operation.kind == "update_node":
            node = nodes_by_id.get(operation.node_id)
            if not node:
                continue
            node.data = {
                **node.data,
                "title": operation.title,
                "content": operation.content,
                "agentRunId": result.run_id,
            }
            continue

        node = GraphNode(
            id=operation.node_id,
            type=operation.node_type,
            position=operation.position,
            style={"width": 360, "height": 240},
            data={
                "title": operation.title,
                "content": operation.content,
                "agentRunId": result.run_id,
                **({"format": operation.format} if operation.format else {}),
                **({"imageUrl": operation.asset_url} if operation.asset_url else {}),
            },
        )
        nodes.append(node)
        nodes_by_id[node.id] = node
        if operation.source_node_id:
            edges.append(
                GraphEdge(
                    id=f"agent-edge-{result.run_id}-{len(edges)}",
                    source=operation.source_node_id,
                    sourceHandle="right-source",
                    target=node.id,
                    targetHandle="left-target",
                    animated=False,
                    style={"stroke": "#88a0b7", "strokeWidth": 2.5},
                )
            )
    return GraphSnapshot(nodes=nodes, edges=edges, revision=graph.revision)
