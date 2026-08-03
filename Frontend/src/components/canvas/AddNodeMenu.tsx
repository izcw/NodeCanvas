import { File, FileText, Image as ImageIcon, Paperclip, Plus } from 'lucide-react'

type AddNodeMenuProps = {
  onText: () => void
  onImage: () => void
  onFile: () => void
  onClose: () => void
  location?: { x: number; y: number }
  title?: string
  showImage?: boolean
}

const options = [
  { key: 'text', label: '文本生成', hint: '记录需求、提示词与讨论，生成脚本、广告词、品牌文案', icon: FileText, tone: 'white' },
  { key: 'image', label: '图片生成', hint: '创建空白图片节点，等待生成结果', icon: ImageIcon, tone: 'cyan' },
  { key: 'file', label: '上传附件', hint: '支持图片、文档、PDF、Markdown', icon: File, tone: 'amber' },
] as const

export function AddNodeMenu({ onText, onImage, onFile, onClose, location, title = '添加节点', showImage = true }: AddNodeMenuProps) {
  const actions = { text: onText, image: onImage, file: onFile }
  const visibleOptions = options.filter((option) => showImage || option.key !== 'image')

  return (
    <>
      <button className="menu-scrim" onClick={onClose} aria-label="关闭添加菜单" />
      <div className={`add-menu ${location ? 'at-cursor' : ''}`} style={location ? { left: location.x, top: location.y } : undefined}>
        <div className="add-menu-heading"><span>{title}</span><kbd>⌘ K</kbd></div>
        {visibleOptions.map(({ key, label, hint, icon: Icon, tone }) => (
          <button key={key} onClick={actions[key]}>
            <span className={`menu-icon ${tone}`}><Icon size={18} /></span>
            <span><strong>{label}</strong><small>{hint}</small></span>
            {key === 'file' ? <Paperclip size={16} /> : <Plus size={16} />}
          </button>
        ))}
      </div>
    </>
  )
}
