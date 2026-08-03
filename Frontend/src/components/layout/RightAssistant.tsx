import { Bot, ChevronDown, MessagesSquare, PanelRightClose, Plus, Sparkles, Trash2, UserRound } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentRunOptions, CanvasNode, ModelConfig } from '../../types/canvas'
import { currentProjectId, loadAgentRuns } from '../../lib/api'
import { NodeChatComposer, type AssistantMode } from '../canvas/NodeChatComposer'

const MarkdownRenderer = lazy(() => import('../canvas/MarkdownRenderer'))

type RightAssistantProps = {
  collapsed: boolean
  nodes: CanvasNode[]
  onToggle: () => void
  onAgentRun: (sourceId: string, prompt: string, model: ModelConfig, options: AgentRunOptions, signal?: AbortSignal) => void | Promise<void>
  onAsk: (sourceId: string, prompt: string, model: ModelConfig, onDelta: (content: string) => void, signal?: AbortSignal) => Promise<string>
}

type PendingRun = { prompt: string; model: ModelConfig; options: AgentRunOptions }
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }
type ChatConversation = { id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessage[] }
type ConversationState = { projectId: string; activeId: string; conversations: ChatConversation[] }

const CONVERSATION_STORAGE_PREFIX = 'nodecanvas:agent-conversations:v1:'

function createConversation(): ChatConversation {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: '对话开始', createdAt: now, updatedAt: now, messages: [] }
}

function loadConversationState(projectId: string): ConversationState {
  try {
    const stored = JSON.parse(localStorage.getItem(`${CONVERSATION_STORAGE_PREFIX}${projectId}`) || 'null') as Partial<ConversationState> | null
    const conversations = stored?.conversations?.filter((item) => item && typeof item.id === 'string' && Array.isArray(item.messages)) as ChatConversation[] | undefined
    if (conversations?.length) {
      const storedActiveId = stored ? stored.activeId : undefined
      const activeId = typeof storedActiveId === 'string' && conversations.some((item) => item.id === storedActiveId) ? storedActiveId : conversations[0].id
      return { projectId, activeId, conversations }
    }
  } catch (error) {
    console.warn('Failed to restore Agent conversations.', error)
  }
  const conversation = createConversation()
  return { projectId, activeId: conversation.id, conversations: [conversation] }
}

function conversationTitle(prompt: string) {
  const compact = prompt.trim().replace(/\s+/g, ' ')
  return compact.length > 18 ? `${compact.slice(0, 18)}…` : compact || '对话开始'
}

function relativeTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export function RightAssistant({ collapsed, nodes, onToggle, onAgentRun, onAsk }: RightAssistantProps) {
  const projectId = currentProjectId()
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null)
  const [conversationState, setConversationState] = useState<ConversationState>(() => loadConversationState(projectId))
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false)
  const [askThinking, setAskThinking] = useState<string[]>([])
  const [runningConversationId, setRunningConversationId] = useState<string | null>(null)
  const thinkingTimerRef = useRef<number | null>(null)
  const askControllerRef = useRef<AbortController | null>(null)
  const conversationMenuRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sourceNode = nodes.find((node) => node.selected && node.type !== 'comment')
    ?? nodes.find((node) => node.type !== 'comment')
  const activeConversation = useMemo(() => conversationState.conversations.find((item) => item.id === conversationState.activeId) ?? conversationState.conversations[0], [conversationState])
  const messages = useMemo(() => activeConversation?.messages ?? [], [activeConversation])
  const canvasThinking = sourceNode?.data.agentStatus === 'running' ? sourceNode.data.agentSummary ?? [] : []
  const thinkingLines = askThinking.length ? askThinking : canvasThinking

  const stopAskThinking = useCallback(() => {
    if (thinkingTimerRef.current !== null) window.clearInterval(thinkingTimerRef.current)
    thinkingTimerRef.current = null
    setAskThinking([])
  }, [])

  const pauseAsk = useCallback(() => {
    askControllerRef.current?.abort()
    askControllerRef.current = null
    stopAskThinking()
  }, [stopAskThinking])

  const startAskThinking = (modelName: string) => {
    stopAskThinking()
    const startedAt = performance.now()
    const stages = ['正在理解问题与回答目标…', '正在读取当前节点和相邻上下文…', '正在检索知识库中的相关内容…']
    let step = 0
    setAskThinking([stages[0]])
    thinkingTimerRef.current = window.setInterval(() => {
      step += 1
      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1)
      setAskThinking(step < stages.length
        ? stages.slice(0, step + 1)
        : [...stages, `${modelName} 正在组织回答… 已等待 ${elapsed} 秒`])
    }, 850)
  }

  const updateMessages = useCallback((conversationId: string, update: (messages: ChatMessage[]) => ChatMessage[], promptForTitle?: string) => {
    setConversationState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) => conversation.id === conversationId
        ? {
            ...conversation,
            title: promptForTitle && conversation.messages.length === 0 ? conversationTitle(promptForTitle) : conversation.title,
            updatedAt: Date.now(),
            messages: update(conversation.messages),
          }
        : conversation),
    }))
  }, [])

  useEffect(() => () => {
    pauseAsk()
  }, [pauseAsk])

  useEffect(() => {
    const hadStoredConversations = Boolean(localStorage.getItem(`${CONVERSATION_STORAGE_PREFIX}${projectId}`))
    pauseAsk()
    const nextState = loadConversationState(projectId)
    setConversationState(nextState)
    setConversationMenuOpen(false)
    if (hadStoredConversations) return
    let active = true
    void loadAgentRuns(projectId).then(({ items }) => {
      if (!active || items.length === 0) return
      const restoredMessages = items.reverse().flatMap((item) => [
        { id: `${item.id}-user`, role: 'user' as const, content: item.prompt },
        ...(item.response ? [{ id: `${item.id}-assistant`, role: 'assistant' as const, content: item.response }] : []),
      ])
      setConversationState((current) => {
        if (current.projectId !== projectId) return current
        const first = current.conversations[0]
        return { ...current, conversations: [{ ...first, title: '历史对话', messages: restoredMessages }, ...current.conversations.slice(1)] }
      })
    }).catch((error) => console.warn('Failed to restore project Agent messages.', error))
    return () => { active = false }
  }, [pauseAsk, projectId])

  useEffect(() => {
    if (conversationState.projectId !== projectId) return
    try {
      localStorage.setItem(`${CONVERSATION_STORAGE_PREFIX}${projectId}`, JSON.stringify(conversationState))
    } catch (error) {
      console.warn('Failed to save Agent conversations.', error)
    }
  }, [conversationState, projectId])

  useEffect(() => {
    if (!conversationMenuOpen) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!conversationMenuRef.current?.contains(event.target as Node)) setConversationMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [conversationMenuOpen])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' })
  }, [messages, pendingRun, thinkingLines])

  const newConversation = () => {
    pauseAsk()
    const conversation = createConversation()
    setConversationState((current) => ({ ...current, activeId: conversation.id, conversations: [conversation, ...current.conversations] }))
    setPendingRun(null)
    setConversationMenuOpen(false)
  }

  const switchConversation = (conversationId: string) => {
    if (conversationId === conversationState.activeId) {
      setConversationMenuOpen(false)
      return
    }
    pauseAsk()
    setPendingRun(null)
    setConversationState((current) => ({ ...current, activeId: conversationId }))
    setConversationMenuOpen(false)
  }

  const deleteConversation = (conversationId: string) => {
    if (conversationId === runningConversationId) pauseAsk()
    setConversationState((current) => {
      const remaining = current.conversations.filter((item) => item.id !== conversationId)
      if (remaining.length === 0) {
        const replacement = createConversation()
        return { ...current, activeId: replacement.id, conversations: [replacement] }
      }
      return { ...current, activeId: current.activeId === conversationId ? remaining[0].id : current.activeId, conversations: remaining }
    })
    setPendingRun(null)
  }

  if (collapsed) return null

  return (
    <aside className="right-sidebar">
      <header className="chat-header">
        <div className="chat-conversation-picker" ref={conversationMenuRef}>
          <button className="chat-conversation-trigger" onClick={() => setConversationMenuOpen((open) => !open)} aria-label="切换对话" aria-haspopup="menu" aria-expanded={conversationMenuOpen}>
            <MessagesSquare size={18} />
            <span><strong>{activeConversation?.title ?? '对话开始'}</strong><small>Agent 对话</small></span>
            <ChevronDown size={14} className={conversationMenuOpen ? 'is-open' : ''} />
          </button>
          {conversationMenuOpen && <div className="chat-conversation-menu" role="menu" aria-label="Agent 对话列表">
            <button className="chat-conversation-new" onClick={newConversation}><Plus size={18} /><strong>新建对话</strong></button>
            <div className="chat-conversation-list">
              {conversationState.conversations.map((conversation) => <div key={conversation.id} className={conversation.id === conversationState.activeId ? 'active' : ''}>
                <button className="chat-conversation-item" onClick={() => switchConversation(conversation.id)}>
                  <span><strong>{conversation.title}</strong><small>{relativeTime(conversation.updatedAt)}</small></span>
                </button>
                <button className="chat-conversation-delete" onClick={() => deleteConversation(conversation.id)} aria-label={`删除对话：${conversation.title}`} title="删除对话"><Trash2 size={15} /></button>
              </div>)}
            </div>
          </div>}
        </div>
        <button className="icon-button" onClick={onToggle} aria-label="收起 Agent"><PanelRightClose size={18} /></button>
      </header>
      <div className="right-agent-body">
        <div ref={scrollRef} className="right-agent-scroll">
          <div className="right-agent-intro">
            <div className="ai-orb large"><Sparkles size={22} /></div>
            <span>灵构 Agent</span>
            <h2>生成、延展或修改画布内容</h2>
            <p>{sourceNode ? <>当前以 <strong>「{sourceNode.data.title}」</strong> 为分支锚点；选中其他节点即可切换。</> : '请先在画布中创建一个节点。'}</p>
          </div>
          {messages.length > 0 && <div className="right-agent-messages">{messages.map((message) => <article key={message.id} className={message.role}>
            <div className="right-agent-avatar" aria-label={message.role === 'user' ? '我的头像' : 'Agent 头像'}>{message.role === 'user' ? <UserRound size={15} /> : <Bot size={16} />}</div>
            <div className="right-agent-message-content"><span>{message.role === 'user' ? '你' : 'Agent'}</span>{message.role === 'assistant' ? <div className="right-agent-markdown"><Suspense fallback={<p>{message.content}</p>}><MarkdownRenderer content={message.content} /></Suspense></div> : <p>{message.content}</p>}</div>
          </article>)}</div>}
          {thinkingLines.length > 0 && <div className="right-agent-thinking-row">
            <div className="right-agent-avatar assistant" aria-label="Agent 头像"><Bot size={16} /></div>
            <section className="right-agent-thinking" role="status" aria-live="polite"><header><span className="execution-summary__pulse" /><strong>Agent 正在思考</strong></header>{thinkingLines.map((line) => <p key={line}>{line}</p>)}</section>
          </div>}
        </div>
        <div className="right-agent-dock">
          {pendingRun && <section className="right-agent-confirm" role="alertdialog" aria-label="确认 Agent 生成"><strong>确认开始生成？</strong><p>Agent 将基于「{sourceNode?.data.title}」生成或修改画布内容。</p><div><button onClick={() => setPendingRun(null)}>取消</button><button className="confirm" onClick={() => { if (sourceNode) onAgentRun(sourceNode.id, pendingRun.prompt, pendingRun.model, pendingRun.options); updateMessages(conversationState.activeId, (current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: '已确认，开始生成画布内容。' }]); setPendingRun(null) }}>确认生成</button></div></section>}
          {sourceNode && <div className="right-agent-composer">
            <NodeChatComposer
              key={`${sourceNode.id}-${conversationState.activeId}`}
              nodeTitle={sourceNode.data.title}
              nodes={nodes}
              defaultActionMode="agent"
              showActionMode={false}
              showAgentGenerationControls={false}
              showAssistantMode
              portalSelects
              isExecuting={runningConversationId === conversationState.activeId}
              onStop={pauseAsk}
              onSend={async (prompt, model, options, _actionMode, assistantMode: AssistantMode, signal) => {
                const conversationId = conversationState.activeId
                updateMessages(conversationId, (current) => [...current, { id: crypto.randomUUID(), role: 'user', content: prompt }], prompt)
                if (assistantMode === 'ask') {
                  const controller = new AbortController()
                  askControllerRef.current?.abort()
                  askControllerRef.current = controller
                  setRunningConversationId(conversationId)
                  startAskThinking(model.name)
                  const answerId = crypto.randomUUID()
                  let answerStarted = false
                  try {
                    const answer = await onAsk(sourceNode.id, prompt, model, (chunk) => {
                      if (!answerStarted) {
                        answerStarted = true
                        stopAskThinking()
                        updateMessages(conversationId, (current) => [...current, { id: answerId, role: 'assistant', content: chunk }])
                        return
                      }
                      updateMessages(conversationId, (current) => current.map((message) => message.id === answerId ? { ...message, content: message.content + chunk } : message))
                    }, controller.signal)
                    stopAskThinking()
                    if (!answerStarted) updateMessages(conversationId, (current) => [...current, { id: answerId, role: 'assistant', content: answer }])
                  } catch (error) {
                    stopAskThinking()
                    if (error instanceof DOMException && error.name === 'AbortError') {
                      updateMessages(conversationId, (current) => current.filter((message) => message.id !== answerId))
                      return
                    }
                    const content = error instanceof Error ? error.message : '聊天失败，请重试。'
                    updateMessages(conversationId, (current) => answerStarted
                      ? current.map((message) => message.id === answerId ? { ...message, content: `${message.content}\n\n> ${content}` } : message)
                      : [...current, { id: answerId, role: 'assistant', content }])
                  } finally {
                    if (askControllerRef.current === controller) askControllerRef.current = null
                    setRunningConversationId((current) => current === conversationId ? null : current)
                  }
                  return
                }
                if (assistantMode === 'manual') {
                  setPendingRun({ prompt, model, options })
                  return
                }
                await onAgentRun(sourceNode.id, prompt, model, options, signal)
                updateMessages(conversationId, (current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: '已进入自动生成流程。' }])
              }}
            />
          </div>}
        </div>
      </div>
    </aside>
  )
}
