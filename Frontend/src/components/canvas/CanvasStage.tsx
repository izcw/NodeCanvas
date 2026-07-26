import { addEdge, Background, BackgroundVariant, MiniMap, NodeToolbar, Panel, Position, ReactFlow, SelectionMode, useReactFlow } from '@xyflow/react'
import type { Connection, OnConnectEnd, OnEdgesChange, OnMove, OnNodesChange, XYPosition } from '@xyflow/react'
import { BoxSelect, Bug, CircleHelp, Clock3, Command, FileText, FolderPlus, Grid3X3, Image as ImageIcon, Link2, LocateFixed, Map, MessageSquareText, MousePointer2, Orbit, Plus, Search, Share2, Sparkles, Video, Workflow } from 'lucide-react'
import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { CanvasEdge, CanvasNode } from '../../types/canvas'
import type { KnowledgeItem } from '../../types/canvas'
import { AddNodeMenu } from './AddNodeMenu'
import { NodeChatComposer } from './NodeChatComposer'
import { nodeTypes } from './nodes'
import { KnowledgePreview } from './KnowledgePreview'
import { FloatingButtonGroup } from '../ui/FloatingButtonGroup'
import { Bot, PanelLeftOpen } from 'lucide-react'

type CanvasStageProps = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  onNodesChange: OnNodesChange<CanvasNode>
  onEdgesChange: OnEdgesChange<CanvasEdge>
  setEdges: React.Dispatch<React.SetStateAction<CanvasEdge[]>>
  onAddText: (position?: XYPosition) => void
  onAddImage: (position?: XYPosition) => void
  onAddFile: (position?: XYPosition) => void
  onAddComment: (position?: XYPosition) => void
  onChatAnswer: (sourceId: string, prompt: string, model: string) => void
  knowledgePreview: KnowledgeItem | null
  onCloseKnowledgePreview: () => void
  leftCollapsed: boolean
  agentCollapsed: boolean
  onToggleLeft: () => void
  onToggleAgent: () => void
}

type MenuState = { canvasPosition?: XYPosition; screenPosition?: { x: number; y: number } }

