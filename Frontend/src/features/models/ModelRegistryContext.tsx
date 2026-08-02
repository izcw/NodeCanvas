import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ModelConfig, ResponseLanguage } from '../../types/canvas'
import { loadModelRegistry, persistModelRegistry } from './modelRegistry'

const TOKEN_USAGE_STORAGE_KEY = 'nodecanvas:model-token-usage:v1'
const RESPONSE_LANGUAGE_STORAGE_KEY = 'nodecanvas:response-language:v1'

export type ModelTokenUsage = {
  modelId: string
  modelName: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  runs: number
  estimated: boolean
}

export type RunTokenUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated: boolean
}

type ModelRegistryValue = {
  models: ModelConfig[]
  managerOpen: boolean
  setManagerOpen: (open: boolean) => void
  saveModel: (model: ModelConfig) => void
  deleteModel: (id: string) => void
  tokenUsage: ModelTokenUsage[]
  recordTokenUsage: (model: ModelConfig, usage: RunTokenUsage) => void
  responseLanguage: ResponseLanguage
  setResponseLanguage: (language: ResponseLanguage) => void
}

const ModelRegistryContext = createContext<ModelRegistryValue | null>(null)

export function ModelRegistryProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState(loadModelRegistry)
  const [managerOpen, setManagerOpen] = useState(false)
  const [tokenUsage, setTokenUsage] = useState<ModelTokenUsage[]>(loadTokenUsage)
  const [responseLanguage, setResponseLanguageState] = useState<ResponseLanguage>(loadResponseLanguage)
  const value = useMemo<ModelRegistryValue>(() => ({
    models,
    managerOpen,
    setManagerOpen,
    saveModel: (model) => setModels((current) => {
      const next = current.some((item) => item.id === model.id)
        ? current.map((item) => item.id === model.id ? model : item)
        : [...current, model]
      persistModelRegistry(next)
      return next
    }),
    deleteModel: (id) => setModels((current) => {
      const target = current.find((model) => model.id === id)
      if (!target || target.isSystem) return current
      const next = current.filter((model) => model.id !== id)
      persistModelRegistry(next)
      return next
    }),
    tokenUsage,
    recordTokenUsage: (model, usage) => setTokenUsage((current) => {
      if (!usage.total_tokens) return current
      const existing = current.find((item) => item.modelId === model.id)
      const nextEntry: ModelTokenUsage = {
        modelId: model.id,
        modelName: model.name,
        promptTokens: (existing?.promptTokens ?? 0) + usage.prompt_tokens,
        completionTokens: (existing?.completionTokens ?? 0) + usage.completion_tokens,
        totalTokens: (existing?.totalTokens ?? 0) + usage.total_tokens,
        runs: (existing?.runs ?? 0) + 1,
        estimated: (existing?.estimated ?? false) || usage.estimated,
      }
      const next = [...current.filter((item) => item.modelId !== model.id), nextEntry]
      window.localStorage.setItem(TOKEN_USAGE_STORAGE_KEY, JSON.stringify(next))
      return next
    }),
    responseLanguage,
    setResponseLanguage: (language) => {
      setResponseLanguageState(language)
      window.localStorage.setItem(RESPONSE_LANGUAGE_STORAGE_KEY, language)
    },
  }), [managerOpen, models, responseLanguage, tokenUsage])
  return <ModelRegistryContext.Provider value={value}>{children}</ModelRegistryContext.Provider>
}

function loadTokenUsage(): ModelTokenUsage[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = JSON.parse(window.localStorage.getItem(TOKEN_USAGE_STORAGE_KEY) || '[]') as ModelTokenUsage[]
    return saved.filter((item) => item && typeof item.modelId === 'string' && Number.isFinite(item.totalTokens))
  } catch {
    return []
  }
}

function loadResponseLanguage(): ResponseLanguage {
  if (typeof window === 'undefined') return 'zh-CN'
  return window.localStorage.getItem(RESPONSE_LANGUAGE_STORAGE_KEY) === 'en-US' ? 'en-US' : 'zh-CN'
}

export function formatTokenCount(value: number) {
  return new Intl.NumberFormat('zh-CN').format(Math.max(0, Math.round(value)))
}

export function useModelRegistry() {
  const value = useContext(ModelRegistryContext)
  if (!value) throw new Error('useModelRegistry must be used inside ModelRegistryProvider')
  return value
}
