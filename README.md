# 节点式 AI 创意策划系统：技术方案与实现分析

## 可运行的全栈版本

当前仓库按前端、后端和 Agent 分离：XYFlow 负责产品画布，FastAPI/SQLite 负责业务状态与执行记录，Agent 包负责上下文解析和结构化生成。

```text
NodeCanvas/
├── frontend/    # React + TypeScript + XYFlow 工作台
├── Backend/     # FastAPI、SQLite 图持久化、知识检索与业务 API
└── Agent/       # 上下文解析、候选生成、校验与图操作编译
```

本地启动：

```bash
python3.12 -m venv Backend/.venv
Backend/.venv/bin/python -m pip install -r Backend/requirements.txt
Backend/.venv/bin/python -m uvicorn Backend.nodecanvas_backend.main:app --reload --port 8000

cd Frontend
npm install
npm run dev -- --port 4173
```

前端默认连接 `http://127.0.0.1:8000`，可通过 `VITE_API_URL` 覆盖。

当前已经实现：

- 黑色主题的共享知识库、无限画布、Agent 面板布局
- 右侧 Agent 收起后变为独立的 Agent 按钮，不保留侧栏占位
- 左侧画布列表按连通关系展示节点组，而不是逐个展示节点
- 共享知识库可上传工作区文件，供后续画布和 Agent 共同引用
- 画布平移、缩放、框选、节点拖拽、连线和删除
- 进度条式缩放控制
- 可编辑的文本/聊天节点
- 本地图片上传并生成图片节点
- 本地文件选择并生成文件节点
- 右侧 Copilot 输入生成文本需求节点
- 小地图、缩放控制、悬浮工具栏与工作流状态反馈
- 画布图自动保存和后端恢复
- Agent 直接入边上下文解析、知识检索和结构化候选生成
- 1×1 至 4×4 多结果生成、右侧自动排布和连线
- Agent Run / Context Snapshot / 结果图持久化
- OpenAI-compatible 模型接入与无密钥本地开发 Provider
- LangGraph StateGraph 编排与可测试的阶段状态
- 浏览器本地模型管理、系统模型、自定义增删改和连接测试
- DeepSeek 推理、Qwen 视觉/OCR 与 Wan 生图默认配置

Agent 与模型注册表的详细设计见 [agent.md](./agent.md)。

生产构建：

```bash
cd frontend
npm run build
```

## 一、项目定位

> 设计节点式 AI 创意策划系统，以可编辑上下文图替代传统线性聊天，通过候选卡选择、节点记忆及上下文关联管理用户创作偏好，提升 AI 在长流程创意策划中的连续性、一致性与可控性。

系统底层采用统一的节点、记忆与生成机制，对外通过四类业务模板进行展示：

- 摄影前期策划
- 产品策划
- 营销文案策划
- 旅游规划

整体结构可拆分为：

```text
节点交互层
    ↓
上下文图谱层
    ↓
Agent 编排层
    ↓
领域模板层
```

---

## 二、核心技术组成

## 1. 节点式画布与图数据建模

传统聊天通常采用线性消息结构：

```text
Message 1 → Message 2 → Message 3
```

本项目将聊天、候选方案和用户决策保存为可编辑的有向图：

```text
用户需求节点
├── 摄影风格候选
│   ├── 夏日清透风【选中】
│   ├── 日系胶片风【淘汰】
│   └── 复古电影风【保留】
├── 场景候选
└── 镜头候选
```

### 涉及能力

- 无限画布、缩放、拖拽、框选和连线
- 节点自动布局
- 分支创建、合并和折叠
- 节点锁定、禁用、归档和删除
- 图状态持久化
- 局部更新与增量渲染
- Undo / Redo
- 快照和版本回滚

### 推荐技术

```text
React
TypeScript
React Flow / XYFlow
Zustand
React Query
ELK.js 或 Dagre
IndexedDB
```

需要区分两类图：

- **产品画布图**：用户看到的创意决策图
- **Agent 执行图**：后端用于执行任务的 LangGraph 工作流

两者需要分开建模，不能直接混用。

---

## 2. 候选卡生成与结构化输出

“抽卡”本质上不是随机抽取，而是：

> AI 针对当前目标生成多组候选方案，由用户选择、淘汰、保留或继续生成。

模型需要返回多个结构统一、方向有差异的候选结果，例如：

