from __future__ import annotations

from contextlib import asynccontextmanager
import json
from threading import Lock

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from Agent.nodecanvas_agent import AgentRunRequest, AgentWorkflow
from Agent.nodecanvas_agent.models import AgentRunResult, Candidate, GraphSnapshot, TokenUsage

from .api_models import AgentRunResponse, HealthResponse, KnowledgeDocumentCreate, KnowledgeDocumentList, ModelConnectionTestRequest, ModelConnectionTestResponse, ProjectCoverUpdate, ProjectCreate, ProjectSummary, ProjectUpdate
from .config import get_settings
from .graph_ops import apply_agent_result
from .model_testing import test_model_connection
from .repository import SQLiteRepository
from .vector_store import EmbeddingProvider, PgvectorKnowledgeIndex


settings = get_settings()
repository = SQLiteRepository(settings.database_path)
workflow = AgentWorkflow()
vector_index = PgvectorKnowledgeIndex(
    settings.pgvector_database_url,
    EmbeddingProvider(
        base_url=settings.embedding_base_url,
        api_key=settings.embedding_api_key,
        model=settings.embedding_model,
        dimensions=settings.embedding_dimensions,
    ),
)
cancelled_runs: set[tuple[str, str]] = set()
cancelled_runs_lock = Lock()


def cancel_run(project_id: str, client_run_id: str) -> None:
    with cancelled_runs_lock:
        cancelled_runs.add((project_id, client_run_id))


def is_run_cancelled(project_id: str, client_run_id: str | None, *, consume: bool = False) -> bool:
    if not client_run_id:
        return False
    key = (project_id, client_run_id)
    with cancelled_runs_lock:
        cancelled = key in cancelled_runs
        if cancelled and consume:
            cancelled_runs.discard(key)
        return cancelled


def index_knowledge_document(project_id: str, document_id: str) -> str:
    """Synchronize a document's derived vector index without losing source data."""
    if not vector_index.enabled:
        repository.set_knowledge_index_status(project_id, document_id, "indexed")
        return "indexed"
    document = repository.knowledge_document(project_id, document_id)
    if not document:
        raise ValueError("knowledge document not found")
    try:
        vector_index.index_document(project_id, document_id, str(document["name"]), repository.knowledge_chunks(project_id, document_id))
    except Exception as exc:
        repository.set_knowledge_index_status(project_id, document_id, "failed", str(exc)[:800])
        return "failed"
    repository.set_knowledge_index_status(project_id, document_id, "indexed")
    return "indexed"


@asynccontextmanager
async def lifespan(_: FastAPI):
    repository.initialize()
    repository.ensure_project("default", "默认画布")
    vector_index.initialize()
    if vector_index.enabled:
        for project_id, document_id, _chunks in repository.all_knowledge_chunks():
            index_knowledge_document(project_id, document_id)
    yield


app = FastAPI(
    title="NodeCanvas API",
    version="0.1.0",
    description="Graph persistence, knowledge retrieval, and Agent execution for NodeCanvas.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        database=str(settings.database_path),
        model_provider=workflow.provider.name,
    )


@app.post("/api/models/test", response_model=ModelConnectionTestResponse)
def test_model(config: ModelConnectionTestRequest) -> ModelConnectionTestResponse:
    return test_model_connection(config)


@app.get("/api/projects", response_model=list[ProjectSummary])
def list_projects() -> list[dict[str, str]]:
    return repository.list_projects()


@app.post("/api/projects", response_model=ProjectSummary, status_code=201)
def create_project(project: ProjectCreate) -> dict[str, str]:
    try:
        return repository.create_project(project.id, project.title)
    except Exception as exc:
        if "UNIQUE constraint" in str(exc):
            raise HTTPException(status_code=409, detail="project already exists") from exc
        raise


@app.patch("/api/projects/{project_id}", response_model=ProjectSummary)
def rename_project(project_id: str, project: ProjectUpdate) -> dict[str, str]:
    updated = repository.rename_project(project_id, project.title)
    if not updated:
        raise HTTPException(status_code=404, detail="project not found")
    return updated


@app.patch("/api/projects/{project_id}/cover", response_model=ProjectSummary)
def update_project_cover(project_id: str, project: ProjectCoverUpdate) -> dict[str, str | None]:
    updated = repository.update_project_cover(project_id, project.cover)
    if not updated:
        raise HTTPException(status_code=404, detail="project not found")
    return updated


