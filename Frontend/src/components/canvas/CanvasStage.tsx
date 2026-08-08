import { addEdge, Background, BackgroundVariant, BaseEdge, ConnectionMode, getBezierPath, Handle, MiniMap, NodeToolbar, Panel, Position, ReactFlow as BaseReactFlow, SelectionMode, useReactFlow } from '@xyflow/react'
import type { Connection, EdgeProps, OnConnectEnd, OnConnectStart, OnEdgesChange, OnMove, OnNodesChange, ReactFlowProps, XYPosition } from '@xyflow/react'
import { AlignHorizontalSpaceAround, AlignVerticalSpaceAround, BoxSelect, ChevronDown, Copy, Eye, FolderPlus, Grid2X2, Grid3X3, History, Link2, LocateFixed, Map, MessageSquareText, Minimize2, Plus, Redo2, Search, Share2, Trash2, Undo2, Workflow, X } from 'lucide-react'
import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentRunOptions, CanvasEdge, CanvasNode, ModelConfig } from '../../types/canvas'
import type { KnowledgeItem } from '../../types/canvas'
import { AddNodeMenu } from './AddNodeMenu'
import { BrandLogo } from '../BrandLogo'
import { NodeChatComposer } from './NodeChatComposer'
import { CanvasNodeReadOnlyContext, nodeTypes } from './nodes'
import { KnowledgePreview } from './KnowledgePreview'
import { FloatingButtonGroup } from '../ui/FloatingButtonGroup'
import { Bot } from 'lucide-react'
import { formatTokenCount, useModelRegistry } from '../../features/models/ModelRegistryContext'
import { toPng } from 'html-to-image'
import { clearAgentRuns, currentProjectId, loadAgentRuns } from '../../lib/api'

type CanvasStageProps = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  onNodesChange: OnNodesChange<CanvasNode>
  onEdgesChange: OnEdgesChange<CanvasEdge>
  setEdges: React.Dispatch<React.SetStateAction<CanvasEdge[]>>
  onAddText: (position?: XYPosition, onCreated?: (id: string) => void) => void
  onAddImage: (position?: XYPosition, onCreated?: (id: string) => void) => void
  onAddFile: (position?: XYPosition, onCreated?: (id: string) => void) => void
  onAddComment: (position?: XYPosition) => void
  onChatAnswer: (sourceId: string, prompt: string, model: ModelConfig, onDelta?: (content: string, type: 'content' | 'reasoning') => void, signal?: AbortSignal) => Promise<string[]>
  onAgentRun: (sourceId: string, prompt: string, model: ModelConfig, options: AgentRunOptions, signal?: AbortSignal) => void | Promise<void>
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
  readOnly: boolean
  onCreateShareLink: () => Promise<string>
  modificationTargetIds?: string[]
  onToggleModificationTarget?: (id: string) => void
}

type MenuMode = 'add' | 'context' | 'reference'
type MenuState = { mode: MenuMode; canvasPosition?: XYPosition; screenPosition?: { x: number; y: number } }
type ChatHistoryCategory = 'text' | 'image' | 'file' | 'comment' | 'agent'
type ChatHistoryEntry = { id: string; category: ChatHistoryCategory; title: string; prompt: string; createdAt: string }

const edgeTypes = { flow: FlowEdge }
const canvasNodeTypes = { ...nodeTypes, selectionConnector: SelectionConnectorNode, connectionPreview: ConnectionPreviewNode }
const ReactFlow = (props: ReactFlowProps<CanvasNode, CanvasEdge>) => (
  <BaseReactFlow {...props} onlyRenderVisibleElements={(props.nodes?.length ?? 0) > 60} />
)
const VIEWPORT_STORAGE_KEY = 'nodecanvas:viewport:default:v1'
type StoredViewport = { x: number; y: number; zoom: number }

function readStoredViewport(): StoredViewport | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(VIEWPORT_STORAGE_KEY)
    const viewport = raw ? JSON.parse(raw) as Partial<StoredViewport> : null
    return viewport && [viewport.x, viewport.y, viewport.zoom].every((value) => typeof value === 'number' && Number.isFinite(value))
      ? { x: viewport.x!, y: viewport.y!, zoom: viewport.zoom! }
      : null
  } catch {
    window.localStorage.removeItem(VIEWPORT_STORAGE_KEY)
    return null
  }
}

