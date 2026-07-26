import { Bot, BrainCircuit, Check, ChevronDown, CornerDownLeft, Plus, Sparkles, X } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'

type NodeChatComposerProps = {
  nodeTitle: string
  onClose: () => void
  onSend: (prompt: string, model: string) => void
}

const models = [
  { name: 'Kimi K2', description: '长上下文，适合复杂创作', duration: '12s', icon: 'sparkles' },
  { name: 'Qwen Max', description: '均衡可靠，擅长中文表达', duration: '8s', icon: 'bot' },
  { name: 'DeepSeek V3', description: '推理清晰，适合结构化任务', duration: '10s', icon: 'brain' },
] as const

export function NodeChatComposer({ nodeTitle, onClose, onSend }: NodeChatComposerProps) {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('Kimi K2')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!modelMenuOpen) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!modelPickerRef.current?.contains(event.target as Node)) setModelMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModelMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [modelMenuOpen])

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const value = prompt.trim()
    if (!value) return
    onSend(value, model)
    setPrompt('')
  }

  return <form className="node-chat-composer" onSubmit={send}>
    <header><span><Sparkles size={14} />围绕「{nodeTitle}」继续创作</span><button type="button" onClick={onClose} aria-label="关闭聊天节点"><X size={15} /></button></header>
    <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder="描述任何你想生成、修改或延展的内容…" aria-label="聊天节点输入" />
    <footer><div><button type="button" className="chat-attachment" aria-label="添加参考"><Plus size={16} /></button><div className="node-model-picker nodrag nopan" ref={modelPickerRef} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><button type="button" className="node-model-trigger" aria-label="选择大模型" aria-haspopup="listbox" aria-expanded={modelMenuOpen} onClick={() => setModelMenuOpen((value) => !value)}><Sparkles size={14} /><span>{model}</span><ChevronDown className={modelMenuOpen ? 'is-open' : ''} size={13} /></button>{modelMenuOpen && <div className="node-model-menu" role="listbox" aria-label="可用模型">{models.map((item) => <button type="button" key={item.name} className={`node-model-option ${model === item.name ? 'selected' : ''}`} role="option" aria-selected={model === item.name} onClick={() => { setModel(item.name); setModelMenuOpen(false) }}><span className="node-model-icon">{item.icon === 'sparkles' ? <Sparkles size={20} /> : item.icon === 'bot' ? <Bot size={20} /> : <BrainCircuit size={20} />}</span><span className="node-model-copy"><strong>{item.name}</strong><small>{item.description}</small></span><span className="node-model-duration">{item.duration}</span>{model === item.name && <Check className="node-model-check" size={15} />}</button>)}</div>}</div></div><button className="node-chat-send" type="submit" disabled={!prompt.trim()} aria-label="发送聊天请求"><CornerDownLeft size={18} /></button></footer>
  </form>
}
