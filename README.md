# 灵构 NodeCanvas

灵构 NodeCanvas 是一个面向 AI 工作流的可视化画布。用户可以在画布上组织文本、图片、文件、备注和 Agent 节点，并通过连线、知识库和模型配置完成从输入到结果的可追踪执行。

当前仓库包含可运行的 React/XYFlow 前端、FastAPI 后端和 LangGraph Agent 执行层。

## 当前已实现

- **可视化画布**：项目、节点、连线、撤销/重做、自动保存、搜索、缩放、小地图和分享入口。
- **节点交互**：右键菜单定位在节点内部，拖动画布或节点时跟随节点；同一时间只显示一个菜单。支持聚焦、全屏预览、复制、创建副本和删除。
- **全屏预览**：节点菜单可打开全屏预览；工作台也支持浏览器全屏展示画布，按 `Esc` 退出。
- **知识库**：上传文本/Markdown 文档、分块、索引状态、失败重试、项目级检索。未连接 PostgreSQL 时使用 SQLite 关键词检索；配置 pgvector 后可切换为向量检索。
- **AI 执行**：FastAPI 接收 Agent Run，LangGraph 依次执行上下文解析、候选生成、校验和画布操作编译，再把结果写回项目图。
- **模型注册表**：支持 OpenAI-compatible 聊天/视觉模型和百炼同步生图模型；未配置密钥时使用确定性的本地 Provider 进行开发联调。
- **页面标题**：工作台显示“工作台 - 灵构 NodeCanvas”，进入画布后显示“项目名 - 灵构 NodeCanvas”。

## 架构

```mermaid
flowchart LR
    UI[React + XYFlow] --> API[FastAPI]
    API --> Store[(SQLite)]
    API --> RAG[Knowledge Retrieval]
    RAG --> V[(PostgreSQL + pgvector 可选)]
    RAG --> LG[LangGraph StateGraph]
    LG --> LLM[Model Provider]
    LG --> Ops[Graph Operations]
    Ops --> Store
    Store --> UI
```

产品画布图和 LangGraph 执行图是两套状态：前者由用户编辑，后者由后端执行。Agent 默认只读取左侧直接入边，并在右侧第一层结果范围内创建或更新节点。

## 目录

```text
Frontend/                 React + TypeScript + Vite + XYFlow
Backend/                  FastAPI、SQLite、知识库 API、pgvector 适配
Agent/                    LangGraph StateGraph、上下文边界、模型 Provider
AGENT.md                  Agent 执行边界与模型层说明
Backend/README.md         后端启动、配置和 API 说明
```

## 本地启动

建议使用两个终端。

### 1. 启动后端

从仓库根目录执行：

```bash
python3.12 -m venv Backend/.venv
Backend/.venv/bin/python -m pip install -r Backend/requirements.txt
Backend/.venv/bin/python -m uvicorn Backend.nodecanvas_backend.main:app --reload --port 8000
```

后端地址：

- API：<http://127.0.0.1:8000>
- OpenAPI：<http://127.0.0.1:8000/docs>
- 健康检查：<http://127.0.0.1:8000/health>

### 2. 启动前端

```bash
cd Frontend
npm install
npm run dev -- --port 4173
```

如果后端不在默认地址，可设置：

```bash
export VITE_API_URL=http://127.0.0.1:8000
```

## 模型配置

默认 Provider 不需要密钥，适合跑通界面和测试。接入真实 OpenAI-compatible 服务时配置：

```bash
export NODECANVAS_LLM_BASE_URL=https://your-provider.example/v1
export NODECANVAS_LLM_API_KEY=your-key
export NODECANVAS_LLM_MODEL=your-model-id
```

模型需要返回包含 `candidates` 数组的 JSON。响应不完整、候选不足或请求失败时，后端返回错误，不会把半成品操作写入画布。图片生成使用百炼同步接口，相关变量见 `Backend/.env.example`。

## 知识库与 pgvector（可选）

SQLite 是项目和执行记录的主存储；pgvector 只保存可重建的知识向量索引。配置 PostgreSQL 后，服务启动会创建 `vector` 扩展并回填已有分块，文档新增/删除时同步索引。

```bash
docker compose -f Backend/compose.pgvector.yml up -d
export NODECANVAS_PGVECTOR_DATABASE_URL=postgresql://nodecanvas:nodecanvas@127.0.0.1:5432/nodecanvas
```

配置真实 Embeddings API：

```bash
export NODECANVAS_EMBEDDING_BASE_URL=https://your-provider.example/v1
export NODECANVAS_EMBEDDING_API_KEY=your-key
export NODECANVAS_EMBEDDING_MODEL=your-embedding-model
```

未配置 Embeddings 时使用确定性 hash 向量，仅用于离线开发和测试，不代表生产检索质量。知识库页面会显示索引状态，失败文档可直接重试。

## 主要 API

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

完整请求模型和响应示例以 <http://127.0.0.1:8000/docs> 为准。

## 验证

```bash
cd Frontend && npm run build
Backend/.venv/bin/python -m pytest Backend/tests -q
git diff --check
```

## 已知边界

- 当前没有账号、权限和多用户协作能力。
- LangGraph 已编译执行，但尚未启用 Checkpointer；Run 和 Context Snapshot 会保存到 SQLite，中间 super-step 不会恢复。
- 本地 Provider 和 hash embedding 是开发兜底，不应作为线上模型效果或检索效果的依据。
- 图片节点保存的是远程 URL；生产环境应下载并转存对象存储，避免临时 URL 过期。

更多 Agent 边界、Provider 和后续演进说明见 [`AGENT.md`](./AGENT.md)；后端配置和 API 细节见 [`Backend/README.md`](./Backend/README.md)。
