'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { linkifySafe } from './linkify'
import Image from '@/components/media/SafeImage'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { ArrowLeft, Send, Loader2, Users, ImagePlus, X } from 'lucide-react'
import { CHAT_MEDIA_MAX_BYTES, CHAT_MEDIA_MIME_TYPES } from '@/lib/messaging/mediaLimits'
import { threadTitle, type ChatMessage, type ChatThreadSummary } from '@/lib/messaging/types'
import { useMessages } from './MessagesProvider'
import { SafetyMenu } from '@/components/safety/SafetyMenu'
import { newClientId } from '@/lib/messaging/clientId'
import { bubbleMetas } from '@/lib/messaging/bubbles'

export default function ThreadView({
  thread,
  onBack,
}: {
  thread: ChatThreadSummary
  onBack: () => void
}) {
  const { t } = useTranslation()
  // `t` is a NEW function on every render. Used as an effect dependency it re-ran the history fetch (and cleared the list) after every
  // render of this component; the effect reads it through a ref so it depends on the thread and the retry key only.
  const tRef = useRef(t)
  tRef.current = t
  const { meId, markThreadRead, subscribeToIncoming, refetch } = useMessages()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // The first page of history could not be read (distinct from a failed SEND, which keeps the draft).
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderFailed, setOlderFailed] = useState(false)
  // Prepending older rows must neither jump to the bottom nor lose the reader's place.
  const keepPosition = useRef<{ top: number; height: number } | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // The id of the send attempt in flight or just failed, tied to the exact text it was made for: a retry of the SAME text repeats it (the server
  // then returns the stored row instead of a second copy); other text, or the next send after a success, gets a new one.
  const attempt = useRef<{ id: string; key: string } | null>(null)
  // The picture chosen for the next message: uploaded AT ONCE (the media route), kept as {path,size} until the message is sent or the picture is removed. `previewUrl` is
  // a local object URL of the chosen file (what the person sees in the composer), revoked when it is no longer needed.
  const [photo, setPhoto] = useState<{ path: string; width: number | null; height: number | null; previewUrl: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const dropPhoto = useCallback(() => {
    setPhoto(prev => { if (prev) URL.revokeObjectURL(prev.previewUrl); return null })
  }, [setPhoto])
  useEffect(() => () => { setPhoto(prev => { if (prev) URL.revokeObjectURL(prev.previewUrl); return null }) }, [thread.id])

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const title = threadTitle(
    thread,
    meId,
    thread.kind === 'group' ? t('v3.msg.unnamedGroup') : t('v3.msg.unknownUser'),
  )
  const other = thread.participants.find(p => p.userId !== meId)

  // Who said it and when: a name above the first bubble of someone else's run (group threads only) and a time under the last bubble of a run.
  const metas = useMemo(() => bubbleMetas(messages, {
    meId,
    group: thread.kind === 'group',
    nameOf: id => thread.participants.find(p => p.userId === id)?.fullName?.trim() || t('v3.msg.unknownUser'),
  }), [messages, meId, thread.kind, thread.participants, t])

  // History, then the read cursor. Opening a thread IS reading it, so the mark is not tied to scrolling to the bottom (there are no per-message
  // receipts) — but it follows a SUCCESSFUL first page (D1), never the mount.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setLoadFailed(false)
    setOlderFailed(false)
    setHasMore(false)
    setMessages([])
    fetch(`/api/messaging/threads/${thread.id}/messages`)
      .then(async r => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then(d => {
        if (cancelled) return
        setMessages(d.messages ?? [])
        setHasMore(d.hasMore === true)
        // D1 (DR-4): the thread is marked read only now that its first page has been loaded and shown. A pending or failed load marks nothing:
        // the person has not seen the messages. A retry that succeeds comes through here too.
        void markThreadRead(thread.id)
      })
      .catch(() => { if (!cancelled) { setError(tRef.current('v3.msg.error')); setLoadFailed(true) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // markThreadRead is read at call time; it must not restart the history fetch when the provider re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, reloadKey])

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
      if (message.hasMedia && !message.media) {
        // A picture arrives through realtime WITHOUT a link (a link is a short-lived signed one made by the server on read): read the newest page again and merge it by id, so the
        // picture appears with its link. Nothing is appended from the bare row (it would be an empty bubble until the link comes).
        void fetch(`/api/messaging/threads/${thread.id}/messages`)
          .then(r => (r.ok ? r.json() : null))
          .then((d: { messages?: ChatMessage[] } | null) => {
            if (!d?.messages) return
            const fresh = d.messages
            setMessages(prev => {
              const byId = new Map(prev.map(m => [m.id, m]))
              for (const m of fresh) byId.set(m.id, m)
              return [...byId.values()].sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1))
            })
          })
          .catch(() => { /* the next reload shows it */ })
      } else {
        setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]))
      }
      if (message.senderId !== meId) void markThreadRead(thread.id)
    })
  }, [thread.id, meId, subscribeToIncoming, markThreadRead])

  useEffect(() => {
    const keep = keepPosition.current
    if (keep && scrollRef.current) {
      // older rows were prepended: keep the message the reader was looking at where it was
      keepPosition.current = null
      scrollRef.current.scrollTop = keep.top + (scrollRef.current.scrollHeight - keep.height)
      return
    }
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  /** One older page, cursor = the oldest message already shown. Ids already on screen are never added twice. */
  const loadOlder = useCallback(async () => {
    const oldest = messages[0]
    if (!oldest || loadingOlder) return
    setLoadingOlder(true)
    setOlderFailed(false)
    try {
      // the cursor is the exact oldest row (time AND id): rows that share its timestamp are neither skipped nor repeated
      const r = await fetch(`/api/messaging/threads/${thread.id}/messages?before=${encodeURIComponent(oldest.createdAt)}&beforeId=${encodeURIComponent(oldest.id)}`)
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      const older: ChatMessage[] = d.messages ?? []
      if (scrollRef.current) keepPosition.current = { top: scrollRef.current.scrollTop, height: scrollRef.current.scrollHeight }
      setMessages(prev => {
        const seen = new Set(prev.map(m => m.id))
        const fresh = older.filter(m => !seen.has(m.id))
        if (fresh.length === 0) keepPosition.current = null
        return fresh.length ? [...fresh, ...prev] : prev
      })
      setHasMore(d.hasMore === true)
    } catch {
      setOlderFailed(true)
    } finally {
      setLoadingOlder(false)
    }
  }, [messages, loadingOlder, thread.id])

  /** Pick a picture: pre-check the type and size (the server checks again), upload at once, keep the path for the message. */
  const pickPhoto = useCallback(async (file: File | undefined) => {
    if (!file || uploading) return
    setError(null)
    if (!(CHAT_MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) { setError(t('v3.msg.imageType')); return }
    if (file.size > CHAT_MEDIA_MAX_BYTES) { setError(t('v3.msg.imageTooLarge')); return }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch(`/api/messaging/threads/${thread.id}/media`, { method: 'POST', body: form })
      if (!r.ok) {
        const code = await r.json().then((j: { error?: string }) => j?.error).catch(() => undefined)
        setError(t(code === 'bad_image_type' ? 'v3.msg.imageType' : code === 'image_too_large' ? 'v3.msg.imageTooLarge' : 'v3.msg.uploadError'))
        return
      }
      const d = await r.json() as { media: { path: string; width: number | null; height: number | null } }
      setPhoto(prev => { if (prev) URL.revokeObjectURL(prev.previewUrl); return { path: d.media.path, width: d.media.width, height: d.media.height, previewUrl: URL.createObjectURL(file) } })
    } catch {
      setError(t('v3.msg.uploadError'))
    } finally {
      setUploading(false)
    }
  }, [uploading, thread.id, t])

  const send = useCallback(async () => {
    const body = draft.trim()
    if ((!body && !photo) || sending || uploading) return
    setSending(true)
    setError(null)
    // the attempt is tied to the exact text AND picture it was made for (see `attempt`)
    const key = `${body}\u0000${photo?.path ?? ''}`
    if (!attempt.current || attempt.current.key !== key) attempt.current = { id: newClientId(), key }
    try {
      const r = await fetch(`/api/messaging/threads/${thread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, ...(photo ? { media: { path: photo.path, width: photo.width, height: photo.height } } : {}), clientId: attempt.current.id }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      attempt.current = null // delivered: the next message is a new send, even with the same text
      // The server's row, not a locally minted one: it carries the real id and
      // the real `created_at`, so the Realtime echo dedupes against it cleanly.
      setMessages(prev => (prev.some(m => m.id === d.message.id) ? prev : [...prev, d.message]))
      setDraft('')
      dropPhoto()
      void refetch()
    } catch (e) {
      // NEUTRAL by design: the server answers "not a participant" and "blocked" with the same 404 (no oracle for who blocked whom), so the text
      // says only that this conversation cannot be written to. 429: the sender is going too fast. Anything else keeps the generic text.
      const status = e instanceof Error ? e.message : ''
      setError(t(status === '404' ? 'v3.msg.cannotSend' : status === '429' ? 'v3.msg.sendTooFast' : 'v3.msg.sendError'))
    } finally {
      setSending(false)
    }
  }, [draft, photo, sending, uploading, dropPhoto, thread.id, refetch, t])

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
        {/* WP-06 — report / block the other person of a 1:1 thread. A block closes the thread server-side (chat_thread_blocked, 20261018); leaving the view is the client's part. */}
        {thread.kind !== 'group' && other && (
          <SafetyMenu className="ml-auto" report={{ target: 'user', id: other.userId }} user={{ id: other.userId, name: title }} onBlockedChange={(b) => { if (b) onBack() }} />
        )}
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--v3-accent)' }} />
          </div>
        ) : loadFailed && messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              className="min-h-[38px] rounded-xl px-4 text-[13px] font-semibold"
              style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
            >
              {t('v3.msg.retry')}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('v3.msg.noMessages')}
          </p>
        ) : (
          <>
          {hasMore && (
            <div className="flex flex-col items-center gap-1 pb-2">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
                className="min-h-[34px] rounded-xl px-3 text-[12.5px] font-semibold disabled:opacity-50"
                style={{ color: 'var(--v3-accent)' }}
              >
                {loadingOlder ? <Loader2 size={16} className="animate-spin" /> : t('v3.msg.loadOlder')}
              </button>
              {olderFailed && <p role="alert" className="text-[12px]" style={{ color: 'var(--v3-rose)' }}>{t('v3.msg.error')}</p>}
            </div>
          )}
          {messages.map((message, i) => {
            const mine = message.senderId === meId
            const meta = metas[i]
            return (
              <div key={message.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {meta?.showName && (
                  <span data-testid="bubble-name" className="mb-0.5 px-1 text-[11.5px] font-semibold" style={{ color: 'var(--v3-fg-secondary)' }}>
                    {meta.name}
                  </span>
                )}
                <div className={`flex max-w-full items-center gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug"
                    style={mine
                      ? { background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }
                      : { background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg)' }}
                  >
                    {message.media && (
                      // The picture, from the SHORT-LIVED signed link the server made for this read. Only an https link is ever put in the page: a missing, expired-and-unrefreshed or
                      // odd value shows a placeholder, never a broken image. The size is reserved (no layout jump). It opens in a new tab without handing over the opener.
                      message.media.url && /^https:\/\//i.test(message.media.url) ? (
                        <div data-testid="message-photo" className={message.body ? 'mb-1.5' : ''}>
                          <a href={message.media.url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link, not a build-time asset */}
                            <img
                              src={message.media.url}
                              alt={t('v3.msg.photoAlt')}
                              loading="lazy"
                              {...(message.media.width && message.media.height ? { width: message.media.width, height: message.media.height } : {})}
                              className="h-auto max-h-80 w-full max-w-[320px] rounded-xl object-cover"
                            />
                          </a>
                        </div>
                      ) : (
                        <div data-testid="message-photo-missing" className={`text-[12.5px] italic ${message.body ? 'mb-1.5' : ''}`}>{t('v3.msg.photoUnavailable')}</div>
                      )
                    )}
                    {/* Safe https links only — see linkify.tsx. Everything else stays text. A picture with no text has no (empty) text line. */}
                    {message.body && <span className="whitespace-pre-wrap break-words">{linkifySafe(message.body)}</span>}
                  </div>
                  {/* Report THIS message (only someone else's; the menu draws nothing while reports are off). No block here: blocking the person is the header's job. */}
                  {!mine && <SafetyMenu report={{ target: 'message', id: message.id }} />}
                </div>
                {meta?.showTime && meta.time && (
                  <span data-testid="bubble-time" className="mt-0.5 px-1 text-[10.5px] tabular-nums" style={{ color: 'var(--v3-fg-muted)' }}>
                    {meta.time}
                  </span>
                )}
              </div>
            )
          })}
          </>
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
        className="sticky bottom-0 flex flex-shrink-0 flex-col gap-2 border-t px-3 py-3"
        style={{ borderColor: 'var(--v3-border)', background: 'var(--v3-panel)' }}
      >
        {(photo || uploading) && (
          <div className="flex items-center gap-2">
            {photo && (
              <div data-testid="composer-photo" className="relative h-16 w-16 overflow-hidden rounded-xl" style={{ background: 'var(--v3-panel-elevated)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL of the chosen file */}
                <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={dropPhoto}
                  aria-label={t('v3.msg.removePhoto')}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {uploading && (
              <span data-testid="composer-uploading" className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>
                <Loader2 size={14} className="animate-spin" />{t('v3.msg.uploading')}
              </span>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={CHAT_MEDIA_MIME_TYPES.join(',')}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void pickPhoto(f) }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading || sending}
          aria-label={t('v3.msg.attach')}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
        >
          <ImagePlus size={18} />
        </button>
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
          disabled={(!draft.trim() && !photo) || sending || uploading}
          aria-label={t('v3.msg.send')}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
        </div>
      </div>
    </div>
  )
}
