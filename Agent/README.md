# NodeCanvas Agent

Agent 已实现为 LangGraph `StateGraph`，和用户可见的 XYFlow 产品画布分开：

```text
START
  → resolve_context
  → generate_candidates
  → validate_candidates
  → compile_operations
  → END
```

当前约束：

- 只读取 Agent 左侧直接入边，避免无关分支污染上下文。
- “修改/改写/更新”等请求只允许修改右侧直接出边目标。
- 普通生成会在 Agent 右侧创建结果节点并自动连线。
- 宫格选择映射为 `rows × columns` 个候选，服务端再次校验最大 4×4。
- 上下文、候选和写图操作均使用 Pydantic 结构化模型。
- 模型结果先完成数量与重复校验，通过后才编译为画布操作。

聊天/推理/视觉模型通过 OpenAI-compatible Provider 调用；百炼生图通过独立的同步图像 Provider 调用并创建图片节点。详细设计见根目录 [agent.md](../agent.md)。
