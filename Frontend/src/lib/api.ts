import type { AgentRunOptions, CanvasEdge, CanvasNode, KnowledgeItem, ModelConfig, ResponseLanguage } from '../types/canvas'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
export const DEFAULT_PROJECT_ID = 'default'
export const ACTIVE_PROJECT_STORAGE_KEY = 'nodecanvas:active-project-id:v1'

export function currentProjectId() {
  const url = new URL(window.location.href)
  const projectFromUrl = url.pathname.match(/^\/canvas\/([^/]+)$/)?.[1]
  if (projectFromUrl) return projectFromUrl
  return localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) || DEFAULT_PROJECT_ID
}

export type ProjectGraph = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  revision: number
}

export type WorkspaceProject = { id: string; title: string; created_at: string; updated_at: string; cover_url: string | null }

export type AgentRunResponse = {
  run: {
    run_id: string
    provider: string
    status: 'completed' | 'failed'
    summary: string[]
    usage: {
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
      estimated: boolean
    }
    operations: Array<{
      kind: 'create_node' | 'update_node'
      node_id: string
      node_type: CanvasNode['type']
    }>
    candidates: Array<{ title: string; content: string }>
  }
  graph: ProjectGraph
}

export type AgentRunHistoryItem = {
  id: string
  source_node_id: string
  status: 'completed' | 'failed'
  provider: string
  prompt: string
  operation_mode: 'agent' | 'update_source' | 'chat'
  title: string
  category: 'text' | 'image' | 'file' | 'comment' | 'agent'
  response: string
  created_at: string
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(payload?.detail || `请求失败（${response.status}）`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function listWorkspaceProjects() { return apiRequest<WorkspaceProject[]>('/api/projects') }
export function createWorkspaceProject(id: string, title: string) { return apiRequest<WorkspaceProject>('/api/projects', { method: 'POST', body: JSON.stringify({ id, title }) }) }
export function renameWorkspaceProject(id: string, title: string) { return apiRequest<WorkspaceProject>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }) }
export function updateWorkspaceProjectCover(id: string, cover?: string) { return apiRequest<WorkspaceProject>(`/api/projects/${id}/cover`, { method: 'PATCH', body: JSON.stringify({ cover: cover ?? null }) }) }
export async function deleteWorkspaceProject(id: string) { await apiRequest<void>(`/api/projects/${id}`, { method: 'DELETE' }) }
export function copyWorkspaceProject(sourceId: string, id: string, title: string) { return apiRequest<WorkspaceProject>(`/api/projects/${sourceId}/copies`, { method: 'POST', body: JSON.stringify({ id, title }) }) }