@app.post("/api/projects/{project_id}/copies", response_model=ProjectSummary, status_code=201)
def copy_project(project_id: str, project: ProjectCreate) -> dict[str, str]:
    try:
        copied = repository.copy_project(project_id, project.id, project.title)
    except Exception as exc:
        if "UNIQUE constraint" in str(exc):
            raise HTTPException(status_code=409, detail="project already exists") from exc
        raise
    if not copied:
        raise HTTPException(status_code=404, detail="project not found")
    return copied


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: str) -> None:
    if not repository.delete_project(project_id):
        raise HTTPException(status_code=404, detail="project not found")


@app.get("/api/projects/{project_id}/graph", response_model=GraphSnapshot)
def get_graph(project_id: str) -> GraphSnapshot:
    graph = repository.get_graph(project_id)
    if not graph:
        raise HTTPException(status_code=404, detail="graph not initialized")
    return graph


@app.put("/api/projects/{project_id}/graph", response_model=GraphSnapshot)
def save_graph(project_id: str, graph: GraphSnapshot) -> GraphSnapshot:
    return repository.save_graph(project_id, graph)


@app.post("/api/projects/{project_id}/shares")
def create_share_link(project_id: str, graph: GraphSnapshot) -> dict[str, str]:
    return {"id": repository.create_share_link(project_id, graph)}


@app.get("/api/shares/{share_id}", response_model=GraphSnapshot)
def get_shared_graph(share_id: str) -> GraphSnapshot:
    graph = repository.get_shared_graph(share_id)
    if not graph:
        raise HTTPException(status_code=404, detail="share link not found")
    return graph


@app.post("/api/projects/{project_id}/agent/runs", response_model=AgentRunResponse)
def run_agent(project_id: str, request: AgentRunRequest) -> AgentRunResponse:
    try:
        knowledge = vector_index.search(project_id, request.prompt) if vector_index.enabled else repository.search_knowledge(project_id, request.prompt)
        result = workflow.run(request, knowledge=knowledge)
        if is_run_cancelled(project_id, request.client_run_id, consume=True):
            raise HTTPException(status_code=409, detail="本次生成已暂停，结果未写入画布")
        stored_graph = request.graph if not result.operations else repository.save_graph(project_id, apply_agent_result(request.graph, result))
        if is_run_cancelled(project_id, request.client_run_id, consume=True):
            repository.save_graph(project_id, request.graph)
            raise HTTPException(status_code=409, detail="本次生成已暂停，结果已撤销")
        repository.save_run(project_id, request.prompt, result, request.operation_mode)
        return AgentRunResponse(run=result, graph=stored_graph)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/agent/runs/{client_run_id}/cancel")
def cancel_agent_run(project_id: str, client_run_id: str) -> dict[str, bool]:
    cancel_run(project_id, client_run_id)
    return {"cancelled": True}


@app.get("/api/projects/{project_id}/agent/runs")
def list_agent_runs(project_id: str, limit: int = Query(default=20, ge=1, le=100)) -> dict[str, object]:
    return {"items": repository.list_runs(project_id, limit)}


@app.delete("/api/projects/{project_id}/agent/runs", status_code=204)
def clear_agent_runs(project_id: str) -> None:
    repository.clear_runs(project_id)


