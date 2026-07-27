import { addEdge, Background, BackgroundVariant, BaseEdge, ConnectionMode, getBezierPath, Handle, MiniMap, NodeToolbar, Panel, Position, ReactFlow, SelectionMode, useReactFlow } from '@xyflow/react'
import type { Connection, EdgeProps, OnConnectEnd, OnConnectStart, OnEdgesChange, OnMove, OnNodesChange, XYPosition } from '@xyflow/react'
import { AlignHorizontalSpaceAround, AlignVerticalSpaceAround, BoxSelect, ChevronDown, CircleHelp, Command, Copy, Eye, FolderPlus, Grid2X2, Grid3X3, Link2, LocateFixed, Map, MessageSquareText, Minimize2, Plus, Redo2, Search, Share2, Undo2, Workflow } from 'lucide-react'
import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { CanvasEdge, CanvasNode } from '../../types/canvas'
import type { KnowledgeItem } from '../../types/canvas'
import { AddNodeMenu } from './AddNodeMenu'
import { BrandLogo } from '../BrandLogo'
import { NodeChatComposer } from './NodeChatComposer'
import { nodeTypes } from './nodes'
import { KnowledgePreview } from './KnowledgePreview'
import { FloatingButtonGroup } from '../ui/FloatingButtonGroup'
import { Bot } from 'lucide-react'

type CanvasStageProps = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  onNodesChange: OnNodesChange<CanvasNode>
  onEdgesChange: OnEdgesChange<CanvasEdge>
  setEdges: React.Dispatch<React.SetStateAction<CanvasEdge[]>>
  onAddText: (position?: XYPosition, onCreated?: (id: string) => void) => void
  onAddImage: (position?: XYPosition, onCreated?: (id: string) => void) => void
  onAddFile: (position?: XYPosition, onCreated?: (id: string) => void) => void
  onAddAgent: (position?: XYPosition, onCreated?: (id: string) => void) => void
  onAddComment: (position?: XYPosition) => void
  onChatAnswer: (sourceId: string, prompt: string, model: string) => void
  onAgentRun: (sourceId: string, prompt: string, model: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onNodeDragStart: () => void
  onNodeDragStop: () => void
  knowledgePreview: KnowledgeItem | null
  onCloseKnowledgePreview: () => void
  leftCollapsed: boolean
  agentCollapsed: boolean
  onToggleLeft: () => void
  onToggleAgent: () => void
}

type MenuMode = 'add' | 'context' | 'reference'
type MenuState = { mode: MenuMode; canvasPosition?: XYPosition; screenPosition?: { x: number; y: number } }

const edgeTypes = { flow: FlowEdge }
const canvasNodeTypes = { ...nodeTypes, selectionConnector: SelectionConnectorNode, connectionPreview: ConnectionPreviewNode }

