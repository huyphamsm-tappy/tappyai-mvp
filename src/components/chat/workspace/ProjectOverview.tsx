'use client'
// Workspace v206 (the mockup's scenario 6): the overview of the project opened in the sidebar. A header (folder tile, kicker, title, the real description when there is one, the
// real conversation count), then the project's own conversations as rows (icon, title, one-line preview of the real last message, time, message count) or the empty state.
// What the mockup also shows (goal, budget, status, saved places, a dossier, "create sub-conversation") needs data projects do not have and is not drawn.
import { useMemo, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ArrowLeft, FolderKanban, Pin } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatRelativeTime } from '@/lib/utils'
import { conversationEmoji } from '@/lib/chat/v206Look'
import { projectRows, projectViewStore } from '@/lib/chat/workspace/projectView'
import { useConversationStore } from './ChatWorkspaceContext'

export default function ProjectOverview() {
  const { t, locale } = useTranslation()
  const store = useConversationStore()
  const id = useSyncExternalStore(projectViewStore.subscribe, projectViewStore.getSnapshot, projectViewStore.getServerSnapshot)
  const project = id ? store?.projects.find(p => p.id === id) ?? null : null
  const rows = useMemo(() => (id && store ? projectRows(store.items, id) : []), [id, store])
  if (!id || !store || !project) return null
  return (
    <section data-testid="project-overview" aria-labelledby="project-overview-title" className="h-full overflow-y-auto px-5 py-6 sm:px-8 md:px-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <button type="button" onClick={() => projectViewStore.set(null)} data-testid="project-overview-back" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-300 hover:bg-blue-900/30 hover:text-white">
          <ArrowLeft size={14} aria-hidden />{t('v206.project.back')}
        </button>
        <header className="rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-950/60 via-indigo-950/40 to-blue-950/60 p-5">
          <div className="flex items-start gap-4">
            <span className="v206-convicon" aria-hidden><FolderKanban size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-sky-300">{t('v206.project.kicker')}</p>
              <h1 id="project-overview-title" className="mt-1 text-xl font-bold text-white md:text-2xl">{project.title}</h1>
              {project.description && <p data-testid="project-overview-desc" className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{project.description}</p>}
            </div>
            <span className="shrink-0 rounded-lg border border-blue-800 bg-blue-950 px-2 py-1 font-mono text-[11px] text-blue-300">{t('chatWs.project.count', { n: String(rows.length) })}</span>
          </div>
        </header>

        <div>
          <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-sky-400">{t('v206.project.rows', { n: String(rows.length) })}</h2>
          {rows.length === 0 ? (
            <div data-testid="project-overview-empty" className="flex flex-col items-center rounded-2xl border border-dashed border-blue-500/25 px-6 py-10 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-900/20 text-slate-500"><FolderKanban size={26} aria-hidden /></div>
              <h3 className="mb-1.5 text-sm font-bold text-slate-200">{t('chatWs.project.emptyChats.title')}</h3>
              <p className="max-w-sm text-xs leading-relaxed text-slate-400">{t('chatWs.project.emptyChats.desc')}</p>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {rows.map(r => (
                <li key={r.id}>
                  <Link href={`/chat/${r.id}`} data-testid="project-overview-row" onClick={() => projectViewStore.set(null)}
                    className="block h-full rounded-2xl border border-blue-900/40 bg-[#0B1328]/70 p-4 transition-colors hover:border-blue-500/50 hover:bg-blue-900/20">
                    <span className="flex items-start gap-3">
                      <span className="v206-rowicon" aria-hidden>{conversationEmoji(r.category)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-white">{r.title || t('chatWs.untitled')}</span>
                          {r.pinned && <Pin size={12} aria-hidden className="shrink-0 text-amber-300" />}
                        </span>
                        {r.preview && <span data-testid="project-overview-preview" className="mt-1 line-clamp-2 block text-xs leading-relaxed text-slate-400">{r.preview}</span>}
                        <span className="mt-2 flex items-center gap-2 font-mono text-[11px] text-slate-500">
                          <span>{formatRelativeTime(r.updated_at, t, locale)}</span>
                          {r.messages > 0 && <><span aria-hidden>•</span><span>{t('v206.header.messages', { n: String(r.messages) })}</span></>}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