@app.post("/api/projects/{project_id}/agent/chat/stream")
def stream_agent_chat(project_id: str, request: AgentRunRequest) -> StreamingResponse:
    if request.operation_mode != "chat":
        raise HTTPException(status_code=422, detail="stream endpoint only accepts chat mode")
    knowledge = vector_index.search(project_id, request.prompt) if vector_index.enabled else repository.search_knowledge(project_id, request.prompt)
    context, provider_name, chunks = workflow.stream_chat(request, knowledge)

    def stream():
        answer_parts: list[str] = []
        try:
            for chunk in chunks:
                if is_run_cancelled(project_id, request.client_run_id):
                    is_run_cancelled(project_id, request.client_run_id, consume=True)
                    return
                answer_parts.append(chunk)
                yield json.dumps({"type": "delta", "content": chunk}, ensure_ascii=False) + "\n"
            answer = "".join(answer_parts)
            completion_tokens = max(1, len(answer) // 3)
            usage = TokenUsage(
                prompt_tokens=context.token_estimate,
                completion_tokens=completion_tokens,
                total_tokens=context.token_estimate + completion_tokens,
                estimated=True,
            )
            result = AgentRunResult(
                provider=provider_name,
                context=context,
                candidates=[Candidate(title="Agent 回答", content=answer, tags=["聊天", "Markdown"], reason="流式回答")],
                usage=usage,
                operations=[],
                summary=["已读取当前节点和直接上下文。", "已完成 Markdown 流式回答。", "本次为纯聊天，未修改画布。"],
            )
            if is_run_cancelled(project_id, request.client_run_id, consume=True):
                return
            repository.save_run(project_id, request.prompt, result, request.operation_mode)
            yield json.dumps({"type": "done", "run": result.model_dump(mode="json")}, ensure_ascii=False) + "\n"
        except Exception as exc:
            yield json.dumps({"type": "error", "message": str(exc)}, ensure_ascii=False) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projects/{project_id}/agent/node-chat/stream")
def stream_node_chat(project_id: str, request: AgentRunRequest) -> StreamingResponse:
    if request.operation_mode != "update_source":
        raise HTTPException(status_code=422, detail="node chat stream endpoint only accepts update_source mode")
    knowledge = vector_index.search(project_id, request.prompt) if vector_index.enabled else repository.search_knowledge(project_id, request.prompt)
    context, provider_name, chunks = workflow.stream_node_update(request, knowledge)

    def stream():
        answer_parts: list[str] = []
        try:
            for event_type, chunk in chunks:
                if is_run_cancelled(project_id, request.client_run_id):
                    is_run_cancelled(project_id, request.client_run_id, consume=True)
                    return
                if event_type == "reasoning":
                    yield json.dumps({"type": "reasoning", "content": chunk}, ensure_ascii=False) + "\n"
                    continue
                answer_parts.append(chunk)
                yield json.dumps({"type": "delta", "content": chunk}, ensure_ascii=False) + "\n"
            answer = "".join(answer_parts).strip()
            if not answer:
                raise ValueError("model returned no node content")
            result = workflow.streamed_update_result(request, context, provider_name, answer)
            if is_run_cancelled(project_id, request.client_run_id, consume=True):
                return
            stored_graph = repository.save_graph(project_id, apply_agent_result(request.graph, result))
            if is_run_cancelled(project_id, request.client_run_id, consume=True):
                repository.save_graph(project_id, request.graph)
                return
            repository.save_run(project_id, request.prompt, result, request.operation_mode)
            yield json.dumps({"type": "done", "run": result.model_dump(mode="json"), "graph": stored_graph.model_dump(mode="json")}, ensure_ascii=False) + "\n"
        except Exception as exc:
            yield json.dumps({"type": "error", "message": str(exc)}, ensure_ascii=False) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/projects/{project_id}/knowledge/documents", status_code=201)
def add_knowledge_document(project_id: str, document: KnowledgeDocumentCreate) -> dict[str, str]:
    try:
        repository.add_knowledge_document(
            project_id,
            document.id,
            document.name,
            document.kind,
            document.content,
            status="indexing" if vector_index.enabled else "indexed",
        )
        status = index_knowledge_document(project_id, document.id)
    except Exception as exc:
        if "UNIQUE constraint" in str(exc):
            raise HTTPException(status_code=409, detail="document already exists") from exc
        raise
    return {"id": document.id, "status": status}


@app.post("/api/projects/{project_id}/knowledge/documents/{document_id}/retry")
def retry_knowledge_document(project_id: str, document_id: str) -> dict[str, str]:
    if not repository.knowledge_document(project_id, document_id):
        raise HTTPException(status_code=404, detail="knowledge document not found")
    return {"id": document_id, "status": index_knowledge_document(project_id, document_id)}


@app.get("/api/projects/{project_id}/knowledge/documents", response_model=KnowledgeDocumentList)
def list_knowledge_documents(project_id: str) -> KnowledgeDocumentList:
    return KnowledgeDocumentList(items=repository.list_knowledge_documents(project_id))


@app.delete("/api/projects/{project_id}/knowledge/documents/{document_id}", status_code=204)
def delete_knowledge_document(project_id: str, document_id: str) -> None:
    if not repository.delete_knowledge_document(project_id, document_id):
        raise HTTPException(status_code=404, detail="knowledge document not found")
    vector_index.delete_document(project_id, document_id)
