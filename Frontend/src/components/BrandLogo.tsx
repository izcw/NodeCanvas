import { ProjectMenu, useProjectWorkspace } from '../features/workspace/ProjectWorkspace'

type BrandLogoProps = { compact?: boolean; onClick?: () => void }

export function BrandLogo({ compact = false, onClick }: BrandLogoProps) {
  const { activeProject } = useProjectWorkspace()
  return (
    <div className={`brand-logo ${compact ? 'compact' : ''} ${onClick ? 'is-clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={(event) => { if (onClick && (event.key === 'Enter' || event.key === ' ')) onClick() }}>
      <ProjectMenu />
      {!compact && (
        <div>
          <strong className="workspace-name" title="当前项目">{activeProject?.title ?? '工作空间'}</strong>
          <span>已保存至云端</span>
        </div>
      )}
    </div>
  )
}
