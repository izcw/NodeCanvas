import type { Edge, Node } from '@xyflow/react'

export type CanvasNodeData = {
  title: string
  content?: string
  imageUrl?: string
  fileName?: string
  fileSize?: string
  fileKind?: string
  knowledgeId?: string
  fileStatus?: '已解析' | '待解析'
  format?: 'text' | 'markdown'
  agentStatus?: 'idle' | 'running' | 'completed' | 'failed'
  agentError?: string
  agentRunId?: string
  agentSummary?: string[]
  generationStatus?: 'running' | 'settling'
  generationRunId?: string
}

export type CanvasNode = Node<CanvasNodeData, 'text' | 'image' | 'file' | 'comment'>
export type CanvasEdge = Edge

export type KnowledgeItem = {
  id: string
  name: string
  kind: string
  size: string
  createdAt?: string
  status?: '已索引' | '索引中' | '索引失败'
}

export type AgentRunOptions = {
  generationType: '自动' | '文本' | '图片'
  grid: { rows: number; columns: number }
  targetNodeIds?: string[]
}

export type ModelCapability = 'chat' | 'reasoning' | 'vision' | 'image' | 'ocr' | 'structured-output'
export type ModelProtocol = 'openai-chat' | 'dashscope-image'
export type ResponseLanguage = 'zh-CN' | 'en-US'

export type ModelConfig = {
  id: string
  name: string
  provider: string
  modelId: string
  baseUrl: string
  apiKey: string
  protocol: ModelProtocol
  capabilities: ModelCapability[]
  description: string
  isSystem: boolean
}
