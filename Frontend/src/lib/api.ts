import type { AgentRunOptions, CanvasEdge, CanvasNode, ModelConfig, ResponseLanguage } from '../types/canvas'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
export const DEFAULT_PROJECT_ID = 'default'
export const ACTIVE_PROJECT_STORAGE_KEY = 'nodecanvas:active-project-id:v1'

function currentProjectId() {
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
  }
  graph: ProjectGraph
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
) {
  return apiRequest<AgentRunResponse>(`/api/projects/${projectId}/agent/runs`, {
    method: 'POST',
    body: JSON.stringify({
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

export function executeNodeChat(
  sourceNodeId: string,
  prompt: string,
  model: ModelConfig,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  revision = 0,
  responseLanguage: ResponseLanguage = 'zh-CN',
  projectId = currentProjectId(),
) {
  return apiRequest<AgentRunResponse>(`/api/projects/${projectId}/agent/runs`, {
    method: 'POST',
    body: JSON.stringify({
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
