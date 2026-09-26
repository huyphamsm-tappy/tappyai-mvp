'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { linkifySafe } from './linkify'
import Image from '@/components/media/SafeImage'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { ArrowLeft, Send, Loader2, Users } from 'lucide-react'
import { threadTitle, type ChatMessage, type ChatThreadSummary } from '@/lib/messaging/types'
import { useMessages } from './MessagesProvider'

export default function ThreadView({
  thread,
  onBack,
}: {
  thread: ChatThreadSummary
  onBack: () => void
}) {
  const { t } = useTranslation()
  const { meId, markThreadRead, subscribeToIncoming, refetch } = useMessages()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const title = threadTitle(
    thread,
    meId,
    thread.kind === 'group' ? t('v3.msg.unnamedGroup') : t('v3.msg.unknownUser'),
  )
  const other = thread.participants.find(p => p.userId !== meId)

  // History, then the read cursor. Opening a thread IS reading it, so the mark
  // is unconditional rather than tied to scrolling to the bottom — Phase 1 has
  // no per-message receipts to be precise about.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setMessages([])
    fetch(`/api/messaging/threads/${thread.id}/messages`)
      .then(async r => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then(d => { if (!cancelled) setMessages(d.messages ?? []) })
      .catch(() => { if (!cancelled) setError(t('v3.msg.error')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [thread.id, t])

  useEffect(() => {
    void markThreadRead(thread.id)
  }, [thread.id, markThreadRead])

  /**
   * 🔑 REAL REALTIME. This appends rows the DATABASE published — the provider
   * holds one `postgres_changes` subscription and hands each INSERT here. There
   * is no polling and no `setInterval` anywhere in this feature.
   *
   * The id check is not paranoia: the sender also receives the echo of their own
   * INSERT, and without it every message you send would appear twice.
   */
  useEffect(() => {
    return subscribeToIncoming(message => {
      if (message.threadId !== thread.id) return
      setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]))
      if (message.senderId !== meId) void markThreadRead(thread.id)
    })
  }, [thread.id, meId, subscribeToIncoming, markThreadRead])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = useCallback(async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      const r = await fetch(`/api/messaging/threads/${thread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      // The server's row, not a locally minted one: it carries the real id and
      // the real `created_at`, so the Realtime echo dedupes against it cleanly.
      setMessages(prev => (prev.some(m => m.id === d.message.id) ? prev : [...prev, d.message]))
      setDraft('')
      void refetch()
    } catch {
      setError(t('v3.msg.sendError'))
    } finally {
      setSending(false)
    }
  }, [draft, sending, thread.id, refetch, t])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Header ── */}
      <div
        className="flex flex-shrink-0 items-center gap-3 border-b px-3 py-3"
        style={{ borderColor: 'var(--v3-border)' }}
      >
        {/* Mobile back. On desktop the list is beside this pane, so there is
            nothing to go back to. */}
        <button
          type="button"
          onClick={onBack}
          aria-label={t('v3.msg.back')}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg lg:hidden"
          style={{ color: 'var(--v3-fg-secondary)' }}
        >
          <ArrowLeft size={20} />
        </button>

        {thread.kind === 'group' || !other?.avatarUrl ? (
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
            style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
            aria-hidden="true"
          >
            {thread.kind === 'group' ? <Users size={16} /> : (title.trim()[0]?.toUpperCase() ?? '?')}
          </span>
        ) : (
          <Image src={other.avatarUrl} alt="" width={36} height={36} className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
        )}

        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{title}</p>
          {/* 🚨 NO "Online" AND NO "Typing…". Presence and typing indicators are
              Phase 2 and no infrastructure for either exists, so nothing here
              claims to know. A group shows its real member count instead. */}
          {thread.kind === 'group' && (
            <p className="text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('v3.msg.groupMembers', { n: String(thread.participants.length) })}
            </p>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--v3-accent)' }} />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('v3.msg.noMessages')}
          </p>
        ) : (
          messages.map(message => {
            const mine = message.senderId === meId
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug"
                  style={mine
                    ? { background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }
                    : { background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg)' }}
                >
                  {/* Safe https links only — see linkify.tsx. Everything else stays text. */}
                  <span className="whitespace-pre-wrap break-words">{linkifySafe(message.body)}</span>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p role="alert" className="px-3 pb-2 text-[12px]" style={{ color: 'var(--v3-rose)' }}>{error}</p>
      )}

      {/* ── Composer ──
          `sticky bottom-0` with the surface colour behind it: on mobile the
          on-screen keyboard shrinks the visual viewport, and a statically
          positioned composer ends up underneath it. */}
      <div
        className="sticky bottom-0 flex flex-shrink-0 items-end gap-2 border-t px-3 py-3"
        style={{ borderColor: 'var(--v3-border)', background: 'var(--v3-panel)' }}
      >
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            // Enter sends, Shift+Enter breaks the line — the convention every
            // messenger this sits beside already uses.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
          }}
          rows={1}
          maxLength={4000}
          placeholder={t('v3.msg.composer')}
          aria-label={t('v3.msg.composer')}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border px-3.5 py-3 text-[13.5px] outline-none transition-colors focus:border-[var(--v3-accent)]"
          style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg)' }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!draft.trim() || sending}
          aria-label={t('v3.msg.send')}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  )
}