```json
{
  "dimension": "photography_style",
  "candidates": [
    {
      "title": "夏日清透",
      "description": "自然光、低对比度、蓝绿色调",
      "tags": ["青春", "自然", "轻盈"],
      "reason": "适合校园和户外环境"
    },
    {
      "title": "日系胶片",
      "description": "暖色偏移、轻颗粒、柔和高光",
      "tags": ["怀旧", "胶片", "温暖"],
      "reason": "强调生活感和回忆感"
    }
  ]
}
```

### 涉及能力

- LLM Structured Output
- JSON Schema
- Pydantic 数据校验
- 多候选生成
- 候选差异性控制
- 语义重复过滤
- 流式生成
- 输出失败重试
- JSON 结构自动修复

### 推荐技术

```text
Python
FastAPI
Pydantic
OpenAI-compatible SDK
Qwen / DeepSeek / OpenAI-compatible Model
SSE
Instructor 或模型原生 Structured Output
```

候选卡不建议按 Token 逐字输出，更适合按“完整卡片”增量推送：

```text
任务开始
→ 候选卡 1 完成
→ 候选卡 2 完成
→ 候选卡 3 完成
→ 生成结束
```

这样既能保留流式体验，也能避免前端接收到不完整 JSON。

---

## 3. Context Graph：结构化上下文管理

这是项目的核心技术。

系统不能只是把聊天消息换成节点后，再把所有文本拼接发给模型。真正的差异在于：

> 每次生成前，根据当前分支、锁定决策、历史偏好和任务目标动态构建上下文快照。

### 节点数据结构示例

```ts
interface ContextNode {
  id: string;
  type: "request" | "candidate" | "decision" | "constraint" | "output";
  domain: "photography" | "product" | "marketing";
  dimension: string;
  content: Record<string, unknown>;

  status: "active" | "selected" | "rejected" | "archived";
  locked: boolean;
  confidence?: number;

  parentIds: string[];
  sourceMessageId?: string;
  createdAt: string;
}
```

### 边关系示例

```ts
interface ContextEdge {
  source: string;
  target: string;
  relation:
    | "expands"
    | "selected_from"
    | "depends_on"
    | "conflicts_with"
    | "replaces"
    | "derived_from";
}
```

### 上下文快照构建逻辑

```text
当前目标
+ 已锁定决策
+ 当前分支祖先节点
+ 与当前任务相关的偏好
+ 必要约束
+ 最近交互
- 已淘汰候选
- 无关分支
- 重复内容
```

### 涉及技术

- 图遍历
- 节点状态过滤
- 依赖关系解析
- 相关上下文检索
- 冲突检测
- Token 预算控制
- 上下文压缩
- 上下文序列化
- 分支级记忆隔离

项目核心价值可以概括为：

> 用结构化图检索替代单纯依赖最近消息和对话摘要。

---

## 4. 用户偏好记忆

系统需要区分不同层级的记忆，避免把一次选择误判为永久偏好。

### 4.1 当前项目决策

仅在当前策划项目中生效：

```text
当前摄影方案选择 85mm、逆光、操场
```

### 4.2 项目内偏好

在同一项目中持续生效：

```text
整体避免高饱和度
```

### 4.3 跨项目长期偏好

经过多次选择后形成：

```text
用户通常偏好自然光、低对比度和留白构图
```

### 偏好数据结构示例

```json
{
  "key": "visual.color_style",
  "value": "low_saturation",
  "weight": 0.76,
  "positiveCount": 5,
  "negativeCount": 1,
  "sourceNodeIds": ["n12", "n37", "n81"],
  "scope": "global"
}
```

### 推荐机制

- 用户选中候选：增加权重
- 用户淘汰候选：降低权重
- 用户锁定节点：覆盖模型推断
- 长期未使用偏好：按时间衰减
- 每条偏好保留来源证据
- 用户可以查看、修改和删除记忆
- 项目级偏好与全局偏好分开存储

第一版不需要复杂推荐算法，采用可解释的权重模型即可。

---

## 5. Agent 与工作流编排

前端呈现自由画布，后端仍需要稳定的执行流程：

```text
识别用户意图
→ 判断当前模板
→ 读取当前分支
→ 检索相关知识
→ 构建上下文快照
→ 生成候选卡
→ 去重与冲突检查
→ 写入节点和关系
→ 更新用户偏好
```

### 推荐技术

```text
LangGraph
Python
FastAPI
Redis
Celery 或 BullMQ
```

### LangGraph 工作流示例

