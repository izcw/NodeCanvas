import { ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from '@xyflow/react'
import type { XYPosition } from '@xyflow/react'
import { ChangeEvent, useCallback, useMemo, useRef, useState } from 'react'
import { CanvasStage } from './components/canvas/CanvasStage'
import { LeftSidebar } from './components/layout/LeftSidebar'
import { RightAssistant } from './components/layout/RightAssistant'
import { getNodeGroups } from './features/canvas/graph'
import { initialEdges, initialNodes } from './features/canvas/initialCanvas'
import type { CanvasNodeData, KnowledgeItem } from './types/canvas'

function Workspace() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [agentCollapsed, setAgentCollapsed] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'canvas' | 'knowledge'>('canvas')
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([
    { id: 'knowledge-brief', name: '品牌拍摄需求.pdf', kind: 'PDF', size: '2.4 MB' },
    { id: 'knowledge-style', name: '视觉风格参考.md', kind: 'MD', size: '18 KB' },
  ])
  const [activeKnowledge, setActiveKnowledge] = useState<KnowledgeItem | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const knowledgeInputRef = useRef<HTMLInputElement>(null)
  const pendingNodePosition = useRef<XYPosition | undefined>(undefined)
  const { fitView } = useReactFlow()
  const groups = useMemo(() => getNodeGroups(nodes, edges).filter((group) => group.nodeIds.length > 1), [nodes, edges])

  const addCanvasNode = useCallback((type: 'text' | 'image' | 'file' | 'comment', data: CanvasNodeData, canvasPosition?: XYPosition) => {
    const id = `${type}-${Date.now()}`
    const position = canvasPosition ?? { x: 180 + (nodes.length % 3) * 360, y: 180 + (nodes.length % 4) * 120 }
    const dimensions = type === 'text' ? { width: 330, height: 252 } : type === 'image' ? { width: 360, height: 258 } : type === 'file' ? { width: 320, height: 112 } : { width: 220, height: 145 }
    setNodes((current) => [...current, { id, type, position, data, style: dimensions }])
    window.setTimeout(() => fitView({ nodes: [{ id }], duration: 350, maxZoom: 1.1 }), 30)
  }, [fitView, nodes.length, setNodes])

  const addText = useCallback((content = '', position?: XYPosition) => addCanvasNode('text', { title: content ? 'Agent 回应' : '灵感笔记', content }, position), [addCanvasNode])
  const addComment = (position?: XYPosition) => addCanvasNode('comment', { title: '备注', content: '' }, position)
  const chooseImage = (position?: XYPosition) => { pendingNodePosition.current = position; imageInputRef.current?.click() }
  const chooseFile = (position?: XYPosition) => { pendingNodePosition.current = position; fileInputRef.current?.click() }
  const chooseKnowledge = () => knowledgeInputRef.current?.click()
  const onImageSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => addCanvasNode('image', { title: file.name.replace(/\.[^.]+$/, ''), imageUrl: String(reader.result) }, pendingNodePosition.current)
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
    addCanvasNode('file', { title: '项目附件', fileName: file.name, fileSize: size, fileKind: file.name.split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE' }, pendingNodePosition.current)
    event.target.value = ''
  }
  const focusGroup = (nodeIds: string[]) => fitView({ nodes: nodeIds.map((id) => ({ id })), duration: 400, padding: 0.3 })
  const addChatAnswer = (sourceId: string, prompt: string, model: string) => {
    const source = nodes.find((node) => node.id === sourceId)
    const id = `text-${Date.now()}`
    const position = { x: (source?.position.x ?? 160) + 40, y: (source?.position.y ?? 120) + 330 }
    setNodes((current) => [...current, { id, type: 'text', position, style: { width: 360, height: 240 }, data: { title: 'Agent 回应', content: `使用 ${model}：\n${prompt}` } }])
    setEdges((current) => [...current, { id: `agent-answer-${Date.now()}`, source: sourceId, sourceHandle: 'bottom-source', target: id, targetHandle: 'top-target', animated: true, style: { stroke: '#88a0b7', strokeWidth: 2.5 } }])
  }

  return <main className={`app-shell ${leftCollapsed ? 'left-collapsed' : ''} ${agentCollapsed ? 'agent-collapsed' : ''}`}>
    <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/*" onChange={onImageSelected} />
    <input ref={fileInputRef} className="visually-hidden" type="file" onChange={onFileSelected} />
    <input ref={knowledgeInputRef} className="visually-hidden" type="file" onChange={onKnowledgeSelected} />
    <LeftSidebar collapsed={leftCollapsed} tab={sidebarTab} groups={groups} knowledge={knowledge} onTabChange={setSidebarTab} onToggle={() => setLeftCollapsed((value) => !value)} onFocusGroup={focusGroup} onUploadKnowledge={chooseKnowledge} onSelectKnowledge={setActiveKnowledge} />
    <CanvasStage nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} setEdges={setEdges} onAddText={(position) => addText('', position)} onAddImage={chooseImage} onAddFile={chooseFile} onAddComment={addComment} onChatAnswer={addChatAnswer} knowledgePreview={activeKnowledge} onCloseKnowledgePreview={() => setActiveKnowledge(null)} leftCollapsed={leftCollapsed} agentCollapsed={agentCollapsed} onToggleLeft={() => setLeftCollapsed((value) => !value)} onToggleAgent={() => setAgentCollapsed((value) => !value)} />
    <RightAssistant collapsed={agentCollapsed} onToggle={() => setAgentCollapsed((value) => !value)} onCreateText={(content) => addText(content)} />
  </main>
}

export function App() {
  return <ReactFlowProvider><Workspace /></ReactFlowProvider>
}