export function CanvasStage({ nodes, edges, onNodesChange, onEdgesChange, setEdges, onAddText, onAddImage, onAddFile, onAddComment, onChatAnswer, knowledgePreview, onCloseKnowledgePreview, leftCollapsed, agentCollapsed, onToggleLeft, onToggleAgent }: CanvasStageProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [zoom, setZoom] = useState(72)
  const [showMiniMap, setShowMiniMap] = useState(true)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [commentMode, setCommentMode] = useState(false)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [hideEdges, setHideEdges] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(0)
  const [viewMode, setViewMode] = useState<'workflow' | 'storyboard'>('workflow')
  const { zoomTo, screenToFlowPosition, fitView, setCenter } = useReactFlow()
  const activeNode = nodes.find((node) => node.id === activeNodeId)
  const selectedNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes])
  const selectedNodeIds = useMemo(() => selectedNodes.map((node) => node.id), [selectedNodes])
  const searchResults = useMemo(() => nodes.filter((node) => `${node.data.title} ${node.data.content ?? ''}`.toLowerCase().includes(query.toLowerCase())), [nodes, query])
  const connectableNodeIds = useMemo(() => new Set(nodes.filter((node) => node.type !== 'comment').map((node) => node.id)), [nodes])
  const visibleEdges = useMemo(() => hideEdges ? [] : edges.filter((edge) => connectableNodeIds.has(edge.source) && connectableNodeIds.has(edge.target)), [connectableNodeIds, edges, hideEdges])
  const isValidConnection = useCallback((connection: Connection | CanvasEdge) => connection.source !== connection.target && connectableNodeIds.has(connection.source) && connectableNodeIds.has(connection.target), [connectableNodeIds])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  useEffect(() => setHighlightedSearchIndex(0), [query, searchOpen])
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
  const onConnect = useCallback((connection: Connection) => { if (!commentMode && isValidConnection(connection)) setEdges((current) => addEdge(createEdge(connection), current)) }, [commentMode, isValidConnection, setEdges])
  const onMove: OnMove = useCallback((_, viewport) => setZoom(Math.round(viewport.zoom * 100)), [])
  const changeZoom = (value: number) => { setZoom(value); void zoomTo(value / 100, { duration: 0 }) }

  const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
    if (commentMode || connectionState.isValid || !connectionState.fromNode || connectionState.fromNode.type === 'comment') return
    const target = event.target instanceof HTMLElement ? event.target.closest('.react-flow__node') : null
    const targetId = target?.getAttribute('data-id')
    if (!target || !targetId || targetId === connectionState.fromNode.id || !connectableNodeIds.has(targetId)) return
    const point = getClientPoint(event)
    if (!point) return
    const targetRect = target.getBoundingClientRect()
    setEdges((current) => addEdge(createEdge({ source: connectionState.fromNode.id, sourceHandle: connectionState.fromHandle?.id ?? 'right-source', target: targetId, targetHandle: nearestHandle(targetRect, point) }), current))
  }, [commentMode, connectableNodeIds, setEdges])

  const openMenuAtCursor = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (!target?.closest('.react-flow__pane') || commentMode) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const menuWidth = 342
    const menuHeight = 300
    const localX = event.clientX - bounds.left
    const localY = event.clientY - bounds.top
    setMenu({ canvasPosition: screenToFlowPosition({ x: event.clientX, y: event.clientY }), screenPosition: { x: Math.max(12, Math.min(localX, bounds.width - menuWidth - 12)), y: Math.max(12, Math.min(localY, bounds.height - menuHeight - 12)) } })
  }

  return <section className={`canvas-stage ${commentMode ? 'comment-mode' : ''} ${knowledgePreview ? 'has-knowledge-preview' : ''}`} onDoubleClickCapture={openMenuAtCursor} onContextMenuCapture={(event) => event.preventDefault()}>
    <ReactFlow nodes={nodes} edges={visibleEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onConnectEnd={onConnectEnd} isValidConnection={isValidConnection} onEdgeClick={(_, edge) => setEdges((current) => current.map((item) => ({ ...item, selected: item.id === edge.id })))} onNodeClick={(_, node) => { if (!commentMode) setActiveNodeId(node.id) }} onPaneClick={(event) => { if (commentMode) onAddComment(screenToFlowPosition({ x: event.clientX, y: event.clientY })); else { setActiveNodeId(null); setEdges((current) => current.map((item) => ({ ...item, selected: false }))) } }} onMove={onMove} fitView zoomOnDoubleClick={false} zoomOnScroll={false} panOnScroll panOnScrollSpeed={1.5} zoomOnPinch minZoom={0.2} maxZoom={2} connectionRadius={110} snapToGrid={snapToGrid} snapGrid={[20, 20]} nodesConnectable={!commentMode} panOnDrag={[2]} selectionOnDrag selectionMode={SelectionMode.Partial} defaultEdgeOptions={{ style: { stroke: '#73869a', strokeWidth: 2.5 } }} deleteKeyCode={['Backspace', 'Delete']} selectionKeyCode="Shift" multiSelectionKeyCode="Shift" proOptions={{ hideAttribution: true }} aria-label="节点式创意策划画布">
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.15} color="#70747a" />
      {showMiniMap && <MiniMap position="bottom-left" className="canvas-minimap" pannable zoomable onClick={(_, point) => { void setCenter(point.x, point.y, { zoom: zoom / 100, duration: 260 }) }} nodeColor={(node) => node.type === 'image' ? '#426e7a' : node.type === 'file' ? '#756347' : '#5b526f'} maskColor="rgba(8, 9, 11, 0.72)" />}
      <CanvasTopbar viewMode={viewMode} onViewModeChange={setViewMode} onShare={() => setShareOpen((value) => !value)} shareOpen={shareOpen} onSearch={() => setSearchOpen(true)} leftCollapsed={leftCollapsed} agentCollapsed={agentCollapsed} onToggleLeft={onToggleLeft} onToggleAgent={onToggleAgent} />
      <CanvasDock onAdd={() => setMenu({})} commentMode={commentMode} onToggleComment={() => { setCommentMode((value) => !value); setActiveNodeId(null) }} />
      <ViewportControls zoom={zoom} miniMapVisible={showMiniMap} snapToGrid={snapToGrid} hideEdges={hideEdges} onChangeZoom={changeZoom} onToggleMiniMap={() => setShowMiniMap((value) => !value)} onToggleSnap={() => setSnapToGrid((value) => !value)} onToggleEdges={() => setHideEdges((value) => !value)} onReset={() => void fitView({ duration: 180, padding: 0.22 })} />
      {selectedNodes.length > 1 && <NodeToolbar nodeId={selectedNodeIds} position={Position.Top} align="center" isVisible className="selection-toolbar"><button aria-label="打组"><FolderPlus size={16} /><span>打组</span></button><span className="selection-toolbar-divider" /><button aria-label="新建文件夹"><FolderPlus size={16} /></button><button aria-label="批量操作"><Bug size={16} /></button></NodeToolbar>}
      {activeNode && selectedNodes.length < 2 && <NodeToolbar nodeId={activeNode.id} position={Position.Bottom} align="center" isVisible className="node-chat-panel"><NodeChatComposer nodeTitle={activeNode.data.title} onClose={() => setActiveNodeId(null)} onSend={(prompt, model) => { onChatAnswer(activeNode.id, prompt, model); setActiveNodeId(null) }} /></NodeToolbar>}
      {selectedNodes.length > 1 && <Panel position="bottom-right" className="selection-generate-panel"><strong>引用所有选中的节点生成</strong><button><span><FileText size={17} /></span><span><b>文本生成</b><small>脚本、广告词、品牌文案</small></span></button><button><span><ImageIcon size={17} /></span><span><b>图片生成</b></span></button><button><span><Video size={17} /></span><span><b>视频生成</b></span></button><button><span><Orbit size={17} /></span><span><b>3D 世界</b><em>Beta</em></span><i /></button></Panel>}
    </ReactFlow>
    {searchOpen && <div className="node-search-overlay" onMouseDown={() => setSearchOpen(false)}><div className="node-search-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="node-search-input"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKeyDown} placeholder="搜索节点…" /></div><div className="node-search-results">{searchResults.map((node, index) => <button key={node.id} className={index === highlightedSearchIndex ? 'highlighted' : ''} aria-selected={index === highlightedSearchIndex} onMouseEnter={() => setHighlightedSearchIndex(index)} onClick={() => chooseSearchResult(node)}><span>{node.data.title}</span><small>{node.type}</small></button>)}</div></div></div>}
    {menu && <AddNodeMenu location={menu.screenPosition} onText={() => { onAddText(menu.canvasPosition); setMenu(null) }} onImage={() => { onAddImage(menu.canvasPosition); setMenu(null) }} onFile={() => { onAddFile(menu.canvasPosition); setMenu(null) }} onClose={() => setMenu(null)} />}
    {knowledgePreview && <KnowledgePreview item={knowledgePreview} onClose={onCloseKnowledgePreview} />}
  </section>
}