```text
IntentRouter
    ↓
ContextResolver
    ↓
TemplatePlanner
    ↓
KnowledgeRetriever
    ↓
CandidateGenerator
    ↓
DiversityEvaluator
    ↓
ConflictValidator
    ↓
GraphWriter
```

这个项目不建议设计成复杂多智能体系统，更适合：

> 单主 Agent + 多个职责明确的工作节点。

这样可以避免与另一个多智能体平台项目重复。

---

## 6. RAG 与领域知识库

三个模板可以使用三套独立知识空间。

### 6.1 摄影策划知识库

- 景别、焦段和透视
- 构图方法
- 布光方案
- 色彩与情绪
- 拍摄场景
- 动作指导
- 摄影案例

### 6.2 产品策划知识库

- 用户画像模板
- 需求分析方法
- 竞品分析框架
- MVP 划分方法
- 用户故事
- 验收标准
- Roadmap 模板

### 6.3 营销文案知识库

- AIDA、PAS、FAB 等框架
- 渠道文案规范
- 品牌语气
- 优秀文案案例
- 禁用词和合规要求
- 用户受众与卖点模板

### 推荐技术

```text
PostgreSQL
pgvector
MinIO
Embedding Model
向量检索
关键词检索
Reranker
Metadata Filter
```

检索时需要加入领域和节点维度过滤：

```text
domain = photography
dimension = lighting
style = summer_jk
```

避免不同模板的知识互相干扰。

---

## 7. 候选多样性与一致性控制

候选卡不能只是同一句话换词，需要同时保证差异性和一致性。

### 7.1 多样性控制

不同卡片应在核心方向上明显不同：

- 风格
- 受众
- 构图
- 渠道
- 价值主张
- 视觉表达

推荐方式：

- 为每张候选卡预分配策略标签
- Embedding 相似度去重
- MMR 排序
- LLM Judge
- 超过相似度阈值后自动重抽

### 7.2 一致性控制

新候选不能违反已经锁定的上下文。

例如用户已锁定：

```text
自然光
```

AI 后续不应生成：

```text
强烈影棚霓虹灯
```

候选写入画布前需经过：

```text
Candidate
→ Constraint Validator
→ 通过 / 标记冲突 / 拒绝
```

这部分是“可控性”真正落地的技术环节。

---

## 8. Schema 驱动模板系统

三个业务不应写成三套完全独立的硬编码页面，而应使用 Schema 驱动。

### 摄影策划模板示例

```json
{
  "id": "photography-planning",
  "dimensions": [
    "theme",
    "subject",
    "scene",
    "wardrobe",
    "pose",
    "composition",
    "camera",
    "lighting",
    "color"
  ],
  "allowedRelations": [
    "expands",
    "depends_on",
    "conflicts_with"
  ]
}
```

### 产品策划模板维度

```text
目标用户
问题
使用场景
需求
功能
优先级
MVP
Roadmap
```

### 营销文案模板维度

```text
目标受众
核心卖点
投放渠道
品牌语气
创意方向
标题
正文
CTA
```

### 涉及技术

- Schema / DSL 驱动
- 动态节点注册
- 模板配置
- 节点类型约束
- 关系类型约束
- 统一执行引擎
- 领域插件化扩展

对外只展示三套具体模板，不需要将产品宣传成万能平台。

---

## 9. 摄影模板中的 3D 相机与灯光节点

3D 功能只需要服务摄影模板，不必强行泛化到其他业务。

### 推荐技术

```text
Three.js
React Three Fiber
Drei
glTF
```

### 可实现能力

- 相机方位角
- 相机俯仰角
- 拍摄距离
- 焦距与 FOV
- 主光、辅光、轮廓光
- 光源方向
- 光照强度
- 色温
- 人物或商品代理模型
- 相机与灯光参数保存到节点

### 节点输出示例

```json
{
  "camera": {
    "azimuth": 35,
    "elevation": 8,
    "distance": 3.2,
    "focalLength": 85
  },
  "lighting": {
    "key": {
      "azimuth": -45,
      "elevation": 30,
      "intensity": 0.8
    },
    "fillRatio": 0.35,
    "colorTemperature": 5200
  }
}
```

这些参数可以进一步编译为：

- 摄影方案
- 拍摄参数表
- Prompt
- 镜头清单
- 灯光配置

---

## 三、推荐整体技术栈

## 1. 前端

