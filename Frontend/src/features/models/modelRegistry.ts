import type { ModelConfig } from '../../types/canvas'

const STORAGE_KEY = 'nodecanvas:model-registry:v2'
const LEGACY_STORAGE_KEY = 'nodecanvas:model-registry:v1'
const ORDER_STORAGE_KEY = 'nodecanvas:model-registry-order:v1'
const KEY_DATABASE = 'nodecanvas-secure-storage'
const KEY_STORE = 'keys'
const KEY_ID = 'model-registry'
const ENCRYPTION_VERSION = 2

type EncryptedRegistry = {
  version: number
  iv: string
  ciphertext: string
}

let persistenceQueue: Promise<void> = Promise.resolve()

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
    // Encrypted data cannot be synchronously decrypted during the first render.
    // Return the built-ins here; the provider hydrates the saved registry after mount.
    // The legacy path keeps existing user configurations visible while migration runs.
    const saved = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) || '[]') as ModelConfig[]
    return applyPersistedModelOrder(mergeModelRegistry(saved))
  } catch {
    return SYSTEM_MODELS
  }
}

function mergeModelRegistry(saved: ModelConfig[]): ModelConfig[] {
    const savedById = new Map(saved.map((model) => [model.id, model]))
    const system = SYSTEM_MODELS.map((model) => ({ ...model, ...savedById.get(model.id), isSystem: true }))
    const custom = saved.filter((model) => !SYSTEM_MODELS.some((item) => item.id === model.id)).map((model) => ({ ...model, isSystem: false }))
    return [...system, ...custom]
}

export async function hydrateModelRegistry(): Promise<ModelConfig[]> {
  if (typeof window === 'undefined') return SYSTEM_MODELS
  await persistenceQueue
  try {
    const encrypted = window.localStorage.getItem(STORAGE_KEY)
    if (encrypted) return applyPersistedModelOrder(mergeModelRegistry(await decryptRegistry(encrypted)))

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!legacy) return SYSTEM_MODELS
    const migrated = mergeModelRegistry(JSON.parse(legacy) as ModelConfig[])
    await persistModelRegistry(migrated)
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    return applyPersistedModelOrder(migrated)
  } catch {
    // Never fall back to writing a new plaintext copy if Web Crypto/IndexedDB is unavailable.
    return SYSTEM_MODELS
  }
}

export function persistModelOrder(modelIds: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(modelIds))
}

function applyPersistedModelOrder(models: ModelConfig[]) {
  if (typeof window === 'undefined') return models
  try {
    const savedOrder = JSON.parse(window.localStorage.getItem(ORDER_STORAGE_KEY) || '[]') as string[]
    if (!Array.isArray(savedOrder) || !savedOrder.length) return models
    const byId = new Map(models.map((model) => [model.id, model]))
    const ordered = savedOrder.map((id) => byId.get(id)).filter((model): model is ModelConfig => Boolean(model))
    models.forEach((model) => { if (!savedOrder.includes(model.id)) ordered.push(model) })
    return ordered
  } catch {
    return models
  }
}

export function persistModelRegistry(models: ModelConfig[]): Promise<void> {
  persistenceQueue = persistenceQueue.then(async () => {
    if (typeof window === 'undefined') return
    const encrypted = await encryptRegistry(models)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted))
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  })
  return persistenceQueue
}

async function encryptRegistry(models: ModelConfig[]): Promise<EncryptedRegistry> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(models))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { version: ENCRYPTION_VERSION, iv: encodeBytes(iv), ciphertext: encodeBytes(new Uint8Array(ciphertext)) }
}

async function decryptRegistry(raw: string): Promise<ModelConfig[]> {
  const envelope = JSON.parse(raw) as EncryptedRegistry
  if (envelope.version !== ENCRYPTION_VERSION || !envelope.iv || !envelope.ciphertext) throw new Error('Unsupported encrypted model registry')
  const key = await getEncryptionKey()
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBytes(envelope.iv) },
    key,
    decodeBytes(envelope.ciphertext),
  )
  const models = JSON.parse(new TextDecoder().decode(plaintext)) as ModelConfig[]
  return Array.isArray(models) ? models : []
}

function encodeBytes(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function decodeBytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function getEncryptionKey(): Promise<CryptoKey> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB || !window.crypto?.subtle) {
      reject(new Error('Secure browser storage is unavailable'))
      return
    }
    const request = indexedDB.open(KEY_DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(KEY_STORE)
    request.onerror = () => reject(request.error ?? new Error('Unable to open secure storage'))
    request.onsuccess = () => {
      const database = request.result
      const read = database.transaction(KEY_STORE, 'readonly').objectStore(KEY_STORE).get(KEY_ID)
      read.onerror = () => reject(read.error ?? new Error('Unable to read secure storage'))
      read.onsuccess = async () => {
        try {
          if (read.result) {
            resolve(read.result as CryptoKey)
            return
          }
          const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
          const writeTransaction = database.transaction(KEY_STORE, 'readwrite')
          const write = writeTransaction.objectStore(KEY_STORE).put(key, KEY_ID)
          write.onerror = () => reject(write.error ?? new Error('Unable to save secure storage key'))
          write.onsuccess = () => resolve(key as CryptoKey)
        } catch (error) {
          reject(error)
        }
      }
    }
  })
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
