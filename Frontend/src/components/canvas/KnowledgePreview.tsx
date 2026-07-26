import { FileText, X } from 'lucide-react'
import type { KnowledgeItem } from '../../types/canvas'

export function KnowledgePreview({ item, onClose }: { item: KnowledgeItem; onClose: () => void }) {
  const isMarkdown = item.kind === 'MD' || item.name.endsWith('.md')
  return <div className="knowledge-preview" role="dialog" aria-label="知识库文件详情"><header><div><FileText size={18} /><span><strong>{item.name}</strong><small>{item.kind} · {item.size} · 共享知识库</small></span></div><button onClick={onClose} aria-label="关闭文件详情"><X size={18} /></button></header><article>{isMarkdown ? <><h1>视觉风格参考</h1><p>本文件可被画布节点与 Agent 共同引用，用于保持画面方向一致。</p><h2>视觉基调</h2><ul><li>低饱和自然色，保留环境光层次。</li><li>人物与环境保持轻盈、安静的关系。</li><li>避免过度锐化与高对比霓虹效果。</li></ul><h2>关键词</h2><code>夏日 · 公路 · 自由 · 自然光 · 留白</code></> : <><h1>{item.name}</h1><p>该文件已加入共享知识库，后续可在 Agent 生成与节点上下文中引用。</p><div className="file-preview-placeholder"><FileText size={40} /><span>{item.kind} 文档预览</span></div></>}</article></div>
}
