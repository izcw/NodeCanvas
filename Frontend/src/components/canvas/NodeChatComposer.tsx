import { Bot, BrainCircuit, Check, ChevronDown, CornerDownLeft, Layers3, Plus, Sparkles, X } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import type { CanvasNode } from '../../types/canvas'

type NodeChatComposerProps = {
  nodeTitle: string
  onClose: () => void
  onSend: (prompt: string, model: string) => void
  nodes: CanvasNode[]
}

const models = [
  { name: 'Kimi K2', description: '长上下文，适合复杂创作', duration: '12s', icon: 'sparkles' },
  { name: 'Qwen Max', description: '均衡可靠，擅长中文表达', duration: '8s', icon: 'bot' },
  { name: 'DeepSeek V3', description: '推理清晰，适合结构化任务', duration: '10s', icon: 'brain' },
] as const

export function NodeChatComposer({ nodeTitle, onClose, onSend, nodes }: NodeChatComposerProps) {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('Kimi K2')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(-1)
  const [selectedMentions, setSelectedMentions] = useState<string[]>([])
  const [cardCount, setCardCount] = useState(1)
  const [cardMenuOpen, setCardMenuOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!mentionOpen && !cardMenuOpen) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!inputWrapRef.current?.contains(event.target as Node)) {
        setMentionOpen(false)
        setCardMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutside)
    return () => document.removeEventListener('mousedown', closeOnOutside)
  }, [mentionOpen, cardMenuOpen])

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const value = prompt.trim()
    if (!value) return
    onSend(value, model)
    setPrompt('')
  }

  const syncMention = (value: string, cursor = inputRef.current?.selectionStart ?? value.length) => {
    const beforeCursor = value.slice(0, cursor)
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/)
    if (!match) { setMentionOpen(false); return }
    setMentionStart(cursor - match[0].length + (match[0].startsWith(' ') ? 1 : 0))
    setMentionQuery(match[1])
    setMentionOpen(true)
  }

  const chooseMention = (node: CanvasNode) => {
    const cursor = inputRef.current?.selectionStart ?? prompt.length
    const next = `${prompt.slice(0, mentionStart)}@${node.data.title} ${prompt.slice(cursor)}`
    setPrompt(next)
    setSelectedMentions((current) => current.includes(node.data.title) ? current : [...current, node.data.title])
    setMentionOpen(false)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      const position = mentionStart + node.data.title.length + 2
      inputRef.current?.setSelectionRange(position, position)
    })
  }

  const handleMentionDeletion = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const input = event.currentTarget
    if (input.selectionStart !== input.selectionEnd) return false
    const cursor = input.selectionStart
    const matchBefore = prompt.slice(0, cursor).match(/@([^\s@]+) $/)
    const matchAfter = prompt.slice(cursor).match(/^@([^\s@]+)/)
    const title = event.key === 'Backspace' ? matchBefore?.[1] : event.key === 'Delete' ? matchAfter?.[1] : undefined
    if (!title || !selectedMentions.includes(title)) return false
    event.preventDefault()
    const start = event.key === 'Backspace' ? cursor - title.length - 2 : cursor
    const end = event.key === 'Backspace' ? cursor : cursor + title.length + 1
    const next = prompt.slice(0, start) + prompt.slice(end)
    setPrompt(next)
    setSelectedMentions((current) => current.filter((mention) => mention !== title))
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(start, start) })
    return true
  }

  const mentionResults = nodes.filter((node) => node.data.title.toLowerCase().includes(mentionQuery.toLowerCase()))
  const highlightedPrompt = prompt.split(/(@[^\s@]+)/g).map((part, index) => part.startsWith('@') && selectedMentions.includes(part.slice(1)) ? <span className="mention-highlight" key={index}>{part}</span> : <span key={index}>{part}</span>)

  return <form className="node-chat-composer" onSubmit={send}>
    <header><span><Sparkles size={14} />围绕「{nodeTitle}」链路继续创作</span><button type="button" onClick={onClose} aria-label="关闭聊天节点"><X size={15} /></button></header>
    <div ref={inputWrapRef} className="node-chat-input-wrap">
      <div ref={highlightRef} className={`node-chat-highlight ${prompt ? '' : 'is-empty'}`} aria-hidden="true">{prompt ? highlightedPrompt : '描述任何你想生成、修改或延展的内容…'}</div>
      <textarea ref={inputRef} autoFocus value={prompt} onChange={(event) => { setPrompt(event.target.value); syncMention(event.target.value) }} onScroll={(event) => { if (highlightRef.current) highlightRef.current.scrollTop = event.currentTarget.scrollTop }} onKeyDown={(event) => { if (mentionOpen && (event.key === 'Escape' || event.key === 'Tab')) { event.preventDefault(); setMentionOpen(false); return } if (handleMentionDeletion(event)) return; if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder="" aria-label="聊天节点输入" />
      {mentionOpen && mentionResults.length > 0 && <div className="node-mention-menu" role="listbox" aria-label="选择节点">{mentionResults.map((node) => <button type="button" key={node.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseMention(node)}><span className={`mention-node-icon ${node.type}`}>@</span><span><strong>{node.data.title}</strong><small>{node.type === 'text' ? '文本节点' : node.type === 'image' ? '图片节点' : node.type === 'file' ? '文件节点' : '备注节点'}</small></span></button>)}</div>}
    </div>
    <footer><div><button type="button" className="chat-attachment" aria-label="添加参考"><Plus size={15} /></button><div className="node-model-picker nodrag nopan" ref={modelPickerRef} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><button type="button" className="node-model-trigger" aria-label="选择大模型" aria-haspopup="listbox" aria-expanded={modelMenuOpen} onClick={() => setModelMenuOpen((value) => !value)}><Sparkles size={14} /><span>{model}</span><ChevronDown className={modelMenuOpen ? 'is-open' : ''} size={13} /></button>{modelMenuOpen && <div className="node-model-menu" role="listbox" aria-label="可用模型">{models.map((item) => <button type="button" key={item.name} className={`node-model-option ${model === item.name ? 'selected' : ''}`} role="option" aria-selected={model === item.name} onClick={() => { setModel(item.name); setModelMenuOpen(false) }}><span className="node-model-icon">{item.icon === 'sparkles' ? <Sparkles size={20} /> : item.icon === 'bot' ? <Bot size={20} /> : <BrainCircuit size={20} />}</span><span className="node-model-copy"><strong>{item.name}</strong><small>{item.description}</small></span><span className="node-model-duration">{item.duration}</span>{model === item.name && <Check className="node-model-check" size={15} />}</button>)}</div>}</div><div className="card-count-picker"><button type="button" className="card-count-trigger" aria-label="选择生成卡片数量" aria-expanded={cardMenuOpen} onClick={() => setCardMenuOpen((value) => !value)}><Layers3 size={14} /><span>×{cardCount}</span></button>{cardMenuOpen && <div className="card-count-menu" role="listbox" aria-label="卡片数量">{[1, 2, 3, 4, 5].map((count) => <button type="button" className={count === cardCount ? 'selected' : ''} key={count} onClick={() => { setCardCount(count); setCardMenuOpen(false) }}>×{count}{count === cardCount && <Check size={13} />}</button>)}</div>}</div></div><button className="node-chat-send" type="submit" disabled={!prompt.trim()} aria-label="发送聊天请求"><CornerDownLeft size={18} /></button></footer>
  </form>
}
