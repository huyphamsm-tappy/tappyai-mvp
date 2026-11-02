'use client'

// WEB-ONLY Phase 8 / WP-06 — the "…" menu for OTHER people's things: Report, and Block / Unblock when the thing has an author.
// Renders nothing unless the server enabled at least one of its actions, so with the flags OFF every call site looks exactly as before:
//   · Block needs USER_BLOCKS_ENABLED (`/api/config` → p8.userBlocks).
//   · Report of a comment or a user needs REPORTS_ENABLED (p8.reports); a report of a post/clip is always on (its route is not flagged).
// Feedback is inline: this app has no toast host outside the admin area.

import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { loginPathFor, currentDestination } from '@/lib/auth/returnTo'
import { useSafetyFlags } from '@/lib/safety/useSafetyFlags'
import { myBlocks, rememberBlock, setBlocked, type ReportTarget } from '@/lib/safety/safetyClient'
import { ReportDialog } from './ReportDialog'
import { SafetyModal } from './SafetyModal'

export interface SafetyMenuProps {
  /** What "Report" reports. Omit to offer only Block. */
  report?: { target: ReportTarget; id: string }
  /** The other person, when blocking makes sense. Never the viewer themselves. */
  user?: { id: string; name?: string | null }
  /** Called after a successful (un)block, e.g. to leave a thread or refresh a list. */
  onBlockedChange?: (blocked: boolean) => void
  className?: string
  /** Icon colour on dark media (Explore). */
  tone?: 'default' | 'onMedia'
}

export function SafetyMenu({ report, user, onBlockedChange, className, tone = 'default' }: SafetyMenuProps) {
  const { t } = useTranslation()
  const flags = useSafetyFlags()
  const [open, setOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [blocked, setBlockedState] = useState(false)
  const [busy, setBusy] = useState(false)
  const [blockFailed, setBlockFailed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const canReport = !!report && (report.target === 'review' || flags.reports)
  const canBlock = flags.userBlocks && !!user
  const userId = user?.id

  useEffect(() => {
    if (!canBlock || !userId) return
    let live = true
    void myBlocks().then((s) => { if (live) setBlockedState(s.has(userId)) })
    return () => { live = false }
  }, [canBlock, userId])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    // Escape closes the menu and puts the focus back on its button (keyboard users would otherwise lose their place).
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(id)
  }, [notice])

  if (!canReport && !canBlock) return null

  const name = user?.name?.trim() || ''

  async function toggleBlock() {
    if (!userId || busy) return
    setBusy(true)
    setBlockFailed(false)
    const next = !blocked
    const result = await setBlocked(userId, next)
    setBusy(false)
    if (result === 'login') { window.location.href = loginPathFor(currentDestination()); return }
    if (result !== 'ok') { setBlockFailed(true); return }
    await rememberBlock(userId, next)
    setConfirming(false)
    setBlockedState(next)
    setNotice(t(next ? 'safety.blocked' : 'safety.unblocked'))
    onBlockedChange?.(next)
  }

  const iconClass = tone === 'onMedia' ? 'text-white drop-shadow' : 'text-gray-500 dark:text-gray-400'

  return (
    <div ref={menuRef} className={`relative ${className ?? ''}`} data-testid="safety-menu">
      <button ref={buttonRef} type="button" aria-label={t('safety.more')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`rounded-full p-1.5 ${iconClass}`}>
        <MoreHorizontal size={18} />
      </button>
      {notice && <span role="status" className="absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1 text-xs text-white">{notice}</span>}
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-gray-900 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
          {canReport && (
            <button role="menuitem" type="button" className="block w-full px-3 py-2 text-left text-sm" onClick={() => { setOpen(false); setReporting(true) }}>
              {t('safety.report')}
            </button>
          )}
          {canBlock && (
            <button role="menuitem" type="button" className="block w-full px-3 py-2 text-left text-sm text-red-600" onClick={() => { setOpen(false); setBlockFailed(false); setConfirming(true) }}>
              {t(blocked ? 'safety.unblock' : 'safety.block')}
            </button>
          )}
        </div>
      )}

      {canReport && report && <ReportDialog open={reporting} onOpenChange={setReporting} target={report.target} targetId={report.id} />}

      {canBlock && (
        <SafetyModal open={confirming} onOpenChange={setConfirming} title={t(blocked ? 'safety.unblockConfirmTitle' : 'safety.blockConfirmTitle', { name })} testId="block-confirm">
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t(blocked ? 'safety.unblockConfirmBody' : 'safety.blockConfirmBody')}</p>
          {blockFailed && <p role="alert" className="mt-3 text-sm text-red-600">{t('safety.failed')}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="rounded-lg px-3 py-2 text-sm" onClick={() => setConfirming(false)}>{t('safety.cancel')}</button>
            <button type="button" disabled={busy} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void toggleBlock()} data-testid="block-confirm-button">
              {t(blocked ? 'safety.unblock' : 'safety.block')}
            </button>
          </div>
        </SafetyModal>
      )}
    </div>
  )
}
