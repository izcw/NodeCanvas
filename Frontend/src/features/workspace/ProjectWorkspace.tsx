import { AlertTriangle, ChevronDown, Clock3, FolderOpen, ImageOff, ImageUp, ListFilter, MoreHorizontal, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ACTIVE_PROJECT_STORAGE_KEY, copyWorkspaceProject, createWorkspaceProject, deleteWorkspaceProject, listWorkspaceProjects, renameWorkspaceProject, updateWorkspaceProjectCover } from '../../lib/api'
import { NodeSelect, type NodeSelectOption } from '../../components/canvas/NodeSelect'

type Project = { id: string; title: string; lastOpenedAt: number; modifiedAt: number; favorite: boolean; cover?: string }
type WorkspaceContextValue = {
  activeProject: Project | null
  projects: Project[]
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  openWorkspace: () => void
  workspaceOpen: boolean
  createProject: () => void
  renameProject: (id?: string) => void
  saveProjectRename: (id: string, title: string) => void
  renamingProject: Project | null
  cancelProjectRename: () => void
  deleteProject: (id?: string) => void
  createProjectCopy: (id: string) => void
  setProjectCover: (id: string, cover?: string) => void
  selectProject: (id: string) => void
  toggleFavorite: (id: string) => void
}

const STORAGE_KEY = 'nodecanvas:workspace-projects:v1'
const VIEW_STORAGE_KEY = 'nodecanvas:workspace-view:v1'
const WORKSPACE_AVATAR_URL = 'https://www.lumehub.duoyu.link/resource/liulan/kasumi/original/051a92ea0787_20260627.jpg'
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function loadProjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Project[]
    return stored.length ? stored.map((project) => ({ ...project, modifiedAt: project.modifiedAt || project.lastOpenedAt || Date.now() })) : []
  } catch { return [] }
}

function loadWorkspaceView() {
  return !projectIdFromLocation()
}

function loadActiveProjectId() {
  const projects = loadProjects()
  const projectFromUrl = projectIdFromLocation()
  if (projectFromUrl) return projectFromUrl
  const stored = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)
  return stored && projects.some((project) => project.id === stored) ? stored : projects[0]?.id ?? null
}

function projectIdFromLocation() {
  const match = window.location.pathname.match(/^\/canvas\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

function navigateToProject(projectId: string) {
  window.history.pushState({}, '', `/canvas/${encodeURIComponent(projectId)}`)
}

function navigateToWorkspace() {
  window.history.pushState({}, '', '/')
}

function cacheActiveProjectId(projectId: string) {
  try {
    if (projectId) localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId)
    else localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY)
  } catch (error) { console.warn('Unable to cache active project locally.', error) }
}

function sortedProjects(projects: Project[]) {
  return [...projects].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.lastOpenedAt - a.lastOpenedAt)
}

function formatProjectModifiedAt(timestamp: number) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return '编辑于 日期未知'
  const elapsed = Math.max(0, Date.now() - date.getTime())
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (elapsed < minute) return '编辑于 刚刚'
  if (elapsed < hour) return `编辑于 ${Math.floor(elapsed / minute)}分钟前`
  if (elapsed < day) return `编辑于 ${Math.floor(elapsed / hour)}小时前`
  if (elapsed <= 7 * day) return `编辑于 ${Math.floor(elapsed / day)}天前`
  return `编辑于 ${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)}`
}

