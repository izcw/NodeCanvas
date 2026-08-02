import { ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react'
import type { XYPosition } from '@xyflow/react'
import { ChangeEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CanvasStage } from './components/canvas/CanvasStage'
import { LeftSidebar } from './components/layout/LeftSidebar'
import { RightAssistant } from './components/layout/RightAssistant'
import { getNodeGroups } from './features/canvas/graph'
import { initialEdges, initialNodes } from './features/canvas/initialCanvas'
import type { AgentRunOptions, CanvasEdge, CanvasNode, CanvasNodeData, KnowledgeItem, ModelConfig } from './types/canvas'
import { createShareLink, deleteKnowledgeDocument, executeAgent, executeNodeChat, loadKnowledgeDocuments, loadProjectGraph, loadSharedGraph, saveProjectGraph, uploadKnowledgeDocument } from './lib/api'
import { ModelRegistryProvider, useModelRegistry } from './features/models/ModelRegistryContext'
import { ModelManagerDialog } from './features/models/ModelManagerDialog'
import { ProjectWorkspaceHome, ProjectWorkspaceProvider } from './features/workspace/ProjectWorkspace'

type CanvasSnapshot = { nodes: CanvasNode[]; edges: CanvasEdge[] }
type PendingAgentModification = {
  sourceId: string
  prompt: string
  model: ModelConfig
  options: AgentRunOptions
  targets: Array<{ id: string; title: string }>
  selectedTargetIds: string[]
}
const GENERATION_SETTLE_MS = 3200

function delay(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration))
}

function agentProgressSummary(elapsedMs: number, contextCount: number, resultCount: number, modelName: string) {
  const elapsed = Math.max(.1, elapsedMs / 1000).toFixed(1)
  if (elapsedMs < 700) return [`正在读取 ${contextCount} 个直接上下文…`, `已用时 ${elapsed} 秒`]
  if (elapsedMs < 1800) return ['正在整理提示词与输出约束…', `已用时 ${elapsed} 秒`]
  if (elapsedMs < 4000) return [`${modelName} 正在生成 ${resultCount} 个候选结果…`, `已用时 ${elapsed} 秒`]
  return [`${modelName} 仍在生成并校验结果…`, `已等待 ${elapsed} 秒`]
}

function clearTransientNodeState(nodes: CanvasNode[]) {
  return nodes.map((node) => ({
    ...node,
    className: node.className?.split(/\s+/).filter((name) => name && name !== 'modification-target').join(' ') || undefined,
    data: {
      ...node.data,
      agentStatus: undefined,
      agentError: undefined,
      agentSummary: undefined,
      generationStatus: undefined,
      generationRunId: undefined,
    },
  }))
}

function setModificationTargetClass(node: CanvasNode, selected: boolean): CanvasNode {
  const classNames = (node.className ?? '').split(/\s+/).filter((name) => name && name !== 'modification-target')
  return { ...node, selected, className: selected ? [...classNames, 'modification-target'].join(' ') : classNames.join(' ') || undefined }
}

function cloneSnapshot(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasSnapshot {
  return structuredClone({ nodes, edges })
}

function snapshotKey(nodes: CanvasNode[], edges: CanvasEdge[]) {
  return JSON.stringify({
    nodes: nodes.map(({ id, type, position, data, style, width, height }) => {
      const { agentStatus: _agentStatus, agentError: _agentError, agentRunId: _agentRunId, agentSummary: _agentSummary, generationStatus: _generationStatus, generationRunId: _generationRunId, ...persistentData } = data
      return { id, type, position, data: persistentData, style, width, height }
    }),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle })),
  })
}

