import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DraggableAttributes, type DraggableSyntheticListeners } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bot, Check, Eye, GripVertical, Image, LockKeyhole, Plus, Save, ScanText, Sparkles, Trash2, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { testModelConnection } from '../../lib/api'
import type { ModelCapability, ModelConfig } from '../../types/canvas'
import { createModelDraft } from './modelRegistry'
import { formatTokenCount, useModelRegistry } from './ModelRegistryContext'

const capabilityOptions: { value: ModelCapability; label: string }[] = [
  { value: 'chat', label: '文本' },
  { value: 'reasoning', label: '思考' },
  { value: 'vision', label: '识图' },
  { value: 'image', label: '生图' },
  { value: 'ocr', label: 'OCR' },
  { value: 'structured-output', label: '结构化输出' },
]

type TestState = { kind: 'idle' | 'testing' | 'success' | 'error'; message: string }

export function ModelManagerDialog() {
  const { models, managerOpen, setManagerOpen, saveModel, reorderModels, deleteModel, tokenUsage, responseLanguage, setResponseLanguage } = useModelRegistry()
  const [selectedId, setSelectedId] = useState(models[0]?.id ?? '')
  const selected = useMemo(() => models.find((model) => model.id === selectedId), [models, selectedId])
  const [draft, setDraft] = useState<ModelConfig>(selected ?? createModelDraft())
  const [testState, setTestState] = useState<TestState>({ kind: 'idle', message: '' })
  const [apiKeyEditing, setApiKeyEditing] = useState(false)
  const usageByModelId = useMemo(() => new Map(tokenUsage.map((usage) => [usage.modelId, usage])), [tokenUsage])
  const totalTokens = useMemo(() => tokenUsage.reduce((sum, usage) => sum + usage.totalTokens, 0), [tokenUsage])
  const [activeModelId, setActiveModelId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (selected) setDraft({ ...selected })
    setApiKeyEditing(false)
    setTestState({ kind: 'idle', message: '' })
  }, [selected])

  useEffect(() => {
    if (!managerOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setManagerOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [managerOpen, setManagerOpen])

  if (!managerOpen) return null

  const update = <K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setTestState({ kind: 'idle', message: '' })
  }
  const createNew = () => {
    const next = createModelDraft()
    setSelectedId(next.id)
    setDraft(next)
    setTestState({ kind: 'idle', message: '' })
  }
  const test = async () => {
    if (!draft.modelId.trim() || !draft.baseUrl.trim() || !draft.apiKey.trim()) {
      setTestState({ kind: 'error', message: '请先填写 Model ID、Base URL 和 API Key' })
      return
    }
    setTestState({ kind: 'testing', message: draft.protocol === 'dashscope-image' ? '正在生成测试图片，可能产生少量费用…' : '正在发送最小测试请求…' })
    try {
      const result = await testModelConnection(draft)
      setTestState({ kind: result.ok ? 'success' : 'error', message: `${result.message} · ${result.latency_ms}ms` })
    } catch (error) {
      setTestState({ kind: 'error', message: error instanceof Error ? error.message : '测试失败' })
    }
  }
  const save = () => {
    if (!draft.name.trim() || !draft.modelId.trim() || !draft.baseUrl.trim()) return
    saveModel(draft)
    setSelectedId(draft.id)
    setTestState({ kind: 'success', message: '已保存到当前浏览器' })
  }
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveModelId(null)
    if (!over || active.id === over.id) return
    const oldIndex = models.findIndex((model) => model.id === active.id)
    const newIndex = models.findIndex((model) => model.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    reorderModels(arrayMove(models, oldIndex, newIndex).map((model) => model.id))
  }
  const activeModel = activeModelId ? models.find((model) => model.id === activeModelId) : undefined

  return (
    <div className="model-manager-overlay" onMouseDown={() => setManagerOpen(false)}>
      <section className="model-manager" role="dialog" aria-modal="true" aria-label="大模型管理" onMouseDown={(event) => event.stopPropagation()}>
        <header className="model-manager__header">
          <div><Sparkles size={18} /><span><strong>大模型管理</strong><small>累计 {formatTokenCount(totalTokens)} Tokens · 配置保存在当前浏览器的加密存储中</small></span></div>
          <button onClick={() => setManagerOpen(false)} aria-label="关闭大模型管理"><X size={17} /></button>
        </header>
        <div className="model-manager__body">
          <aside className="model-manager__list">
            <button className="model-add-button" onClick={createNew}><Plus size={15} />增加模型</button>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active }) => setActiveModelId(String(active.id))} onDragCancel={() => setActiveModelId(null)} onDragEnd={handleDragEnd}>
              <SortableContext items={models.map((model) => model.id)} strategy={verticalListSortingStrategy}>
                <div className="model-manager__sortable-list">
                  {models.map((model) => <SortableModelRow key={model.id} model={model} selected={selectedId === model.id} usage={usageByModelId.get(model.id)} onSelect={() => setSelectedId(model.id)} />)}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
                {activeModel ? <ModelRow model={activeModel} selected={selectedId === activeModel.id} usage={usageByModelId.get(activeModel.id)} onSelect={() => undefined} overlay /> : null}
              </DragOverlay>
            </DndContext>
          </aside>
          <div className="model-manager__form">
            <div className="model-form-title">
              <span><strong>{draft.isSystem ? '系统默认模型' : selected ? '编辑自定义模型' : '增加自定义模型'}</strong><small>{draft.isSystem ? '可以配置连接信息，但不能删除' : '支持 OpenAI-compatible 与百炼生图接口'}</small></span>
              {!draft.isSystem && selected && <button className="model-delete-button" onClick={() => { deleteModel(draft.id); setSelectedId(models[0]?.id ?? '') }}><Trash2 size={14} />删除</button>}
            </div>
            <div className="model-form-grid">
              <label className="wide"><span>默认回复语言</span><select value={responseLanguage} onChange={(event) => setResponseLanguage(event.target.value as typeof responseLanguage)}><option value="zh-CN">中文（默认）</option><option value="en-US">English</option></select><small className="model-form-hint">应用于所有文本模型的 Agent 与节点聊天回复</small></label>
              <label><span>显示名称</span><input value={draft.name} onChange={(event) => update('name', event.target.value)} /></label>
              <label><span>服务商</span><input value={draft.provider} onChange={(event) => update('provider', event.target.value)} /></label>
              <label className="wide"><span>Model ID</span><input value={draft.modelId} onChange={(event) => update('modelId', event.target.value)} placeholder="例如 deepseek-v4-pro" /></label>
              <label className="wide"><span>Base URL / 完整生图接口</span><input value={draft.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} placeholder="https://api.example.com/v1" /></label>
              <label className="wide"><span>API Key</span><input type="text" value={apiKeyEditing ? draft.apiKey : maskApiKey(draft.apiKey)} onFocus={() => setApiKeyEditing(true)} onBlur={() => setApiKeyEditing(false)} onChange={(event) => update('apiKey', event.target.value)} placeholder="保存为加密配置" autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>
              <label><span>接口协议</span><select value={draft.protocol} onChange={(event) => update('protocol', event.target.value as ModelConfig['protocol'])}><option value="openai-chat">OpenAI Chat</option><option value="dashscope-image">百炼生图</option></select></label>
              <label><span>用途说明</span><input value={draft.description} onChange={(event) => update('description', event.target.value)} /></label>
            </div>
            <fieldset className="model-capabilities"><legend>模型能力</legend>{capabilityOptions.map((capability) => <label key={capability.value}><input type="checkbox" checked={draft.capabilities.includes(capability.value)} onChange={(event) => update('capabilities', event.target.checked ? [...draft.capabilities, capability.value] : draft.capabilities.filter((item) => item !== capability.value))} /><span>{capability.label}</span></label>)}</fieldset>
            <div className={`model-test-result ${testState.kind}`}>{testState.kind === 'success' && <Check size={14} />}{testState.kind === 'testing' && <Zap size={14} />}{testState.message || '新增或修改后，可先测试模型再保存。生图测试可能产生少量费用。'}</div>
            <footer className="model-manager__footer"><button className="model-test-button" onClick={() => void test()} disabled={testState.kind === 'testing'}><Zap size={15} />{testState.kind === 'testing' ? '测试中' : '测试模型'}</button><button className="model-save-button" onClick={save}><Save size={15} />保存</button></footer>
          </div>
        </div>
      </section>
    </div>
  )
}

