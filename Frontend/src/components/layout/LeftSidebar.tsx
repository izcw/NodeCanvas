import { AlertTriangle, ArrowLeftToLine, BookOpen, ChevronDown, ChevronRight, Copy, FileText, FolderUp, Image as ImageIcon, Layers3, MoreHorizontal, Paperclip, Plus, Trash2 } from 'lucide-react'
import type { CanvasNode, KnowledgeItem } from '../../types/canvas'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NodeGroup } from '../../features/canvas/graph'
import { BrandLogo } from '../BrandLogo'

type SidebarTab = 'canvas' | 'knowledge'

type LeftSidebarProps = {
  collapsed: boolean
  tab: SidebarTab
  groups: NodeGroup[]
  nodes: CanvasNode[]
  knowledge: KnowledgeItem[]
  onTabChange: (tab: SidebarTab) => void
  onToggle: () => void
  onFocusGroup: (nodeIds: string[]) => void
  onUploadKnowledge: () => void
  onSelectKnowledge: (item: KnowledgeItem) => void
  onAttachKnowledge: (item: KnowledgeItem) => void
  onDeleteKnowledge: (item: KnowledgeItem) => void
  onRetryKnowledge: (item: KnowledgeItem) => void
  onNewCanvas: () => void
  onRenameNode: (id: string, title: string) => void
}