export function ProjectWorkspaceProvider({ children, onProjectChange }: { children: ReactNode; onProjectChange: (project: Project, isNew: boolean) => void }) {
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [activeProjectId, setActiveProjectId] = useState(loadActiveProjectId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renamingProject, setRenamingProject] = useState<Project | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(loadWorkspaceView)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null

  useEffect(() => {
    try {
      // Covers are persisted by the API. Never duplicate Base64 image payloads in localStorage.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.map(({ cover: _cover, ...project }) => project)))
    } catch (error) {
      console.warn('Unable to cache workspace preferences locally.', error)
    }
  }, [projects])
  useEffect(() => {
    cacheActiveProjectId(activeProjectId)
  }, [activeProjectId])
  useEffect(() => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, workspaceOpen ? 'workspace' : 'canvas') } catch (error) { console.warn('Unable to cache workspace view locally.', error) }
  }, [workspaceOpen])
  useEffect(() => {
    if (!workspaceOpen) return
    let active = true
    void listWorkspaceProjects().then((stored) => {
      if (!active || stored.length === 0) return
      setProjects((local) => {
        const localById = new Map(local.map((project) => [project.id, project]))
        return stored.map((project) => ({
          id: project.id,
          title: project.title,
          lastOpenedAt: Date.parse(project.updated_at) || Date.now(),
          modifiedAt: Date.parse(project.updated_at) || Date.now(),
          favorite: localById.get(project.id)?.favorite ?? false,
          cover: project.cover_url ?? localById.get(project.id)?.cover,
        }))
      })
    }).catch(() => { /* Offline mode keeps the locally cached directory. */ })
    return () => { active = false }
  }, [workspaceOpen])
  useEffect(() => {
    const onPopState = () => {
      const projectId = projectIdFromLocation()
      if (!projectId) {
        setWorkspaceOpen(true)
        return
      }
      const project = projects.find((item) => item.id === projectId) ?? { id: projectId, title: '项目', lastOpenedAt: Date.now(), modifiedAt: Date.now(), favorite: false }
      setActiveProjectId(projectId)
      cacheActiveProjectId(projectId)
      setWorkspaceOpen(false)
      onProjectChange(project, false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [onProjectChange, projects])

  const selectProject = useCallback((id: string) => {
    const project = projects.find((item) => item.id === id)
    if (!project) return
    const opened = { ...project, lastOpenedAt: Date.now() }
    setProjects((items) => items.map((item) => item.id === id ? opened : item))
    setActiveProjectId(id)
    cacheActiveProjectId(id)
    navigateToProject(id)
    setWorkspaceOpen(false)
    setMenuOpen(false)
    onProjectChange(opened, false)
  }, [onProjectChange, projects])

  const createProject = useCallback(() => {
    const now = Date.now()
    const project: Project = { id: crypto.randomUUID(), title: `未命名项目 ${projects.length + 1}`, lastOpenedAt: now, modifiedAt: now, favorite: false }
    setProjects((items) => [...items, project])
    setActiveProjectId(project.id)
    cacheActiveProjectId(project.id)
    navigateToProject(project.id)
    setWorkspaceOpen(false)
    setMenuOpen(false)
    void createWorkspaceProject(project.id, project.title).catch(() => { /* The local directory remains usable offline. */ })
    onProjectChange(project, true)
  }, [onProjectChange, projects.length])

  const renameProject = useCallback((id = activeProject?.id) => {
    const project = projects.find((item) => item.id === id)
    if (!project) return
    setRenamingProject(project)
    setMenuOpen(false)
  }, [activeProject?.id, projects])

  const saveProjectRename = useCallback((id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    setProjects((items) => items.map((item) => item.id === id ? { ...item, title: trimmed, modifiedAt: Date.now() } : item))
    void renameWorkspaceProject(id, trimmed).catch(() => { /* The local directory remains usable offline. */ })
    setRenamingProject(null)
  }, [])

  const deleteProject = useCallback((id = activeProject?.id) => {
    if (!id || !activeProject) return
    if (projects.length === 1) return
    const project = projects.find((item) => item.id === id)
    if (!project) return
    const nextProjects = projects.filter((item) => item.id !== id)
    const nextActive = sortedProjects(nextProjects)[0]
    setProjects(nextProjects)
    if (activeProject.id === id) {
      setActiveProjectId(nextActive.id)
      cacheActiveProjectId(nextActive.id)
      navigateToProject(nextActive.id)
    }
    setMenuOpen(false)
    void deleteWorkspaceProject(id).catch(() => { /* The local directory remains usable offline. */ })
    if (activeProject.id === id) onProjectChange(nextActive, false)
  }, [activeProject, onProjectChange, projects])

  const createProjectCopy = useCallback((id: string) => {
    const source = projects.find((project) => project.id === id)
    if (!source) return
    const now = Date.now()
    const copy: Project = { id: crypto.randomUUID(), title: `${source.title} 副本`, lastOpenedAt: now, modifiedAt: now, favorite: false, cover: source.cover }
    setProjects((items) => [...items, copy])
    void copyWorkspaceProject(source.id, copy.id, copy.title).catch(() => { /* The local directory remains usable offline. */ })
  }, [projects])

  const setProjectCover = useCallback((id: string, cover?: string) => {
    setProjects((items) => items.map((project) => project.id === id ? { ...project, cover, modifiedAt: Date.now() } : project))
    void updateWorkspaceProjectCover(id, cover).catch(() => { /* Keep the local cover when the server is temporarily unavailable. */ })
  }, [])

  const value = useMemo<WorkspaceContextValue>(() => ({
    activeProject, projects: sortedProjects(projects), menuOpen, setMenuOpen, workspaceOpen,
    openWorkspace: () => { navigateToWorkspace(); setWorkspaceOpen(true); setMenuOpen(false) }, createProject, renameProject, saveProjectRename, renamingProject, cancelProjectRename: () => setRenamingProject(null), deleteProject, createProjectCopy, setProjectCover, selectProject,
    toggleFavorite: (id) => setProjects((items) => items.map((project) => project.id === id ? { ...project, favorite: !project.favorite } : project)),
  }), [activeProject, createProject, createProjectCopy, deleteProject, menuOpen, projects, renameProject, renamingProject, saveProjectRename, selectProject, setProjectCover, workspaceOpen])

  return <WorkspaceContext.Provider value={value}>{children}<ProjectRenameDialog /></WorkspaceContext.Provider>
}

export function useProjectWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useProjectWorkspace 必须在 ProjectWorkspaceProvider 内使用')
  return context
}

export function DocumentTitle() {
  const { activeProject, workspaceOpen } = useProjectWorkspace()
  useEffect(() => {
    document.title = workspaceOpen ? '工作台 - 灵构 NodeCanvas' : `${activeProject?.title ?? '未命名项目'} - 灵构 NodeCanvas`
  }, [activeProject?.title, workspaceOpen])
  return null
}

export function ProjectMenu() {
  const { menuOpen, setMenuOpen, activeProject, openWorkspace, renameProject, createProject, deleteProject } = useProjectWorkspace()
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen, setMenuOpen])
  return <div className="project-menu-anchor" ref={menuRef}>
    <button className="project-menu-trigger" onClick={() => setMenuOpen(!menuOpen)} aria-label="打开项目菜单" aria-expanded={menuOpen}>
      <img src="/logo.png" alt="灵构" /><ChevronDown size={15} className={menuOpen ? 'rotated' : ''} />
    </button>
    {menuOpen && <div className="project-menu" role="menu" aria-label="项目菜单">
      <button onClick={openWorkspace}><FolderOpen size={18} />返回工作空间</button>
      <div className="project-menu-divider" />
      <p>项目</p>
      <button onClick={() => renameProject()}><Pencil size={18} />重命名</button>
      <button onClick={createProject}><Plus size={19} />新建项目</button>
      <button className="danger" onClick={() => deleteProject()}><Trash2 size={18} />删除</button>
      {activeProject && <small>当前：{activeProject.title}</small>}
    </div>}
  </div>
}