function createEdge(connection: Connection): CanvasEdge {
  return { ...connection, id: `edge-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}-${Date.now()}`, animated: true, selected: false, style: { stroke: '#7d91a5', strokeWidth: 2.5 } }
}

function getClientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ('touches' in event) { const touch = event.changedTouches[0]; return touch ? { x: touch.clientX, y: touch.clientY } : null }
  return { x: event.clientX, y: event.clientY }
}

function nearestHandle(rect: DOMRect, point: { x: number; y: number }) {
  const distances = { top: Math.abs(point.y - rect.top), right: Math.abs(point.x - rect.right), bottom: Math.abs(point.y - rect.bottom), left: Math.abs(point.x - rect.left) }
  const side = (Object.entries(distances).sort(([, a], [, b]) => a - b)[0][0])
  return `${side}-target`
}

function CanvasTopbar({ viewMode, onViewModeChange, onShare, shareOpen, onSearch, leftCollapsed, agentCollapsed, onToggleLeft, onToggleAgent }: { viewMode: 'workflow' | 'storyboard'; onViewModeChange: (mode: 'workflow' | 'storyboard') => void; onShare: () => void; shareOpen: boolean; onSearch: () => void; leftCollapsed: boolean; agentCollapsed: boolean; onToggleLeft: () => void; onToggleAgent: () => void }) { return <Panel position="top-center" className="canvas-topbar"><div className="topbar-left">{leftCollapsed && <FloatingButtonGroup className="left-collapsed-button"><button onClick={onToggleLeft} aria-label="展开画布侧栏"><PanelLeftOpen size={16} />管理</button></FloatingButtonGroup>}<FloatingButtonGroup className="view-switcher"><button className={viewMode === 'workflow' ? 'active' : ''} onClick={() => onViewModeChange('workflow')}><Workflow size={15} />工作流</button><button className={viewMode === 'storyboard' ? 'active' : ''} onClick={() => onViewModeChange('storyboard')}><BoxSelect size={15} />故事板</button></FloatingButtonGroup></div><div className="topbar-right"><FloatingButtonGroup className="canvas-actions"><span className="save-status"><span className="status-dot" />已保存</span><button aria-label="分享" onClick={onShare}><Share2 size={16} /></button>{shareOpen && <span className="share-popover">通过链接分享</span>}<span className="token-counter">12,480 tokens</span><button aria-label="搜索节点" onClick={onSearch}><Search size={16} /></button></FloatingButtonGroup>{agentCollapsed && <FloatingButtonGroup className="agent-collapsed-button"><button onClick={onToggleAgent} aria-label="展开 Agent"><Bot size={16} />Agent</button></FloatingButtonGroup>}</div></Panel> }
function CanvasDock({ onAdd, commentMode, onToggleComment }: { onAdd: () => void; commentMode: boolean; onToggleComment: () => void }) { return <Panel position="bottom-center" className="canvas-dock"><FloatingButtonGroup><button className="add-primary" onClick={onAdd} aria-label="添加节点"><Plus size={22} /></button><button className={commentMode ? '' : 'active'} aria-label="选择工具"><MousePointer2 size={18} /></button><button className={commentMode ? 'active comment-tool' : 'comment-tool'} onClick={onToggleComment} aria-label={commentMode ? '退出备注模式' : '进入备注模式'}><MessageSquareText size={18} /></button><span className="dock-divider" /><button aria-label="连接节点"><Link2 size={18} /></button><button aria-label="自动布局"><Workflow size={18} /></button><button aria-label="AI 生成"><Sparkles size={18} /><span className="notification-dot" /></button><span className="dock-divider" /><button aria-label="历史记录"><Clock3 size={18} /></button><button aria-label="快捷键"><Command size={18} /></button><button aria-label="帮助"><CircleHelp size={18} /></button></FloatingButtonGroup></Panel> }
function ViewportControls({ zoom, miniMapVisible, snapToGrid, hideEdges, onChangeZoom, onToggleMiniMap, onToggleSnap, onToggleEdges, onReset }: { zoom: number; miniMapVisible: boolean; snapToGrid: boolean; hideEdges: boolean; onChangeZoom: (value: number) => void; onToggleMiniMap: () => void; onToggleSnap: () => void; onToggleEdges: () => void; onReset: () => void }) { return <Panel position="bottom-left" className="viewport-controls"><FloatingButtonGroup><button className={miniMapVisible ? 'active' : ''} onClick={onToggleMiniMap} aria-label="显示或隐藏小地图"><Map size={19} /></button><button className={snapToGrid ? 'active' : ''} onClick={onToggleSnap} aria-label="切换网格吸附"><Grid3X3 size={19} /></button><button onClick={onReset} aria-label="完整显示全部节点"><LocateFixed size={19} /></button><button className={hideEdges ? 'active' : ''} onClick={onToggleEdges} aria-label="隐藏连接线"><Link2 size={19} /></button><span className="viewport-divider" /><input type="range" min="20" max="200" value={zoom} onChange={(event) => onChangeZoom(Number(event.target.value))} aria-label="画布缩放" /></FloatingButtonGroup></Panel> }
