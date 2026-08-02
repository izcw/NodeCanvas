import type { ModelConfig } from '../../types/canvas'

const STORAGE_KEY = 'nodecanvas:model-registry:v1'

export const SYSTEM_MODELS: ModelConfig[] = [
  {
    id: 'system-deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'DeepSeek',
    modelId: 'deepseek-v4-pro',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    protocol: 'openai-chat',
    capabilities: ['chat', 'reasoning', 'structured-output'],
    description: '深度推理与复杂策划',
    isSystem: true,
  },
  {
    id: 'system-qwen-3-7-plus',
    name: 'Qwen 3.7 Plus',
    provider: '阿里云百炼',
    modelId: 'qwen3.7-plus',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    protocol: 'openai-chat',
    capabilities: ['chat', 'reasoning', 'vision', 'structured-output'],
    description: '文本、识图与长上下文',
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