export function ProjectWorkspaceHome({ hidden = false }: { hidden?: boolean }) {
  const { workspaceOpen, projects, selectProject, createProject, toggleFavorite } = useProjectWorkspace()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'favorite' | 'recent'>('all')
  const filteredProjects = projects.filter((project) => (
    project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    && (filter === 'all' || (filter === 'favorite' ? project.favorite : !project.favorite))
  ))
  const filterOptions: NodeSelectOption[] = [
    { value: 'all', label: '显示全部', description: '展示所有项目', icon: <ListFilter size={16} /> },
    { value: 'favorite', label: '仅收藏', description: '仅展示收藏项目', icon: <Star size={16} /> },
    { value: 'recent', label: '未收藏', description: '隐藏收藏项目', icon: <Clock3 size={16} /> },
  ]
  if (hidden || !workspaceOpen) return null
  return <section className="project-workspace-home" aria-label="工作空间项目">
    <div className="workspace-global-header">
      <div className="workspace-global-brand"><img src="/logo.png" alt="灵构" /><strong>灵构</strong></div>
      <nav aria-label="主导航"><button className="active"><FolderOpen size={16} />工作空间</button></nav>
      <div className="workspace-global-actions"><span>我的工作区</span><button className="workspace-avatar" aria-label="用户菜单"><img src={WORKSPACE_AVATAR_URL} alt="工作区头像" /></button></div>
    </div>
    <header><div><span>工作空间</span><h2>所有项目（{projects.length}）</h2><p>收藏项目优先展示，其余按最近打开时间排序。</p></div><div className="workspace-project-tools"><label className="project-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索" aria-label="搜索项目" /></label><NodeSelect className="workspace-filter-picker" value={filter} options={filterOptions} onChange={(value) => setFilter(value as typeof filter)} ariaLabel="筛选项目" /><button className="primary-project-button" onClick={createProject}><Plus size={18} />新建项目</button></div></header>
    <div className="project-grid">
      <button className="project-card project-create-card" onClick={createProject} aria-label="新建项目"><span><Plus size={27} /></span><strong>新建项目</strong><small>创建一个新的创意画布</small></button>
      {filteredProjects.map((project) => <article className="project-card" key={project.id}>
        <button className="project-card-main" onClick={() => selectProject(project.id)}><span className={`project-card-art ${project.cover ? 'has-image' : ''}`} style={project.cover ? { backgroundImage: `url("${project.cover}")` } : undefined} /><strong>{project.title}</strong><small>{formatProjectModifiedAt(project.modifiedAt || project.lastOpenedAt)}</small></button>
        <button className={`favorite-project ${project.favorite ? 'active' : ''}`} onClick={() => toggleFavorite(project.id)} aria-label={project.favorite ? '取消收藏' : '收藏项目'}><Star size={18} fill={project.favorite ? 'currentColor' : 'none'} /></button>
        <ProjectCardMenu project={project} />
      </article>)}
      {filteredProjects.length === 0 && <div className="project-empty-state">{projects.length === 0 ? '还没有项目，点击新建项目开始' : '没有匹配的项目'}</div>}
    </div>
  </section>
}

