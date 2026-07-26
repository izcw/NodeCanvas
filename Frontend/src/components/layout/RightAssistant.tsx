import { Aperture, ChevronDown, ChevronRight, CornerDownLeft, History, PanelRightClose, Plus, Sparkles, WandSparkles, Workflow } from 'lucide-react'
import { FormEvent, useState } from 'react'

type RightAssistantProps = {
  collapsed: boolean
  onToggle: () => void
  onCreateText: (text: string) => void
}

export function RightAssistant({ collapsed, onToggle, onCreateText }: RightAssistantProps) {
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<string[]>([])
  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const value = prompt.trim()
    if (!value) return
    setMessages((current) => [...current, value])
    onCreateText(value)
    setPrompt('')
  }

  if (collapsed) return <aside className="right-sidebar collapsed-hidden" />

  return (
    <aside className="right-sidebar">
      <header className="chat-header">
        <div><span className="live-dot" /><strong>Agent</strong><span>理解当前画布与知识库</span></div>
        <button className="icon-button" onClick={onToggle} aria-label="收起 Agent"><PanelRightClose size={18} /></button>
      </header>
      <div className="chat-history-strip"><button className="active"><Plus size={14} />新建对话</button><button><History size={14} />对话历史</button></div>
      <div className="chat-body">
        <div className="chat-hero"><div className="ai-orb large"><Sparkles size={22} /></div><span>灵构 Agent</span><h2>今天一起构想什么？</h2><p>我会基于当前画布分支和共享知识库，持续理解你的创作方向。</p></div>
        <div className="suggestions">
          <Suggestion icon={Aperture} tone="blue" title="生成镜头清单" hint="基于当前创意简报" onClick={() => setPrompt('基于当前画布，帮我补充一份三镜头的拍摄清单')} />
          <Suggestion icon={Workflow} tone="purple" title="检查上下文冲突" hint="梳理节点依赖关系" onClick={() => setPrompt('检查画布中是否有互相冲突的创意方向')} />
          <Suggestion icon={WandSparkles} tone="amber" title="探索更多方向" hint="生成差异化候选" onClick={() => setPrompt('从当前方案延展三个差异明显的视觉风格')} />
        </div>
        {messages.length > 0 && <div className="chat-messages">{messages.map((message, index) => <div className="user-message" key={`${message}-${index}`}>{message}</div>)}<div className="assistant-message"><span><Sparkles size={13} />已写入新的文本节点</span>连接到任意参考节点，即可把需求纳入当前分支。</div></div>}
      </div>
      <form className="chat-composer" onSubmit={send}>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder="描述创意或需求，Agent 会读取上下文…" aria-label="发送给 Agent" />
        <div className="composer-footer"><div><button type="button" className="composer-tool" aria-label="添加附件"><Plus size={17} /></button><button type="button" className="model-button"><Sparkles size={14} />Kimi K2<ChevronDown size={13} /></button></div><button type="submit" className="send-button" disabled={!prompt.trim()} aria-label="发送"><CornerDownLeft size={17} /></button></div>
      </form>
    </aside>
  )
}

function Suggestion({ icon: Icon, tone, title, hint, onClick }: { icon: typeof Aperture; tone: 'blue' | 'purple' | 'amber'; title: string; hint: string; onClick: () => void }) {
  return <button onClick={onClick}><span className={`suggestion-icon ${tone}`}><Icon size={16} /></span><span><strong>{title}</strong><small>{hint}</small></span><ChevronRight size={15} /></button>
}
