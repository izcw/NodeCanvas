from __future__ import annotations

import re
from typing import TypedDict
from uuid import uuid4

from langgraph.graph import END, START, StateGraph

from .context_graph import ContextGraphResolver
from .models import AgentRunRequest, AgentRunResult, Candidate, ContextSnapshot, GraphOperation, Position, TokenUsage
from .provider import CandidateProvider, provider_from_connection, provider_from_env


class WorkflowState(TypedDict, total=False):
    request: AgentRunRequest
    knowledge: list[str]
    context: ContextSnapshot
    candidates: list[Candidate]
    usage: TokenUsage
    operations: list[GraphOperation]
    provider_name: str


class AgentWorkflow:
    """Single-agent workflow with explicit, testable stages.

    Stages: resolve context -> retrieve knowledge -> generate structured
    candidates -> validate/diversify -> compile graph operations.
    """

    def __init__(self, provider: CandidateProvider | None = None, resolver: ContextGraphResolver | None = None):
        self.provider = provider or provider_from_env()
        self.resolver = resolver or ContextGraphResolver()
        builder = StateGraph(WorkflowState)
        builder.add_node("resolve_context", self._resolve_context)
        builder.add_node("generate_candidates", self._generate_candidates)
        builder.add_node("validate_candidates", self._validate_candidates_node)
        builder.add_node("compile_operations", self._compile_operations_node)
        builder.add_edge(START, "resolve_context")
        builder.add_edge("resolve_context", "generate_candidates")
        builder.add_edge("generate_candidates", "validate_candidates")
        builder.add_edge("validate_candidates", "compile_operations")
        builder.add_edge("compile_operations", END)
        self.graph = builder.compile()

    def run(self, request: AgentRunRequest, knowledge: list[str] | None = None) -> AgentRunResult:
        state = self.graph.invoke({"request": request, "knowledge": knowledge or []})
        created_count = sum(operation.kind == "create_node" for operation in state["operations"])
        updated_count = sum(operation.kind == "update_node" for operation in state["operations"])
        context = state["context"]
        operation_summary = (
            "本次为纯聊天，未修改画布。"
            if request.operation_mode == "chat"
            else f"已编排 {created_count} 个新增节点。"
            if created_count
            else f"已定位并更新 {updated_count} 个已有节点。"
        )
        knowledge_sources = list(dict.fromkeys(item.split("]", 1)[0].lstrip("[") for item in context.knowledge if item.startswith("[")))
        knowledge_suffix = f"，参考：{'、'.join(knowledge_sources)}" if knowledge_sources else ""
        context_summary = (
            f"读取当前节点原文及 {len(context.direct_inputs)} 个直接上下文。"
            if context.focus_node
            else f"读取 {len(context.direct_inputs)} 个直接上下文，检索 {len(context.knowledge)} 条知识{knowledge_suffix}。"
        )
        candidate_summary = (
            "已生成并校验优化结果。"
            if context.current_node
            else f"{state['provider_name']} 已生成并校验 {len(state['candidates'])} 个关联节点。"
        )
        return AgentRunResult(
            provider=state["provider_name"],
            context=context,
            candidates=state["candidates"],
            usage=state["usage"],
            operations=state["operations"],
            summary=[
                context_summary,
                candidate_summary,
                operation_summary,
            ],
        )

    def _resolve_context(self, state: WorkflowState) -> WorkflowState:
        return {"context": self.resolver.resolve(state["request"], state.get("knowledge", []))}

    def stream_chat(self, request: AgentRunRequest, knowledge: list[str] | None = None):
        context = self.resolver.resolve(request, knowledge or [])
        provider = self.provider if request.connection is None else provider_from_connection(request.connection)
        return context, provider.name, provider.stream_chat(context=context, model=request.model, operation_mode=request.operation_mode)

    def stream_node_update(self, request: AgentRunRequest, knowledge: list[str] | None = None):
        context = self.resolver.resolve(request, knowledge or [])
        provider = self.provider if request.connection is None else provider_from_connection(request.connection)
        return context, provider.name, provider.stream_chat_events(context=context, model=request.model, operation_mode="update_source")

    def streamed_update_result(self, request: AgentRunRequest, context: ContextSnapshot, provider_name: str, content: str) -> AgentRunResult:
        current = context.current_node
        if current is None:
            raise ValueError("streamed node update requires a current node")
        candidate = Candidate(title=current.title, content=content, tags=["节点修改", "流式输出"], reason="流式节点修改")
        completion_tokens = max(1, len(content) // 3)
        usage = TokenUsage(
            prompt_tokens=context.token_estimate,
            completion_tokens=completion_tokens,
            total_tokens=context.token_estimate + completion_tokens,
            estimated=True,
        )
        operations = self._compile_operations(request, [candidate])
        return AgentRunResult(
            provider=provider_name,
            context=context,
            candidates=[candidate],
            usage=usage,
            operations=operations,
            summary=["已读取当前节点原文。", "已流式生成并校验修改结果。", "已更新当前节点。"],
        )

    def _generate_candidates(self, state: WorkflowState) -> WorkflowState:
        request = state["request"]
        provider = self.provider if request.connection is None else provider_from_connection(request.connection)
        generation = provider.generate(
            context=state["context"],
            count=request.grid.count,
            model=request.model,
            generation_type=request.generation_type,
            rows=request.grid.rows,
            columns=request.grid.columns,
        )
        return {
            "provider_name": provider.name,
            "candidates": generation.candidates,
            "usage": generation.usage,
        }

    def _validate_candidates_node(self, state: WorkflowState) -> WorkflowState:
        return {"candidates": self._validate_candidates(state["candidates"], state["request"].grid.count)}

    def _compile_operations_node(self, state: WorkflowState) -> WorkflowState:
        return {"operations": self._compile_operations(state["request"], state["candidates"])}

    @staticmethod
    def _validate_candidates(candidates: list[Candidate], count: int) -> list[Candidate]:
        unique: list[Candidate] = []
        fingerprints: set[str] = set()
        for candidate in candidates:
            fingerprint = re.sub(r"\W+", "", f"{candidate.title}{candidate.content}").lower()
            if not fingerprint or fingerprint in fingerprints:
                continue
            fingerprints.add(fingerprint)
            unique.append(candidate)
            if len(unique) == count:
                break
        if len(unique) != count:
            raise ValueError(f"expected {count} unique candidates, received {len(unique)}")
        return unique

    @staticmethod
    def _compile_operations(request: AgentRunRequest, candidates: list[Candidate]) -> list[GraphOperation]:
        source = next(node for node in request.graph.nodes if node.id == request.source_node_id)
        if request.operation_mode == "chat":
            return []
        if request.operation_mode == "update_source":
            candidate = candidates[0]
            return [
                GraphOperation(
                    kind="update_node",
                    node_id=source.id,
                    node_type=source.type,
                    title=candidate.title,
                    content=candidate.content,
                    source_node_id=source.id,
                )
            ]
        nodes_by_id = {node.id: node for node in request.graph.nodes}
        direct_outputs = [
            nodes_by_id[edge.target]
            for edge in request.graph.edges
            if edge.source == request.source_node_id
            and (edge.sourceHandle in (None, "right-source"))
            and edge.target in nodes_by_id
        ]
        modify = bool(re.search(r"修改|改写|更新|调整|优化|润色|modify|update|rewrite|edit", request.prompt, re.I))
        mentioned = next(
            (node for node in direct_outputs if f"@{node.data.get('title', '')}" in request.prompt),
            None,
        )
        explicit_targets = [node for node in direct_outputs if node.id in request.target_node_ids]
        targets = explicit_targets or ([mentioned or direct_outputs[0]] if modify and direct_outputs else [])
        if targets and len(candidates) >= len(targets):
            operations = []
            for target, candidate in zip(targets, candidates, strict=False):
                operations.append(
                    GraphOperation(
                        kind="update_node",
                        node_id=target.id,
                        node_type=target.type,
                        title=candidate.title,
                        content=candidate.content,
                        source_node_id=request.source_node_id,
                    )
                )
            return operations
        source_width = (
            (source.measured or {}).get("width")
            or source.width
            or (source.style or {}).get("width")
            or 470
        )
        output_width, output_height, horizontal_gap, vertical_gap = 360, 240, 48, 48
        occupied_right = max(
            [source.position.x + float(source_width)] + [
                node.position.x + float((node.measured or {}).get("width") or node.width or (node.style or {}).get("width") or 360)
                for node in direct_outputs
            ]
        )
        origin_x = occupied_right + 96
        origin_y = source.position.y
        operations = []
        for index, candidate in enumerate(candidates):
            row = index // request.grid.columns
            column = index % request.grid.columns
            previous_in_plan_id = source.id if column == 0 else operations[-1].node_id
            operations.append(
                GraphOperation(
                    kind="create_node",
                    node_id=f"agent-result-{uuid4()}",
                    node_type="image" if request.generation_type == "图片" and candidate.asset_url else "text",
                    title=candidate.title,
                    content=candidate.content,
                    format="markdown" if request.generation_type == "文本" else None,
                    position=Position(
                        x=origin_x + column * (output_width + horizontal_gap),
                        y=origin_y + row * (output_height + vertical_gap),
                    ),
                    source_node_id=previous_in_plan_id,
                    asset_url=candidate.asset_url,
                )
            )
        return operations
