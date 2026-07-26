import { Children, cloneElement, isValidElement, type ReactNode } from 'react'

export function FloatingButtonGroup({ className = '', children }: { className?: string; children: ReactNode }) {
  const enhanced = Children.map(children, (child) => {
    if (!isValidElement<{ 'aria-label'?: string; 'data-tooltip'?: string; onMouseEnter?: (event: React.MouseEvent<HTMLElement>) => void }>(child)) return child
    const label = child.props['aria-label']
    if (!label || child.props['data-tooltip']) return child
    return cloneElement(child, {
      'data-tooltip': label,
      onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        event.currentTarget.dataset.tooltipPosition = window.innerHeight - rect.bottom < 64 ? 'top' : 'bottom'
      },
    })
  })
  return <div className={`floating-button-group ${className}`.trim()}>{enhanced}</div>
}