type ModelRowProps = {
  model: ModelConfig
  selected: boolean
  usage?: { totalTokens: number; estimated: boolean }
  onSelect: () => void
  overlay?: boolean
  dragHandle?: {
    setActivatorNodeRef: (element: HTMLElement | null) => void
    attributes: DraggableAttributes
    listeners: DraggableSyntheticListeners
  }
}

function ModelRow({ model, selected, usage, onSelect, overlay = false, dragHandle }: ModelRowProps) {
  return <button className={`${selected ? 'selected ' : ''}${overlay ? 'model-manager__drag-overlay' : ''}`} onClick={onSelect} title={usage ? `${model.name}：${formatTokenCount(usage.totalTokens)} Tokens` : `${model.name}：尚未调用`}>
    {dragHandle && <span className="model-manager__drag-handle" ref={dragHandle.setActivatorNodeRef} {...dragHandle.attributes} {...dragHandle.listeners} aria-label="拖拽排序" title="拖拽排序"><GripVertical size={15} /></span>}
    <ModelIcon model={model} />
    <span className="model-manager__model-meta"><strong>{model.name}</strong><small>{model.provider} · {model.modelId}</small><em>{usage ? `${formatTokenCount(usage.totalTokens)} Tokens${usage.estimated ? '（含估算）' : ''}` : '尚未调用'}</em></span>
    {model.isSystem && <LockKeyhole size={12} />}
  </button>
}

function SortableModelRow(props: ModelRowProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.model.id })
  return <div ref={setNodeRef} className={isDragging ? 'model-manager__sortable-item is-dragging' : 'model-manager__sortable-item'} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <ModelRow {...props} dragHandle={{ setActivatorNodeRef, attributes, listeners }} />
  </div>
}

export function maskApiKey(apiKey: string) {
  if (apiKey.length <= 12) return apiKey
  return `${apiKey.slice(0, 8)}${'*'.repeat(apiKey.length - 12)}${apiKey.slice(-4)}`
}

function ModelIcon({ model }: { model: ModelConfig }) {
  if (model.capabilities.includes('image')) return <span className="model-manager__model-icon"><Image size={16} /></span>
  if (model.capabilities.includes('ocr')) return <span className="model-manager__model-icon"><ScanText size={16} /></span>
  if (model.capabilities.includes('vision')) return <span className="model-manager__model-icon"><Eye size={16} /></span>
  if (model.capabilities.includes('reasoning')) return <span className="model-manager__model-icon"><Bot size={16} /></span>
  return <span className="model-manager__model-icon"><Sparkles size={16} /></span>
}
