# NodeCanvas Backend

FastAPI 服务已实现以下主链路：

- SQLite 持久化项目画布快照与 revision
- Agent Run、Context Snapshot 和结果记录
- 文本知识文档分块与项目内关键词检索；配置 PostgreSQL + pgvector 后切换为向量检索
- LangGraph Agent 执行 API 与结果图持久化
- 临时模型连通性测试（凭据不入库）
- 本地开发 CORS、健康检查和 OpenAPI 文档

## 启动

从仓库根目录执行：

```bash
python3.12 -m venv Backend/.venv
Backend/.venv/bin/python -m pip install -r Backend/requirements.txt
Backend/.venv/bin/python -m uvicorn Backend.nodecanvas_backend.main:app --reload --port 8000
```

服务地址：

- API: `http://127.0.0.1:8000`
- OpenAPI: `http://127.0.0.1:8000/docs`
- 健康检查: `GET /health`

## 模型配置

默认使用确定性的本地 Provider，便于在没有密钥时完成开发、测试和端到端联调。配置以下环境变量后会调用真实的 OpenAI-compatible `chat/completions` 接口：

```bash
export NODECANVAS_LLM_BASE_URL=https://your-provider.example/v1
export NODECANVAS_LLM_API_KEY=your-key
export NODECANVAS_LLM_MODEL=your-model-id
```

模型必须返回包含 `candidates` 数组的 JSON 对象。Provider 返回不完整 JSON、候选不足或网络失败时，API 返回 502，不会把半成品写入画布。

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
```

## 测试

```bash
Backend/.venv/bin/python -m pytest Backend/tests -q
```

SQLite 数据默认保存在 `Backend/data/nodecanvas.db`，该目录不会提交到 Git。

## pgvector 语义检索

项目画布与执行记录继续由 SQLite 事务化保存；知识分块会同步到 PostgreSQL 的 `nodecanvas_knowledge_vectors` 作为可重建的 pgvector 索引。配置 `.env.example` 中的 `NODECANVAS_PGVECTOR_DATABASE_URL` 后，服务启动会创建 `vector` 扩展、回填已有分块，并在每次知识文档新增/删除时同步索引。

设置 OpenAI-compatible embeddings 地址、密钥和模型后会调用真实 Embeddings API；未设置时使用确定性本地 hash embedding，仅用于离线开发与测试，不应用于生产检索质量评估。

若已安装 Docker，可运行 `docker compose -f Backend/compose.pgvector.yml up -d` 启动本地 pgvector，再设置 `NODECANVAS_PGVECTOR_DATABASE_URL=postgresql://nodecanvas:nodecanvas@127.0.0.1:5432/nodecanvas`。知识库会显示索引状态；失败后可在界面中重试，服务启动也会自动回填索引。

LangGraph 正式版要求 Python 3.10+；本仓库本地基线采用 Python 3.12。
