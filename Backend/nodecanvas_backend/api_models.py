from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from Agent.nodecanvas_agent.models import AgentRunResult, GraphSnapshot


class HealthResponse(BaseModel):
    status: str
    database: str
    model_provider: str


class ProjectCreate(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=255)


class ProjectUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class ProjectCoverUpdate(BaseModel):
    cover: str | None = Field(default=None, max_length=20_000_000)


class ProjectSummary(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    cover_url: str | None = None


class AgentRunResponse(BaseModel):
    run: AgentRunResult
    graph: GraphSnapshot


class KnowledgeDocumentCreate(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=255)
    kind: str = Field(default="TEXT", max_length=24)
    content: str = Field(default="", max_length=2_000_000)


class KnowledgeDocumentList(BaseModel):
    items: list[dict[str, Any]]


class ModelConnectionTestRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    model_id: str = Field(min_length=1, max_length=180)
    base_url: str = Field(min_length=8, max_length=1000)
    api_key: str = Field(min_length=1, max_length=1000)
    protocol: Literal["openai-chat", "dashscope-image"] = "openai-chat"


class ModelConnectionTestResponse(BaseModel):
    ok: bool
    latency_ms: int
    message: str