export async function loadProjectGraph(projectId = currentProjectId()): Promise<ProjectGraph | null> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/graph`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`读取画布失败（${response.status}）`)
  return response.json() as Promise<ProjectGraph>
}

export function saveProjectGraph(nodes: CanvasNode[], edges: CanvasEdge[], revision = 0, projectId = currentProjectId()) {
  return apiRequest<ProjectGraph>(`/api/projects/${projectId}/graph`, {
    method: 'PUT',
    body: JSON.stringify({ nodes, edges, revision }),
  })
}

export function cancelAgentRun(clientRunId: string, projectId = currentProjectId()) {
  return apiRequest<{ cancelled: boolean }>(`/api/projects/${projectId}/agent/runs/${encodeURIComponent(clientRunId)}/cancel`, { method: 'POST' })
}

export async function createShareLink(nodes: CanvasNode[], edges: CanvasEdge[], revision = 0, projectId = currentProjectId()) {
  const response = await apiRequest<{ id: string }>(`/api/projects/${projectId}/shares`, {
    method: 'POST',
    body: JSON.stringify({ nodes, edges, revision }),
  })
  return `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(response.id)}`
}

export async function loadSharedGraph(shareId: string): Promise<ProjectGraph> {
  const response = await fetch(`${API_BASE_URL}/api/shares/${encodeURIComponent(shareId)}`)
  if (!response.ok) throw new Error(response.status === 404 ? '分享链接不存在或已失效' : `读取分享失败（${response.status}）`)
  return response.json() as Promise<ProjectGraph>
}

export function executeAgent(
  sourceNodeId: string,
  prompt: string,
  model: ModelConfig,
  options: AgentRunOptions,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  revision = 0,
  responseLanguage: ResponseLanguage = 'zh-CN',
  projectId = currentProjectId(),
  signal?: AbortSignal,
  clientRunId?: string,
) {
  return apiRequest<AgentRunResponse>(`/api/projects/${projectId}/agent/runs`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      client_run_id: clientRunId,
      source_node_id: sourceNodeId,
      prompt,
      model: model.name,
      connection: {
        id: model.id,
        name: model.name,
        provider: model.provider,
        model_id: model.modelId,
        base_url: model.baseUrl,
        api_key: model.apiKey,
        protocol: model.protocol,
        capabilities: model.capabilities,
      },
      generation_type: options.generationType,
      operation_mode: 'agent',
      target_node_ids: options.targetNodeIds ?? [],
      response_language: responseLanguage,
      grid: options.grid,
      graph: { nodes, edges, revision },
    }),
  })
}

export function loadAgentRuns(projectId = currentProjectId(), limit = 100) {
  return apiRequest<{ items: AgentRunHistoryItem[] }>(`/api/projects/${projectId}/agent/runs?limit=${limit}`)
}

export function clearAgentRuns(projectId = currentProjectId()) {
  return apiRequest<void>(`/api/projects/${projectId}/agent/runs`, { method: 'DELETE' })
}

export async function executeNodeChat(
  sourceNodeId: string,
  prompt: string,
  model: ModelConfig,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  revision = 0,
  responseLanguage: ResponseLanguage = 'zh-CN',
  projectId = currentProjectId(),
  onDelta?: (content: string, type: 'content' | 'reasoning') => void,
  signal?: AbortSignal,
  clientRunId?: string,
) {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/agent/node-chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      client_run_id: clientRunId,
      source_node_id: sourceNodeId,
      prompt,
      model: model.name,
      connection: {
        id: model.id,
        name: model.name,
        provider: model.provider,
        model_id: model.modelId,
        base_url: model.baseUrl,
        api_key: model.apiKey,
        protocol: model.protocol,
        capabilities: model.capabilities,
      },
      generation_type: '文本',
      operation_mode: 'update_source',
      response_language: responseLanguage,
      grid: { rows: 1, columns: 1 },
      graph: { nodes, edges, revision },
    }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(payload?.detail || `请求失败（${response.status}）`)
  }
  if (!response.body) throw new Error('当前浏览器不支持流式响应。')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const completed: { run?: AgentRunResponse['run']; graph?: ProjectGraph } = {}
  const consumeLine = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as { type: 'reasoning' | 'delta' | 'done' | 'error'; content?: string; message?: string; run?: AgentRunResponse['run']; graph?: ProjectGraph }
    if (event.type === 'reasoning' && event.content) onDelta?.(event.content, 'reasoning')
    if (event.type === 'delta' && event.content) onDelta?.(event.content, 'content')
    if (event.type === 'done' && event.run && event.graph) {
      completed.run = event.run
      completed.graph = event.graph
    }
    if (event.type === 'error') throw new Error(event.message || '节点修改流式响应失败。')
  }
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) consumeLine(line)
    if (done) break
  }
  if (buffer.trim()) consumeLine(buffer)
  if (!completed.run || !completed.graph) throw new Error('节点修改流式响应未正常完成。')
  return { run: completed.run, graph: completed.graph }
}

export async function executeAgentChat(
  sourceNodeId: string,
  prompt: string,
  model: ModelConfig,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  revision = 0,
  responseLanguage: ResponseLanguage = 'zh-CN',
  projectId = currentProjectId(),
  onDelta?: (content: string) => void,
  signal?: AbortSignal,
  clientRunId?: string,
) {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/agent/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      client_run_id: clientRunId,
      source_node_id: sourceNodeId,
      prompt,
      model: model.name,
      connection: {
        id: model.id,
        name: model.name,
        provider: model.provider,
        model_id: model.modelId,
        base_url: model.baseUrl,
        api_key: model.apiKey,
        protocol: model.protocol,
        capabilities: model.capabilities,
      },
      generation_type: '文本',
      operation_mode: 'chat',
      response_language: responseLanguage,
      grid: { rows: 1, columns: 1 },
      graph: { nodes, edges, revision },
    }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(payload?.detail || `请求失败（${response.status}）`)
  }
  if (!response.body) throw new Error('当前浏览器不支持流式响应。')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const completed: { run?: AgentRunResponse['run'] } = {}
  const consumeLine = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as { type: 'delta' | 'done' | 'error'; content?: string; message?: string; run?: AgentRunResponse['run'] }
    if (event.type === 'delta' && event.content) onDelta?.(event.content)
    if (event.type === 'done' && event.run) completed.run = event.run
    if (event.type === 'error') throw new Error(event.message || '流式回答失败。')
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) consumeLine(line)
    if (done) break
  }
  if (buffer.trim()) consumeLine(buffer)
  if (!completed.run) throw new Error('流式回答未正常完成。')
  return { run: completed.run }
}

export function testModelConnection(model: ModelConfig) {
  return apiRequest<{ ok: boolean; latency_ms: number; message: string }>('/api/models/test', {
    method: 'POST',
    body: JSON.stringify({
      name: model.name,
      model_id: model.modelId,
      base_url: model.baseUrl,
      api_key: model.apiKey,
      protocol: model.protocol,
    }),
  })
}

export function uploadKnowledgeDocument(
  document: { id: string; name: string; kind: string; content: string },
  projectId = currentProjectId(),
) {
  return apiRequest<{ id: string; status: string }>(`/api/projects/${projectId}/knowledge/documents`, {
    method: 'POST',
    body: JSON.stringify(document),
  })
}

export function retryKnowledgeDocument(documentId: string, projectId = currentProjectId()) {
  return apiRequest<{ id: string; status: string }>(`/api/projects/${projectId}/knowledge/documents/${documentId}/retry`, { method: 'POST' })
}

type KnowledgeDocumentResponse = { id: string; name: string; kind: string; size: number; created_at: string; status: 'indexed' | 'indexing' | 'failed' }

function formatKnowledgeSize(size: number) {
  if (size < 1024) return `${Math.max(1, size)} 字符`
  return `${Math.ceil(size / 1024)} KB`
}

export async function loadKnowledgeDocuments(projectId = currentProjectId()): Promise<KnowledgeItem[]> {
  const response = await apiRequest<{ items: KnowledgeDocumentResponse[] }>(`/api/projects/${projectId}/knowledge/documents`)
  return response.items.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    size: formatKnowledgeSize(item.size),
    createdAt: item.created_at,
    status: item.status === 'failed' ? '索引失败' : item.status === 'indexing' ? '索引中' : '已索引',
  }))
}

export async function deleteKnowledgeDocument(documentId: string, projectId = currentProjectId()) {
  await apiRequest<void>(`/api/projects/${projectId}/knowledge/documents/${documentId}`, { method: 'DELETE' })
}
