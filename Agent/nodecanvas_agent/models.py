from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


NodeKind = Literal["text", "image", "file", "comment", "agent"]
GenerationType = Literal["文本", "图片", "文档"]
ModelProtocol = Literal["openai-chat", "dashscope-image"]
OperationMode = Literal["agent", "update_source"]
ResponseLanguage = Literal["zh-CN", "en-US"]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Position(BaseModel):
    x: float
    y: float


class GraphNode(BaseModel):
    id: str
    type: NodeKind
    position: Position
    data: dict[str, Any] = Field(default_factory=dict)
    style: dict[str, Any] | None = None
    width: float | None = None
    height: float | None = None
    measured: dict[str, float] | None = None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str | None = None
    targetHandle: str | None = None
    animated: bool | None = None
    style: dict[str, Any] | None = None


class GraphSnapshot(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    revision: int = 0


class ResultGrid(BaseModel):
    rows: int = Field(default=1, ge=1, le=4)
    columns: int = Field(default=1, ge=1, le=4)

    @property
    def count(self) -> int:
        return self.rows * self.columns


class ModelConnection(BaseModel):
    id: str
    name: str
    provider: str
    model_id: str
    base_url: str
    api_key: str = ""
    protocol: ModelProtocol = "openai-chat"
    capabilities: list[str] = Field(default_factory=list)


class AgentRunRequest(BaseModel):
    source_node_id: str
    prompt: str = Field(min_length=1, max_length=12_000)
    model: str = "Kimi K2"
    generation_type: GenerationType = "文本"
    operation_mode: OperationMode = "agent"
    response_language: ResponseLanguage = "zh-CN"
    target_node_ids: list[str] = Field(default_factory=list)
    grid: ResultGrid = Field(default_factory=ResultGrid)
    connection: ModelConnection | None = None
    graph: GraphSnapshot

    @model_validator(mode="after")
    def source_must_exist(self) -> "AgentRunRequest":
        if not any(node.id == self.source_node_id for node in self.graph.nodes):
            raise ValueError("source_node_id does not exist in graph")
        return self


class ContextItem(BaseModel):
    node_id: str
    title: str
    kind: NodeKind
    content: str


class ContextSnapshot(BaseModel):
    source_node_id: str
    goal: str
    direct_inputs: list[ContextItem]
    current_node: ContextItem | None = None
    knowledge: list[str] = Field(default_factory=list)
    response_language: ResponseLanguage = "zh-CN"
    token_estimate: int = 0
    created_at: str = Field(default_factory=utc_now)


class Candidate(BaseModel):
    title: str
    content: str
    tags: list[str] = Field(default_factory=list)
    reason: str = ""
    asset_url: str | None = None


class TokenUsage(BaseModel):
    """Usage reported by a model provider, or a transparent local estimate."""

    prompt_tokens: int = Field(default=0, ge=0)
    completion_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    estimated: bool = False


class ProviderGeneration(BaseModel):
    candidates: list[Candidate]
    usage: TokenUsage


class GraphOperation(BaseModel):
    kind: Literal["create_node", "update_node"]
    node_id: str
    node_type: NodeKind = "text"
    title: str
    content: str
    format: Literal["text", "markdown"] | None = None
    position: Position | None = None
    source_node_id: str | None = None
    asset_url: str | None = None


class AgentRunResult(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid4()))
    status: Literal["completed", "failed"] = "completed"
    provider: str
    context: ContextSnapshot
    candidates: list[Candidate]
    usage: TokenUsage = Field(default_factory=TokenUsage)
    operations: list[GraphOperation]
    summary: list[str] = Field(default_factory=list, max_length=3)
    created_at: str = Field(default_factory=utc_now)