export function CanvasStage({ nodes, edges, onNodesChange, onEdgesChange, setEdges, onAddText, onAddImage, onAddFile, onAddAgent, onAddComment, onChatAnswer, onAgentRun, canUndo, canRedo, onUndo, onRedo, onNodeDragStart, onNodeDragStop, knowledgePreview, onCloseKnowledgePreview, leftCollapsed, agentCollapsed, onToggleLeft, onToggleAgent }: CanvasStageProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [zoom, setZoom] = useState(72)
  const [showMiniMap, setShowMiniMap] = useState(true)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [commentMode, setCommentMode] = useState(false)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [hideEdges, setHideEdges] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(0)
  const [viewMode, setViewMode] = useState<'workflow' | 'storyboard'>('workflow')
  const [presentationMode, setPresentationMode] = useState(false)
  const [selectionDragPosition, setSelectionDragPosition] = useState<XYPosition | null>(null)
  const [selectionGenerateMenu, setSelectionGenerateMenu] = useState<Omit<MenuState, 'mode'> | null>(null)
  const [pendingConnection, setPendingConnection] = useState<{ source: string; sourceHandle: string; canvasPosition: XYPosition } | null>(null)
  const { zoomTo, screenToFlowPosition, fitView, setCenter, setNodes } = useReactFlow<CanvasNode, CanvasEdge>()
  const activeNode = nodes.find((node) => node.id === activeNodeId)
  const selectedNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes])
  const selectedNodeIds = useMemo(() => selectedNodes.map((node) => node.id), [selectedNodes])
  const searchResults = useMemo(() => nodes.filter((node) => `${node.data.title} ${node.data.content ?? ''}`.toLowerCase().includes(query.toLowerCase())), [nodes, query])
  const connectableNodeIds = useMemo(() => new Set(nodes.filter((node) => node.type !== 'comment').map((node) => node.id)), [nodes])
  const visibleEdges = useMemo(() => hideEdges ? [] : edges
    .filter((edge) => connectableNodeIds.has(edge.source) && connectableNodeIds.has(edge.target))
    .map((edge) => {
      const activeFlow = selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target) || focusedNodeId === edge.source || focusedNodeId === edge.target || activeNodeId === edge.source || activeNodeId === edge.target
      return {
        ...edge,
        type: 'flow',
        animated: false,
        style: { ...edge.style, strokeWidth: 2.5 },
        data: { ...edge.data, activeFlow },
      }
    }), [activeNodeId, connectableNodeIds, edges, focusedNodeId, hideEdges, selectedNodeIds])
  const temporaryNodeId = 'pending-connection-target'
  const selectionConnectorId = 'selection-connector'
  const selectionConnector = useMemo(() => {
    if (selectedNodes.length < 2) return null
    const right = Math.max(...selectedNodes.map((node) => node.position.x + (node.measured?.width ?? node.width ?? 0)))
    const top = Math.min(...selectedNodes.map((node) => node.position.y))
    const bottom = Math.max(...selectedNodes.map((node) => node.position.y + (node.measured?.height ?? node.height ?? 0)))
    return { id: selectionConnectorId, type: 'selectionConnector', position: { x: right, y: (top + bottom) / 2 }, data: { title: '' }, className: 'selection-connector-node', width: 2, height: 2, measured: { width: 2, height: 2 }, selectable: false, draggable: false, deletable: false, style: { width: 2, height: 2 } } as unknown as CanvasNode
  }, [selectedNodes])
  const selectionPreviewPosition = selectionDragPosition ?? selectionGenerateMenu?.canvasPosition
  const flowNodes = useMemo(() => {
    const previewPosition = selectionPreviewPosition ?? pendingConnection?.canvasPosition
    const extras = [selectionConnector, previewPosition ? { id: temporaryNodeId, type: 'connectionPreview', position: previewPosition, data: { title: '' }, width: 2, height: 2, measured: { width: 2, height: 2 }, selectable: false, draggable: false, deletable: false, style: { width: 2, height: 2, opacity: 0, pointerEvents: 'none' } } as unknown as CanvasNode : null].filter(Boolean) as CanvasNode[]
    return [...nodes, ...extras]
  }, [nodes, pendingConnection, selectionConnector, selectionPreviewPosition])
  const flowEdges = useMemo(() => {
    if (selectionPreviewPosition) {
      const previewEdges = selectedNodes
        .filter((node) => node.type !== 'comment')
        .map((node) => ({
          ...createEdge({ source: node.id, sourceHandle: 'right-source', target: temporaryNodeId, targetHandle: 'left-target' }),
          id: `selection-preview-${node.id}`,
          data: { activeFlow: true },
        }))
      return [...visibleEdges, ...previewEdges]
    }
    if (!pendingConnection) return visibleEdges
    const previewConnection = pendingConnection.sourceHandle === 'left-context-source'
      ? { source: temporaryNodeId, sourceHandle: 'right-source', target: pendingConnection.source, targetHandle: 'left-target' }
      : { source: pendingConnection.source, sourceHandle: 'right-source', target: temporaryNodeId, targetHandle: 'left-target' }
    return [...visibleEdges, { ...createEdge(previewConnection), data: { activeFlow: true } }]
  }, [pendingConnection, selectedNodes, selectionPreviewPosition, visibleEdges])
  const isValidConnection = useCallback((connection: Connection | CanvasEdge) => connection.source !== connection.target && (connection.sourceHandle === 'right-source' || connection.sourceHandle === 'selection-source') && connection.targetHandle === 'left-target' && (connection.source === selectionConnectorId || connectableNodeIds.has(connection.source)) && connectableNodeIds.has(connection.target), [connectableNodeIds])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditing = target?.matches('input, textarea, [contenteditable="true"]')
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      } else if (!isEditing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) onRedo()
        else onUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onRedo, onUndo])
  useEffect(() => {
    const handleAgentRun = (event: Event) => {
      const { sourceId, prompt, model } = (event as CustomEvent<{ sourceId: string; prompt: string; model: string }>).detail
      onAgentRun(sourceId, prompt, model)
    }
    window.addEventListener('nodecanvas:agent-send', handleAgentRun)
    return () => window.removeEventListener('nodecanvas:agent-send', handleAgentRun)
  }, [onAgentRun])
  useEffect(() => setHighlightedSearchIndex(0), [query, searchOpen])
  useEffect(() => {
    if (!presentationMode) return
    setActiveNodeId(null)
    setMenu(null)
    setSearchOpen(false)
    setShareOpen(false)
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setPresentationMode(false) } }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [presentationMode])
  useEffect(() => {
    if (!leftCollapsed) return
    const bar = document.querySelector('.collapsed-workspace-bar .brand-logo')
    if (!bar) return
    const expand = () => onToggleLeft()
    bar.addEventListener('click', expand)
    return () => bar.removeEventListener('click', expand)
  }, [leftCollapsed, onToggleLeft])
  useEffect(() => {
    if (!searchOpen) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setSearchOpen(false) }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [searchOpen])
  const chooseSearchResult = (node: CanvasNode) => { setActiveNodeId(node.id); setSearchOpen(false); void fitView({ nodes: [{ id: node.id }], duration: 280, padding: 0.3, maxZoom: 1.15 }) }
  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlightedSearchIndex((index) => searchResults.length ? (index + 1) % searchResults.length : 0) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlightedSearchIndex((index) => searchResults.length ? (index - 1 + searchResults.length) % searchResults.length : 0) }
    else if (event.key === 'Enter' && searchResults[highlightedSearchIndex]) { event.preventDefault(); chooseSearchResult(searchResults[highlightedSearchIndex]) }
    else if (event.key === 'Escape') { event.preventDefault(); setSearchOpen(false) }
  }
  const onConnect = useCallback((connection: Connection) => {
    if (commentMode) return
    if (connection.source === selectionConnectorId) {
      if (!connection.target) return
      setEdges((current) => [...current, ...selectedNodes.filter((node) => node.type !== 'comment' && node.id !== connection.target && !current.some((edge) => edge.source === node.id && edge.target === connection.target)).map((node) => createEdge({ source: node.id, sourceHandle: 'right-source', target: connection.target!, targetHandle: connection.targetHandle ?? 'left-target' }))])
      return
    }
    if (!isValidConnection(connection)) return
    setEdges((current) => {
      const alreadyConnected = current.some((edge) => (edge.source === connection.source && edge.target === connection.target) || (edge.source === connection.target && edge.target === connection.source))
      return alreadyConnected ? current : addEdge(createEdge(connection), current)
    })
  }, [commentMode, isValidConnection, selectedNodes, setEdges])
  const onMove: OnMove = useCallback((_, viewport) => setZoom(Math.round(viewport.zoom * 100)), [])
  const changeZoom = (value: number) => { setZoom(value); void zoomTo(value / 100, { duration: 0 }) }

  const arrangeSelectedNodes = (mode: 'grid' | 'horizontal' | 'vertical') => {
    if (selectedNodes.length < 2) return
    const gap = 32
    const getWidth = (node: CanvasNode) => node.measured?.width ?? node.width ?? 0
    const getHeight = (node: CanvasNode) => node.measured?.height ?? node.height ?? 0
    const originX = Math.min(...selectedNodes.map((node) => node.position.x))
    const originY = Math.min(...selectedNodes.map((node) => node.position.y))
    const ordered = [...selectedNodes].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    const columns = Math.ceil(Math.sqrt(ordered.length))
    const maxWidth = Math.max(...ordered.map(getWidth), 0)
    const maxHeight = Math.max(...ordered.map(getHeight), 0)
    setNodes((current) => current.map((node) => {
      const index = ordered.findIndex((item) => item.id === node.id)
      if (index < 0) return node
      if (mode === 'horizontal') return { ...node, position: { ...node.position, x: originX + index * (maxWidth + gap), y: originY } }
      if (mode === 'vertical') return { ...node, position: { ...node.position, x: originX, y: originY + index * (maxHeight + gap) } }
      return { ...node, position: { ...node.position, x: originX + (index % columns) * (maxWidth + gap), y: originY + Math.floor(index / columns) * (maxHeight + gap) } }
    }))
  }

  const duplicateSelectedNodes = () => {
    if (!selectedNodes.length) return
    const copies = selectedNodes.map((node) => ({ ...node, id: `${node.type}-${crypto.randomUUID()}`, position: { x: node.position.x + 36, y: node.position.y + 36 }, selected: true }))
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...copies])
  }

  const setMenuAtPoint = useCallback((bounds: DOMRect, point: { x: number; y: number }, mode: MenuMode = 'add') => {
    const menuWidth = 342
    const menuHeight = 360
    const localX = point.x - bounds.left
    const localY = point.y - bounds.top
    setMenu({ mode, canvasPosition: screenToFlowPosition(point), screenPosition: { x: Math.max(12, Math.min(localX, bounds.width - menuWidth - 12)), y: Math.max(12, Math.min(localY, bounds.height - menuHeight - 12)) } })
  }, [screenToFlowPosition])

  const setSelectionMenuAtPoint = useCallback((bounds: DOMRect, point: { x: number; y: number }) => {
    const menuWidth = 342
    const menuHeight = 360
    const localX = point.x - bounds.left
    const localY = point.y - bounds.top
    setSelectionGenerateMenu({
      canvasPosition: screenToFlowPosition(point),
      screenPosition: {
        x: Math.max(12, Math.min(localX, bounds.width - menuWidth - 12)),
        y: Math.max(12, Math.min(localY, bounds.height - menuHeight - 12)),
      },
    })
  }, [screenToFlowPosition])

  const onConnectStart: OnConnectStart = useCallback((event, { nodeId, handleId }) => {
    if (nodeId !== selectionConnectorId || handleId !== 'selection-source') return
    const point = getClientPoint(event)
    if (!point) return
    setMenu(null)
    setPendingConnection(null)
    setSelectionGenerateMenu(null)
    setSelectionDragPosition(screenToFlowPosition(point))
  }, [screenToFlowPosition])

  useEffect(() => {
    if (!selectionDragPosition) return
    const followPointer = (event: MouseEvent | TouchEvent) => {
      const point = getClientPoint(event)
      if (point) setSelectionDragPosition(screenToFlowPosition(point))
    }
    window.addEventListener('mousemove', followPointer)
    window.addEventListener('touchmove', followPointer)
    return () => {
      window.removeEventListener('mousemove', followPointer)
      window.removeEventListener('touchmove', followPointer)
    }
  }, [screenToFlowPosition, selectionDragPosition])

  const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
    const fromSelection = connectionState.fromNode?.id === selectionConnectorId
    if (fromSelection) setSelectionDragPosition(null)
    if (commentMode || connectionState.isValid || !connectionState.fromNode) return
    const point = getClientPoint(event)
    if (!point) return
    const eventTarget = event.target instanceof HTMLElement ? event.target : null
    const elementsAtPoint = document.elementsFromPoint(point.x, point.y)
    const target = eventTarget?.closest('.react-flow__node') ?? elementsAtPoint.map((element) => element.closest('.react-flow__node')).find(Boolean) ?? null
    const droppedHandle = eventTarget?.closest('.react-flow__handle') ?? elementsAtPoint.find((element) => element.classList.contains('react-flow__handle'))
    const droppedHandleId = connectionState.toHandle?.id ?? droppedHandle?.getAttribute('data-handleid')
    const targetId = connectionState.toNode?.id ?? target?.getAttribute('data-id')

    if (fromSelection) {
      const stage = document.querySelector('.canvas-stage')
      if (stage instanceof HTMLElement) setSelectionMenuAtPoint(stage.getBoundingClientRect(), point)
      return
    }
    if (connectionState.fromNode.type === 'comment') return

    if (!target) {
      const stage = event.target instanceof Element ? event.target.closest('.canvas-stage') : null
      if (!stage) return
      const sourceHandle = connectionState.fromHandle?.id === 'left-context-source' ? 'left-context-source' : 'right-source'
      setPendingConnection({ source: connectionState.fromNode.id, sourceHandle, canvasPosition: screenToFlowPosition(point) })
      setMenuAtPoint(stage.getBoundingClientRect(), point, sourceHandle === 'left-context-source' ? 'context' : 'reference')
      return
    }

    if (!targetId || targetId === connectionState.fromNode.id || !connectableNodeIds.has(targetId)) return
    const fromContextHandle = connectionState.fromHandle?.id === 'left-context-source'
    const droppedOnOppositeSide = fromContextHandle
      ? droppedHandleId === 'right-source'
      : droppedHandleId === 'left-target' || droppedHandleId === 'left-context-source'
    if (!droppedOnOppositeSide) return
    const targetRect = target.getBoundingClientRect()
    setEdges((current) => {
      const alreadyConnected = current.some((edge) => (edge.source === connectionState.fromNode.id && edge.target === targetId) || (edge.source === targetId && edge.target === connectionState.fromNode.id))
      if (alreadyConnected) return current
      const connection = fromContextHandle
        ? { source: targetId, sourceHandle: 'right-source', target: connectionState.fromNode.id, targetHandle: 'left-target' }
        : { source: connectionState.fromNode.id, sourceHandle: 'right-source', target: targetId, targetHandle: nearestHandle(targetRect, point) }
      return addEdge(createEdge(connection), current)
    })
  }, [commentMode, connectableNodeIds, screenToFlowPosition, setEdges, setMenuAtPoint, setSelectionMenuAtPoint])

  useEffect(() => {
    const openConnectionMenu = (event: Event) => {
      const { sourceId, side, x, y } = (event as CustomEvent<{ sourceId: string; side: 'context' | 'reference'; x: number; y: number }>).detail
      const stage = document.querySelector('.canvas-stage')
      if (!(stage instanceof HTMLElement)) return
      const sourceHandle = side === 'context' ? 'left-context-source' : 'right-source'
      const point = { x, y }
      setPendingConnection({ source: sourceId, sourceHandle, canvasPosition: screenToFlowPosition(point) })
      setMenuAtPoint(stage.getBoundingClientRect(), point, side)
    }
    window.addEventListener('nodecanvas:open-connection-menu', openConnectionMenu)
    return () => window.removeEventListener('nodecanvas:open-connection-menu', openConnectionMenu)
  }, [screenToFlowPosition, setMenuAtPoint])

  useEffect(() => {
    const openSelectionMenu = (event: Event) => {
      const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail
      const stage = document.querySelector('.canvas-stage')
      if (!(stage instanceof HTMLElement)) return
      setMenu(null)
      setPendingConnection(null)
      setSelectionDragPosition(null)
      setSelectionMenuAtPoint(stage.getBoundingClientRect(), { x, y })
    }
    window.addEventListener('nodecanvas:open-selection-menu', openSelectionMenu)
    return () => window.removeEventListener('nodecanvas:open-selection-menu', openSelectionMenu)
  }, [setSelectionMenuAtPoint])

  const openMenuAtCursor = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (!target?.classList.contains('react-flow__pane') || commentMode || presentationMode) return
    const bounds = event.currentTarget.getBoundingClientRect()
    setMenuAtPoint(bounds, { x: event.clientX, y: event.clientY }, 'add')
  }

  const closeMenu = () => { setMenu(null); setPendingConnection(null) }
  const connectCreatedNode = (id: string) => {
    if (!pendingConnection) {
      closeMenu()
      return
    }
    setEdges((current) => {
      const alreadyConnected = current.some((edge) => (edge.source === pendingConnection.source && edge.target === id) || (edge.source === id && edge.target === pendingConnection.source))
      if (alreadyConnected) return current
      const connection = pendingConnection.sourceHandle === 'left-context-source'
        ? { source: id, sourceHandle: 'right-source', target: pendingConnection.source, targetHandle: 'left-target' }
        : { source: pendingConnection.source, sourceHandle: 'right-source', target: id, targetHandle: 'left-target' }
      return addEdge(createEdge(connection), current)
    })
    closeMenu()
  }

  const connectSelectionToCreatedNode = (id: string) => {
    if (!selectedNodes.length) return
    setEdges((current) => {
      const additions = selectedNodes
        .filter((node) => node.type !== 'comment')
        .filter((node) => node.id !== id && !current.some((edge) => edge.source === node.id && edge.target === id))
        .map((node) => createEdge({ source: node.id, sourceHandle: 'right-source', target: id, targetHandle: 'left-target' }))
      return additions.length ? [...current, ...additions] : current
    })
    setSelectionGenerateMenu(null)
  }

  return <section className={`canvas-stage ${commentMode ? 'comment-mode' : ''} ${presentationMode ? 'presentation-mode' : ''} ${knowledgePreview ? 'has-knowledge-preview' : ''} ${selectionDragPosition ? 'selection-connecting' : ''}`} onDoubleClickCapture={openMenuAtCursor} onContextMenuCapture={(event) => { event.preventDefault(); if (presentationMode) event.stopPropagation() }}>
    <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={canvasNodeTypes} edgeTypes={edgeTypes} connectionMode={ConnectionMode.Loose} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_, node) => setFocusedNodeId(node.id)} onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop} onConnect={onConnect} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd} isValidConnection={isValidConnection} onEdgeClick={(_, edge) => setEdges((current) => current.map((item) => ({ ...item, selected: item.id === edge.id })))} onNodeDoubleClick={(_, node) => { if (!presentationMode && !commentMode && node.type !== 'agent') { closeMenu(); setActiveNodeId(node.id) } }} onPaneClick={(event) => { if (presentationMode) return; if (commentMode) onAddComment(screenToFlowPosition({ x: event.clientX, y: event.clientY })); else { setActiveNodeId(null); setFocusedNodeId(null); setEdges((current) => current.map((item) => ({ ...item, selected: false }))) } }} onMove={onMove} fitView zoomOnDoubleClick={false} zoomOnScroll={false} panOnScroll panOnScrollSpeed={1.5} zoomOnPinch minZoom={0.2} maxZoom={2} connectionRadius={110} snapToGrid={snapToGrid} snapGrid={[20, 20]} nodesConnectable={!commentMode && !presentationMode} nodesDraggable={!presentationMode} elementsSelectable={!presentationMode} panOnDrag={[2]} selectionOnDrag={!presentationMode} selectionMode={SelectionMode.Partial} defaultEdgeOptions={{ style: { stroke: '#73869a', strokeWidth: 2.5 } }} deleteKeyCode={presentationMode ? null : ['Backspace', 'Delete']} selectionKeyCode="Shift" multiSelectionKeyCode="Shift" proOptions={{ hideAttribution: true }} aria-label="节点式创意策划画布">
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.15} color="#70747a" />
      {showMiniMap && <MiniMap position="bottom-left" className="canvas-minimap" pannable zoomable onClick={(_, point) => { void setCenter(point.x, point.y, { zoom: zoom / 100, duration: 260 }) }} nodeColor={(node) => node.type === 'image' ? '#426e7a' : node.type === 'file' ? '#756347' : '#5b526f'} maskColor="rgba(8, 9, 11, 0.72)" />}
      <CanvasTopbar viewMode={viewMode} onViewModeChange={setViewMode} onShare={() => setShareOpen((value) => !value)} shareOpen={shareOpen} onSearch={() => setSearchOpen(true)} presentationMode={presentationMode} onTogglePresentation={() => setPresentationMode((value) => !value)} leftCollapsed={leftCollapsed} agentCollapsed={agentCollapsed} onToggleAgent={onToggleAgent} />
      <CanvasDock onAdd={() => setMenu({ mode: 'add' })} commentMode={commentMode} onToggleComment={() => { setCommentMode((value) => !value); setActiveNodeId(null) }} canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />
      <ViewportControls zoom={zoom} miniMapVisible={showMiniMap} snapToGrid={snapToGrid} hideEdges={hideEdges} onChangeZoom={changeZoom} onToggleMiniMap={() => setShowMiniMap((value) => !value)} onToggleSnap={() => setSnapToGrid((value) => !value)} onToggleEdges={() => setHideEdges((value) => !value)} onReset={() => void fitView({ duration: 180, padding: 0.22 })} />
      {selectedNodes.length > 1 && <NodeToolbar nodeId={selectedNodeIds} position={Position.Top} align="center" isVisible className="selection-toolbar"><button aria-label="打组"><FolderPlus size={16} /><span>打组</span></button><span className="selection-toolbar-divider" /><button aria-label="宫格排列" title="宫格排列" onClick={() => arrangeSelectedNodes('grid')}><Grid2X2 size={16} /><span>宫格</span></button><button aria-label="水平排列" title="水平排列" onClick={() => arrangeSelectedNodes('horizontal')}><AlignHorizontalSpaceAround size={16} /><span>水平</span></button><button aria-label="垂直排列" title="垂直排列" onClick={() => arrangeSelectedNodes('vertical')}><AlignVerticalSpaceAround size={16} /><span>垂直</span></button><button aria-label="创建副本" title="创建副本" onClick={duplicateSelectedNodes}><Copy size={16} /><span>副本</span></button></NodeToolbar>}
      {activeNode && selectedNodes.length < 2 && <NodeToolbar nodeId={activeNode.id} position={Position.Bottom} align="center" isVisible className="node-chat-panel"><NodeChatComposer key={activeNode.id} nodeTitle={activeNode.data.title} nodes={nodes} onClose={() => setActiveNodeId(null)} onSend={(prompt, model) => { onChatAnswer(activeNode.id, prompt, model); setActiveNodeId(null) }} /></NodeToolbar>}
    </ReactFlow>
    {searchOpen && <div className="node-search-overlay" onMouseDown={() => setSearchOpen(false)}><div className="node-search-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="node-search-input"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKeyDown} placeholder="搜索节点…" /></div><div className="node-search-results">{searchResults.map((node, index) => <button key={node.id} className={index === highlightedSearchIndex ? 'highlighted' : ''} aria-selected={index === highlightedSearchIndex} onMouseEnter={() => setHighlightedSearchIndex(index)} onClick={() => chooseSearchResult(node)}><span>{node.data.title}</span><small>{node.type}</small></button>)}</div></div></div>}
    {menu && <AddNodeMenu title={menu.mode === 'context' ? '添加上下文' : menu.mode === 'reference' ? '引用该节点生成' : '添加节点'} showAgent={menu.mode !== 'context'} showImage={menu.mode !== 'context'} location={menu.screenPosition} onText={() => onAddText(menu.canvasPosition, connectCreatedNode)} onImage={() => onAddImage(menu.canvasPosition, connectCreatedNode)} onFile={() => onAddFile(menu.canvasPosition, connectCreatedNode)} onAgent={() => onAddAgent(menu.canvasPosition, connectCreatedNode)} onClose={closeMenu} />}
    {selectionGenerateMenu && <AddNodeMenu title="引用该节点生成" location={selectionGenerateMenu.screenPosition} onText={() => onAddText(selectionGenerateMenu.canvasPosition, connectSelectionToCreatedNode)} onImage={() => onAddImage(selectionGenerateMenu.canvasPosition, connectSelectionToCreatedNode)} onFile={() => onAddFile(selectionGenerateMenu.canvasPosition, connectSelectionToCreatedNode)} onAgent={() => onAddAgent(selectionGenerateMenu.canvasPosition, connectSelectionToCreatedNode)} onClose={() => setSelectionGenerateMenu(null)} />}
    {knowledgePreview && <KnowledgePreview item={knowledgePreview} onClose={onCloseKnowledgePreview} />}
  </section>
}