export function CanvasStage({ nodes, edges, onNodesChange, onEdgesChange, setEdges, onAddText, onAddImage, onAddFile, onAddComment, onChatAnswer, onAgentRun, canUndo, canRedo, onUndo, onRedo, onNodeDragStart, onNodeDragStop, knowledgePreview, onCloseKnowledgePreview, leftCollapsed, agentCollapsed, onToggleLeft, onToggleAgent, readOnly, onCreateShareLink, modificationTargetIds, onToggleModificationTarget }: CanvasStageProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [zoom, setZoom] = useState(72)
  const zoomLabelRef = useRef<number | null>(null)
  const [showMiniMap, setShowMiniMap] = useState(true)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [commentMode, setCommentMode] = useState(false)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [hideEdges, setHideEdges] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(0)
  const [viewMode, setViewMode] = useState<'workflow' | 'storyboard'>('workflow')
  const [presentationMode, setPresentationMode] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<ChatHistoryCategory | 'all'>('all')
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([])
  const projectId = currentProjectId()
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null)
  const stageRef = useRef<HTMLElement>(null)
  const [selectionDragPosition, setSelectionDragPosition] = useState<XYPosition | null>(null)
  const [boxSelectionActive, setBoxSelectionActive] = useState(false)
  const [canvasPanning, setCanvasPanning] = useState(false)
  const [selectionGenerateMenu, setSelectionGenerateMenu] = useState<Omit<MenuState, 'mode'> | null>(null)
  const [pendingConnection, setPendingConnection] = useState<{ source: string; sourceHandle: string; canvasPosition: XYPosition } | null>(null)
  const viewportSaveTimerRef = useRef<number | null>(null)
  const viewportRestoredRef = useRef(false)
  const storedViewportRef = useRef<StoredViewport | null>(readOnly ? null : readStoredViewport())
  const latestViewportRef = useRef<StoredViewport | null>(storedViewportRef.current)
  const panePointerRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const selectionGestureRef = useRef(false)
  const suppressAddMenuUntilRef = useRef(0)
  const canvasPanGestureRef = useRef(false)
  const suppressNodeClickRef = useRef(false)
  const updateZoomLabel = useCallback((viewportZoom: number) => {
    const nextZoom = Math.round(viewportZoom * 100)
    if (zoomLabelRef.current === nextZoom) return
    zoomLabelRef.current = nextZoom
    setZoom(nextZoom)
  }, [])
  const { deleteElements, zoomTo, screenToFlowPosition, fitView, setCenter, setNodes, setViewport, getViewport } = useReactFlow<CanvasNode, CanvasEdge>()
  const interactionLocked = presentationMode || readOnly || modificationTargetIds !== undefined
  const nodeInteractionsLocked = interactionLocked || canvasPanning
  const activeNode = nodes.find((node) => node.id === activeNodeId)
  const activeNodeExecutionLocked = activeNode?.data.agentStatus === 'running' || Boolean(activeNode?.data.generationStatus)
  const selectedNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes])
  const selectedNodeIds = useMemo(() => selectedNodes.map((node) => node.id), [selectedNodes])
  const searchResults = useMemo(() => nodes.filter((node) => `${node.data.title} ${node.data.content ?? ''}`.toLowerCase().includes(query.toLowerCase())), [nodes, query])
  const sharedGraphFittedRef = useRef(false)
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
  useEffect(() => setHighlightedSearchIndex(0), [query, searchOpen])
  useEffect(() => {
    let active = true
    setChatHistory([])
    void loadAgentRuns(projectId).then(({ items }) => {
      if (!active) return
      setChatHistory(items.map((item) => ({
        id: item.id,
        category: item.category,
        title: item.title,
        prompt: item.prompt,
        createdAt: new Date(item.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      })))
    }).catch((error) => console.warn('Failed to restore project chat history.', error))
    return () => { active = false }
  }, [projectId])
  useEffect(() => {
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(frame)
  }, [leftCollapsed, agentCollapsed])
  useEffect(() => {
    if (!readOnly || !nodes.length || sharedGraphFittedRef.current) return
    const frame = requestAnimationFrame(() => {
      sharedGraphFittedRef.current = true
      void fitView({ duration: 0, padding: 0.2, maxZoom: 1.05 })
    })
    return () => cancelAnimationFrame(frame)
  }, [fitView, nodes.length, readOnly])
  useEffect(() => {
    if (!shareOpen) return
    const closeIfOutside = (event: Event) => {
      const root = document.querySelector('.share-menu')
      if (!(root instanceof HTMLElement) || !root.contains(event.target as Node)) setShareOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShareOpen(false) }
    const closeOnWindowBlur = () => setShareOpen(false)
    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('focusin', closeIfOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('blur', closeOnWindowBlur)
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      document.removeEventListener('focusin', closeIfOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('blur', closeOnWindowBlur)
    }
  }, [shareOpen])
  useEffect(() => {
    if (!presentationMode) return
    setActiveNodeId(null)
    setMenu(null)
    setSearchOpen(false)
    setShareOpen(false)
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      setPresentationMode(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [presentationMode])
  useEffect(() => {
    const syncFullscreenState = () => setPresentationMode(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [])
  const togglePresentation = useCallback(async () => {
    if (activeNodeExecutionLocked) return
    const stage = stageRef.current
    if (!stage) return
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined)
      setPresentationMode(false)
      return
    }
    setPresentationMode(true)
    if (!stage.requestFullscreen) return
    try {
      await stage.requestFullscreen()
    } catch {
      // The visual presentation mode remains a useful fallback where the
      // browser declines programmatic fullscreen requests.
    }
  }, [activeNodeExecutionLocked])
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
  const chooseSearchResult = (node: CanvasNode) => { if (activeNodeExecutionLocked) return; setActiveNodeId(node.id); setSearchOpen(false); void fitView({ nodes: [{ id: node.id }], duration: 280, padding: 0.3, maxZoom: 1.15 }) }
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
  const restoreStoredViewport = useCallback(() => {
    const restoredViewport = storedViewportRef.current
    if (restoredViewport) {
      void setViewport(restoredViewport, { duration: 0 })
      updateZoomLabel(restoredViewport.zoom)
    }
    requestAnimationFrame(() => { viewportRestoredRef.current = true })
  }, [setViewport, updateZoomLabel])

  useEffect(() => {
    const persistLatestViewport = () => {
      if (!readOnly && latestViewportRef.current) window.localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(latestViewportRef.current))
    }
    window.addEventListener('pagehide', persistLatestViewport)
    return () => {
      if (viewportSaveTimerRef.current !== null) window.clearTimeout(viewportSaveTimerRef.current)
      persistLatestViewport()
      window.removeEventListener('pagehide', persistLatestViewport)
    }
  }, [readOnly])

  const onMove: OnMove = useCallback((_, viewport) => {
    updateZoomLabel(viewport.zoom)
    latestViewportRef.current = viewport
    if (readOnly || !viewportRestoredRef.current) return
    if (viewportSaveTimerRef.current !== null) window.clearTimeout(viewportSaveTimerRef.current)
    viewportSaveTimerRef.current = window.setTimeout(() => {
      window.localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport))
      viewportSaveTimerRef.current = null
    }, 180)
  }, [readOnly, updateZoomLabel])
  const onMoveStart: OnMove = useCallback((event) => {
    if (event?.type !== 'mousedown' && event?.type !== 'touchstart') return
    canvasPanGestureRef.current = true
    suppressNodeClickRef.current = true
    setCanvasPanning(true)
  }, [])
  const onMoveEnd: OnMove = useCallback((_, viewport) => {
    latestViewportRef.current = viewport
    if (readOnly || !viewportRestoredRef.current) return
    if (viewportSaveTimerRef.current !== null) window.clearTimeout(viewportSaveTimerRef.current)
    window.localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport))
    viewportSaveTimerRef.current = null
  }, [readOnly])
  const changeZoom = (value: number) => {
    zoomLabelRef.current = value
    setZoom(value)
    void zoomTo(value / 100, { duration: 0 })
  }
  const copyHistoryEntry = async (item: ChatHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(item.prompt)
      setCopiedHistoryId(item.id)
      window.setTimeout(() => setCopiedHistoryId((current) => current === item.id ? null : current), 1600)
    } catch {
      setCopiedHistoryId(null)
    }
  }
  const clearChatHistory = async () => {
    try {
      await clearAgentRuns(projectId)
    } catch (error) {
      console.warn('Failed to clear project chat history.', error)
    }
    setChatHistory([])
    setCopiedHistoryId(null)
  }

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
    const idMap = new globalThis.Map(selectedNodes.map((node) => [node.id, `${node.type}-${crypto.randomUUID()}`]))
    const copies = selectedNodes.map((node) => {
      const { measured: _measured, width: _width, height: _height, ...cloneableNode } = node
      return { ...cloneableNode, id: idMap.get(node.id)!, position: { x: node.position.x + 36, y: node.position.y + 36 }, selected: true, measured: undefined, width: undefined, height: undefined }
    })
    const copiedEdges = edges
      .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: `edge-${crypto.randomUUID()}`,
        source: idMap.get(edge.source)!,
        target: idMap.get(edge.target)!,
        selected: false,
      }))
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...copies])
    if (copiedEdges.length) {
      // Let React Flow commit and measure the copied nodes first. Adding the
      // edges in the next frame avoids a stale internal-node lookup where the
      // edge exists in state but is not painted until a later refresh.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEdges((current) => [...current, ...copiedEdges]))
      })
    }
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
    if (event.detail !== 2 || !target?.classList.contains('react-flow__pane') || commentMode || interactionLocked || event.shiftKey || selectionGestureRef.current || Date.now() < suppressAddMenuUntilRef.current) return
    window.getSelection()?.removeAllRanges()
    const bounds = event.currentTarget.getBoundingClientRect()
    setMenuAtPoint(bounds, { x: event.clientX, y: event.clientY }, 'add')
  }

  const onStageMouseDownCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button === 1 || event.button === 2) {
      canvasPanGestureRef.current = true
      suppressNodeClickRef.current = true
      setCanvasPanning(true)
    }
    if (!(event.target instanceof HTMLElement) || !event.target.classList.contains('react-flow__pane')) return
    window.getSelection()?.removeAllRanges()
    panePointerRef.current = { x: event.clientX, y: event.clientY, moved: false }
    if (event.shiftKey) suppressAddMenuUntilRef.current = Date.now() + 500
  }

  const onStageMouseMoveCapture = (event: ReactMouseEvent<HTMLElement>) => {
    const pointer = panePointerRef.current
    if (!pointer || pointer.moved) return
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 5) return
    pointer.moved = true
    suppressAddMenuUntilRef.current = Date.now() + 500
  }

  const onStageMouseUpCapture = () => {
    if (panePointerRef.current?.moved) suppressAddMenuUntilRef.current = Date.now() + 500
    panePointerRef.current = null
    if (canvasPanGestureRef.current) {
      canvasPanGestureRef.current = false
      setCanvasPanning(false)
      window.setTimeout(() => { suppressNodeClickRef.current = false }, 0)
    }
  }

  useEffect(() => {
    if (!canvasPanning) return
    const finishCanvasPan = () => {
      canvasPanGestureRef.current = false
      setCanvasPanning(false)
      window.setTimeout(() => { suppressNodeClickRef.current = false }, 0)
    }
    window.addEventListener('mouseup', finishCanvasPan)
    window.addEventListener('touchend', finishCanvasPan)
    window.addEventListener('touchcancel', finishCanvasPan)
    window.addEventListener('blur', finishCanvasPan)
    return () => {
      window.removeEventListener('mouseup', finishCanvasPan)
      window.removeEventListener('touchend', finishCanvasPan)
      window.removeEventListener('touchcancel', finishCanvasPan)
      window.removeEventListener('blur', finishCanvasPan)
    }
  }, [canvasPanning])

  const onSelectionStart = () => {
    setBoxSelectionActive(false)
    selectionGestureRef.current = true
    suppressAddMenuUntilRef.current = Date.now() + 500
    setMenu(null)
  }

  const onSelectionEnd = () => {
    setBoxSelectionActive(true)
    selectionGestureRef.current = false
    suppressAddMenuUntilRef.current = Date.now() + 500
  }

  const copyReadOnlyLink = async () => {
    setShareMessage('正在创建只读链接…')
    try {
      const link = await onCreateShareLink()
      await navigator.clipboard.writeText(link)
      setShareMessage('只读链接已复制，可直接发送给他人。')
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : '创建分享链接失败')
    }
  }

  const downloadCanvasImage = async () => {
    const renderer = document.querySelector<HTMLElement>('.canvas-stage .react-flow__renderer')
    if (!renderer) return
    setShareMessage('正在导出 PNG…')
    const previousViewport = getViewport()
    const padding = 72
    const nodeBounds = nodes.reduce((bounds, node) => {
      const width = node.measured?.width ?? node.width ?? (Number(node.style?.width) || 360)
      const height = node.measured?.height ?? node.height ?? (Number(node.style?.height) || 240)
      return {
        minX: Math.min(bounds.minX, node.position.x),
        minY: Math.min(bounds.minY, node.position.y),
        maxX: Math.max(bounds.maxX, node.position.x + width),
        maxY: Math.max(bounds.maxY, node.position.y + height),
      }
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
    const hasNodes = Number.isFinite(nodeBounds.minX) && Number.isFinite(nodeBounds.minY)
    const contentWidth = hasNodes ? Math.ceil(nodeBounds.maxX - nodeBounds.minX + padding * 2) : Math.max(1, renderer.clientWidth)
    const contentHeight = hasNodes ? Math.ceil(nodeBounds.maxY - nodeBounds.minY + padding * 2) : Math.max(1, renderer.clientHeight)
    const exportViewport = hasNodes ? {
      x: padding - nodeBounds.minX,
      y: padding - nodeBounds.minY,
      zoom: 1,
    } : previousViewport
    const pixelRatio = Math.min(2, Math.max(.8, 12000 / Math.max(contentWidth, contentHeight)))
    try {
      await setViewport(exportViewport, { duration: 0 })
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80))
      const dataUrl = await toPng(renderer, {
        backgroundColor: '#090a0c',
        cacheBust: true,
        width: contentWidth,
        height: contentHeight,
        pixelRatio,
        style: { width: `${contentWidth}px`, height: `${contentHeight}px` },
      })
      const link = document.createElement('a')
      link.download = `NodeCanvas-${new Date().toISOString().slice(0, 10)}.png`
      link.href = dataUrl
      link.click()
      setShareMessage('图片已下载。')
    } catch (error) {
      setShareMessage(error instanceof Error ? `图片导出失败：${error.message}` : '图片导出失败')
    } finally {
      await setViewport(previousViewport, { duration: 0 })
    }
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

  return <section ref={stageRef} className={`canvas-stage ${commentMode ? 'comment-mode' : ''} ${presentationMode ? 'presentation-mode' : ''} ${readOnly ? 'read-only-share' : ''} ${knowledgePreview ? 'has-knowledge-preview' : ''} ${(boxSelectionActive || selectedNodes.length > 1) && selectedNodes.length ? 'has-box-selection' : ''} ${selectionDragPosition ? 'selection-connecting' : ''} ${canvasPanning ? 'is-canvas-panning' : ''}`} onMouseDownCapture={onStageMouseDownCapture} onMouseMoveCapture={onStageMouseMoveCapture} onMouseUpCapture={onStageMouseUpCapture} onDoubleClickCapture={openMenuAtCursor} onContextMenuCapture={(event) => {
    // Shared links are read-only, but their nodes can still expose the
    // viewing menu (focus, preview, and copy). Presentation mode and agent
    // target selection remain fully locked.
    if (presentationMode || modificationTargetIds !== undefined) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    // Let a node's own handler open its custom context menu. Only the blank
    // canvas needs the stage-level native-menu suppression.
    if ((event.target as Element).closest('.react-flow__node')) return
    event.preventDefault()
  }}>
    <CanvasNodeReadOnlyContext.Provider value={readOnly}>
    <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={canvasNodeTypes} edgeTypes={edgeTypes} connectionMode={ConnectionMode.Loose} defaultViewport={storedViewportRef.current ?? { x: 0, y: 0, zoom: 1 }} noPanClassName="canvas-pan-never-block" onInit={restoreStoredViewport} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onSelectionStart={onSelectionStart} onSelectionEnd={onSelectionEnd} onNodeClick={(_, node) => { setBoxSelectionActive(false); if (suppressNodeClickRef.current) { suppressNodeClickRef.current = false; return } if (modificationTargetIds) { onToggleModificationTarget?.(node.id); return } if (!nodeInteractionsLocked) setFocusedNodeId(node.id) }} onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop} onConnect={onConnect} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd} isValidConnection={isValidConnection} onEdgeClick={(_, edge) => { if (!nodeInteractionsLocked) setEdges((current) => current.map((item) => ({ ...item, selected: item.id === edge.id }))) }} onEdgeDoubleClick={(_, edge) => { if (nodeInteractionsLocked) return; setEdges((current) => current.map((item) => { if (item.id !== edge.id) return item; const adopted = !item.data?.selected; const original = item.data?.originalStyle ?? item.style ?? { stroke: '#73869a', strokeWidth: 2.5 }; return { ...item, data: { ...item.data, selected: adopted, originalStyle: original }, style: adopted ? { stroke: '#b8d36b', strokeWidth: 2.6, strokeDasharray: '7 4' } : original } })) }} onNodeDoubleClick={(_, node) => { if (!activeNodeExecutionLocked && !nodeInteractionsLocked && !commentMode) { closeMenu(); setActiveNodeId(node.id) } }} onPaneClick={(event) => { if (activeNodeExecutionLocked || nodeInteractionsLocked) return; setBoxSelectionActive(false); if (commentMode) onAddComment(screenToFlowPosition({ x: event.clientX, y: event.clientY })); else { setActiveNodeId(null); setFocusedNodeId(null); setEdges((current) => current.map((item) => ({ ...item, selected: false }))) } }} onMoveStart={onMoveStart} onMove={onMove} onMoveEnd={onMoveEnd} zoomOnDoubleClick={false} zoomOnScroll={false} panOnScroll panOnScrollSpeed={1.5} zoomOnPinch minZoom={0.2} maxZoom={2} connectionRadius={110} snapToGrid={snapToGrid} snapGrid={[20, 20]} nodesConnectable={!commentMode && !nodeInteractionsLocked} nodesDraggable={!nodeInteractionsLocked} elementsSelectable={!nodeInteractionsLocked} panOnDrag={[2]} selectionOnDrag={!nodeInteractionsLocked} selectionMode={SelectionMode.Partial} defaultEdgeOptions={{ style: { stroke: '#73869a', strokeWidth: 2.5 } }} deleteKeyCode={nodeInteractionsLocked || activeNodeExecutionLocked ? null : ['Backspace', 'Delete']} selectionKeyCode="Shift" multiSelectionKeyCode="Shift" proOptions={{ hideAttribution: true }} aria-label="节点式创意策划画布">
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.15} color="#70747a" />
      {showMiniMap && <MiniMap position="bottom-left" className="canvas-minimap" pannable zoomable onClick={(_, point) => { void setCenter(point.x, point.y, { zoom: zoom / 100, duration: 260 }) }} nodeColor={(node) => node.type === 'image' ? '#426e7a' : node.type === 'file' ? '#756347' : '#5b526f'} maskColor="rgba(8, 9, 11, 0.72)" />}
      <CanvasTopbar readOnly={readOnly} viewMode={viewMode} onViewModeChange={setViewMode} onShare={() => setShareOpen((value) => !value)} shareOpen={shareOpen} shareMessage={shareMessage} onCopyShareLink={() => void copyReadOnlyLink()} onDownloadImage={() => void downloadCanvasImage()} onSearch={() => setSearchOpen(true)} presentationMode={presentationMode} onTogglePresentation={() => void togglePresentation()} leftCollapsed={leftCollapsed} agentCollapsed={agentCollapsed} onToggleAgent={onToggleAgent} />
      {!readOnly && <CanvasDock onAdd={() => setMenu({ mode: 'add' })} commentMode={commentMode} onToggleComment={() => { if (activeNodeExecutionLocked) return; setCommentMode((value) => !value); setActiveNodeId(null) }} onHistory={() => setHistoryOpen(true)} canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />}
      <ViewportControls readOnly={readOnly} zoom={zoom} miniMapVisible={showMiniMap} snapToGrid={snapToGrid} hideEdges={hideEdges} onChangeZoom={changeZoom} onToggleMiniMap={() => setShowMiniMap((value) => !value)} onToggleSnap={() => setSnapToGrid((value) => !value)} onToggleEdges={() => setHideEdges((value) => !value)} onReset={() => void fitView({ duration: 180, padding: 0.22 })} />
      {!modificationTargetIds && (selectedNodes.length > 1 || (boxSelectionActive && selectedNodes.length === 1)) && <NodeToolbar nodeId={selectedNodeIds} position={Position.Top} align="center" isVisible className="selection-toolbar">{selectedNodes.length > 1 && <><button aria-label="打组"><FolderPlus size={16} /><span>打组</span></button><span className="selection-toolbar-divider" /><button aria-label="宫格排列" title="宫格排列" onClick={() => arrangeSelectedNodes('grid')}><Grid2X2 size={16} /><span>宫格</span></button><button aria-label="水平排列" title="水平排列" onClick={() => arrangeSelectedNodes('horizontal')}><AlignHorizontalSpaceAround size={16} /><span>水平</span></button><button aria-label="垂直排列" title="垂直排列" onClick={() => arrangeSelectedNodes('vertical')}><AlignVerticalSpaceAround size={16} /><span>垂直</span></button><span className="selection-toolbar-divider" /></>}<button aria-label="创建副本" title="创建副本" onClick={duplicateSelectedNodes}><Copy size={16} /><span>副本</span></button><span className="selection-toolbar-divider" /><button className="selection-delete-button" aria-label="删除选中节点" title="删除选中节点" onClick={() => void deleteElements({ nodes: selectedNodeIds.map((id) => ({ id })) })}><Trash2 size={16} /><span>删除</span></button></NodeToolbar>}
      {activeNode && <NodeToolbar nodeId={activeNode.id} position={activeNode.position.y > 300 ? Position.Top : Position.Bottom} align={activeNode.position.x < 320 ? 'start' : activeNode.position.x > 640 ? 'end' : 'center'} data-side={activeNode.position.x > 640 ? 'end' : activeNode.position.x < 320 ? 'start' : 'center'} isVisible className="node-chat-panel"><NodeChatComposer key={activeNode.id} nodeId={activeNode.id} nodeTitle={activeNode.data.title} nodes={nodes} runStatus={activeNode.data.agentStatus} runSummary={activeNode.data.agentSummary} onClose={() => { if (!activeNodeExecutionLocked) setActiveNodeId(null) }} onSend={(prompt, model, options, actionMode, _assistantMode, signal, onProgress) => { setChatHistory((current) => [{ id: crypto.randomUUID(), category: actionMode === 'agent' ? 'agent' : activeNode.type, title: activeNode.data.title, prompt, createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }, ...current]); if (actionMode === 'agent') return onAgentRun(activeNode.id, prompt, model, options, signal); return onChatAnswer(activeNode.id, prompt, model, onProgress, signal) }} /></NodeToolbar>}
    </ReactFlow>
    </CanvasNodeReadOnlyContext.Provider>
    {searchOpen && <div className="node-search-overlay" onMouseDown={() => setSearchOpen(false)}><div className="node-search-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="node-search-input"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKeyDown} placeholder="搜索节点…" /></div><div className="node-search-results">{searchResults.map((node, index) => <button key={node.id} className={index === highlightedSearchIndex ? 'highlighted' : ''} aria-selected={index === highlightedSearchIndex} onMouseEnter={() => setHighlightedSearchIndex(index)} onClick={() => chooseSearchResult(node)}><span>{node.data.title}</span><small>{node.type}</small></button>)}</div></div></div>}
    {menu && <AddNodeMenu title={menu.mode === 'context' ? '添加上下文' : menu.mode === 'reference' ? '引用该节点生成' : '添加节点'} showImage={menu.mode !== 'context'} location={menu.screenPosition} onText={() => onAddText(menu.canvasPosition, connectCreatedNode)} onImage={() => onAddImage(menu.canvasPosition, connectCreatedNode)} onFile={() => onAddFile(menu.canvasPosition, connectCreatedNode)} onClose={closeMenu} />}
    {selectionGenerateMenu && <AddNodeMenu title="引用该节点生成" location={selectionGenerateMenu.screenPosition} onText={() => onAddText(selectionGenerateMenu.canvasPosition, connectSelectionToCreatedNode)} onImage={() => onAddImage(selectionGenerateMenu.canvasPosition, connectSelectionToCreatedNode)} onFile={() => onAddFile(selectionGenerateMenu.canvasPosition, connectSelectionToCreatedNode)} onClose={() => setSelectionGenerateMenu(null)} />}
    {knowledgePreview && <KnowledgePreview item={knowledgePreview} onClose={onCloseKnowledgePreview} />}
    {historyOpen && <div className="canvas-history-overlay" onMouseDown={() => setHistoryOpen(false)}><section className="canvas-history-dialog" role="dialog" aria-label="聊天历史" onMouseDown={(event) => event.stopPropagation()}><header><strong>聊天历史</strong><div className="canvas-history-header-actions"><button onClick={() => void clearChatHistory()} disabled={!chatHistory.length} aria-label="清空聊天历史" title="清空聊天历史"><Trash2 size={14} /></button><button onClick={() => setHistoryOpen(false)} aria-label="关闭聊天历史" title="关闭"><X size={16} /></button></div></header><nav>{(['all', 'text', 'image', 'agent', 'file', 'comment'] as const).map((type) => <button key={type} className={historyFilter === type ? 'active' : ''} onClick={() => setHistoryFilter(type)}>{type === 'all' ? '全部' : type === 'text' ? '文本' : type === 'image' ? '图片' : type === 'agent' ? 'Agent' : type === 'file' ? '文件' : '备注'}</button>)}</nav><div className="canvas-history-list">{chatHistory.filter((item) => historyFilter === 'all' || item.category === historyFilter).map((item) => <article key={item.id}><div className="canvas-history-entry-header"><small>{item.category === 'agent' ? 'Agent' : item.category} · {item.createdAt}</small><button className="canvas-history-copy" onClick={() => void copyHistoryEntry(item)} aria-label={copiedHistoryId === item.id ? '已复制聊天记录' : '复制聊天记录'} title={copiedHistoryId === item.id ? '已复制' : '复制'}>{copiedHistoryId === item.id ? '已复制' : <Copy size={14} />}</button></div><strong>{item.title || '未命名节点'}</strong><p>{item.prompt}</p></article>)}{chatHistory.filter((item) => historyFilter === 'all' || item.category === historyFilter).length === 0 && <p>暂无该分类的聊天记录。</p>}</div></section></div>}
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

function CanvasTopbar({ readOnly, viewMode, onViewModeChange, onShare, shareOpen, shareMessage, onCopyShareLink, onDownloadImage, onSearch, presentationMode, onTogglePresentation, leftCollapsed, agentCollapsed, onToggleAgent }: { readOnly: boolean; viewMode: 'workflow' | 'storyboard'; onViewModeChange: (mode: 'workflow' | 'storyboard') => void; onShare: () => void; shareOpen: boolean; shareMessage: string; onCopyShareLink: () => void; onDownloadImage: () => void; onSearch: () => void; presentationMode: boolean; onTogglePresentation: () => void; leftCollapsed: boolean; agentCollapsed: boolean; onToggleAgent: () => void }) { const { setManagerOpen, tokenUsage } = useModelRegistry(); const totalTokens = tokenUsage.reduce((sum, usage) => sum + usage.totalTokens, 0); return <Panel position="top-center" className="canvas-topbar"><div className="topbar-left">{!readOnly && leftCollapsed && <FloatingButtonGroup className="left-collapsed-button"><div className="collapsed-workspace-bar"><BrandLogo /><span className="collapsed-canvas-divider" /><button className="collapsed-canvas-switcher">画布 1<ChevronDown size={14} /></button></div></FloatingButtonGroup>}{!readOnly && <FloatingButtonGroup className="view-switcher"><button className={viewMode === 'workflow' ? 'active' : ''} onClick={() => onViewModeChange('workflow')}><Workflow size={15} />工作流</button><button className={viewMode === 'storyboard' ? 'active' : ''} onClick={() => onViewModeChange('storyboard')}><BoxSelect size={15} />故事板</button></FloatingButtonGroup>}</div><div className="topbar-right"><FloatingButtonGroup className="canvas-actions"><div className="share-menu"><button aria-label="分享" onClick={onShare}><Share2 size={16} /></button>{shareOpen && <div className="share-popover"><strong>分享画布</strong><button onClick={onCopyShareLink}>复制只读链接</button><button onClick={onDownloadImage}>下载图片</button>{shareMessage && <small>{shareMessage}</small>}</div>}</div>{!readOnly && <button className="token-counter" aria-label="管理大模型与 Token 用量" onClick={() => setManagerOpen(true)}>{formatTokenCount(totalTokens)} Tokens</button>}<button aria-label="搜索节点" onClick={onSearch}><Search size={16} /></button></FloatingButtonGroup>{!readOnly && <button className="presentation-toggle" onClick={onTogglePresentation} aria-label={presentationMode ? "退出全屏预览" : "全屏预览"}>{presentationMode ? <Minimize2 size={16} /> : <Eye size={16} />}</button>}{!readOnly && agentCollapsed && <FloatingButtonGroup className="agent-collapsed-button"><button onClick={onToggleAgent} aria-label="展开 Agent"><Bot size={16} />Agent</button></FloatingButtonGroup>}</div></Panel> }
function CanvasDock({ onAdd, commentMode, onToggleComment, onHistory, canUndo, canRedo, onUndo, onRedo }: { onAdd: () => void; commentMode: boolean; onToggleComment: () => void; onHistory: () => void; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) { return <Panel position="bottom-center" className="canvas-dock"><FloatingButtonGroup><button className="add-primary" onClick={onAdd} aria-label="添加节点"><Plus size={22} /></button><button className={commentMode ? 'active comment-tool' : 'comment-tool'} onClick={onToggleComment} aria-label={commentMode ? '退出备注模式' : '进入备注模式'}><MessageSquareText size={18} /></button><span className="dock-divider" /><button onClick={onUndo} disabled={!canUndo} aria-label="撤回上一步" data-tooltip="撤回上一步（⌘Z）" data-tooltip-position="top"><Undo2 size={18} /></button><button onClick={onRedo} disabled={!canRedo} aria-label="下一步" data-tooltip="下一步（⇧⌘Z）" data-tooltip-position="top"><Redo2 size={18} /></button><button onClick={onHistory} aria-label="聊天历史"><History size={16} /></button></FloatingButtonGroup></Panel> }
function ViewportControls({ readOnly, zoom, miniMapVisible, snapToGrid, hideEdges, onChangeZoom, onToggleMiniMap, onToggleSnap, onToggleEdges, onReset }: { readOnly: boolean; zoom: number; miniMapVisible: boolean; snapToGrid: boolean; hideEdges: boolean; onChangeZoom: (value: number) => void; onToggleMiniMap: () => void; onToggleSnap: () => void; onToggleEdges: () => void; onReset: () => void }) { return <Panel position="bottom-left" className="viewport-controls"><FloatingButtonGroup><button className={miniMapVisible ? 'active' : ''} onClick={onToggleMiniMap} aria-label="显示或隐藏小地图"><Map size={19} /></button>{!readOnly && <button className={snapToGrid ? 'active' : ''} onClick={onToggleSnap} aria-label="切换网格吸附"><Grid3X3 size={19} /></button>}<button onClick={onReset} aria-label="完整显示全部节点"><LocateFixed size={19} /></button><button className={hideEdges ? 'active' : ''} onClick={onToggleEdges} aria-label="隐藏连接线"><Link2 size={19} /></button><span className="viewport-divider" /><input type="range" min="20" max="200" value={zoom} onChange={(event) => onChangeZoom(Number(event.target.value))} aria-label="画布缩放" /></FloatingButtonGroup></Panel> }
