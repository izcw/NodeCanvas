import { File, FileText, Image as ImageIcon, Paperclip, Plus, Upload } from 'lucide-react'

type AddNodeMenuProps = {
  onText: () => void
  onImage: () => void
  onFile: () => void
  onClose: () => void
  location?: { x: number; y: number }
}

const options = [
  { key: 'text', label: '文本节点', hint: '记录需求、提示词与讨论', icon: FileText, tone: 'purple' },
  { key: 'image', label: '图片节点', hint: '上传视觉参考或生成结果', icon: ImageIcon, tone: 'cyan' },
  { key: 'file', label: '文件节点', hint: '添加文档与项目附件', icon: File, tone: 'amber' },
] as const

export function AddNodeMenu({ onText, onImage, onFile, onClose, location }: AddNodeMenuProps) {
  const actions = { text: onText, image: onImage, file: onFile }

  return (
    <>
      <button className="menu-scrim" onClick={onClose} aria-label="关闭添加菜单" />
      <div className={`add-menu ${location ? 'at-cursor' : ''}`} style={location ? { left: location.x, top: location.y } : undefined}>
        <div className="add-menu-heading"><span>添加到画布</span><kbd>⌘ K</kbd></div>
        {options.map(({ key, label, hint, icon: Icon, tone }) => (
          <button key={key} onClick={actions[key]}>
            <span className={`menu-icon ${tone}`}><Icon size={18} /></span>
            <span><strong>{label}</strong><small>{hint}</small></span>
            {key === 'text' ? <Plus size={16} /> : key === 'image' ? <Upload size={16} /> : <Paperclip size={16} />}
          </button>
        ))}
      </div>
    </>
  )
}