function ProjectCardMenu({ project }: { project: Project }) {
  const { selectProject, renameProject, deleteProject, createProjectCopy, setProjectCover } = useProjectWorkspace()
  const [open, setOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const onCoverSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file?.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') setProjectCover(project.id, reader.result) }
    reader.readAsDataURL(file)
    event.target.value = ''
    setOpen(false)
  }
  return <div className="project-card-menu-anchor" ref={menuRef}>
    <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={onCoverSelected} />
    <button className="project-card-more" onClick={() => setOpen((value) => !value)} aria-label={`${project.title} 更多操作`} aria-expanded={open}><MoreHorizontal size={19} /></button>
    {open && <div className="project-card-menu" role="menu" aria-label={`${project.title} 项目操作`}><button onClick={() => selectProject(project.id)}>打开</button><button onClick={() => { renameProject(project.id); setOpen(false) }}>重命名</button><button onClick={() => { createProjectCopy(project.id); setOpen(false) }}>创建副本</button><div /><button onClick={() => fileInputRef.current?.click()}><ImageUp size={15} />替换封面</button><button disabled={!project.cover} onClick={() => { setProjectCover(project.id); setOpen(false) }}><ImageOff size={15} />移除封面</button><div /><button className="danger" onClick={() => { setOpen(false); setDeleteConfirmOpen(true) }}>删除</button></div>}
    {deleteConfirmOpen && <ProjectDeleteDialog project={project} onCancel={() => setDeleteConfirmOpen(false)} onConfirm={() => { deleteProject(project.id); setDeleteConfirmOpen(false) }} />}
  </div>
}

function ProjectDeleteDialog({ project, onCancel, onConfirm }: { project: Project; onCancel: () => void; onConfirm: () => void }) {
  return createPortal(<div className="model-manager-overlay project-delete-overlay" onMouseDown={onCancel}><section className="project-delete-dialog" role="dialog" aria-modal="true" aria-label="确认删除项目" onMouseDown={(event) => event.stopPropagation()}><span className="project-delete-icon"><AlertTriangle size={22} /></span><h2>删除项目？</h2><p>“{project.title}”及其画布、知识库和历史运行记录将被永久删除，无法恢复。</p><footer><button onClick={onCancel}>取消</button><button className="danger" onClick={onConfirm}>确认删除</button></footer></section></div>, document.body)
}

function ProjectRenameDialog() {
  const { renamingProject, saveProjectRename, cancelProjectRename } = useProjectWorkspace()
  const [title, setTitle] = useState('')
  useEffect(() => { setTitle(renamingProject?.title ?? '') }, [renamingProject])
  if (!renamingProject) return null
  const submit = () => saveProjectRename(renamingProject.id, title)
  return createPortal(<div className="model-manager-overlay project-rename-overlay" onMouseDown={cancelProjectRename}><section className="project-rename-dialog" role="dialog" aria-modal="true" aria-label="重命名项目" onMouseDown={(event) => event.stopPropagation()}><h2>重命名项目</h2><input className="workspace-name-input" autoFocus value={title} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); if (event.key === 'Escape') cancelProjectRename() }} aria-label="项目名称" /><footer><button onClick={cancelProjectRename}>取消</button><button className="confirm" onClick={submit} disabled={!title.trim()}>确认</button></footer></section></div>, document.body)
}
