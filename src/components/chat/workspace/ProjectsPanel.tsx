'use client'

import { useState } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { ChatProject } from './useConversationList'

// The "Projects" tab of the history sidebar, project list level: the person's projects as cards, and the form that creates one.
// Opening a project, renaming it and deleting it are handled by the sidebar (they need its list, menu and confirmation).

export default function ProjectsPanel({ projects, query, onOpen, onCreate }: {
  projects: ChatProject[]
  /** The sidebar's search text, already applied by the caller; only used to tell "no projects" from "no match". */
  query: string
  onOpen: (id: string) => void
  onCreate: (title: string, description: string) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const clean = title.replace(/\s+/g, ' ').trim()
    if (!clean || busy) return
    setBusy(true)
    const ok = await onCreate(clean, description.trim())
    setBusy(false)
    if (ok) { setCreating(false); setTitle(''); setDescription('') }
  }

  return (
    <div className="space-y-2">
      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-500/40 bg-blue-600/10 px-3 py-2 text-xs font-medium text-sky-200 transition-colors hover:bg-blue-600/25"
        >
          <Plus size={14} aria-hidden />{t('chatWs.project.new')}
        </button>
      ) : (
        <form
          onSubmit={e => { e.preventDefault(); void submit() }}
          className="space-y-2 rounded-xl border border-blue-500/30 bg-[#0B1328]/70 p-3"
        >
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={80}
            placeholder={t('chatWs.project.titlePlaceholder')}
            aria-label={t('chatWs.project.titlePlaceholder')}
            className="w-full rounded border border-blue-500 bg-[#121829] px-2 py-1 text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={300}
            placeholder={t('chatWs.project.descPlaceholder')}
            aria-label={t('chatWs.project.descPlaceholder')}
            className="w-full rounded border border-blue-900/50 bg-[#121829] px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <div className="flex justify-end gap-2 text-xs">
            <button type="button" onClick={() => { setCreating(false); setTitle(''); setDescription('') }} className="rounded-lg border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800">{t('chatWs.project.cancel')}</button>
            <button type="submit" disabled={busy || title.trim() === ''} className="rounded-lg bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">{t('chatWs.project.create')}</button>
          </div>
        </form>
      )}

      {projects.length === 0 && !creating && query.trim() === '' && (
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-900/20 text-slate-500"><FolderKanban size={28} aria-hidden /></div>
          <h4 className="mb-1.5 text-sm font-bold text-slate-200">{t('chatWs.project.empty.title')}</h4>
          <p className="max-w-[260px] text-xs leading-relaxed text-slate-400">{t('chatWs.project.empty.desc')}</p>
        </div>
      )}

      <ul className="space-y-2">
        {projects.map(p => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onOpen(p.id)}
              className="w-full space-y-1.5 rounded-xl border border-blue-900/40 bg-[#0B1328]/60 p-3 text-left text-slate-300 transition-all hover:bg-blue-900/20"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-white">
                  <FolderKanban size={14} aria-hidden className="shrink-0 text-sky-300" />
                  <span className="truncate">{p.title}</span>
                </span>
                <span className="shrink-0 rounded border border-blue-800 bg-blue-950 px-1.5 py-0.5 font-mono text-[10px] text-blue-300">{t('chatWs.project.count', { n: String(p.conversationCount) })}</span>
              </span>
              {p.description && <span className="line-clamp-2 block text-[11px] text-slate-400">{p.description}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