```text
React
TypeScript
React Flow / XYFlow
Zustand
React Query
React Three Fiber
Drei
ELK.js
Tailwind CSS 或 Ant Design
SSE / WebSocket
```

## 2. 后端

```text
Python
FastAPI
LangGraph
Pydantic
SQLAlchemy
PostgreSQL
pgvector
Redis
MinIO
```

## 3. AI 能力

```text
LLM：Qwen / DeepSeek / OpenAI-compatible Model
Embedding：BGE-M3
Reranker：BGE-Reranker
Structured Output：JSON Schema + Pydantic
视觉理解：Qwen-VL
```

## 4. 部署与工程化

```text
Docker Compose
Nginx
GitHub Actions
OpenTelemetry
Langfuse
Prometheus + Grafana（可选）
```

---

## 四、推荐数据架构

```text
Workspace
├── Project
│   ├── Template
│   ├── Graph
│   │   ├── Nodes
│   │   └── Edges
│   ├── Context Snapshots
│   ├── Runs
│   └── Outputs
├── Preference Memory
├── Knowledge Base
└── Assets
```

### 核心数据表

```text
users
projects
templates
graph_nodes
graph_edges
node_versions
generation_runs
candidate_batches
context_snapshots
user_preferences
knowledge_documents
knowledge_chunks
```

### 数据库设计建议

- `graph_nodes.content`：PostgreSQL JSONB
- `templates.schema`：PostgreSQL JSONB
- 节点状态、关系、版本：普通结构化字段
- 向量：pgvector
- 缓存与任务状态：Redis
- 素材与文档：MinIO

第一版没有必要使用 Neo4j。当前规模下，PostgreSQL 节点表、边表和递归 CTE 已经足够。

---

## 五、一次“抽卡”的完整执行流程

用户在摄影节点输入：

> 夏日 JK，但不要太网红，想要自然一点。

系统执行：

```text
1. 获取当前节点及祖先链
2. 获取已经锁定的决策
3. 查询项目级与长期用户偏好
4. 检索摄影知识库
5. 构建 Context Snapshot
6. 调用 LLM 生成多个候选方案
7. 使用 Embedding 进行语义去重
8. 校验候选是否违反已有约束
9. 通过 SSE 逐张写入画布
10. 用户选择、淘汰、保留或继续抽卡
11. 更新节点状态与偏好证据
12. 基于选中节点继续发散
```

### 发送给模型的上下文示例

```xml
<goal>夏日 JK 摄影策划</goal>

<locked_decisions>
  <scene>校园操场</scene>
  <tone>自然、克制、非网红感</tone>
</locked_decisions>

<user_preferences>
  <preference weight="0.81">低饱和度</preference>
  <preference weight="0.73">自然光</preference>
</user_preferences>

<current_task>
  为“构图”维度生成 4 个差异明显的候选卡。
</current_task>
```

系统不再依赖几十轮完整聊天，而是根据节点图动态生成结构化上下文。

---

## 六、最值得写进简历的技术亮点

## 1. 图式上下文管理

将传统线性聊天重构为可查询、可编辑、可追溯的 Context Graph，通过当前分支、祖先节点、锁定决策及语义相关性动态组装模型上下文。

## 2. 候选决策机制

采用结构化输出生成多候选节点，支持选择、淘汰、重抽和继续发散，并通过语义去重与约束校验保证候选差异性和上下文一致性。

## 3. 分层偏好记忆

基于用户显式选择和拒绝建立项目级、领域级及长期偏好记忆，记录来源证据与置信权重，减少上下文截断和摘要压缩导致的偏好丢失。

## 4. Schema 驱动模板

通过模板 Schema 定义节点类型、策划维度和关系约束，以统一执行引擎承载摄影、产品策划和营销文案三种业务场景。

---

## 七、开发范围建议

第一版不建议将三套模板全部做得同样复杂。

### 摄影策划：完整实现

- 节点抽卡
- Context Graph
- 用户偏好记忆
- 摄影知识库
- 3D 相机节点
- 3D 灯光节点
- 摄影方案导出

### 产品策划：中等实现

- 目标用户
- 问题分析
- 功能候选
- MVP 选择
- Roadmap
- PRD 结构化导出

### 营销文案：轻量实现

- 受众选择
- 卖点选择
- 渠道选择
- 文案风格选择
- 标题与正文生成
- 多版本文案导出

这样既能让 HR 看到三个业务模板，又能让技术面试官看出项目的核心深度集中在摄影策划和上下文图管理上。
