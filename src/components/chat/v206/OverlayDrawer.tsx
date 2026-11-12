'use client'
// Workspace v206: a drawer that slides OVER the canvas (a portal on <body>, no column of its own, so the conversation never reflows or loses its scroll position).
// Focus goes into the drawer when it opens and back to the control that opened it when it closes; Esc and a click on the backdrop close it; Tab stays inside.
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import '../v206.css'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** The drawers that are open, the last one on top. */
const openStack: object[] = []

export interface OverlayDrawerProps {
  /** the dialog's accessible name */
  title: string
  subtitle?: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  testId?: string
  /** a reading panel (the full report) instead of a narrow drawer */
  wide?: boolean
}

export default function OverlayDrawer({ title, subtitle, closeLabel, onClose, children, footer, testId, wide }: OverlayDrawerProps) {
  const root = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const titleId = useRef(`v206-dlg-${Math.random().toString(36).slice(2, 8)}`).current
  const token = useRef({}).current

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeBtn.current?.focus({ preventScroll: true })
    openStack.push(token)
    const onKey = (e: KeyboardEvent) => {
      // two drawers can be open (a profile opened from inside the full report): Esc and Tab belong to the one on top only
      if (openStack[openStack.length - 1] !== token) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCloseRef.current(); return }
      if (e.key !== 'Tab' || !root.current) return
      const items = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hasAttribute('disabled'))
      if (!items.length) return
      const first = items[0]; const last = items[items.length - 1]
      const at = document.activeElement
      if (e.shiftKey && (at === first || !root.current.contains(at))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (at === last || !root.current.contains(at))) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      const at = openStack.indexOf(token)
      if (at >= 0) openStack.splice(at, 1)
      // back to the control that opened the drawer (if it is still on the page); without preventScroll the page would jump
      if (opener && opener !== document.body && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [])

  if (typeof document === 'undefined') return null
  return createPortal(
    <>
      <div className="v206-backdrop" data-testid="v206-backdrop" onClick={() => onClose()} aria-hidden="true" />
      <aside ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} className={wide ? 'v206-drawer v206-drawer-wide' : 'v206-drawer'} data-testid={testId ?? 'v206-drawer'}>
        <header className="v206-drawer-head">
          <div className="min-w-0">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button ref={closeBtn} type="button" className="v206-x" onClick={() => onClose()} aria-label={closeLabel} data-testid="v206-drawer-close"><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="v206-drawer-body" data-report-scroll>{children}</div>
        {footer && <footer className="v206-drawer-foot">{footer}</footer>}
      </aside>
    </>,
    document.body,
  )
}
