import { useState } from 'react'

type BrandLogoProps = { compact?: boolean; onClick?: () => void }

export function BrandLogo({ compact = false, onClick }: BrandLogoProps) {
  const [name, setName] = useState('键盘卖点营销')
  const [editing, setEditing] = useState(false)
  return (
    <div className={`brand-logo ${compact ? 'compact' : ''} ${onClick ? 'is-clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={(event) => { if (onClick && (event.key === 'Enter' || event.key === ' ')) onClick() }}>
      <img src="/logo.png" alt="灵构" />
      {!compact && (
        <div>
          {editing ? <input className="workspace-name-input" autoFocus value={name} onChange={(event) => setName(event.target.value)} onBlur={() => setEditing(false)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') setEditing(false) }} aria-label="工作区名称" /> : <strong className="workspace-name" onClick={() => setEditing(true)} title="点击修改工作区名称">{name}</strong>}
          <span>已保存至云端</span>
        </div>
      )}
    </div>
  )
}
