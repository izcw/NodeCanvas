import type { CanvasNodeData } from '../types/canvas'

export const DEFAULT_TEXT_NODE_TITLE = '未命名文本'

export function deriveTextNodeTitle(content?: string, fallback = DEFAULT_TEXT_NODE_TITLE): string {
  const line = (content ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+/, ''))
    .find(Boolean)
  if (!line) return fallback
  const normalized = line
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[>*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return fallback
  return normalized.length > 28 ? `${normalized.slice(0, 28).trimEnd()}…` : normalized
}

export function shouldAutoUpdateTextNodeTitle(data: CanvasNodeData): boolean {
  return data.titleMode === 'auto' || !data.title || data.title === '灵感笔记' || data.title === 'Agent 回应' || data.title === DEFAULT_TEXT_NODE_TITLE
}
