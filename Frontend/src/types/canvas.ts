import type { Edge, Node } from '@xyflow/react'

export type CanvasNodeData = {
  title: string
  content?: string
  imageUrl?: string
  fileName?: string
  fileSize?: string
  fileKind?: string
}

export type CanvasNode = Node<CanvasNodeData, 'text' | 'image' | 'file' | 'comment'>
export type CanvasEdge = Edge

export type KnowledgeItem = {
  id: string
  name: string
  kind: string
  size: string
}
