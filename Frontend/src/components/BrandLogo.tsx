type BrandLogoProps = { compact?: boolean }

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <div className={`brand-logo ${compact ? 'compact' : ''}`}>
      <img src="/logo.png" alt="灵构" />
      {!compact && (
        <div>
          <strong>灵构</strong>
          <span>节点创意工作台</span>
        </div>
      )}
    </div>
  )
}
