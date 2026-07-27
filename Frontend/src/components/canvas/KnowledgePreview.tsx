import { FileText, X } from 'lucide-react'
import type { KnowledgeItem } from '../../types/canvas'

export function KnowledgePreview({ item, onClose }: { item: KnowledgeItem; onClose: () => void }) {
  const isMarkdown = item.kind === 'MD' || item.name.endsWith('.md')
  return <div className="knowledge-preview" role="dialog" aria-label="知识库文件详情"><header><div><FileText size={18} /><span><strong>{item.name}</strong><small>{item.kind} · {item.size} · 共享知识库</small></span></div><button onClick={onClose} aria-label="关闭文件详情"><X size={18} /></button></header><article>{isMarkdown ? <><h1>键盘内容方向</h1><p>本文件用于让 Agent 保持产品卖点、内容语气与传播场景的一致。</p><h2>内容主线</h2><ul><li>用“轻”切入：轻量机身与轻盈手感，适合桌搭与移动使用。</li><li>用“快”证明：磁轴键盘面向职业级电竞，强调响应与操控。</li><li>用“酷”建立记忆：透明键帽、冷调光影与“不羁风范”的视觉识别。</li></ul><h2>关键词</h2><code>磁轴 · 职业级电竞 · 轻盈 · 不羁 · 桌搭</code></> : <><h1>{item.name}</h1><p>该文件已加入共享知识库，后续可在 Agent 生成与节点上下文中引用。</p><div className="file-preview-placeholder"><FileText size={40} /><span>{item.kind} 产品资料预览</span></div></>}</article></div>
}
