'use client'

import { useEffect, useRef, useState } from 'react'
import Image from '@/components/media/SafeImage'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Search, X, Check, Loader2 } from 'lucide-react'

interface FoundUser {
  id: string
  full_name: string | null
  avatar_url: string | null
}

const MIN_QUERY = 2
const DEBOUNCE_MS = 350

/**
 * The new-conversation flow: search real accounts, pick one or more, start a thread.
 *
 * 🔑 REUSES `GET /api/users/search`, which already exists and already carries its
 * own enumeration rate limit (30/min/IP) and its own "name partial, email/phone
 * exact" policy. A second people-search endpoint would have been a second place
 * for that policy to drift.
 *
 * 🚨 There is no directory listing and no suggested-people list, because neither
 * exists as real data. An empty search box shows a hint, not invented names.
 */
export default function NewMessageSheet({
  onClose,
  onStarted,
}: {
  onClose: () => void
  onStarted: (threadId: string) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoundUser[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<FoundUser[]>([])
  const [groupName, setGroupName] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounced so typing a name is one request, not one per keystroke.
  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY) { setResults([]); setSearching(false); return }
    setSearching(true)
    let cancelled = false
    const timer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then(r => (r.ok ? r.json() : { users: [] }))
        .then(d => { if (!cancelled) setResults(d.users ?? []) })
        .catch(() => { if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, DEBOUNCE_MS)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  function toggle(user: FoundUser) {
    setSelected(prev =>
      prev.some(u => u.id === user.id) ? prev.filter(u => u.id !== user.id) : [...prev, user])
  }

  async function start() {
    if (selected.length === 0 || starting) return
    setStarting(true)
    setError(null)
    try {
      // One person is a direct thread — and the server deduplicates it, so
      // picking someone you already talk to reopens that conversation instead of
      // creating a second one. More than one is a group.
      const payload = selected.length === 1
        ? { kind: 'direct', userId: selected[0].id }
        : { kind: 'group', userIds: selected.map(u => u.id), title: groupName.trim() || null }
      const r = await fetch('/api/messaging/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      onStarted(d.threadId)
    } catch {
      setError(t('v3.msg.error'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t('v3.msg.close')}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        className="relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border sm:max-w-md sm:rounded-2xl"
        style={{ background: 'var(--v3-panel)', borderColor: 'var(--v3-border)' }}
      >
        <div className="flex flex-shrink-0 items-center gap-2 border-b px-4 py-3.5" style={{ borderColor: 'var(--v3-border)' }}>
          <h2 className="flex-1 text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.msg.new')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('v3.msg.close')}
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ color: 'var(--v3-fg-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-shrink-0 px-4 pt-3">
          <div className="relative">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--v3-fg-muted)' }} />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('v3.msg.findPeople')}
              aria-label={t('v3.msg.findPeople')}
              className="w-full rounded-xl border py-2.5 pl-10 pr-3 text-[13.5px] outline-none transition-colors focus:border-[var(--v3-accent)]"
              style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg)' }}
            />
          </div>

          {/* A name only appears once more than one person is picked, because
              that is the only case where the thread is a group. */}
          {selected.length > 1 && (
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              maxLength={120}
              placeholder={t('v3.msg.groupName')}
              aria-label={t('v3.msg.groupName')}
              className="mt-2 w-full rounded-xl border px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-[var(--v3-accent)]"
              style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg)' }}
            />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {query.trim().length < MIN_QUERY ? (
            <p className="px-2 py-6 text-center text-[12.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('v3.msg.searchHint')}
            </p>
          ) : searching ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--v3-accent)' }} />
            </div>
          ) : results.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('v3.msg.noResults')}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {results.map(user => {
                const picked = selected.some(u => u.id === user.id)
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => toggle(user)}
                      aria-pressed={picked}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors"
                      style={{ background: picked ? 'var(--v3-accent-soft)' : 'transparent' }}
                    >
                      {user.avatar_url ? (
                        <Image src={user.avatar_url} alt="" width={36} height={36} className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
                      ) : (
                        <span
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                          style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
                          aria-hidden="true"
                        >
                          {(user.full_name ?? '?').trim()[0]?.toUpperCase() ?? '?'}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                        {user.full_name?.trim() || t('v3.msg.unknownUser')}
                      </span>
                      {picked && <Check size={17} style={{ color: 'var(--v3-accent)' }} aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {error && <p role="alert" className="px-4 pb-1 text-[12px]" style={{ color: 'var(--v3-rose)' }}>{error}</p>}

        <div className="flex-shrink-0 border-t px-4 py-3" style={{ borderColor: 'var(--v3-border)' }}>
          <button
            type="button"
            onClick={() => void start()}
            disabled={selected.length === 0 || starting}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
          >
            {starting && <Loader2 size={17} className="animate-spin" />}
            {selected.length > 1 ? t('v3.msg.startChatN', { n: String(selected.length) }) : t('v3.msg.startChat')}
          </button>
        </div>
      </div>
    </div>
  )
}
