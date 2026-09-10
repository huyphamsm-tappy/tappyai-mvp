'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Search, Users, MessageCircle } from 'lucide-react'
import { threadTitle, type ChatThreadSummary } from '@/lib/messaging/types'

/**
 * Relative time from the app's existing `time.*` strings — no new vocabulary,
 * and no `Intl.RelativeTimeFormat`, which renders English units inside a
 * Vietnamese session.
 */
function useTimeAgo() {
  const { t } = useTranslation()
  return (iso: string) => {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
    if (mins < 1) return t('time.justNow')
    if (mins < 60) return t('time.minutesAgo', { n: String(mins) })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('time.hoursAgo', { n: String(hours) })
    return t('time.daysAgo', { n: String(Math.floor(hours / 24)) })
  }
}

function Avatar({ url, name, group }: { url: string | null; name: string; group: boolean }) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-bold"
      style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
      aria-hidden="true"
    >
      {group ? <Users size={18} /> : (name.trim()[0]?.toUpperCase() ?? '?')}
    </span>
  )
}

export default function ThreadList({
  threads,
  activeId,
  meId,
  onSelect,
}: {
  threads: ChatThreadSummary[]
  activeId: string | null
  meId: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const timeAgo = useTimeAgo()
  const [query, setQuery] = useState('')

  /**
   * 🔑 Filters what is ALREADY LOADED. This is not message search — the server
   * has no full-text index over `chat_messages` and Phase 1 does not add one, so
   * offering a box that appears to search history would be a promise nothing
   * keeps. It narrows the visible list by name and last message, which is what
   * the box is next to.
   */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return threads
    return threads.filter(thread => {
      const title = threadTitle(thread, meId, t('v3.msg.unknownUser')).toLowerCase()
      return title.includes(q) || (thread.lastMessage?.body.toLowerCase().includes(q) ?? false)
    })
  }, [threads, query, meId, t])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex-shrink-0 px-1 pb-3">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--v3-fg-muted)', marginTop: '-6px' }}
        />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('v3.msg.search')}
          aria-label={t('v3.msg.search')}
          className="w-full rounded-xl border py-2.5 pl-10 pr-3 text-[13px] outline-none transition-colors focus:border-[var(--v3-accent)]"
          style={{
            background: 'var(--v3-panel-elevated)',
            borderColor: 'var(--v3-border)',
            color: 'var(--v3-fg)',
          }}
        />
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-muted)' }}
            aria-hidden="true"
          >
            <MessageCircle size={26} />
          </span>
          {/* A real empty state. No placeholder conversations are ever rendered. */}
          <p className="mt-1 text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>
            {t('v3.msg.empty')}
          </p>
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('v3.msg.emptyHint')}
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-2">
          {visible.map(thread => {
            const title = threadTitle(thread, meId, thread.kind === 'group' ? t('v3.msg.unnamedGroup') : t('v3.msg.unknownUser'))
            const other = thread.participants.find(p => p.userId !== meId)
            const active = thread.id === activeId
            const unread = thread.unreadCount > 0
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  aria-current={active ? 'true' : undefined}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors"
                  style={active
                    ? { background: 'var(--v3-accent-soft)' }
                    : { background: 'transparent' }}
                >
                  <Avatar url={thread.kind === 'group' ? null : other?.avatarUrl ?? null} name={title} group={thread.kind === 'group'} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        className="min-w-0 flex-1 truncate text-[13.5px]"
                        style={{ color: 'var(--v3-fg)', fontWeight: unread ? 700 : 600 }}
                      >
                        {title}
                      </span>
                      <span className="flex-shrink-0 text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
                        {timeAgo(thread.lastMessage?.createdAt ?? thread.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className="min-w-0 flex-1 truncate text-[12px]"
                        style={{ color: unread ? 'var(--v3-fg-secondary)' : 'var(--v3-fg-muted)' }}
                      >
                        {thread.lastMessage?.body ?? t('v3.msg.noMessages')}
                      </span>
                      {/* 🚨 REAL COUNT. Derived server-side from the read cursor by
                          `chat_thread_summaries()`; there is no client-side arithmetic
                          here and no placeholder number. Zero renders nothing. */}
                      {unread && (
                        <span
                          className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold tabular-nums"
                          style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
                        >
                          {thread.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
