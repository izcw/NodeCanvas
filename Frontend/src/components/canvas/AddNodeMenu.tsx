import { Bot, File, FileText, Image as ImageIcon, Paperclip, Plus, Upload } from 'lucide-react'

type AddNodeMenuProps = {
  onText: () => void
  onImage: () => void
  onFile: () => void
  onAgent: () => void
  onClose: () => void
  location?: { x: number; y: number }
  title?: string
  showAgent?: boolean
  showImage?: boolean
}

const options = [
  { key: 'agent', label: 'Agent', hint: '引用左侧上下文，创建或修改右侧节点', icon: Bot, tone: 'purple' },
  { key: 'text', label: '文本生成', hint: '记录需求、提示词与讨论，生成脚本、广告词、品牌文案', icon: FileText, tone: 'white' },
  { key: 'image', label: '生成图片', hint: '上传视觉参考或生成结果', icon: ImageIcon, tone: 'cyan' },
  { key: 'file', label: '上传附件', hint: '支持图片、文档、PDF、Markdown', icon: File, tone: 'amber' },
] as const

export function AddNodeMenu({ onText, onImage, onFile, onAgent, onClose, location, title = '添加节点', showAgent = true, showImage = true }: AddNodeMenuProps) {
  const actions = { text: onText, image: onImage, file: onFile, agent: onAgent }
  const visibleOptions = options.filter((option) => (showAgent || option.key !== 'agent') && (showImage || option.key !== 'image'))

  return (
    <>
      <button className="menu-scrim" onClick={onClose} aria-label="关闭添加菜单" />
      <div className={`add-menu ${location ? 'at-cursor' : ''}`} style={location ? { left: location.x, top: location.y } : undefined}>
        <div className="add-menu-heading"><span>{title}</span><kbd>⌘ K</kbd></div>
        {visibleOptions.map(({ key, label, hint, icon: Icon, tone }) => (
          <button key={key} onClick={actions[key]}>
            <span className={`menu-icon ${tone}`}><Icon size={18} /></span>
            <span><strong>{label}</strong><small>{hint}</small></span>
            {key === 'text' || key === 'agent' ? <Plus size={16} /> : key === 'image' ? <Upload size={16} /> : <Paperclip size={16} />}
          </button>
        ))}
      </div>
    </>
  )
}
