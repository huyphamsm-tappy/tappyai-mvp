'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { Bookmark, Download, Lightbulb } from 'lucide-react'
import '@/components/chat/v206.css'
import { WORKSPACE_V206, headerBadges } from '@/lib/chat/v206'
import { v206Store } from '@/lib/chat/v206Store'
import { cn, formatRelativeTime } from '@/lib/utils'
import { SHELL_REF } from '@/lib/chat/shellRef'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { buildTranscriptMarkdown, exportFileName, messageText } from '@/lib/chat/workspace/historyModel'
import { OPEN_SAVED_EVENT, V206_LOOK, conversationEmoji, statusLine } from '@/lib/chat/v206Look'
import { useConversationStore } from './ChatWorkspaceContext'
import SavedDrawer from './SavedDrawer'

// The bar above the conversation on desktop: the conversation's title and when it was last updated, an export button, and the button
// that slides the saved-places panel over the chat. The title always follows the sidebar (one shared store), so a rename shows in both.

/** The messages of a conversation that have readable text (the count the header may state). */
function messageCount(messages: ReadonlyArray<{ content?: unknown } | null> | null | undefined): number {
  return Array.isArray(messages) ? messages.filter(m => m && messageText(m.content).trim() !== '').length : 0
}

export default function WorkspaceToolbar() {
  const { t, locale } = useTranslation()
  const pathname = usePathname()
  const store = useConversationStore()
  const { items } = store
  const [drawerOpen, setDrawerOpen] = useState(false)
  // workspace v206: the tips the open conversation's answers carry, and the overlay drawers' state (one drawer at a time, the saved drawer included)
  const v206 = useSyncExternalStore(v206Store.subscribe, v206Store.getSnapshot, v206Store.getServerSnapshot)
  useEffect(() => { if (WORKSPACE_V206 && v206.drawer && drawerOpen) setDrawerOpen(false) }, [v206.drawer, drawerOpen])
  useEffect(() => {
    const open = () => { if (WORKSPACE_V206) v206Store.closeDrawer(); setDrawerOpen(true) }
    window.addEventListener(OPEN_SAVED_EVENT, open)
    return () => window.removeEventListener(OPEN_SAVED_EVENT, open)
  }, [])
  const activeId = store.activeId !== undefined ? store.activeId : /^\/chat\/([^/?#]+)/.exec(pathname)?.[1] ?? null
  const conv = activeId ? items.find(c => c.id === activeId) ?? null : null

  function exportTranscript() {
    if (!conv) return
    const now = new Date()
    const md = buildTranscriptMarkdown(conv, {
      you: t('chatWs.export.you'),
      tappy: t('chatWs.export.tappy'),
      exportedFrom: t('chatWs.export.from'),
      messageCount: n => t('chatWs.export.count', { n: String(n) }),
      untitled: t('chatWs.untitled'),
    }, now)
    const name = exportFileName(conv.title, now)
    const blob = new Blob([String.fromCharCode(0xfeff) + md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 1000)
  }

  return (
    <>
      {/* the first layout: the conversation is ONE surface (the panel's); the header is a row of it, with no bar of its own and no line under it */}
      <div className={cn('hidden shrink-0 items-center justify-between px-5 py-3 lg:flex', SHELL_REF ? 'bg-transparent' : 'border-b border-blue-900/30 bg-[#091022]/80 backdrop-blur-md')}>
        <div className="flex min-w-0 items-center gap-3">
          {V206_LOOK && <span aria-hidden className="v206-convicon" data-testid="v206-convicon">{conversationEmoji(conv?.category)}</span>}
          <div className="min-w-0">
            <h1 className={cn('truncate font-bold text-white', SHELL_REF ? 'text-base md:text-[17px]' : 'text-sm md:text-base')}>{conv?.title || t('chatWs.header.untitled')}</h1>
            {conv && (
              <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400" data-testid="v206-status">
                <span>
                  {V206_LOOK
                    ? statusLine({ updated: t('chatWs.header.updated', { time: formatRelativeTime(conv.updated_at, t, locale) }), messages: messageCount(conv.messages) }, n => t('v206.header.messages', { n: String(n) }))
                    : t('chatWs.header.updated', { time: formatRelativeTime(conv.updated_at, t, locale) })}
                </span>
                {WORKSPACE_V206 && headerBadges(conv).map(b => <span key={b} className="v206-badge" data-testid={`v206-badge-${b}`}>{t(`v206.header.${b}`)}</span>)}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {WORKSPACE_V206 && v206.tips.length > 0 && (
            <button
              type="button"
              onClick={() => { setDrawerOpen(false); v206Store.openTips() }}
              aria-haspopup="dialog"
              data-testid="v206-header-tips"
              className="flex items-center gap-1.5 rounded-xl border border-transparent px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:border-amber-500/40 hover:bg-amber-500/10"
            >
              <Lightbulb size={15} aria-hidden />{t('v206.header.tipsN', { n: String(v206.tips.length) })}
            </button>
          )}
          {conv && (
            <button
              type="button"
              onClick={exportTranscript}
              title={t('chatWs.menu.export')}
              className={SHELL_REF
                ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 transition-colors hover:bg-white/10 hover:text-white'
                : 'flex items-center gap-1.5 rounded-xl border border-transparent px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-blue-900/40 hover:bg-blue-900/20 hover:text-white'}
            >
              {/* the first layout draws the header actions as round icon buttons: same actions, same names (read by screen readers and shown as the tooltip) */}
              <Download size={SHELL_REF ? 18 : 15} aria-hidden />{SHELL_REF ? <span className="sr-only">{t('chatWs.header.export')}</span> : t('chatWs.header.export')}
            </button>
          )}
          <button
            type="button"
            onClick={() => { if (WORKSPACE_V206) v206Store.closeDrawer(); setDrawerOpen(open => !open) }}
            aria-pressed={drawerOpen}
            title={t('chatWs.drawer.title')}
            className={cn(
              'flex items-center transition-colors',
              SHELL_REF ? 'h-10 w-10 justify-center rounded-xl border' : 'gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium',
              drawerOpen ? 'border-blue-400 bg-blue-600/25 text-sky-200' : SHELL_REF ? 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10 hover:text-white' : 'border-transparent text-slate-300 hover:border-blue-900/40 hover:bg-blue-900/20 hover:text-white',
            )}
          >
            <Bookmark size={SHELL_REF ? 18 : 15} aria-hidden />{SHELL_REF ? <span className="sr-only">{t('chatWs.header.saved')}</span> : t('chatWs.header.saved')}
          </button>
        </div>
      </div>
      {drawerOpen && <div className="hidden lg:block"><SavedDrawer onClose={() => setDrawerOpen(false)} /></div>}
    </>
  )
}
