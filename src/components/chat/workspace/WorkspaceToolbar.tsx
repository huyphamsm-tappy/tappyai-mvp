'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bookmark, Download } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { buildTranscriptMarkdown, exportFileName } from '@/lib/chat/workspace/historyModel'
import { useConversationStore } from './ChatWorkspaceContext'
import SavedDrawer from './SavedDrawer'

// The bar above the conversation on desktop: the conversation's title and when it was last updated, an export button, and the button
// that slides the saved-places panel over the chat. The title always follows the sidebar (one shared store), so a rename shows in both.

export default function WorkspaceToolbar() {
  const { t, locale } = useTranslation()
  const pathname = usePathname()
  const { items } = useConversationStore()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const activeId = /^\/chat\/([^/?#]+)/.exec(pathname)?.[1] ?? null
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
      <div className="hidden shrink-0 items-center justify-between border-b border-blue-900/30 bg-[#091022]/80 px-5 py-3 backdrop-blur-md lg:flex">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-white md:text-base">{conv?.title || t('chatWs.header.untitled')}</h1>
          {conv && <p className="text-[11px] text-slate-400">{t('chatWs.header.updated', { time: formatRelativeTime(conv.updated_at, t, locale) })}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {conv && (
            <button
              type="button"
              onClick={exportTranscript}
              title={t('chatWs.menu.export')}
              className="flex items-center gap-1.5 rounded-xl border border-transparent px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-blue-900/40 hover:bg-blue-900/20 hover:text-white"
            >
              <Download size={15} aria-hidden />{t('chatWs.header.export')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDrawerOpen(open => !open)}
            aria-pressed={drawerOpen}
            title={t('chatWs.drawer.title')}
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors',
              drawerOpen ? 'border-blue-400 bg-blue-600/25 text-sky-200' : 'border-transparent text-slate-300 hover:border-blue-900/40 hover:bg-blue-900/20 hover:text-white',
            )}
          >
            <Bookmark size={15} aria-hidden />{t('chatWs.header.saved')}
          </button>
        </div>
      </div>
      {drawerOpen && <div className="hidden lg:block"><SavedDrawer onClose={() => setDrawerOpen(false)} /></div>}
    </>
  )
}