export function LeftSidebar({ collapsed, tab, groups, nodes, knowledge, onTabChange, onToggle, onFocusGroup, onUploadKnowledge, onSelectKnowledge, onAttachKnowledge, onDeleteKnowledge, onRetryKnowledge, onNewCanvas, onRenameNode }: LeftSidebarProps) {
  const [canvases, setCanvases] = useState(['画布 1'])
  const [activeCanvas, setActiveCanvas] = useState('画布 1')
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false)
  const [actionCanvas, setActionCanvas] = useState<string | null>(null)
  const [groupNames, setGroupNames] = useState<Record<string, string>>({})
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editingNode, setEditingNode] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [knowledgeQuery, setKnowledgeQuery] = useState('')
  const [knowledgeMenuId, setKnowledgeMenuId] = useState<string | null>(null)
  const [pendingKnowledgeDeletion, setPendingKnowledgeDeletion] = useState<KnowledgeItem | null>(null)
  const switcherRef = useRef<HTMLDivElement>(null)
  const knowledgeListRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!canvasMenuOpen) return
    const onPointerDown = (event: PointerEvent) => { if (!switcherRef.current?.contains(event.target as Node)) { setCanvasMenuOpen(false); setActionCanvas(null) } }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [canvasMenuOpen])
  useEffect(() => {
    if (!knowledgeMenuId) return
    const closeIfOutside = (event: Event) => {
      if (!knowledgeListRef.current?.contains(event.target as Node)) setKnowledgeMenuId(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setKnowledgeMenuId(null)
    }
    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('focusin', closeIfOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      document.removeEventListener('focusin', closeIfOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [knowledgeMenuId])
  if (collapsed) {
    return null
  }
  const filteredKnowledge = knowledge.filter((item) => item.name.toLowerCase().includes(knowledgeQuery.trim().toLowerCase()))

  return (
    <aside className="left-sidebar">
      <div className="workspace-header">
        <BrandLogo />
        <button className="icon-button" onClick={onToggle} aria-label="折叠侧边栏"><ArrowLeftToLine size={18} /></button>
      </div>
      <nav className="left-tabs" aria-label="工作区视图">
        <button className={tab === 'canvas' ? 'active' : ''} onClick={() => onTabChange('canvas')}><Layers3 size={15} />画布</button>
        <button className={tab === 'knowledge' ? 'active' : ''} onClick={() => onTabChange('knowledge')}><BookOpen size={15} />知识库</button>
      </nav>
      {tab === 'canvas' && <div className="canvas-switcher-wrap" ref={switcherRef}>
        <button className="canvas-switcher-trigger" onClick={() => setCanvasMenuOpen((value) => !value)} aria-expanded={canvasMenuOpen}><Layers3 size={17} /><span>{activeCanvas}</span><ChevronDown size={16} className={canvasMenuOpen ? 'rotated' : ''} /></button>
        {canvasMenuOpen && <div className="canvas-switcher-menu">
          <div className="canvas-switcher-heading"><span><Layers3 size={17} />画布</span><button aria-label="新建画布" onClick={() => { const name = `画布 ${canvases.length + 1}`; setCanvases((items) => [...items, name]); setActiveCanvas(name); setCanvasMenuOpen(false); onNewCanvas() }}><Plus size={23} /></button></div>
          {canvases.map((canvas) => <div key={canvas} className={`canvas-switcher-item ${canvas === activeCanvas ? 'active' : ''}`}><button onClick={() => { setActiveCanvas(canvas); setCanvasMenuOpen(false); setActionCanvas(null) }}>{canvas}</button><button className="canvas-more" aria-label={`${canvas}操作`} onClick={() => setActionCanvas(actionCanvas === canvas ? null : canvas)}><MoreHorizontal size={19} /></button>{actionCanvas === canvas && <div className="canvas-action-menu"><button onClick={() => { const next = window.prompt('重命名画布', canvas)?.trim(); if (next) { setCanvases((items) => items.map((item) => item === canvas ? next : item)); if (activeCanvas === canvas) setActiveCanvas(next) }; setActionCanvas(null) }}><FileText size={15} />重命名画布</button><button onClick={() => { const copy = `${canvas} 副本`; setCanvases((items) => [...items, copy]); setActiveCanvas(copy); setActionCanvas(null); setCanvasMenuOpen(false) }}><Copy size={15} />复制画布</button><button disabled={canvases.length === 1} onClick={() => { setCanvases((items) => items.filter((item) => item !== canvas)); if (activeCanvas === canvas) setActiveCanvas(canvases.find((item) => item !== canvas) ?? '画布 1'); setActionCanvas(null) }}><Trash2 size={15} />删除画布</button></div>}</div>)}
        </div>}
      </div>}
      {tab === 'canvas' ? (
        <section className="sidebar-content">
          <div className="sidebar-section-title"><span>当前画布</span><span className="count-pill">{groups.length} 组</span></div>
          <p className="sidebar-hint">仅展示存在关联的节点组 · 当前 {groups.reduce((sum, group) => sum + group.nodeIds.length, 0)} 个节点</p>
          <div className="node-list group-list">
            {groups.map((group) => (
              <div key={group.id} className="canvas-group-item">
                <button onClick={() => setExpandedGroups((current) => { const next = new Set(current); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next })}>
                  <span className="node-list-icon group" onClick={(event) => { event.stopPropagation(); onFocusGroup(group.nodeIds) }} role="button" tabIndex={0} aria-label="定位分组"><Layers3 size={16} /></span>
                  <span>{editingGroup === group.id ? <input className="group-name-input" autoFocus value={groupNames[group.id] ?? group.title} onChange={(event) => setGroupNames((current) => ({ ...current, [group.id]: event.target.value }))} onBlur={() => setEditingGroup(null)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') setEditingGroup(null) }} aria-label="分组名称" /> : <strong onClick={(event) => { event.stopPropagation(); setEditingGroup(group.id) }} title="点击重命名分组">{groupNames[group.id] ?? group.title}</strong>}<small>{group.description}</small></span>
                  {expandedGroups.has(group.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                {expandedGroups.has(group.id) && <div className="group-node-list">{group.nodeIds.map((id) => { const node = nodes.find((item) => item.id === id); if (!node) return null; const Icon = node.type === 'image' ? ImageIcon : node.type === 'file' ? Paperclip : FileText; return <div key={id} className="group-node-row" role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onFocusGroup([id]) }}><span className={`group-node-icon ${node.type}`} onClick={() => onFocusGroup([id])} role="button" tabIndex={0} aria-label="定位节点"><Icon size={14} /></span>{editingNode === id ? <input className="group-node-name-input" autoFocus value={node.data.title || ''} onChange={(event) => onRenameNode(id, event.target.value)} onBlur={() => setEditingNode(null)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') setEditingNode(null) }} aria-label="节点名称" /> : <span onClick={() => setEditingNode(id)} title="点击重命名节点">{node.data.title || '未命名节点'}</span>}</div> })}</div>}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="sidebar-content knowledge-panel">
          <div className="sidebar-section-title"><span>共享知识库</span><span className="count-pill">{knowledge.length}</span></div>
          <p className="sidebar-hint">工作区内的 Agent 与画布均可引用</p>
          <button className="knowledge-upload" onClick={onUploadKnowledge}><FolderUp size={16} />上传共享文件</button>
          <input className="knowledge-search" value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="搜索知识库文件" aria-label="搜索知识库文件" />
          <div className="knowledge-list" ref={knowledgeListRef}>
            {filteredKnowledge.map((item) => <div key={item.id} className="knowledge-item"><button className="knowledge-item-main" onClick={() => onSelectKnowledge(item)}><span className="node-list-icon file"><FileText size={16} /></span><span><strong title={item.name}>{item.name}</strong><small title={`${item.kind} · ${item.size} · ${item.status ?? '已索引'}`}>{item.kind} · {item.size} · {item.status ?? '已索引'}</small></span></button><button className="knowledge-item-more" onClick={() => setKnowledgeMenuId((id) => id === item.id ? null : item.id)} aria-label={`${item.name}操作`}><MoreHorizontal size={16} /></button>{knowledgeMenuId === item.id && <div className="knowledge-action-menu"><button onClick={() => { onAttachKnowledge(item); setKnowledgeMenuId(null) }}><Paperclip size={14} />添加到画布</button>{item.status === '索引失败' && <button onClick={() => { onRetryKnowledge(item); setKnowledgeMenuId(null) }}>重试索引</button>}<button className="danger" onClick={() => { setPendingKnowledgeDeletion(item); setKnowledgeMenuId(null) }}><Trash2 size={14} />删除文件</button></div>}</div>)}
            {filteredKnowledge.length === 0 && <p className="knowledge-empty">{knowledge.length ? '没有匹配的文件' : '上传文件后，Agent 即可检索引用。'}</p>}
          </div>
        </section>
      )}
      {pendingKnowledgeDeletion && <KnowledgeDeleteDialog item={pendingKnowledgeDeletion} onCancel={() => setPendingKnowledgeDeletion(null)} onConfirm={() => { onDeleteKnowledge(pendingKnowledgeDeletion); setPendingKnowledgeDeletion(null) }} />}
    </aside>
  )
}

function KnowledgeDeleteDialog({ item, onCancel, onConfirm }: { item: KnowledgeItem; onCancel: () => void; onConfirm: () => void }) {
  return createPortal(
    <div className="model-manager-overlay project-delete-overlay" onMouseDown={onCancel}>
      <section className="project-delete-dialog" role="dialog" aria-modal="true" aria-label="确认删除知识库文件" onMouseDown={(event) => event.stopPropagation()}>
        <span className="project-delete-icon"><AlertTriangle size={22} /></span>
        <h2>删除知识库文件？</h2>
        <p>“{item.name}”及其检索索引将被永久删除，无法恢复；画布上的附件节点不会被删除。</p>
        <footer><button onClick={onCancel}>取消</button><button className="danger" onClick={onConfirm}>确认删除</button></footer>
      </section>
    </div>,
    document.body,
  )
}
