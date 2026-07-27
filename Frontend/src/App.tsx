import { ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react'
import type { XYPosition } from '@xyflow/react'
import { ChangeEvent, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CanvasStage } from './components/canvas/CanvasStage'
import { LeftSidebar } from './components/layout/LeftSidebar'
import { RightAssistant } from './components/layout/RightAssistant'
import { getNodeGroups } from './features/canvas/graph'
import { initialEdges, initialNodes } from './features/canvas/initialCanvas'
import type { CanvasEdge, CanvasNode, CanvasNodeData, KnowledgeItem } from './types/canvas'

type CanvasSnapshot = { nodes: CanvasNode[]; edges: CanvasEdge[] }

function cloneSnapshot(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasSnapshot {
  return structuredClone({ nodes, edges })
}

function snapshotKey(nodes: CanvasNode[], edges: CanvasEdge[]) {
  return JSON.stringify({
    nodes: nodes.map(({ id, type, position, data, style, width, height }) => ({ id, type, position, data, style, width, height })),
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
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [agentCollapsed, setAgentCollapsed] = useState(true)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [historyTick, setHistoryTick] = useState(0)
  const [sidebarTab, setSidebarTab] = useState<'canvas' | 'knowledge'>('canvas')
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([
    { id: 'knowledge-brief', name: '键盘产品卖点.pdf', kind: 'PDF', size: '1.8 MB' },
    { id: 'knowledge-style', name: '键盘内容方向.md', kind: 'MD', size: '16 KB' },
  ])
  const [activeKnowledge, setActiveKnowledge] = useState<KnowledgeItem | null>(null)
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
    const size = file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`
    setKnowledge((current) => [{ id: `knowledge-${Date.now()}`, name: file.name, kind: file.name.split('.').pop()?.toUpperCase() || 'FILE', size }, ...current])
    event.target.value = ''
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
  const editCurrentNode = (sourceId: string, prompt: string, model: string) => {
    setNodes((current) => current.map((node) => node.id === sourceId ? {
      ...node,
      data: {
        ...node.data,
        ...(node.type === 'text' || node.type === 'comment'
          ? { content: `使用 ${model}：\n${prompt}` }
          : { title: prompt }),
      },
    } : node))
  }

  const runAgentNode = useCallback((sourceId: string, prompt: string, model: string) => {
    const source = nodes.find((node) => node.id === sourceId)
    if (!source) return
    const directOutputIds = edges
      .filter((edge) => edge.source === sourceId && (!edge.sourceHandle || edge.sourceHandle === 'right-source'))
      .map((edge) => edge.target)
    const contextIds = edges
      .filter((edge) => edge.target === sourceId && (!edge.targetHandle || edge.targetHandle === 'left-target'))
      .map((edge) => edge.source)
    const context = nodes
      .filter((node) => contextIds.includes(node.id))
      .map((node) => `${node.data.title}：${node.data.content ?? node.data.fileName ?? ''}`)
      .filter(Boolean)
      .join('\n')
    const result = `${context ? `引用上下文：\n${context}\n\n` : ''}使用 ${model}：\n${prompt}`
    const requestedTarget = nodes.find((node) => directOutputIds.includes(node.id) && prompt.includes(`@${node.data.title}`))
    const shouldModify = /修改|改写|更新|调整|优化|润色|modify|update|rewrite|edit/i.test(prompt)
    const target = requestedTarget ?? (shouldModify ? nodes.find((node) => directOutputIds.includes(node.id)) : undefined)

    if (target) {
      setNodes((current) => current.map((node) => node.id === target.id ? {
        ...node,
        data: {
          ...node.data,
          ...(node.type === 'text' || node.type === 'comment'
            ? { content: result }
            : { title: prompt.replace(`@${node.data.title}`, '').trim() || node.data.title }),
        },
      } : node))
      return
    }

    const id = `text-${Date.now()}`
    const position = { x: source.position.x + (source.measured?.width ?? source.width ?? 470) + 120, y: source.position.y + directOutputIds.length * 280 }
    setNodes((current) => [...current, { id, type: 'text', position, style: { width: 360, height: 240 }, data: { title: 'Agent 回应', content: result } }])
    setEdges((current) => [...current, { id: `agent-answer-${Date.now()}`, source: sourceId, sourceHandle: 'right-source', target: id, targetHandle: 'left-target', animated: false, style: { stroke: '#88a0b7', strokeWidth: 2.5 } }])
  }, [edges, nodes, setEdges, setNodes])

  return <main className={`app-shell ${leftCollapsed ? 'left-collapsed' : ''} ${agentCollapsed ? 'agent-collapsed' : ''}`}>
    <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/*" onChange={onImageSelected} />
    <input ref={fileInputRef} className="visually-hidden" type="file" onChange={onFileSelected} />
    <input ref={knowledgeInputRef} className="visually-hidden" type="file" onChange={onKnowledgeSelected} />
    <LeftSidebar collapsed={leftCollapsed} tab={sidebarTab} groups={groups} nodes={nodes} knowledge={knowledge} onTabChange={setSidebarTab} onToggle={() => setLeftCollapsed((value) => !value)} onFocusGroup={focusGroup} onRenameNode={(id, title) => setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, title } } : node))} onUploadKnowledge={chooseKnowledge} onSelectKnowledge={setActiveKnowledge} onNewCanvas={() => { setNodes([]); setEdges([]); setActiveKnowledge(null); setSidebarTab('canvas') }} />
    <CanvasStage nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} setEdges={setEdges} onAddText={(position, onCreated) => addText('', position, onCreated)} onAddImage={chooseImage} onAddFile={chooseFile} onAddAgent={addAgent} onAddComment={addComment} onChatAnswer={editCurrentNode} onAgentRun={runAgentNode} canUndo={historyState.canUndo} canRedo={historyState.canRedo} onUndo={undo} onRedo={redo} onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop} knowledgePreview={activeKnowledge} onCloseKnowledgePreview={() => setActiveKnowledge(null)} leftCollapsed={leftCollapsed} agentCollapsed={agentCollapsed} onToggleLeft={() => setLeftCollapsed((value) => !value)} onToggleAgent={() => setAgentCollapsed((value) => !value)} />
    <RightAssistant collapsed={agentCollapsed} onToggle={() => setAgentCollapsed((value) => !value)} onCreateText={(content) => addText(content)} />
  </main>
}

export function App() {
  return <ReactFlowProvider><Workspace /></ReactFlowProvider>
}