function createEdge(connection: Connection): CanvasEdge {
  return { ...connection, id: `edge-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}-${Date.now()}`, type: 'flow', animated: false, selected: false, style: { stroke: '#8294a6', strokeWidth: 2.5 } }
}

function SelectionConnectorNode() {
  const openMenu = (event: React.MouseEvent) => {
    event.stopPropagation()
    window.dispatchEvent(new CustomEvent('nodecanvas:open-selection-menu', {
      detail: { x: event.clientX, y: event.clientY },
    }))
  }
  return <Handle id="selection-source" type="source" position={Position.Right} className="selection-connect-handle" aria-label="引用所有选中的节点生成" title="拖拽连接或点击生成" onClick={openMenu} />
}

function ConnectionPreviewNode() {
  return <>
    <Handle id="left-target" type="target" position={Position.Left} />
    <Handle id="right-source" type="source" position={Position.Right} />
  </>
}

function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const activeFlow = data?.activeFlow === true

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={style}
      className={`edge-flow-path${activeFlow ? ' is-active' : ''}`}
    />
  )
}

function getClientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ('touches' in event) { const touch = event.changedTouches[0]; return touch ? { x: touch.clientX, y: touch.clientY } : null }
  return { x: event.clientX, y: event.clientY }
}

function nearestHandle(rect: DOMRect, point: { x: number; y: number }) {
  void rect
  void point
  return 'left-target'
}

