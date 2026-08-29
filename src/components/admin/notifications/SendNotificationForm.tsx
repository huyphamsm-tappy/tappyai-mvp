'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Loader2, Send, Search, X, AlertCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Controller Notifications — the targeted send form (Phase B).
//
// ⚠️ NOTHING HERE IS AUTHORIZATION. The parent renders this only when the PDP
// said the actor holds `notifications.send.user`, but the route re-checks on
// every request. Removing this component would not grant anybody anything, and
// rendering it does not either.
//
// The recipient picker reads `/api/admin/users` — the ADMIN surface, gated on
// `users.list.read` — never `/api/users/search`, which is a consumer route that
// hands follower counts to any signed-in user. `profiles` carries no `email`
// column at all, so there is no address to leak here even by accident.

export interface Recipient {
  id: string
  name: string
}

export interface SendOutcome {
  recipients: number
  accepted: number
  failed: number
  gone: number
  unreachable: number
  errored: number
}

export function SendNotificationForm() {
  const { t } = useTranslation()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Recipient[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Recipient[]>([])

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')

  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState<SendOutcome | null>(null)
  const [busy, setBusy] = useState(false)

  // A REF, not the `busy` state, is what actually prevents a double submit.
  // Two submits dispatched before React re-renders both read the same stale
  // `busy === false`; the ref is written synchronously inside the first. The
  // server's duplicate-suppression window is the second line of defence, not
  // the first — this is the client in-flight guard.
  const inFlight = useRef(false)

  const search = async () => {
    const q = query.trim()
    if (q.length < 2) return
    setSearching(true)
    try {
      const r = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=10`, { cache: 'no-store' })
      const j = await r.json().catch(() => null)
      const rows: Array<{ id: string; full_name?: string | null }> = j?.data?.users ?? j?.data ?? []
      setResults(
        rows
          .filter((u) => u?.id)
          .map((u) => ({ id: u.id, name: u.full_name?.trim() || t('admin.notifications.unnamedUser') }))
      )
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const add = (r: Recipient) => {
    setOutcome(null)
    // De-duplicated here as well as on the server: selecting the same person
    // twice must not mean two messages.
    setSelected((prev) => (prev.some((p) => p.id === r.id) ? prev : [...prev, r]))
  }
  const remove = (id: string) => setSelected((prev) => prev.filter((p) => p.id !== id))

  const linkInvalid = link.trim() !== '' && !(link.trim().startsWith('/') && !link.trim().startsWith('//'))
  const canSubmit =
    selected.length > 0 && title.trim().length > 0 && body.trim().length > 0 && !linkInvalid && !busy

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current || !canSubmit) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setOutcome(null)

    try {
      const res = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: selected.map((s) => s.id),
          title: title.trim(),
          body: body.trim(),
          ...(link.trim() ? { link: link.trim() } : {}),
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error?.message ?? t('admin.notifications.error.generic'))
        return
      }
      setOutcome(json?.data as SendOutcome)
    } catch {
      setError(t('admin.notifications.error.generic'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const field =
    'w-full rounded-admin-sm border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50'

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {/* ── Recipients ─────────────────────────────────────────────────── */}
      <section aria-labelledby="notif-recipients">
        <h2 id="notif-recipients" className="mb-2 text-sm font-semibold text-foreground">
          {t('admin.notifications.recipients')}
        </h2>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter searches; it must not submit the send form.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void search()
                }
              }}
              placeholder={t('admin.notifications.searchPlaceholder')}
              aria-label={t('admin.notifications.searchPlaceholder')}
              className={`${field} pl-9`}
            />
          </div>
          <button
            type="button"
            onClick={() => void search()}
            disabled={query.trim().length < 2 || searching}
            className="shrink-0 rounded-admin-sm border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
          >
            {searching ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : t('admin.notifications.search')}
          </button>
        </div>

        {results.length > 0 && (
          <ul className="mt-2 space-y-1">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => add(r)}
                  className="flex w-full items-center justify-between rounded-admin-sm border border-border bg-card px-3 py-2 text-left text-sm text-foreground hover:border-ring hover:bg-muted"
                >
                  {/* Display name only. No email, no avatar, no follower counts —
                      the minimum needed to pick the right person. */}
                  <span className="truncate">{r.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {t('admin.notifications.add')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" data-testid="selected-recipients">
            {selected.map((s) => (
              <li key={s.id}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs text-foreground">
                  {s.name}
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    aria-label={`${t('admin.notifications.remove')} ${s.name}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X aria-hidden className="h-3 w-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Message ────────────────────────────────────────────────────── */}
      <section aria-labelledby="notif-message" className="space-y-3">
        <h2 id="notif-message" className="text-sm font-semibold text-foreground">
          {t('admin.notifications.message')}
        </h2>

        <div>
          <label htmlFor="notif-title" className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('admin.notifications.titleLabel')}
          </label>
          <input
            id="notif-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            disabled={busy}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="notif-body" className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('admin.notifications.bodyLabel')}
          </label>
          <textarea
            id="notif-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={3}
            disabled={busy}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="notif-link" className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('admin.notifications.linkLabel')}
          </label>
          <input
            id="notif-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/explore"
            disabled={busy}
            aria-invalid={linkInvalid}
            className={field}
          />
          {linkInvalid && (
            <p className="mt-1 text-xs text-red-400">{t('admin.notifications.linkInvalid')}</p>
          )}
        </div>
      </section>

      {/* ── Preview ────────────────────────────────────────────────────── */}
      {(title.trim() || body.trim()) && (
        <section aria-labelledby="notif-preview">
          <h2 id="notif-preview" className="mb-2 text-sm font-semibold text-foreground">
            {t('admin.notifications.preview')}
          </h2>
          <div className="rounded-admin-md border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">{title.trim() || '—'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{body.trim() || '—'}</p>
            {link.trim() && !linkInvalid && (
              <p className="mt-2 text-xs text-ring">{link.trim()}</p>
            )}
          </div>
          {/* Said plainly rather than implied: Android renders data-only fields
              through the app's own service and the browser renders web push its
              own way, so no preview here can be device-identical. */}
          <p className="mt-1.5 text-xs text-muted-foreground">{t('admin.notifications.previewNote')}</p>
        </section>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-admin-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {/* ── Result — never the word "delivered" ────────────────────────── */}
      {outcome && (
        <section aria-labelledby="notif-result" data-testid="send-outcome">
          <h2 id="notif-result" className="mb-2 text-sm font-semibold text-foreground">
            {t('admin.notifications.result')}
          </h2>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ['admin.notifications.result.recipients', outcome.recipients],
              ['admin.notifications.result.accepted', outcome.accepted],
              ['admin.notifications.result.failed', outcome.failed],
              ['admin.notifications.result.gone', outcome.gone],
              ['admin.notifications.result.unreachable', outcome.unreachable],
              ['admin.notifications.result.errored', outcome.errored],
            ].map(([key, value]) => (
              <div key={key as string} className="rounded-admin-sm border border-border bg-card px-3 py-2">
                <dt className="text-xs text-muted-foreground">{t(key as string)}</dt>
                <dd className="text-lg font-semibold text-foreground">{value as number}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{t('admin.notifications.result.note')}</p>
        </section>
      )}

      <button
        type="submit"
        data-testid="notification-send"
        disabled={!canSubmit}
        aria-busy={busy}
        className="flex items-center justify-center gap-2 rounded-admin-sm bg-ring px-5 py-2.5 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
        {busy
          ? t('admin.notifications.sending')
          : `${t('admin.notifications.send')} (${selected.length})`}
      </button>
    </form>
  )
}
