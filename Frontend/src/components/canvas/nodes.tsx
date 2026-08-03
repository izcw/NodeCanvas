/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type ChangeEvent,
  type ReactNode,
  lazy,
  memo,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Handle,
  NodeResizer,
  type NodeProps,
  Position,
  useReactFlow,
} from '@xyflow/react'
import {
  Copy,
  Check,
  Code2,
  Expand,
  File,
  FileText,
  Image as ImageIcon,
  Maximize2,
  MessageSquareText,
  Paperclip,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { CanvasNode } from '../../types/canvas'
import { NodeSelect } from './NodeSelect'

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'))
export const CanvasNodeReadOnlyContext = createContext(false)

type NodeKind = CanvasNode['type']

type NodeFrameProps = {
  id: string
  kind: NodeKind
  selected: boolean
  children: ReactNode
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
  connectable?: boolean
  generationStatus?: CanvasNode['data']['generationStatus']
}

type NodeHeaderProps = {
  icon: ReactNode
  label: string
  title: string
  nodeId: string
}

function openConnectionMenu(event: React.MouseEvent, sourceId: string, side: 'context' | 'reference') {
  event.stopPropagation()
  window.dispatchEvent(new CustomEvent('nodecanvas:open-connection-menu', {
    detail: { sourceId, side, x: event.clientX, y: event.clientY },
  }))
}

function NodeHandles({ id }: { id: string }) {
  return (
    <>
      <span className="node-anchor node-anchor--left" aria-label="添加上下文" title="添加上下文">
        <Handle id="left-target" className="canvas-handle canvas-target-handle" type="target" position={Position.Left} />
        <Handle id="left-context-source" className="canvas-handle canvas-source-handle canvas-context-handle" type="source" position={Position.Left} onClick={(event) => openConnectionMenu(event, id, 'context')} />
      </span>
      <span className="node-anchor node-anchor--right" aria-label="引用该节点生成" title="引用该节点生成">
        <Handle id="right-source" className="canvas-handle canvas-source-handle" type="source" position={Position.Right} onClick={(event) => openConnectionMenu(event, id, 'reference')} />
      </span>
    </>
  )
}

function NodeContextMenu({
  id,
  isImage,
  position,
  anchorRef,
  readOnly,
  onClose,
  onPreview,
  onReplaceImage,
}: {
  id: string
  isImage: boolean
  position: { x: number; y: number }
  anchorRef: { current: HTMLElement | null }
  readOnly: boolean
  onClose: () => void
  onPreview: () => void
  onReplaceImage: () => void
}) {
  const { deleteElements, fitView, getNode, getNodes, setNodes } = useReactFlow()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    menuRef.current?.focus()
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const duplicate = () => {
    const node = getNode(id)
    if (!node) return
    setNodes([
      ...getNodes(),
      {
        ...node,
        id: `${node.type}-${crypto.randomUUID()}`,
        position: { x: node.position.x + 36, y: node.position.y + 36 },
        selected: false,
      },
    ])
    onClose()
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      className="node-context-menu nodrag"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {!readOnly && isImage && (
        <button role="menuitem" onClick={onReplaceImage}>
          <ImageIcon size={15} />
          替换图片
        </button>
      )}
      <button
        role="menuitem"
        onClick={() => {
          void fitView({ nodes: [{ id }], duration: 180, maxZoom: 1.4 })
          onClose()
        }}
      >
        <Expand size={15} />
        聚焦查看
      </button>
      <button role="menuitem" onClick={onPreview}>
        <Maximize2 size={15} />
        全屏预览
      </button>
      {!readOnly && <button role="menuitem" onClick={duplicate}>
        <Copy size={15} />
        创建副本
      </button>}
      <button
        role="menuitem"
        onClick={() => {
          void navigator.clipboard?.writeText(
            JSON.stringify(getNode(id)?.data ?? {}, null, 2),
          )
          onClose()
        }}
      >
        <Copy size={15} />
        复制内容
      </button>
      {!readOnly && <><span className="node-menu-divider" />
      <button
        role="menuitem"
        className="danger"
        onClick={() => {
          void deleteElements({ nodes: [{ id }] })
          onClose()
        }}
      >
        <Trash2 size={15} />
        删除节点
      </button></>}
    </div>,
    document.body,
  )
}

function NodeFrame({
  id,
  kind,
  selected,
  children,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  connectable = true,
  generationStatus,
}: NodeFrameProps) {
  const { getNode, getNodes, setNodes } = useReactFlow()
  const readOnly = useContext(CanvasNodeReadOnlyContext)
  const [menuOpen, setMenuOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const frameRef = useRef<HTMLElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const getMenuPosition = () => {
    const frame = frameRef.current
    if (!frame) return menuPosition
    const bounds = frame.getBoundingClientRect()
    const menuWidth = 190
    const menuHeight = 220
    // Keep the menu anchored inside the node instead of floating beside it.
    const innerX = bounds.left + 12
    const innerY = bounds.top + 12
    return {
      x: Math.min(Math.max(8, innerX), Math.max(8, window.innerWidth - menuWidth - 8)),
      y: Math.min(Math.max(8, innerY), Math.max(8, window.innerHeight - menuHeight - 8)),
    }
  }

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const openMenuAtEvent = (event: MouseEvent | PointerEvent) => {
      if (!(event.target instanceof Node) || !frame.contains(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      window.dispatchEvent(new CustomEvent('nodecanvas:close-node-context-menus', { detail: { exceptId: id } }))
      setMenuPosition(getMenuPosition())
      setMenuOpen(true)
    }
    const openContextMenu = (event: MouseEvent) => openMenuAtEvent(event)
    const openOnRightPointerDown = (event: PointerEvent) => {
      if (event.button === 2) openMenuAtEvent(event)
    }
    // React Flow owns the node event layer. Capture on document so the custom
    // menu wins before React Flow can consume the browser contextmenu event.
    document.addEventListener('contextmenu', openContextMenu, true)
    document.addEventListener('pointerdown', openOnRightPointerDown, true)
    return () => {
      document.removeEventListener('contextmenu', openContextMenu, true)
      document.removeEventListener('pointerdown', openOnRightPointerDown, true)
    }
  }, [id])
  useEffect(() => {
    if (!menuOpen) return
    let animationFrame = 0
    const syncMenuPosition = () => {
      const next = getMenuPosition()
      setMenuPosition((current) => current.x === next.x && current.y === next.y ? current : next)
      animationFrame = window.requestAnimationFrame(syncMenuPosition)
    }
    animationFrame = window.requestAnimationFrame(syncMenuPosition)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [menuOpen])
  useEffect(() => {
    const closeOtherMenus = (event: Event) => {
      if ((event as CustomEvent<{ exceptId: string }>).detail.exceptId !== id) setMenuOpen(false)
    }
    window.addEventListener('nodecanvas:close-node-context-menus', closeOtherMenus)
    return () => window.removeEventListener('nodecanvas:close-node-context-menus', closeOtherMenus)
  }, [id])

  const replaceImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setNodes(
        getNodes().map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  imageUrl: String(reader.result),
                  title: file.name.replace(/\.[^.]+$/, ''),
                },
              }
            : node,
        ),
      )
      setMenuOpen(false)
      event.target.value = ''
    }
    reader.readAsDataURL(file)
  }

  return (
    <article
      ref={frameRef}
      className={`canvas-node canvas-node--${kind} ${selected ? 'is-selected' : ''}`}
    >
      <input
        ref={imageInputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={replaceImage}
      />
      <NodeResizer
        isVisible={selected}
        minWidth={minWidth}
        minHeight={minHeight}
        maxWidth={maxWidth}
        maxHeight={maxHeight}
        lineClassName="node-resize-line"
        handleClassName="node-resize-handle"
      />
      {connectable && <NodeHandles id={id} />}
      <div className="node-card">{children}</div>
      {generationStatus && <GenerationSand status={generationStatus} />}
      {menuOpen && (
        <NodeContextMenu
          id={id}
          isImage={getNode(id)?.type === 'image'}
          position={menuPosition}
          anchorRef={frameRef}
          readOnly={readOnly}
          onClose={() => setMenuOpen(false)}
          onPreview={() => { setMenuOpen(false); setPreviewOpen(true) }}
          onReplaceImage={() => imageInputRef.current?.click()}
        />
      )}
      {previewOpen && <NodeFullscreenPreview node={getNode(id) as CanvasNode | undefined} onClose={() => setPreviewOpen(false)} />}
    </article>
  )
}

