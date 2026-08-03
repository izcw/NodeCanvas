# NodeCanvas Backend

NodeCanvas 后端是一个 FastAPI 服务，负责项目画布快照、Agent Run、知识库文档和模型连通性测试。Agent 执行由 `Agent/nodecanvas_agent/workflow.py` 中的 LangGraph `StateGraph` 驱动。

## 启动

从仓库根目录执行：

```bash
python3.12 -m venv Backend/.venv
Backend/.venv/bin/python -m pip install -r Backend/requirements.txt
Backend/.venv/bin/python -m uvicorn Backend.nodecanvas_backend.main:app --reload --port 8000
```

- API：`http://127.0.0.1:8000`
- OpenAPI：`http://127.0.0.1:8000/docs`
- 健康检查：`GET /health`

SQLite 数据默认写入 `Backend/data/nodecanvas.db`，该目录不会提交到 Git。

## 配置模型 Provider

不配置密钥时使用确定性的本地 Provider，便于测试和前后端联调。接入真实 OpenAI-compatible `chat/completions` 服务时设置：

```bash
export NODECANVAS_LLM_BASE_URL=https://your-provider.example/v1
export NODECANVAS_LLM_API_KEY=your-key
export NODECANVAS_LLM_MODEL=your-model-id
```

模型需要返回包含 `candidates` 数组的 JSON。后端会校验候选和画布操作；网络失败、JSON 不完整或候选不足时返回错误，不会写入半成品图操作。百炼生图和其他变量可参考 `Backend/.env.example`。

## API

```text
GET  /health
POST /api/models/test
GET  /api/projects/{project_id}/graph
PUT  /api/projects/{project_id}/graph
POST /api/projects/{project_id}/agent/runs
GET  /api/projects/{project_id}/agent/runs
POST /api/projects/{project_id}/knowledge/documents
GET  /api/projects/{project_id}/knowledge/documents
POST /api/projects/{project_id}/knowledge/documents/{document_id}/retry
```

项目图和执行记录由 SQLite 事务化保存。知识文档会先分块，再根据配置使用关键词检索或 pgvector 语义检索。完整参数以运行中的 OpenAPI 文档为准。

## pgvector 语义检索（可选）

pgvector 是知识检索的派生索引，不替代 SQLite 主存储。已安装 Docker 时：

```bash
docker compose -f Backend/compose.pgvector.yml up -d
export NODECANVAS_PGVECTOR_DATABASE_URL=postgresql://nodecanvas:nodecanvas@127.0.0.1:5432/nodecanvas
```

如需真实 Embeddings API：

```bash
export NODECANVAS_EMBEDDING_BASE_URL=https://your-provider.example/v1
export NODECANVAS_EMBEDDING_API_KEY=your-key
export NODECANVAS_EMBEDDING_MODEL=your-embedding-model
```

服务启动时会创建 `vector` 扩展并尝试回填已有分块；文档新增、删除和重试会同步索引。知识库中的索引状态用于区分 `pending`、`indexed` 和 `failed`。未配置 Embeddings 时使用确定性 hash embedding，仅适合离线开发和测试。

## 测试

```bash
Backend/.venv/bin/python -m pytest Backend/tests -q
```

LangGraph 当前没有启用 Checkpointer：Run 和 Context Snapshot 会保存，但中间 super-step 不支持暂停恢复。需要人工审批或长任务恢复时，应接入 PostgreSQL Checkpointer，并为每次 Run 使用稳定的 `thread_id`。
