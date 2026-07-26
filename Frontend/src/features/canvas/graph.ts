import type { CanvasEdge, CanvasNode } from '../../types/canvas'

export type NodeGroup = {
  id: string
  nodeIds: string[]
  title: string
  description: string
}

/** Returns connected components so the sidebar reflects canvas branches, not individual nodes. */
export function getNodeGroups(nodes: CanvasNode[], edges: CanvasEdge[]): NodeGroup[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const links = new Map<string, Set<string>>()

  for (const node of nodes) links.set(node.id, new Set())
  for (const edge of edges) {
    if (links.has(edge.source) && links.has(edge.target)) {
      links.get(edge.source)?.add(edge.target)
      links.get(edge.target)?.add(edge.source)
    }
  }

  const visited = new Set<string>()
  const groups: NodeGroup[] = []

  for (const node of nodes) {
    if (visited.has(node.id)) continue
    const queue = [node.id]
    const nodeIds: string[] = []
    visited.add(node.id)

    while (queue.length) {
      const current = queue.shift()!
      nodeIds.push(current)
      for (const neighbor of links.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }

    const titles = nodeIds
      .map((id) => nodesById.get(id)?.data.title)
      .filter(Boolean) as string[]
    groups.push({
      id: nodeIds.join('-'),
      nodeIds,
      title: titles[0] ?? '未命名分支',
      description:
        titles.length > 1 ? `${titles[0]} · ${titles.length - 1} 个关联节点` : '未连接节点',
    })
  }

  return groups
}
