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
        <div className="chat-hero"><div className="ai-orb large"><Sparkles size={22} /></div><span>灵构 Agent</span><h2>今天一起卖什么？</h2><p>我会基于键盘产品卖点与当前画布，持续完善内容营销方向。</p></div>
        <div className="suggestions">
          <Suggestion icon={Aperture} tone="blue" title="生成种草脚本" hint="围绕产品核心卖点" onClick={() => setPrompt('围绕这款键盘的轻盈、磁轴和电竞属性，生成一版 30 秒短视频种草脚本')} />
          <Suggestion icon={Workflow} tone="purple" title="拆解内容支柱" hint="搭建营销传播结构" onClick={() => setPrompt('为这款键盘拆解三个内容支柱，并说明各自适合的社媒形式')} />
          <Suggestion icon={WandSparkles} tone="amber" title="探索传播方向" hint="生成差异化候选" onClick={() => setPrompt('围绕“不羁风范，与生俱来”延展三个差异明显的内容创意')} />
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