function CanvasTopbar({ viewMode, onViewModeChange, onShare, shareOpen, onSearch, presentationMode, onTogglePresentation, leftCollapsed, agentCollapsed, onToggleAgent }: { viewMode: 'workflow' | 'storyboard'; onViewModeChange: (mode: 'workflow' | 'storyboard') => void; onShare: () => void; shareOpen: boolean; onSearch: () => void; presentationMode: boolean; onTogglePresentation: () => void; leftCollapsed: boolean; agentCollapsed: boolean; onToggleAgent: () => void }) { return <Panel position="top-center" className="canvas-topbar"><div className="topbar-left">{leftCollapsed && <FloatingButtonGroup className="left-collapsed-button"><div className="collapsed-workspace-bar"><BrandLogo /><span className="collapsed-canvas-divider" /><button className="collapsed-canvas-switcher">画布 1<ChevronDown size={14} /></button></div></FloatingButtonGroup>}<FloatingButtonGroup className="view-switcher"><button className={viewMode === 'workflow' ? 'active' : ''} onClick={() => onViewModeChange('workflow')}><Workflow size={15} />工作流</button><button className={viewMode === 'storyboard' ? 'active' : ''} onClick={() => onViewModeChange('storyboard')}><BoxSelect size={15} />故事板</button></FloatingButtonGroup></div><div className="topbar-right"><FloatingButtonGroup className="canvas-actions"><button aria-label="分享" onClick={onShare}><Share2 size={16} /></button>{shareOpen && <span className="share-popover">通过链接分享</span>}<span className="token-counter">12,480 tokens</span><button aria-label="搜索节点" onClick={onSearch}><Search size={16} /></button></FloatingButtonGroup><button className="presentation-toggle" onClick={onTogglePresentation} aria-label={presentationMode ? "退出全屏预览" : "全屏预览"}>{presentationMode ? <Minimize2 size={16} /> : <Eye size={16} />}</button>{agentCollapsed && <FloatingButtonGroup className="agent-collapsed-button"><button onClick={onToggleAgent} aria-label="展开 Agent"><Bot size={16} />Agent</button></FloatingButtonGroup>}</div></Panel> }
function CanvasDock({ onAdd, commentMode, onToggleComment, canUndo, canRedo, onUndo, onRedo }: { onAdd: () => void; commentMode: boolean; onToggleComment: () => void; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) { return <Panel position="bottom-center" className="canvas-dock"><FloatingButtonGroup><button className="add-primary" onClick={onAdd} aria-label="添加节点"><Plus size={22} /></button><button className={commentMode ? 'active comment-tool' : 'comment-tool'} onClick={onToggleComment} aria-label={commentMode ? '退出备注模式' : '进入备注模式'}><MessageSquareText size={18} /></button><button aria-label="自动布局"><Workflow size={18} /></button><span className="dock-divider" /><button onClick={onUndo} disabled={!canUndo} aria-label="撤回上一步" title="撤回上一步（⌘Z）"><Undo2 size={18} /></button><button onClick={onRedo} disabled={!canRedo} aria-label="下一步" title="下一步（⇧⌘Z）"><Redo2 size={18} /></button><span className="dock-divider" /><button aria-label="快捷键"><Command size={18} /></button><button aria-label="帮助"><CircleHelp size={18} /></button></FloatingButtonGroup></Panel> }
function ViewportControls({ zoom, miniMapVisible, snapToGrid, hideEdges, onChangeZoom, onToggleMiniMap, onToggleSnap, onToggleEdges, onReset }: { zoom: number; miniMapVisible: boolean; snapToGrid: boolean; hideEdges: boolean; onChangeZoom: (value: number) => void; onToggleMiniMap: () => void; onToggleSnap: () => void; onToggleEdges: () => void; onReset: () => void }) { return <Panel position="bottom-left" className="viewport-controls"><FloatingButtonGroup><button className={miniMapVisible ? 'active' : ''} onClick={onToggleMiniMap} aria-label="显示或隐藏小地图"><Map size={19} /></button><button className={snapToGrid ? 'active' : ''} onClick={onToggleSnap} aria-label="切换网格吸附"><Grid3X3 size={19} /></button><button onClick={onReset} aria-label="完整显示全部节点"><LocateFixed size={19} /></button><button className={hideEdges ? 'active' : ''} onClick={onToggleEdges} aria-label="隐藏连接线"><Link2 size={19} /></button><span className="viewport-divider" /><input type="range" min="20" max="200" value={zoom} onChange={(event) => onChangeZoom(Number(event.target.value))} aria-label="画布缩放" /></FloatingButtonGroup></Panel> }
