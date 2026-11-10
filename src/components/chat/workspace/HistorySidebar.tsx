'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Download, ListChecks, MessageCircle, MoreVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { apiFetch } from '@/lib/account/ageGateClient'
import {
  buildTranscriptMarkdown, conversationMatches, exportFileName, groupByTime, type HistoryConversation,
} from '@/lib/chat/workspace/historyModel'

// Desktop history sidebar of the chat workspace (400 px at 2xl, 360 px below). It lists the signed-in person's own saved conversations
// from GET /api/conversations (the 20 most recent), searches title + messages without diacritics, groups by day, renames in place,
// exports a transcript as .md and deletes one or several behind a confirmation. Pin / archive / projects are NOT here yet: the
// `conversations` table has no column for them (a later slice adds them with a migration).

type Status = 'loading' | 'ready' | 'error' | 'signedOut'

interface Confirm {
  ids: string[]
}

export default function HistorySidebar() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()
  const activeId = /^\/chat\/([^/?#]+)/.exec(pathname)?.[1] ?? null

  const [items, setItems] = useState<HistoryConversation[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Mirrors `renamingId` synchronously, so Enter / Escape / blur can never finish the same edit twice (an Escape must not be saved by
  // the blur that follows it).
  const renamingRef = useRef<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const say = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 3500)
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', { cache: 'no-store' })
      if (res.status === 401) {
        setItems([])
        setStatus('signedOut')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as HistoryConversation[]
      setItems(Array.isArray(data) ? data : [])
      setStatus('ready')
    } catch {
      setStatus(prev => (prev === 'ready' ? prev : 'error'))
    }
  }, [])

  // Reload on arrival and whenever the route changes: a conversation saved for the first time moves /chat → /chat/<id>.
  useEffect(() => { void load() }, [load, pathname])

  // The search box debounces by 250 ms, like the design.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(queryInput), 250)
    return () => clearTimeout(timer)
  }, [queryInput])

  // Close the row menu on any outside press or Escape.
  useEffect(() => {
    if (!menuId) return
    const close = () => setMenuId(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuId])

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])

  const visible = useMemo(() => items.filter(c => conversationMatches(c, query)), [items, query])
  const groups = useMemo(() => groupByTime(visible, new Date()), [visible])

  // ── rename ──
  function startRename(id: string) {
    renamingRef.current = id
    setRenamingId(id)
  }

  async function finishRename(id: string, value: string | null) {
    if (renamingRef.current !== id) return
    renamingRef.current = null
    setRenamingId(null)
    if (value === null) return
    const next = value.replace(/\s+/g, ' ').trim()
    const current = items.find(c => c.id === id)
    if (!current) return
    if (!next) { say(t('chatWs.rename.empty')); return }
    if (next === (current.title ?? '')) return
    setItems(list => list.map(c => (c.id === id ? { ...c, title: next } : c)))
    try {
      const res = await apiFetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
      say(t('chatWs.rename.saved'))
    } catch {
      setItems(list => list.map(c => (c.id === id ? { ...c, title: current.title } : c)))
      say(t('chatWs.rename.failed'))
    }
  }

  // ── export ──
  function exportConversation(conv: HistoryConversation) {
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
    say(t('chatWs.export.done', { file: name }))
  }

  // ── delete ──
  async function confirmDelete() {
    if (!confirm) return
    const ids = confirm.ids
    setConfirm(null)
    const results = await Promise.all(ids.map(async id => {
      try {
        const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        return res.ok ? id : null
      } catch { return null }
    }))
    const deleted = results.filter((id): id is string => id !== null)
    if (deleted.length > 0) {
      setItems(list => list.filter(c => !deleted.includes(c.id)))
      setSelected(new Set())
      setSelectMode(false)
      say(t('chatWs.delete.done', { n: String(deleted.length) }))
      if (activeId && deleted.includes(activeId)) router.push('/chat')
    }
    if (deleted.length < ids.length) say(t('chatWs.delete.failed'))
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  const confirmTitleOf = confirm && confirm.ids.length === 1 ? items.find(c => c.id === confirm.ids[0])?.title || t('chatWs.untitled') : ''

  return (
    <aside
      aria-label={t('chatWs.sidebar.title')}
      className="relative hidden lg:flex w-[360px] 2xl:w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl border border-blue-500/25 bg-[#091022]/90 shadow-2xl shadow-blue-950/70"
    >
      <div className="flex items-center justify-between border-b border-blue-900/30 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight text-white">{t('chatWs.sidebar.title')}</h2>
          <span className="rounded-full border border-blue-500/30 bg-blue-900/40 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-300">{items.length}</span>
        </div>
        <Link
          href="/chat"
          className="flex items-center gap-1 rounded-xl border border-blue-500/40 bg-blue-600/20 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 transition-colors hover:bg-blue-600/40"
        >
          <Plus size={14} aria-hidden />
          {t('chatWs.sidebar.newChat')}
        </Link>
      </div>

      <div className="flex items-center gap-2 border-b border-blue-900/20 p-3">
        <div className="relative min-w-0 flex-1">
          <Search size={16} aria-hidden className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="search"
            value={queryInput}
            onChange={e => setQueryInput(e.target.value)}
            placeholder={t('chatWs.search.placeholder')}
            aria-label={t('chatWs.search.placeholder')}
            className="w-full rounded-xl border border-blue-900/40 bg-[#050B18] py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 transition-all focus:border-blue-500/60 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          title={t('chatWs.select.title')}
          aria-pressed={selectMode}
          disabled={status !== 'ready' || items.length === 0}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40',
            selectMode ? 'border-blue-400 bg-blue-600/25 text-sky-200' : 'border-blue-900/40 bg-[#050B18] text-slate-300 hover:border-blue-500/50 hover:text-white',
          )}
        >
          <ListChecks size={14} aria-hidden />
          {selectMode ? t('chatWs.select.done') : t('chatWs.select.on')}
        </button>
      </div>

      <div className={cn('flex-1 space-y-3 overflow-y-auto px-2 py-2', selectMode && 'pb-24')}>
        {status === 'loading' && <p className="p-6 text-center text-xs text-slate-400">{t('chatWs.loading')}</p>}

        {status === 'error' && (
          <EmptyState icon={<MessageCircle size={28} aria-hidden />} title={t('chatWs.error.load')} actionLabel={t('chatWs.error.retry')} onAction={() => { setStatus('loading'); void load() }} />
        )}

        {status === 'signedOut' && (
          <EmptyState icon={<MessageCircle size={28} aria-hidden />} title={t('chatWs.signin.title')} desc={t('chatWs.signin.desc')} actionLabel={t('chatWs.signin.action')} href="/login?returnTo=/chat" />
        )}

        {status === 'ready' && items.length === 0 && (
          <EmptyState icon={<MessageCircle size={28} aria-hidden />} title={t('chatWs.empty.none.title')} desc={t('chatWs.empty.none.desc')} actionLabel={t('chatWs.empty.none.action')} href="/chat" />
        )}

        {status === 'ready' && items.length > 0 && visible.length === 0 && (
          <EmptyState
            icon={<Search size={28} aria-hidden />}
            title={t('chatWs.empty.search.title')}
            desc={t('chatWs.empty.search.desc', { q: query })}
            actionLabel={t('chatWs.empty.search.action')}
            onAction={() => { setQueryInput(''); setQuery('') }}
          />
        )}

        {status === 'ready' && groups.map(group => (
          <section key={group.key} className="space-y-1">
            <h3 className="px-2 py-1 font-mono text-[10px] font-bold uppercase text-slate-400">
              {t(`chatWs.group.${group.key}`)} ({group.items.length})
            </h3>
            <ul className="space-y-1">
              {group.items.map(conv => {
                const isActive = conv.id === activeId
                const isSelected = selected.has(conv.id)
                const isRenaming = renamingId === conv.id
                const title = conv.title || t('chatWs.untitled')
                return (
                  <li key={conv.id} className="relative">
                    <div
                      role="button"
                      tabIndex={0}
                      data-conv-id={conv.id}
                      onClick={() => { if (isRenaming) return; if (selectMode) toggleSelected(conv.id); else router.push(`/chat/${conv.id}`) }}
                      onKeyDown={e => {
                        if (isRenaming || e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (selectMode) toggleSelected(conv.id); else router.push(`/chat/${conv.id}`) }
                      }}
                      className={cn(
                        'group flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left transition-all',
                        isSelected ? 'bg-blue-600/20 text-sky-100 ring-1 ring-blue-400/60'
                          : isActive ? 'border-l-2 border-blue-400 bg-gradient-to-r from-blue-600/30 via-blue-500/15 to-transparent text-sky-200'
                            : 'text-slate-300 hover:bg-blue-900/20 hover:text-slate-100',
                      )}
                    >
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(conv.id)}
                          onClick={e => e.stopPropagation()}
                          aria-label={title}
                          className="mr-2.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-blue-500"
                        />
                      )}
                      <div className="min-w-0 flex-1 pr-2">
                        {isRenaming ? (
                          <input
                            autoFocus
                            defaultValue={title}
                            maxLength={120}
                            onFocus={e => e.currentTarget.select()}
                            onClick={e => e.stopPropagation()}
                            onDoubleClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              e.stopPropagation()
                              if (e.key === 'Enter') { e.preventDefault(); void finishRename(conv.id, e.currentTarget.value) }
                              else if (e.key === 'Escape') { e.preventDefault(); void finishRename(conv.id, null) }
                            }}
                            onBlur={e => void finishRename(conv.id, e.currentTarget.value)}
                            className="w-full min-w-0 rounded border border-blue-500 bg-[#121829] px-2 py-1 text-sm text-white focus:outline-none"
                          />
                        ) : (
                          <span
                            title={t('chatWs.rename.hint')}
                            onDoubleClick={e => { if (selectMode) return; e.stopPropagation(); startRename(conv.id) }}
                            className={cn('block truncate text-xs font-medium', isActive && 'font-semibold text-white')}
                          >
                            {title}
                          </span>
                        )}
                      </div>
                      {!selectMode && !isRenaming && (
                        <button
                          type="button"
                          aria-label={t('chatWs.menu.open')}
                          aria-haspopup="menu"
                          aria-expanded={menuId === conv.id}
                          onClick={e => { e.stopPropagation(); setMenuId(menuId === conv.id ? null : conv.id) }}
                          className="shrink-0 rounded-lg p-1 text-slate-400 opacity-0 transition-all hover:bg-blue-800/40 hover:text-white focus:opacity-100 group-hover:opacity-100"
                        >
                          <MoreVertical size={14} aria-hidden />
                        </button>
                      )}
                    </div>

                    {menuId === conv.id && (
                      <div role="menu" className="absolute right-2 top-9 z-40 min-w-[210px] rounded-2xl border border-blue-500/30 bg-[#0A1224] py-1.5 text-xs text-slate-200 shadow-2xl">
                        <button role="menuitem" type="button" onClick={e => { e.stopPropagation(); setMenuId(null); startRename(conv.id) }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-blue-600/25 hover:text-white">
                          <Pencil size={14} aria-hidden />{t('chatWs.menu.rename')}
                        </button>
                        <button role="menuitem" type="button" onClick={e => { e.stopPropagation(); setMenuId(null); exportConversation(conv) }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-blue-600/25 hover:text-white">
                          <Download size={14} aria-hidden />{t('chatWs.menu.export')}
                        </button>
                        <div className="my-1 h-px bg-blue-900/40" />
                        <button role="menuitem" type="button" onClick={e => { e.stopPropagation(); setMenuId(null); setConfirm({ ids: [conv.id] }) }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-red-300 transition-colors hover:bg-red-600/30 hover:text-red-100">
                          <Trash2 size={14} aria-hidden />{t('chatWs.menu.delete')}
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {selectMode && (
        <div className="absolute inset-x-2 bottom-3 z-30 rounded-2xl border border-blue-500/40 bg-[#0A1530] px-3 py-2.5 shadow-2xl shadow-black/70">
          <div className="flex items-center justify-between">
            <span role="status" className="text-xs font-semibold text-white">{t('chatWs.select.count', { n: String(selected.size) })}</span>
            <div className="flex items-center gap-1.5 text-[11px]">
              <button type="button" onClick={exitSelectMode} className="rounded-lg px-2 py-1 text-slate-300 hover:bg-blue-900/30 hover:text-white">{t('chatWs.select.cancel')}</button>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => setConfirm({ ids: Array.from(selected) })}
                className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-600/20 px-2.5 py-1 font-medium text-red-200 hover:bg-red-600/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={13} aria-hidden />{t('chatWs.select.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className="absolute inset-x-3 bottom-3 z-40 rounded-xl border border-blue-500/40 bg-[#0B152C] px-3 py-2 text-xs font-medium text-white shadow-xl" style={selectMode ? { bottom: '4.5rem' } : undefined}>
          {notice}
        </p>
      )}

      {confirm && (
        <div role="dialog" aria-modal="true" aria-labelledby="chatws-delete-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#091226] p-5 shadow-2xl shadow-red-950/80" onClick={e => e.stopPropagation()}>
            <h3 id="chatws-delete-title" className="mb-1.5 text-sm font-bold text-white">
              {confirm.ids.length === 1 ? t('chatWs.delete.title') : t('chatWs.delete.batchTitle', { n: String(confirm.ids.length) })}
            </h3>
            <p className="mb-4 text-xs leading-relaxed text-slate-300">
              {confirm.ids.length === 1 ? t('chatWs.delete.body', { title: `"${confirmTitleOf}"` }) : t('chatWs.delete.batchBody')}
            </p>
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" autoFocus onClick={() => setConfirm(null)} className="rounded-xl border border-slate-700 px-3.5 py-1.5 font-medium text-slate-300 hover:bg-slate-800">{t('chatWs.delete.cancel')}</button>
              <button type="button" onClick={() => void confirmDelete()} className="rounded-xl bg-red-600 px-4 py-1.5 font-semibold text-white shadow-md shadow-red-600/30 hover:bg-red-500">{t('chatWs.delete.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

function EmptyState({ icon, title, desc, actionLabel, onAction, href }: {
  icon: React.ReactNode
  title: string
  desc?: string
  actionLabel?: string
  onAction?: () => void
  href?: string
}) {
  const action = 'mt-4 inline-block rounded-xl border border-blue-500/40 bg-blue-600/20 px-3.5 py-1.5 text-xs font-medium text-sky-200 transition-all hover:bg-blue-600/40'
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-900/20 text-slate-500">{icon}</div>
      <h4 className="mb-1.5 text-sm font-bold text-slate-200">{title}</h4>
      {desc && <p className="max-w-[260px] text-xs leading-relaxed text-slate-400">{desc}</p>}
      {actionLabel && href && <Link href={href} className={action}>{actionLabel}</Link>}
      {actionLabel && !href && onAction && <button type="button" onClick={onAction} className={action}>{actionLabel}</button>}
    </div>
  )
}