function NodeFullscreenPreview({ node, onClose }: { node?: CanvasNode; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  if (!node) return null
  const { data } = node
  return createPortal(
    <div className={`node-fullscreen-preview node-fullscreen-preview--${node.type}`} role="dialog" aria-modal="true" aria-label={`${data.title} 全屏预览`} onMouseDown={onClose}>
      <section onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>{node.type === 'image' ? '图片节点' : node.type === 'file' ? '附件节点' : node.type === 'comment' ? '备注节点' : '文本节点'}</span><h2>{data.title || '未命名节点'}</h2></div><button onClick={onClose} aria-label="关闭全屏预览">关闭</button></header>
        <main>
          {node.type === 'image' && data.imageUrl ? <img src={data.imageUrl} alt={data.title || '节点图片'} /> : node.type === 'file' ? <div className="node-preview-file"><File size={32} /><strong>{data.fileName || data.title}</strong><span>{data.fileKind || 'FILE'} · {data.fileSize || '未知大小'}</span><p>{data.content || '该附件没有可预览的文本内容。'}</p></div> : node.type === 'text' && data.format === 'markdown' ? <article className="node-preview-markdown markdown-preview">{data.content?.trim() ? <Suspense fallback={<span className="markdown-preview__empty">正在渲染 Markdown…</span>}><MarkdownRenderer content={data.content} /></Suspense> : <span className="markdown-preview__empty">暂无 Markdown 内容</span>}</article> : <article>{data.content || '暂无内容'}</article>}
        </main>
      </section>
    </div>,
    document.body,
  )
}

function GenerationSand({ status }: { status: NonNullable<CanvasNode['data']['generationStatus']> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const statusRef = useRef(status)
  const settlingStartedRef = useRef<number | null>(status === 'settling' ? performance.now() : null)

  useEffect(() => {
    statusRef.current = status
    if (status === 'settling' && settlingStartedRef.current === null) settlingStartedRef.current = performance.now()
  }, [status])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    const context = canvas?.getContext('2d')
    if (!canvas || !host || !context) return
    type Particle = { x: number; y: number; velocity: number; radius: number; phase: number; alpha: number; tint: number }
    let width = 1
    let height = 1
    let frame = 0
    let lastFrameAt = 0
    let particles: Particle[] = []
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const createParticle = (): Particle => ({
      x: Math.random() * width,
      y: Math.random() * height,
      velocity: .18 + Math.random() * .42,
      radius: .62 + Math.random() * 1.08,
      phase: Math.random() * Math.PI * 2,
      alpha: .34 + Math.random() * .62,
      tint: Math.random(),
    })
    const resize = () => {
      width = Math.max(1, host.clientWidth)
      height = Math.max(1, host.clientHeight)
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const count = Math.max(76, Math.min(180, Math.round((width * height) / 1150)))
      particles = Array.from({ length: count }, createParticle)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    const render = (time: number) => {
      if (!reduceMotion && time - lastFrameAt < 33) {
        frame = requestAnimationFrame(render)
        return
      }
      lastFrameAt = time
      context.clearRect(0, 0, width, height)
      const settlingProgress = statusRef.current === 'settling'
        ? Math.min(1, (time - (settlingStartedRef.current ?? time)) / 3200)
        : 0
      for (const particle of particles) {
        const flow = Math.sin(particle.y * .02 + time * .00075 + particle.phase) * .28
        const lift = Math.cos(particle.x * .014 - time * .00055 + particle.phase) * .12
        particle.x += (particle.velocity + flow) * (statusRef.current === 'settling' ? 1.9 : 1)
        particle.y += lift - particle.velocity * (statusRef.current === 'settling' ? .7 : .08)
        if (statusRef.current === 'running') {
          if (particle.x > width + 8) particle.x = -8
          if (particle.y < -8) particle.y = height + 8
          if (particle.y > height + 8) particle.y = -8
        }
        const twinkle = .58 + .32 * Math.sin(time * .0025 + particle.phase)
        const alpha = particle.alpha * twinkle * (1 - settlingProgress)
        const color = particle.tint > .7 ? `rgba(225,205,255,${alpha})` : particle.tint > .35 ? `rgba(172,209,255,${alpha})` : `rgba(255,255,255,${alpha})`
        context.beginPath()
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
        context.fillStyle = color
        context.fill()
      }
      if (!reduceMotion) frame = requestAnimationFrame(render)
    }
    if (reduceMotion) render(performance.now())
    else frame = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return (
    <div
      className={`generation-sand generation-sand--${status} nodrag nopan`}
      aria-label={status === 'running' ? '节点正在生成' : '节点生成完成'}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  )
}

function NodeHeader({
  icon,
  label,
  title,
  nodeId,
}: NodeHeaderProps) {
  const { updateNodeData } = useReactFlow()

  return (
    <header className="node-card__header" title={`${label}：${title}`}>
      <span className="node-card__icon">{icon}</span>
      <span className="node-card__type">{label}</span>
      <input
        className="node-card__title nodrag"
        value={title}
        onChange={(event) =>
          updateNodeData(nodeId, { title: event.target.value })
        }
        onClick={(event) => event.stopPropagation()}
        aria-label={`${label}自定义名称`}
      />
    </header>
  )
}

export const TextNode = memo(({ id, data, selected }: NodeProps<CanvasNode>) => {
  const { updateNodeData } = useReactFlow()
  const format = data.format ?? 'text'
  const [editingMarkdown, setEditingMarkdown] = useState(false)

  useEffect(() => {
    if (format === 'text') setEditingMarkdown(false)
  }, [format])

  return (
    <NodeFrame
      id={id}
      kind="text"
      selected={selected}
      minWidth={260}
      minHeight={210}
      maxWidth={660}
      maxHeight={620}
      generationStatus={data.generationStatus}
    >
      <NodeHeader
        icon={<FileText size={16} />}
        label="文本节点"
        title={data.title}
        nodeId={id}
      />
      <div className="node-card__body node-card__body--text">
        {format === 'markdown' && !editingMarkdown ? (
          <div className="markdown-preview nodrag nopan nowheel" aria-label={`${data.title} Markdown 预览`}>
            {data.content?.trim() ? (
              <Suspense fallback={<span className="markdown-preview__empty">正在渲染 Markdown…</span>}>
                <MarkdownRenderer content={data.content} />
              </Suspense>
            ) : <span className="markdown-preview__empty">暂无 Markdown 内容</span>}
          </div>
        ) : (
          <textarea
            className="nodrag nopan nowheel"
            value={data.content ?? ''}
            onChange={(event) => updateNodeData(id, { content: event.target.value })}
            placeholder={format === 'markdown' ? '输入 Markdown 源码…' : '写下想法、脚本或提示词…'}
            aria-label={`${data.title}内容`}
          />
        )}
        <div className="text-node-controls nodrag nopan">
          <NodeSelect className="text-format-picker" value={format} ariaLabel="选择文本格式" onChange={(value) => { const nextFormat = value as 'text' | 'markdown'; updateNodeData(id, { format: nextFormat }); setEditingMarkdown(false) }} options={[{ value: 'text', label: '纯文本', description: '普通文本编辑', icon: <FileText size={18} /> }, { value: 'markdown', label: 'Markdown', description: '渲染 Markdown 内容', icon: <Code2 size={18} /> }]} />
          {format === 'markdown' && <button type="button" className="markdown-edit-toggle nodrag nopan" onClick={(event) => { event.stopPropagation(); setEditingMarkdown((value) => !value) }} aria-label={editingMarkdown ? '完成 Markdown 编辑并预览' : '编辑 Markdown 源码'}>{editingMarkdown ? <><Check size={13} />预览</> : <><Pencil size={13} />编辑</>}</button>}
        </div>
      </div>
    </NodeFrame>
  )
})

export const ImageNode = memo(({ id, data, selected }: NodeProps<CanvasNode>) => {
  return (
    <NodeFrame
      id={id}
      kind="image"
      selected={selected}
      minWidth={240}
      minHeight={190}
      maxWidth={760}
      maxHeight={660}
      generationStatus={data.generationStatus}
    >
      <NodeHeader
        icon={<ImageIcon size={16} />}
        label="图片节点"
        title={data.title}
        nodeId={id}
      />
      <div className="node-card__body node-card__body--image">
        {data.imageUrl ? <img draggable={false} src={data.imageUrl} alt={data.title} /> : <div className="image-node-empty"><ImageIcon size={28} /><span>等待生成图片</span></div>}
      </div>
    </NodeFrame>
  )
})

export const FileNode = memo(({ id, data, selected }: NodeProps<CanvasNode>) => {
  return (
    <NodeFrame
      id={id}
      kind="file"
      selected={selected}
      minWidth={260}
      minHeight={126}
      maxWidth={620}
      maxHeight={300}
      generationStatus={data.generationStatus}
    >
      <NodeHeader
        icon={<Paperclip size={16} />}
        label={data.knowledgeId ? '知识库附件' : '附件节点'}
        title={data.title}
        nodeId={id}
      />
      <div className="node-card__body node-card__body--file">
        <span className="node-card__file-icon">
          <File size={24} />
          <b>{data.fileKind || 'FILE'}</b>
        </span>
        <span className="node-card__file-copy">
          <strong>{data.fileName || '键盘产品卖点.pdf'}</strong>
          <small>{data.fileSize || '2.4 MB'} · {data.fileStatus || '已解析'}</small>
        </span>
        {data.knowledgeId && <span className="node-card__knowledge-badge">知识库</span>}
      </div>
    </NodeFrame>
  )
})

export const CommentNode = memo(
  ({ id, data, selected }: NodeProps<CanvasNode>) => {
    const { updateNodeData } = useReactFlow()

    return (
      <NodeFrame
        id={id}
        kind="comment"
        selected={selected}
        minWidth={180}
        minHeight={120}
        maxWidth={380}
        maxHeight={300}
        connectable={false}
        generationStatus={data.generationStatus}
      >
        <NodeHeader
          icon={<MessageSquareText size={16} />}
          label="备注节点"
          title={data.title || '备注'}
          nodeId={id}
        />
        <div className="node-card__body node-card__body--comment">
          <textarea
            className="nodrag nopan nowheel"
            value={data.content ?? ''}
            onChange={(event) =>
              updateNodeData(id, { content: event.target.value })
            }
            placeholder="写下备注…"
            aria-label={`${data.title || '备注'}内容`}
          />
        </div>
      </NodeFrame>
    )
  },
)

TextNode.displayName = 'TextNode'
ImageNode.displayName = 'ImageNode'
FileNode.displayName = 'FileNode'
CommentNode.displayName = 'CommentNode'

export const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  file: FileNode,
  comment: CommentNode,
}
