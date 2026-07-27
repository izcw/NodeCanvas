/* eslint-disable react-refresh/only-export-components */
import {
  type ChangeEvent,
  type ReactNode,
  memo,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  Handle,
  NodeResizer,
  type NodeProps,
  Position,
  useReactFlow,
} from '@xyflow/react'
import {
  Copy,
  Bot,
  Check,
  ChevronDown,
  Code2,
  Expand,
  File,
  FileText,
  Image as ImageIcon,
  MessageSquareText,
  Paperclip,
  Trash2,
} from 'lucide-react'
import type { CanvasNode } from '../../types/canvas'
import { NodeChatComposer } from './NodeChatComposer'
import { NodeSelect } from './NodeSelect'

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
  onClose,
  onReplaceImage,
}: {
  id: string
  isImage: boolean
  onClose: () => void
  onReplaceImage: () => void
}) {
  const { deleteElements, fitView, getNode, getNodes, setNodes } = useReactFlow()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
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

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      className="node-context-menu nodrag"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isImage && (
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
      <button role="menuitem" onClick={duplicate}>
        <Copy size={15} />
        创建副本
      </button>
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
      <span className="node-menu-divider" />
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
      </button>
    </div>
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
}: NodeFrameProps) {
  const { getNode, getNodes, setNodes } = useReactFlow()
  const [menuOpen, setMenuOpen] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

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
      className={`canvas-node canvas-node--${kind} ${selected ? 'is-selected' : ''}`}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setMenuOpen(true)
      }}
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
      {menuOpen && (
        <NodeContextMenu
          id={id}
          isImage={getNode(id)?.type === 'image'}
          onClose={() => setMenuOpen(false)}
          onReplaceImage={() => imageInputRef.current?.click()}
        />
      )}
    </article>
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

  return (
    <NodeFrame
      id={id}
      kind="text"
      selected={selected}
      minWidth={260}
      minHeight={210}
      maxWidth={660}
      maxHeight={620}
    >
      <NodeHeader
        icon={<FileText size={16} />}
        label="文本节点"
        title={data.title}
        nodeId={id}
      />
      <div className="node-card__body node-card__body--text">
        <textarea
          className="nodrag nopan nowheel"
          value={data.content ?? ''}
          onChange={(event) => updateNodeData(id, { content: event.target.value })}
          placeholder="写下想法、脚本或提示词…"
          aria-label={`${data.title}内容`}
        />
        <NodeSelect className="text-format-picker" value={format} ariaLabel="选择文本格式" onChange={(value) => updateNodeData(id, { format: value as 'text' | 'markdown' })} options={[{ value: 'text', label: '纯文本', description: '普通文本编辑', icon: <FileText size={18} /> }, { value: 'markdown', label: 'Markdown', description: '支持 Markdown 语法', icon: <Code2 size={18} /> }]} />
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
    >
      <NodeHeader
        icon={<ImageIcon size={16} />}
        label="图片节点"
        title={data.title}
        nodeId={id}
      />
      <div className="node-card__body node-card__body--image">
        <img
          draggable={false}
          src={data.imageUrl || '/sample-concept.svg'}
          alt={data.title}
        />
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
    >
      <NodeHeader
        icon={<Paperclip size={16} />}
        label="文件节点"
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
          <small>{data.fileSize || '2.4 MB'} · 已解析</small>
        </span>
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

export const AgentNode = memo(({ id, data, selected }: NodeProps<CanvasNode>) => {
  const { getEdges, getNodes } = useReactFlow()
  const allNodes = getNodes() as CanvasNode[]
  const allowedNodeIds = new Set(getEdges().flatMap((edge) => {
    if (edge.target === id && (!edge.targetHandle || edge.targetHandle === 'left-target')) return [edge.source]
    if (edge.source === id && (!edge.sourceHandle || edge.sourceHandle === 'right-source')) return [edge.target]
    return []
  }))

  return (
    <NodeFrame
      id={id}
      kind="agent"
      selected={selected}
      minWidth={390}
      minHeight={290}
      maxWidth={680}
      maxHeight={560}
    >
      <NodeHeader
        icon={<Bot size={16} />}
        label="Agent 节点"
        title={data.title}
        nodeId={id}
      />
      <div className="node-card__body node-card__body--agent nodrag nopan nowheel">
        <NodeChatComposer
          mode="agent"
          nodeTitle={data.title}
          nodes={allNodes.filter((node) => allowedNodeIds.has(node.id))}
          onSend={(prompt, model) => {
            window.dispatchEvent(new CustomEvent('nodecanvas:agent-send', {
              detail: { sourceId: id, prompt, model },
            }))
          }}
        />
      </div>
    </NodeFrame>
  )
})

TextNode.displayName = 'TextNode'
ImageNode.displayName = 'ImageNode'
FileNode.displayName = 'FileNode'
CommentNode.displayName = 'CommentNode'
AgentNode.displayName = 'AgentNode'

export const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  file: FileNode,
  comment: CommentNode,
  agent: AgentNode,
}
