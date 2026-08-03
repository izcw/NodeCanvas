import { Check, ChevronDown } from 'lucide-react'
import { useRef, useState, type ReactNode, type FocusEvent } from 'react'
import { createPortal } from 'react-dom'

export type NodeSelectOption = { value: string; label: string; description?: string; icon: ReactNode; meta?: string }
type Props = { value: string; options: NodeSelectOption[]; onChange: (value: string) => void; ariaLabel: string; className?: string; portal?: boolean }

export function NodeSelect({ value, options, onChange, ariaLabel, className = '', portal = false }: Props) {
  const selected = options.find((option) => option.value === value) ?? options[0]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeOnBlur = (event: FocusEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }
  const triggerRect = open ? triggerRef.current?.getBoundingClientRect() : null
  const menu = open && <div className={`node-model-menu ${portal ? 'node-model-menu--portal' : ''}`} role="listbox" aria-label={ariaLabel} style={portal && triggerRect ? { left: Math.max(8, triggerRect.right - 310), bottom: window.innerHeight - triggerRect.top + 10 } : undefined} onMouseDown={portal ? (event) => event.preventDefault() : undefined}>{options.map((option) => <button type="button" key={option.value} className={`node-model-option ${option.value === value ? 'selected' : ''}`} role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false) }}><span className="node-model-icon">{option.icon}</span><span className="node-model-copy"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>{option.meta && <span className="node-model-duration">{option.meta}</span>}{option.value === value && <Check className="node-model-check" size={15} />}</button>)}</div>
  return <div ref={ref} className={`node-model-picker nodrag nopan ${className}`} onBlur={closeOnBlur}>
    <button ref={triggerRef} type="button" className="node-model-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((state) => !state)}>{selected?.icon}<span>{selected?.label}</span><ChevronDown className={open ? 'is-open' : ''} size={13} /></button>
    {portal && menu ? createPortal(menu, document.body) : menu}
  </div>
}
