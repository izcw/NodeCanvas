/* eslint-disable react-refresh/only-export-components */
import { ChangeEvent, memo, useEffect, useRef, useState } from 'react'
import {
  Handle,
  NodeResizer,
  NodeProps,
  Position,
  useReactFlow,
} from '@xyflow/react'
import {
  Check,
  File,
  FileText,
  MessageSquareText,
  Image as ImageIcon,
  Copy,
  Expand,
  Paperclip,
  Plus,
} from 'lucide-react'
import type { CanvasNode } from '../../types/canvas'

const handlePositions = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
] as const

function NodeHandles() {
  return <>{handlePositions.map(([name, position]) => <span className={`node-handle-wrap node-handle-${name}`} key={name}><Handle id={`${name}-target`} className="canvas-handle canvas-target-handle" type="target" position={position} /><Handle id={`${name}-source`} className="canvas-handle canvas-source-handle" type="source" position={position}><Plus size={14} strokeWidth={2.6} /></Handle></span>)}</>
}

function NodeFrame({ id, selected, children, minWidth, minHeight, maxWidth, maxHeight, connectable = true }: { id: string; selected: boolean; children: React.ReactNode; minWidth: number; minHeight: number; maxWidth: number; maxHeight: number; connectable?: boolean }) {
  const { deleteElements, getNode, getNodes, setNodes, fitView } = useReactFlow()
  const [menuOpen, setMenuOpen] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (!target?.closest('.node-context-menu')) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    const closeOnFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null
      if (!next || !menuRef.current?.contains(next)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('focusout', closeOnFocusOut)
    return () => { document.removeEventListener('mousedown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); document.removeEventListener('focusout', closeOnFocusOut) }
  }, [menuOpen])
  const duplicate = () => {
    const node = getNode(id)
    if (!node) return
    setNodes([...getNodes(), { ...node, id: `${node.type}-${Date.now()}`, position: { x: node.position.x + 36, y: node.position.y + 36 }, selected: false }])
    setMenuOpen(false)
  }
  const replaceImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { const node = getNode(id); if (node) setNodes(getNodes().map((item) => item.id === id ? { ...item, data: { ...item.data, imageUrl: String(reader.result), title: file.name.replace(/\.[^.]+$/, '') } } : item)); setMenuOpen(false) }
    reader.readAsDataURL(file)
  }
  const isImage = getNode(id)?.type === 'image'
  return <div className={`canvas-node ${selected ? 'is-selected' : ''}`} onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true) }}><input ref={imageInputRef} className="visually-hidden" type="file" accept="image/*" onChange={replaceImage} /><NodeResizer isVisible={selected} minWidth={minWidth} minHeight={minHeight} maxWidth={maxWidth} maxHeight={maxHeight} lineClassName="node-resize-line" handleClassName="node-resize-handle" />{connectable && <NodeHandles />}{children}{menuOpen && <div ref={menuRef} tabIndex={-1} className="node-context-menu nodrag" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false) }}>{isImage && <button onClick={() => imageInputRef.current?.click()}><ImageIcon size={15} />替换图片</button>}<button onClick={() => { void fitView({ nodes: [{ id }], duration: 180, maxZoom: 1.4 }); setMenuOpen(false) }}><Expand size={15} />全屏查看</button><button onClick={duplicate}><Copy size={15} />创建副本</button><button onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(getNode(id)?.data ?? {})); setMenuOpen(false) }}><Copy size={15} />复制节点</button><span /><button className="danger" onClick={() => { void deleteElements({ nodes: [{ id }] }); setMenuOpen(false) }}>删除节点</button></div>}</div>
}

const NodeLabel = ({
  icon,
  title, nodeId,
  eyebrow,
}: {
  icon: React.ReactNode
  title: string
  eyebrow: string
  nodeId: string
}) => (
  <NodeLabelContent icon={icon} title={title} eyebrow={eyebrow} nodeId={nodeId} />
)

function NodeLabelContent({ icon, title, eyebrow, nodeId }: { icon: React.ReactNode; title: string; eyebrow: string; nodeId: string }) {
  const { updateNodeData } = useReactFlow()
  return <div className="node-label">
    <span className="node-label-icon">{icon}</span>
    <span>{eyebrow}</span>
    <input className="node-title nodrag" value={title} onChange={(event) => updateNodeData(nodeId, { title: event.target.value })} aria-label="节点标题" />
    <span className="node-verified">
      <Check size={9} strokeWidth={3} />
    </span>
  </div>
}

export const TextNode = memo(
  ({ id, data, selected }: NodeProps<CanvasNode>) => {
    const { updateNodeData } = useReactFlow()

    const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { content: event.target.value })
    }

    return (
      <NodeFrame id={id} selected={selected} minWidth={260} minHeight={210} maxWidth={660} maxHeight={620}>
        <div className="text-node">
        <NodeLabel
          eyebrow="灵感笔记"
          icon={<FileText size={13} />}
          title={data.title}
          nodeId={id}
        />
        <div className="node-surface text-node-surface">
          <textarea
            className="nodrag nopan nowheel"
            value={data.content ?? ''}
            onChange={handleChange}
            placeholder="双击开始编辑…"
            aria-label={`${data.title}内容`}
          />
        </div></div>
      </NodeFrame>
    )
  },
)

export const ImageNode = memo(
  ({ id, data, selected }: NodeProps<CanvasNode>) => (
    <NodeFrame id={id} selected={selected} minWidth={240} minHeight={190} maxWidth={760} maxHeight={660}>
      <div className="image-node">
      <NodeLabel
        eyebrow="视角参考"
        icon={<ImageIcon size={13} />}
        title={data.title}
        nodeId={id}
      />
      <div className="node-surface image-node-surface">
        <img
          draggable={false}
          src={data.imageUrl || '/sample-concept.svg'}
          alt={data.title}
        />
      </div>
      </div>
    </NodeFrame>
  ),
)

export const FileNode = memo(
  ({ id, data, selected }: NodeProps<CanvasNode>) => (
    <NodeFrame id={id} selected={selected} minWidth={260} minHeight={110} maxWidth={620} maxHeight={300}>
      <div className="file-node">
      <NodeLabel
        eyebrow="附件"
        icon={<Paperclip size={13} />}
        title={data.title}
        nodeId={id}
      />
      <div className="node-surface file-node-surface">
        <div className="file-icon">
          <File size={26} />
          <span>{data.fileKind || 'PDF'}</span>
        </div>
        <div className="file-copy">
          <strong>{data.fileName || '品牌拍摄需求.pdf'}</strong>
          <span>{data.fileSize || '2.4 MB'} · 已解析</span>
        </div>
      </div>
      </div>
    </NodeFrame>
  ),
)

export const CommentNode = memo(
  ({ id, data, selected }: NodeProps<CanvasNode>) => {
    const { updateNodeData } = useReactFlow()
    return <NodeFrame id={id} selected={selected} minWidth={180} minHeight={120} maxWidth={380} maxHeight={300} connectable={false}><div className="comment-node"><NodeLabel eyebrow="NOTE" icon={<MessageSquareText size={13} />} title={data.title || '备注'} nodeId={id} /><div className="comment-node-surface"><textarea className="nodrag nopan nowheel" value={data.content ?? ''} onChange={(event) => updateNodeData(id, { content: event.target.value })} placeholder="写下备注…" aria-label={`${data.title || '备注'}内容`} /></div></div></NodeFrame>
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