function focusNewNodeEditor(id: string, type: 'text' | 'comment' | 'agent') {
  const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)
  const editor = node?.querySelector<HTMLElement>(type === 'agent' ? '.node-chat-editor' : 'textarea')
  if (!editor) return
  editor.focus()
  if (editor instanceof HTMLTextAreaElement) {
    const end = editor.value.length
    editor.setSelectionRange(end, end)
    return
  }
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function Workspace() {
  const { recordTokenUsage, responseLanguage } = useModelRegistry()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [agentCollapsed, setAgentCollapsed] = useState(true)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [historyTick, setHistoryTick] = useState(0)
  const [sidebarTab, setSidebarTab] = useState<'canvas' | 'knowledge'>('canvas')
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([])
  const [activeKnowledge, setActiveKnowledge] = useState<KnowledgeItem | null>(null)
  const [graphReady, setGraphReady] = useState(false)
  const [agentRunning, setAgentRunning] = useState(false)
  const [pendingAgentModification, setPendingAgentModification] = useState<PendingAgentModification | null>(null)
  const shareId = useMemo(() => new URLSearchParams(window.location.search).get('share'), [])
  const [readOnlyShare, setReadOnlyShare] = useState(Boolean(shareId))
  const graphRevisionRef = useRef(0)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const knowledgeInputRef = useRef<HTMLInputElement>(null)
  const pendingNodePosition = useRef<XYPosition | undefined>(undefined)
  const pendingNodeCreated = useRef<((id: string) => void) | undefined>(undefined)
  const { fitView } = useReactFlow()
  const groups = useMemo(() => getNodeGroups(nodes, edges).filter((group) => group.nodeIds.length > 1), [nodes, edges])
  const historyRef = useRef<{ past: CanvasSnapshot[]; future: CanvasSnapshot[] }>({ past: [], future: [] })
  const lastSnapshotRef = useRef<CanvasSnapshot>(cloneSnapshot(initialNodes, initialEdges))
  const lastSnapshotKeyRef = useRef(snapshotKey(initialNodes, initialEdges))
  const isDraggingRef = useRef(false)

  useEffect(() => {
    let active = true
    if (shareId) {
      void loadSharedGraph(shareId)
        .then((graph) => {
          if (!active) return
          setNodes(clearTransientNodeState(graph.nodes))
          setEdges(graph.edges)
          graphRevisionRef.current = graph.revision
        })
        .catch((error) => {
          console.warn('Failed to load shared canvas.', error)
          if (active) setReadOnlyShare(false)
        })
        .finally(() => { if (active) setGraphReady(true) })
      return () => { active = false }
    }
    void loadProjectGraph()
      .then(async (graph) => {
        if (!active) return
        if (graph) {
          setNodes(clearTransientNodeState(graph.nodes))
          setEdges(graph.edges)
          graphRevisionRef.current = graph.revision
        } else {
          const stored = await saveProjectGraph(initialNodes, initialEdges)
          if (active) graphRevisionRef.current = stored.revision
        }
      })
      .catch((error) => {
        console.warn('NodeCanvas backend is unavailable; keeping the in-memory canvas.', error)
      })
      .finally(() => {
        if (active) setGraphReady(true)
      })
    void loadKnowledgeDocuments()
      .then((items) => { if (active) setKnowledge(items) })
      .catch((error) => console.warn('Failed to load knowledge documents.', error))
    return () => { active = false }
  }, [setEdges, setNodes, shareId])

  useEffect(() => {
    if (!graphReady || readOnlyShare || agentRunning || nodes.some((node) => node.data.generationStatus)) return
    const timeout = window.setTimeout(() => {
      void saveProjectGraph(nodes, edges, graphRevisionRef.current)
        .then((graph) => { graphRevisionRef.current = graph.revision })
        .catch((error) => console.warn('Failed to persist canvas graph.', error))
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [agentRunning, edges, graphReady, nodes, readOnlyShare])

  useLayoutEffect(() => {
    if (isDraggingRef.current) return
    const key = snapshotKey(nodes, edges)
    if (key === lastSnapshotKeyRef.current) return
    historyRef.current.past.push(lastSnapshotRef.current)
    if (historyRef.current.past.length > 80) historyRef.current.past.shift()
    historyRef.current.future = []
    lastSnapshotRef.current = cloneSnapshot(nodes, edges)
    lastSnapshotKeyRef.current = key
    setHistoryState({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    })
  }, [edges, historyTick, nodes])

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true
  }, [])

  const onNodeDragStop = useCallback(() => {
    isDraggingRef.current = false
    setHistoryTick((tick) => tick + 1)
  }, [])

  const restoreSnapshot = useCallback((snapshot: CanvasSnapshot) => {
    lastSnapshotRef.current = cloneSnapshot(snapshot.nodes, snapshot.edges)
    lastSnapshotKeyRef.current = snapshotKey(snapshot.nodes, snapshot.edges)
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
  }, [setEdges, setNodes])

  const undo = useCallback(() => {
    const previous = historyRef.current.past.pop()
    if (!previous) return
    historyRef.current.future.unshift(cloneSnapshot(nodes, edges))
    restoreSnapshot(previous)
    setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: true })
  }, [edges, nodes, restoreSnapshot])

  const redo = useCallback(() => {
    const next = historyRef.current.future.shift()
    if (!next) return
    historyRef.current.past.push(cloneSnapshot(nodes, edges))
    restoreSnapshot(next)
    setHistoryState({ canUndo: true, canRedo: historyRef.current.future.length > 0 })
  }, [edges, nodes, restoreSnapshot])

  const addCanvasNode = useCallback((type: 'text' | 'image' | 'file' | 'comment' | 'agent', data: CanvasNodeData, canvasPosition?: XYPosition, onCreated?: (id: string) => void) => {
    const id = `${type}-${Date.now()}`
    const position = canvasPosition ?? { x: 180 + (nodes.length % 3) * 360, y: 180 + (nodes.length % 4) * 120 }
    const dimensions = type === 'text' ? { width: 330, height: 252 } : type === 'image' ? { width: 360, height: 258 } : type === 'file' ? { width: 320, height: 112 } : type === 'agent' ? { width: 470, height: 340 } : { width: 220, height: 145 }
    setNodes((current) => [...current, { id, type, position, data, style: dimensions }])
    onCreated?.(id)
    window.setTimeout(() => {
      void fitView({ nodes: [{ id }], duration: 350, maxZoom: 1.1 })
      if (type === 'text' || type === 'comment' || type === 'agent') focusNewNodeEditor(id, type)
    }, 80)
  }, [fitView, nodes.length, setNodes])

  const addText = useCallback((content = '', position?: XYPosition, onCreated?: (id: string) => void) => addCanvasNode('text', { title: content ? 'Agent 回应' : '灵感笔记', content }, position, onCreated), [addCanvasNode])
  const addAgent = useCallback((position?: XYPosition, onCreated?: (id: string) => void) => addCanvasNode('agent', { title: 'Agent', content: '' }, position, onCreated), [addCanvasNode])
  const addComment = (position?: XYPosition) => addCanvasNode('comment', { title: '备注', content: '' }, position)
  const chooseImage = (position?: XYPosition, onCreated?: (id: string) => void) => { pendingNodePosition.current = position; pendingNodeCreated.current = onCreated; imageInputRef.current?.click() }
  const chooseFile = (position?: XYPosition, onCreated?: (id: string) => void) => { pendingNodePosition.current = position; pendingNodeCreated.current = onCreated; fileInputRef.current?.click() }
  const chooseKnowledge = () => knowledgeInputRef.current?.click()
  const onImageSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { addCanvasNode('image', { title: file.name.replace(/\.[^.]+$/, ''), imageUrl: String(reader.result) }, pendingNodePosition.current, pendingNodeCreated.current); pendingNodeCreated.current = undefined }
    reader.readAsDataURL(file)
    event.target.value = ''
  }
  const onKnowledgeSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const id = `knowledge-${Date.now()}`
    const size = file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`
    const kind = file.name.split('.').pop()?.toUpperCase() || 'FILE'
    const item: KnowledgeItem = { id, name: file.name, kind, size, status: '索引中' }
    setKnowledge((current) => [item, ...current])
    const isText = file.type.startsWith('text/') || /\.(md|txt|json|csv|tsv|html?|xml)$/i.test(file.name)
    void (isText ? file.text() : Promise.resolve('')).then((content) =>
      uploadKnowledgeDocument({ id, name: file.name, kind, content }),
    ).then(() => {
      setKnowledge((current) => current.map((entry) => entry.id === id ? { ...entry, status: '已索引' } : entry))
    }).catch((error) => {
      console.warn('Failed to index knowledge document.', error)
      setKnowledge((current) => current.map((entry) => entry.id === id ? { ...entry, status: '索引失败' } : entry))
    })
    event.target.value = ''
  }
  const removeKnowledge = (item: KnowledgeItem) => {
    if (!window.confirm(`删除知识库文件“${item.name}”？此操作不会删除画布上的附件节点。`)) return
    const previous = knowledge
    setKnowledge((current) => current.filter((entry) => entry.id !== item.id))
    if (activeKnowledge?.id === item.id) setActiveKnowledge(null)
    void deleteKnowledgeDocument(item.id).catch((error) => {
      console.warn('Failed to delete knowledge document.', error)
      setKnowledge(previous)
    })
  }
  const attachKnowledgeToCanvas = (item: KnowledgeItem) => {
    addCanvasNode('file', {
      title: item.name.replace(/\.[^.]+$/, '') || '知识库附件',
      fileName: item.name,
      fileSize: item.size,
      fileKind: item.kind,
      fileStatus: item.status === '已索引' ? '已解析' : '待解析',
      knowledgeId: item.id,
      content: `知识库附件：${item.name}`,
    })
    setSidebarTab('canvas')
  }
  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const size = file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`
    addCanvasNode('file', { title: '项目附件', fileName: file.name, fileSize: size, fileKind: file.name.split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE' }, pendingNodePosition.current, pendingNodeCreated.current)
    pendingNodeCreated.current = undefined
    event.target.value = ''
  }
  const focusGroup = (nodeIds: string[]) => fitView({ nodes: nodeIds.map((id) => ({ id })), duration: 400, padding: 0.3 })
  const shareCurrentCanvas = useCallback(() => createShareLink(nodes, edges, graphRevisionRef.current), [edges, nodes])
  const editCurrentNode = async (sourceId: string, prompt: string, model: ModelConfig) => {
    const generationRunId = crypto.randomUUID()
    setAgentRunning(true)
    setNodes((current) => current.map((node) => node.id === sourceId
      ? { ...node, data: { ...node.data, generationStatus: 'running', generationRunId } }
      : node))
    try {
      const { graph, run } = await executeNodeChat(sourceId, prompt, model, nodes, edges, graphRevisionRef.current, responseLanguage)
      recordTokenUsage(model, run.usage)
      setNodes(graph.nodes.map((node) => node.id === sourceId
        ? { ...node, data: { ...node.data, generationStatus: 'settling', generationRunId: run.run_id } }
        : node))
      setEdges(graph.edges)
      graphRevisionRef.current = graph.revision
      await delay(GENERATION_SETTLE_MS)
      setNodes((current) => current.map((node) => node.id === sourceId && node.data.generationRunId === run.run_id
        ? { ...node, data: { ...node.data, generationStatus: undefined, generationRunId: undefined } }
        : node))
      return run.summary
    } catch (error) {
      setNodes((current) => current.map((node) => node.id === sourceId && node.data.generationRunId === generationRunId
        ? { ...node, data: { ...node.data, generationStatus: undefined, generationRunId: undefined } }
        : node))
      throw error
    } finally {
      setAgentRunning(false)
    }
  }

  const runAgentNode = useCallback((sourceId: string, prompt: string, model: ModelConfig, options: AgentRunOptions, decision?: 'modify' | 'create') => {
    const optimisticRunId = crypto.randomUUID()
    const source = nodes.find((node) => node.id === sourceId)
    if (!source) return
    const directOutputs = edges
      .filter((edge) => edge.source === sourceId && (!edge.sourceHandle || edge.sourceHandle === 'right-source'))
      .map((edge) => nodes.find((node) => node.id === edge.target))
      .filter((node): node is CanvasNode => Boolean(node))
    const shouldModify = /修改|改写|更新|调整|优化|润色|modify|update|rewrite|edit/i.test(prompt)
    const mentionedTarget = directOutputs.find((node) => prompt.includes(`@${node.data.title}`))
    const mentionedTargetIndex = mentionedTarget ? prompt.indexOf(`@${mentionedTarget.data.title}`) : -1
    const mentionPrefix = mentionedTargetIndex >= 0 ? prompt.slice(0, mentionedTargetIndex) : ''
    const directModifyMention = Boolean(mentionedTarget && /(?:修改|改写|更新|调整|优化|润色|modify|update|rewrite|edit)\s*(?:一下)?\s*$/i.test(mentionPrefix) && !/(参考|引用|借鉴|参考一下)\s*$/i.test(mentionPrefix))
    const explicitTargets = directOutputs.filter((node) => options.targetNodeIds?.includes(node.id))
    const updateTargets = decision === 'create' ? [] : explicitTargets.length ? explicitTargets : options.grid.rows * options.grid.columns === 1 ? [mentionedTarget ?? (shouldModify ? directOutputs[0] : undefined)].filter((node): node is CanvasNode => Boolean(node)) : []
    const updateTarget = updateTargets[0]
    const updateTargetIds = new Set(updateTargets.map((node) => node.id))
    if (updateTarget && !decision && !directModifyMention) {
      setPendingAgentModification({ sourceId, prompt, model, options, targets: directOutputs.map((node) => ({ id: node.id, title: node.data.title })), selectedTargetIds: [updateTarget.id] })
      setNodes((current) => current.map((node) => setModificationTargetClass(node, node.id === updateTarget.id)))
      return
    }
    const effectiveOptions = updateTargets.length > 1 ? { ...options, targetNodeIds: updateTargets.map((node) => node.id), grid: { rows: Math.ceil(updateTargets.length / 4), columns: Math.min(4, updateTargets.length) } } : { ...options, targetNodeIds: updateTargets.map((node) => node.id) }
    const contextCount = edges.filter((edge) => edge.target === sourceId && (!edge.targetHandle || edge.targetHandle === 'left-target')).length
    const resultCount = effectiveOptions.grid.rows * effectiveOptions.grid.columns
    const startedAt = performance.now()
    const optimisticNodes: CanvasNode[] = []
    const optimisticEdges: CanvasEdge[] = []
    if (!updateTarget) {
      const styledWidth = Number(source.style?.width)
      const sourceWidth = source.measured?.width ?? source.width ?? (Number.isFinite(styledWidth) ? styledWidth : 470)
      const occupiedRight = Math.max(source.position.x + sourceWidth, ...directOutputs.map((node) => node.position.x + (node.measured?.width ?? node.width ?? Number(node.style?.width) ?? 360)))
      const originX = occupiedRight + 96
      const originY = source.position.y
      const count = effectiveOptions.grid.rows * effectiveOptions.grid.columns
      for (let index = 0; index < count; index += 1) {
        const id = `pending-agent-${optimisticRunId}-${index}`
        const nodeType = options.generationType === '图片' ? 'image' : 'text'
        optimisticNodes.push({
          id,
          type: nodeType,
          position: {
            x: originX + (index % effectiveOptions.grid.columns) * 408,
            y: originY + Math.floor(index / effectiveOptions.grid.columns) * 288,
          },
          style: { width: 360, height: 240 },
          data: {
            title: `${effectiveOptions.generationType}结果 ${String(index + 1).padStart(2, '0')}`,
            content: '正在生成内容…',
            ...(effectiveOptions.generationType === '文本' ? { format: 'markdown' as const } : {}),
            generationStatus: 'running',
            generationRunId: optimisticRunId,
          },
        })
        optimisticEdges.push({
          id: `pending-edge-${optimisticRunId}-${index}`,
          source: sourceId,
          sourceHandle: 'right-source',
          target: id,
          targetHandle: 'left-target',
          animated: false,
          style: { stroke: '#88a0b7', strokeWidth: 2.5 },
        })
      }
    }
    setAgentRunning(true)
    setNodes((current) => [
      ...current.map((node) => node.id === sourceId
        ? { ...node, data: { ...node.data, agentStatus: 'running' as const, agentError: undefined, agentSummary: agentProgressSummary(0, contextCount, resultCount, model.name) } }
        : updateTargetIds.has(node.id)
          ? { ...node, data: { ...node.data, generationStatus: 'running' as const, generationRunId: optimisticRunId } }
          : node),
      ...optimisticNodes,
    ])
    if (optimisticEdges.length) setEdges((current) => [...current, ...optimisticEdges])
    window.setTimeout(() => {
      const visibleRunNodes = updateTargets.length
        ? [{ id: sourceId }, ...updateTargets.map((node) => ({ id: node.id }))]
        : [{ id: sourceId }, ...optimisticNodes.map((node) => ({ id: node.id }))]
      void fitView({ nodes: visibleRunNodes, duration: 360, padding: 0.22, maxZoom: 1.05 })
    }, 40)
    const progressTimer = window.setInterval(() => {
      const elapsedMs = performance.now() - startedAt
      setNodes((current) => current.map((node) => node.id === sourceId && node.data.agentStatus === 'running'
        ? { ...node, data: { ...node.data, agentSummary: agentProgressSummary(elapsedMs, contextCount, resultCount, model.name) } }
        : node))
    }, 500)
    void executeAgent(sourceId, prompt, model, effectiveOptions, nodes, edges, graphRevisionRef.current, responseLanguage)
      .then(({ graph, run }) => {
        recordTokenUsage(model, run.usage)
        const operatedNodeIds = new Set(run.operations.map((operation) => operation.node_id))
        setNodes(graph.nodes.map((node) => node.id === sourceId
          ? { ...node, data: { ...node.data, agentStatus: 'completed', agentRunId: run.run_id, agentSummary: undefined } }
          : operatedNodeIds.has(node.id)
            ? { ...node, data: { ...node.data, generationStatus: 'settling', generationRunId: run.run_id } }
            : node))
        setEdges(graph.edges)
        graphRevisionRef.current = graph.revision
        window.setTimeout(() => {
          setNodes((current) => current.map((node) => node.data.generationRunId === run.run_id
            ? { ...node, data: { ...node.data, generationStatus: undefined, generationRunId: undefined } }
            : node))
        }, GENERATION_SETTLE_MS)
      })
      .catch((error: Error) => {
        setNodes((current) => current
          .filter((node) => node.data.generationRunId !== optimisticRunId || updateTargetIds.has(node.id))
          .map((node) => node.id === sourceId
            ? { ...node, data: { ...node.data, agentStatus: 'failed', agentError: error.message, agentSummary: ['执行未完成。', error.message] } }
            : node.data.generationRunId === optimisticRunId
              ? { ...node, data: { ...node.data, generationStatus: undefined, generationRunId: undefined } }
              : node))
        setEdges((current) => current.filter((edge) => !edge.id.startsWith(`pending-edge-${optimisticRunId}`)))
      })
      .finally(() => {
        window.clearInterval(progressTimer)
        setAgentRunning(false)
      })
  }, [edges, fitView, nodes, recordTokenUsage, responseLanguage, setEdges, setNodes])

  const confirmationAnchor = pendingAgentModification ? document.querySelector<HTMLElement>(`.react-flow__node[data-id="${pendingAgentModification.sourceId}"] .node-chat-send`)?.getBoundingClientRect() : null
  const toggleModificationTarget = (id: string) => {
    if (!pendingAgentModification) return
    if (!pendingAgentModification.targets.some((target) => target.id === id)) return
    const selectedTargetIds = pendingAgentModification.selectedTargetIds.includes(id)
      ? pendingAgentModification.selectedTargetIds.filter((targetId) => targetId !== id)
      : [...pendingAgentModification.selectedTargetIds, id]
    setPendingAgentModification({ ...pendingAgentModification, selectedTargetIds })
    const selectableIds = new Set(pendingAgentModification.targets.map((target) => target.id))
    setNodes((current) => current.map((node) => setModificationTargetClass(node, selectableIds.has(node.id) && selectedTargetIds.includes(node.id))))
  }

  const shellClassName = readOnlyShare
    ? 'app-shell read-only-share-shell'
    : `app-shell ${leftCollapsed ? 'left-collapsed' : ''} ${agentCollapsed ? 'agent-collapsed' : ''}`

  const handleProjectChange = useCallback((project: { id: string }, isNew: boolean) => {
    setGraphReady(false)
    graphRevisionRef.current = 0
    setNodes([])
    setEdges([])
    setActiveKnowledge(null)
    setSidebarTab('canvas')
    void loadProjectGraph(project.id)
      .then(async (graph) => {
        if (graph) {
          setNodes(clearTransientNodeState(graph.nodes))
          setEdges(graph.edges)
          graphRevisionRef.current = graph.revision
        } else if (isNew) {
          const stored = await saveProjectGraph([], [], 0, project.id)
          graphRevisionRef.current = stored.revision
        }
      })
      .catch((error) => console.warn('Failed to switch project graph.', error))
      .finally(() => setGraphReady(true))
    void loadKnowledgeDocuments(project.id)
      .then((items) => setKnowledge(items))
      .catch((error) => console.warn('Failed to switch project knowledge base.', error))
  }, [setEdges, setNodes])

  return <ProjectWorkspaceProvider onProjectChange={handleProjectChange}><ProjectWorkspaceHome hidden={readOnlyShare} /><main className={shellClassName}>
    <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/*" onChange={onImageSelected} />
    <input ref={fileInputRef} className="visually-hidden" type="file" onChange={onFileSelected} />
    <input ref={knowledgeInputRef} className="visually-hidden" type="file" onChange={onKnowledgeSelected} />
    {!readOnlyShare && <LeftSidebar collapsed={leftCollapsed} tab={sidebarTab} groups={groups} nodes={nodes} knowledge={knowledge} onTabChange={setSidebarTab} onToggle={() => setLeftCollapsed((value) => !value)} onFocusGroup={focusGroup} onRenameNode={(id, title) => setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, title } } : node))} onUploadKnowledge={chooseKnowledge} onSelectKnowledge={setActiveKnowledge} onAttachKnowledge={attachKnowledgeToCanvas} onDeleteKnowledge={removeKnowledge} onNewCanvas={() => { setNodes([]); setEdges([]); setActiveKnowledge(null); setSidebarTab('canvas') }} />}
    <CanvasStage nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} setEdges={setEdges} onAddText={(position, onCreated) => addText('', position, onCreated)} onAddImage={chooseImage} onAddFile={chooseFile} onAddAgent={addAgent} onAddComment={addComment} onChatAnswer={editCurrentNode} onAgentRun={runAgentNode} canUndo={historyState.canUndo} canRedo={historyState.canRedo} onUndo={undo} onRedo={redo} onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop} knowledgePreview={activeKnowledge} onCloseKnowledgePreview={() => setActiveKnowledge(null)} leftCollapsed={leftCollapsed} agentCollapsed={agentCollapsed} onToggleLeft={() => setLeftCollapsed((value) => !value)} onToggleAgent={() => setAgentCollapsed((value) => !value)} readOnly={readOnlyShare} onCreateShareLink={shareCurrentCanvas} modificationTargetIds={pendingAgentModification?.selectedTargetIds} onToggleModificationTarget={toggleModificationTarget} />
    {!readOnlyShare && <RightAssistant collapsed={agentCollapsed} onToggle={() => setAgentCollapsed((value) => !value)} onCreateText={(content) => addText(content)} />}
    {pendingAgentModification && confirmationAnchor && <section className="agent-modification-popover" role="dialog" aria-label="确认 Agent 执行方式" style={{ left: confirmationAnchor.right, top: confirmationAnchor.top - 10 }}><span>将修改</span><div className="agent-modification-targets">{pendingAgentModification.targets.map((target) => <button key={target.id} className={pendingAgentModification.selectedTargetIds.includes(target.id) ? 'selected' : ''} onClick={() => toggleModificationTarget(target.id)}>@{target.title}</button>)}</div><small>点击节点名称可增加或取消修改；画布中的紫色高亮表示会被修改。</small><footer><button onClick={() => { setNodes((current) => current.map((node) => setModificationTargetClass(node, false))); setPendingAgentModification(null) }}>取消</button>{pendingAgentModification.selectedTargetIds.length === 0 ? <button className="agent-modification-create" onClick={() => { const pending = pendingAgentModification; setNodes((current) => current.map((node) => setModificationTargetClass(node, false))); setPendingAgentModification(null); runAgentNode(pending.sourceId, pending.prompt, pending.model, pending.options, 'create') }}>新生成</button> : <button className="agent-modification-confirm" onClick={() => { const pending = pendingAgentModification; const selectedIds = pending.selectedTargetIds; setNodes((current) => current.map((node) => setModificationTargetClass(node, false))); setPendingAgentModification(null); runAgentNode(pending.sourceId, pending.prompt, pending.model, { ...pending.options, targetNodeIds: selectedIds }, 'modify') }}>确认修改</button>}</footer></section>}
  </main></ProjectWorkspaceProvider>
}

export function App() {
  return <ModelRegistryProvider><ReactFlowProvider><Workspace /><ModelManagerDialog /></ReactFlowProvider></ModelRegistryProvider>
}
