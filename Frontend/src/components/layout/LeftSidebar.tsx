import { ArrowLeftToLine, BookOpen, ChevronDown, ChevronRight, FileText, FolderPlus, FolderUp, Layers3, Search } from 'lucide-react'
import type { KnowledgeItem } from '../../types/canvas'
import { useState } from 'react'
import type { NodeGroup } from '../../features/canvas/graph'
import { BrandLogo } from '../BrandLogo'

type SidebarTab = 'canvas' | 'knowledge'

type LeftSidebarProps = {
  collapsed: boolean
  tab: SidebarTab
  groups: NodeGroup[]
  knowledge: KnowledgeItem[]
  onTabChange: (tab: SidebarTab) => void
  onToggle: () => void
  onFocusGroup: (nodeIds: string[]) => void
  onUploadKnowledge: () => void
  onSelectKnowledge: (item: KnowledgeItem) => void
}

export function LeftSidebar({ collapsed, tab, groups, knowledge, onTabChange, onToggle, onFocusGroup, onUploadKnowledge, onSelectKnowledge }: LeftSidebarProps) {
  const [canvasCount, setCanvasCount] = useState(1)
  if (collapsed) {
    return <aside className="left-sidebar collapsed-hidden" />
  }

  return (
    <aside className="left-sidebar">
      <div className="workspace-header">
        <BrandLogo />
        <button className="icon-button" onClick={onToggle} aria-label="折叠侧边栏"><ArrowLeftToLine size={18} /></button>
      </div>
      <div className="workspace-switcher">
        <span className="workspace-avatar">灵</span>
        <div><strong>未命名工作区</strong><span>摄影策划 · 画布 1</span></div>
        <ChevronDown size={15} />
      </div>
      <nav className="left-tabs" aria-label="工作区视图">
        <button className={tab === 'canvas' ? 'active' : ''} onClick={() => onTabChange('canvas')}><Layers3 size={15} />画布</button>
        <button className={tab === 'knowledge' ? 'active' : ''} onClick={() => onTabChange('knowledge')}><BookOpen size={15} />知识库</button>
      </nav>
      {tab === 'canvas' ? (
        <section className="sidebar-content">
          <div className="sidebar-section-title"><span>画布 {canvasCount}</span><button className="icon-button" aria-label="新建画布" onClick={() => setCanvasCount((value) => value + 1)}><FolderPlus size={16} /></button><span className="count-pill">{groups.length} 组</span><button className="icon-button" aria-label="搜索分组"><Search size={16} /></button></div>
          <p className="sidebar-hint">仅展示存在关联的节点组 · 当前 {groups.reduce((sum, group) => sum + group.nodeIds.length, 0)} 个节点</p>
          <div className="node-list group-list">
            {groups.map((group) => (
              <button key={group.id} onClick={() => onFocusGroup(group.nodeIds)}>
                <span className="node-list-icon group"><Layers3 size={16} /></span>
                <span><strong>{group.title}</strong><small>{group.description}</small></span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="sidebar-content knowledge-panel">
          <div className="sidebar-section-title"><span>共享知识库</span><span className="count-pill">{knowledge.length}</span></div>
          <p className="sidebar-hint">工作区内的 Agent 与画布均可引用</p>
          <button className="knowledge-upload" onClick={onUploadKnowledge}><FolderUp size={16} />上传共享文件</button>
          <div className="knowledge-list">
            {knowledge.map((item) => <button key={item.id} className="knowledge-item" onClick={() => onSelectKnowledge(item)}><span className="node-list-icon file"><FileText size={16} /></span><span><strong>{item.name}</strong><small>{item.kind} · {item.size}</small></span></button>)}
          </div>
        </section>
      )}
    </aside>
  )
}
