import type { ModelConfig } from '../../types/canvas'

const STORAGE_KEY = 'nodecanvas:model-registry:v1'

export const SYSTEM_MODELS: ModelConfig[] = [
  {
    id: 'system-deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
    modelId: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    protocol: 'openai-chat',
    capabilities: ['chat', 'reasoning', 'structured-output'],
    description: '轻量快速、高性价比文本模型',
    isSystem: true,
  },
  {
    id: 'system-kimi-k3',
    name: 'Kimi K3',
    provider: '月之暗面',
    modelId: 'kimi-k3',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKey: '',
    protocol: 'openai-chat',
    capabilities: ['chat', 'vision', 'structured-output'],
    description: '旗舰多模态、百万级上下文',
    isSystem: true,
  },
  {
    id: 'system-qwen-vl-ocr',
    name: 'Qwen VL OCR',
    provider: '阿里云百炼',
    modelId: 'qwen-vl-ocr',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    protocol: 'openai-chat',
    capabilities: ['vision', 'ocr', 'structured-output'],
    description: '图片文字与文档识别',
    isSystem: true,
  },
  {
    id: 'system-wan-2-7-image-pro',
    name: 'Wan 2.7 Image Pro',
    provider: '阿里云百炼',
    modelId: 'wan2.7-image-pro',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    apiKey: '',
    protocol: 'dashscope-image',
    capabilities: ['image'],
    description: '高质量生图与图片编辑',
    isSystem: true,
  },
]

export function loadModelRegistry(): ModelConfig[] {
  if (typeof window === 'undefined') return SYSTEM_MODELS
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as ModelConfig[]
    const savedById = new Map(saved.map((model) => [model.id, model]))
    const system = SYSTEM_MODELS.map((model) => ({ ...model, ...savedById.get(model.id), isSystem: true }))
    const custom = saved.filter((model) => !SYSTEM_MODELS.some((item) => item.id === model.id)).map((model) => ({ ...model, isSystem: false }))
    return [...system, ...custom]
  } catch {
    return SYSTEM_MODELS
  }
}

export function persistModelRegistry(models: ModelConfig[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(models))
}

export function createModelDraft(): ModelConfig {
  return {
    id: `custom-${crypto.randomUUID()}`,
    name: '自定义模型',
    provider: 'OpenAI-compatible',
    modelId: '',
    baseUrl: '',
    apiKey: '',
    protocol: 'openai-chat',
    capabilities: ['chat'],
    description: '自定义模型',
    isSystem: false,
  }
}
