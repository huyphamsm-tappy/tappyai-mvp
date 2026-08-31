'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Radio, AlertCircle, ScanSearch, ShieldAlert } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useGuardedActionProps } from '@/components/admin/layout/GuardedSurface'

// Controller Notifications — the BROADCAST form (V2.2 Phase C, requirement C-14).
//
// ⚠️ NOTHING HERE IS AUTHORIZATION. The parent renders this only when the PDP
// said the actor holds `notifications.send.broadcast`, and the route re-checks
// on every request with `requirePermission` + `isSameOrigin`. Deleting this file
// would not take anyone's permission away, and rendering it grants nothing.
//
// ── WHY THIS FORM IS SHAPED SO AWKWARDLY ─────────────────────────────────────
// A broadcast cannot be recalled. Every other Controller action has a correcting
// action; this one has an audience that has already been interrupted. So the
// flow is deliberately not one click:
//
//   compose → DRY RUN → read the resolved audience → type BROADCAST → send
//
// 🚨 THE SEND CONTROL DOES NOT EXIST BEFORE A DRY RUN. Not disabled — absent.
// There is no rendered path to a real send until the server has told this
// operator, for THIS message, how many people it resolved. That is C-14's
// "showing the resolved audience count from the dry run", and it is why the
// dry-run result and the message it belongs to live in ONE piece of state:
// they cannot drift apart if they cannot be updated separately.

/** What the route returns for `dryRun: true`. */
export interface BroadcastPlan {
  campaignId: string
  audienceSize: number
  candidates: number
  excluded: { banned: number; suspended: number; noProfile: number }
  chunkCount: number
  chunkSizes: number[]
  audienceFingerprint: string
}

/** What the route returns for a real send. */
export interface BroadcastResult {
  campaignId: string
  audienceSize: number
  alreadyNotified: number
  attempted: number
  chunkCount: number
  accepted: number
  failed: number
  gone: number
  unreachable: number
  errored: number
  status: string
  audienceFingerprint: string
}

/**
 * The exact phrase the operator must type. Owner decision U-2/U-3, 2026-09-01.
 *
 * 🔑 NOT TRANSLATED, DELIBERATELY. A confirmation phrase that changed with the
 * interface language would mean the guard is a different guard per locale, and
 * the one thing this control must be is identical for everybody. It is a
 * constant, not copy.
 */
export const CONFIRM_PHRASE = 'BROADCAST'

/**
 * How long a dry run stays valid. Owner decision U-4.
 *
 * The audience is a snapshot: people subscribe and unsubscribe, and accounts get
 * suspended. Five minutes is short enough that the number on screen still
 * describes the platform, and long enough to read it and think.
 */
export const DRY_RUN_TTL_MS = 5 * 60 * 1000

/** The message, and the plan the server produced FOR that exact message. */
interface Verified {
  plan: BroadcastPlan
  /** Signature of the message the dry run was run against. */
  signature: string
  expiresAt: number
}

const signatureOf = (title: string, body: string, link: string) =>
  JSON.stringify([title.trim(), body.trim(), link.trim()])

export function BroadcastForm() {
  const { t } = useTranslation()
  const guard = useGuardedActionProps()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')

  const [verified, setVerified] = useState<Verified | null>(null)
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<BroadcastResult | null>(null)
  const [busy, setBusy] = useState<'dry' | 'send' | null>(null)
  const [expiredNotice, setExpiredNotice] = useState(false)

  // A ref, not `busy`, is what actually prevents a double submit: two submits
  // dispatched before React re-renders both read the same stale state.
  const inFlight = useRef(false)

  const signature = signatureOf(title, body, link)

  /**
   * 🚨 INVALIDATION IS DERIVED, NOT REMEMBERED.
   *
   * The dry run is valid only while the message still matches the one it was run
   * against AND the clock has not passed its expiry. Both are computed at render
   * from the current values, so there is no `onChange` handler that could be
   * forgotten on a fourth field, and no stale flag to go out of sync. Editing
   * anything makes `signature` differ; time passing makes `expiresAt` pass.
   */
  const isFresh = verified !== null && verified.signature === signature && Date.now() < verified.expiresAt

  // Re-render when a fresh plan expires, so the send control disappears on its
  // own rather than waiting for the operator to touch something.
  useEffect(() => {
    if (!verified) return
    const ms = verified.expiresAt - Date.now()
    if (ms <= 0) return
    const timer = setTimeout(() => {
      setExpiredNotice(true)
      setVerified((v) => (v && v.expiresAt <= Date.now() ? { ...v } : v))
    }, ms)
    return () => clearTimeout(timer)
  }, [verified])

  /**
   * Editing clears the transient panels. It deliberately does NOT clear the
   * typed phrase.
   *
   * 🔑 IT USED TO, AND MUTATION TESTING SHOWED THAT LINE WAS UNOBSERVABLE.
   * Removing it changed no behaviour anywhere, because the phrase input only
   * exists while a dry run is fresh — an edit unmounts it — and `runDryRun`
   * clears the phrase when the next plan arrives. One owner for that rule,
   * tested; a second copy would be code no test can distinguish from its own
   * absence, which is how dead safety code accumulates and stops being read.
   */
  const editMessage = useCallback((set: (v: string) => void) => (v: string) => {
    set(v)
    setResult(null)
    setError('')
    setExpiredNotice(false)
  }, [])

  const linkInvalid = link.trim() !== '' && !(link.trim().startsWith('/') && !link.trim().startsWith('//'))
  const composed = title.trim().length > 0 && body.trim().length > 0 && !linkInvalid

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/notifications/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, json }
  }

  const runDryRun = async () => {
    if (inFlight.current || !composed || guard.disabled) return
    inFlight.current = true
    setBusy('dry')
    setError('')
    setResult(null)
    setExpiredNotice(false)
    try {
      const { ok, json } = await post({
        title: title.trim(),
        body: body.trim(),
        ...(link.trim() ? { link: link.trim() } : {}),
        dryRun: true,
      })
      if (!ok) {
        setError(json?.error?.message ?? t('admin.broadcast.error.generic'))
        return
      }
      setVerified({
        plan: json?.data as BroadcastPlan,
        // Captured from the values the request was BUILT from, so a keystroke
        // landing mid-flight cannot make a stale plan look fresh.
        signature: signatureOf(title, body, link),
        expiresAt: Date.now() + DRY_RUN_TTL_MS,
      })
      setPhrase('')
    } catch {
      setError(t('admin.broadcast.error.generic'))
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  const onSend = async (e: FormEvent) => {
    e.preventDefault()
    // Re-checked here as well as in the render: the control should not exist,
    // and if it somehow does, it still cannot fire.
    if (inFlight.current || !isFresh || !verified || phrase !== CONFIRM_PHRASE || guard.disabled) return
    inFlight.current = true
    setBusy('send')
    setError('')
    try {
      const { ok, json } = await post({
        title: title.trim(),
        body: body.trim(),
        ...(link.trim() ? { link: link.trim() } : {}),
        // 🚨 BOTH OF THESE ARE LOAD-BEARING.
        // `dryRun: false` is sent EXPLICITLY: the server defaults it to true, so
        // omitting it is the safe outcome, never a send.
        // `campaignId` is the one from THIS dry run, which makes the send
        // idempotent against the audience the operator actually reviewed.
        dryRun: false,
        campaignId: verified.plan.campaignId,
      })
      if (!ok) {
        setError(json?.error?.message ?? t('admin.broadcast.error.generic'))
        return
      }
      setResult(json?.data as BroadcastResult)
      // One confirmation authorises one send. The plan is spent.
      setVerified(null)
      setPhrase('')
    } catch {
      setError(t('admin.broadcast.error.generic'))
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  const field =
    'w-full rounded-admin-sm border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50'

  const plan = verified?.plan
  const phraseOk = phrase === CONFIRM_PHRASE

  return (
    <form onSubmit={onSend} noValidate className="space-y-6" data-testid="broadcast-form">
      <div className="flex items-start gap-3 rounded-admin-md border border-border bg-muted/40 p-4">
        <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ring" />
        <p className="text-xs leading-snug text-muted-foreground">{t('admin.broadcast.warning')}</p>
      </div>

      {/* ── Message ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="bc-message" className="space-y-3">
        <h2 id="bc-message" className="text-sm font-semibold text-foreground">
          {t('admin.broadcast.message')}
        </h2>
        <div>
          <label htmlFor="bc-title" className="mb-1 block text-xs text-muted-foreground">
            {t('admin.broadcast.titleLabel')}
          </label>
          <input
            id="bc-title"
            value={title}
            onChange={(e) => editMessage(setTitle)(e.target.value)}
            maxLength={120}
            className={field}
            disabled={busy !== null}
          />
        </div>
        <div>
          <label htmlFor="bc-body" className="mb-1 block text-xs text-muted-foreground">
            {t('admin.broadcast.bodyLabel')}
          </label>
          <textarea
            id="bc-body"
            value={body}
            onChange={(e) => editMessage(setBody)(e.target.value)}
            maxLength={500}
            rows={3}
            className={field}
            disabled={busy !== null}
          />
        </div>
        <div>
          <label htmlFor="bc-link" className="mb-1 block text-xs text-muted-foreground">
            {t('admin.broadcast.linkLabel')}
          </label>
          <input
            id="bc-link"
            value={link}
            onChange={(e) => editMessage(setLink)(e.target.value)}
            maxLength={500}
            className={field}
            aria-invalid={linkInvalid}
            disabled={busy !== null}
          />
          {linkInvalid ? (
            <p className="mt-1 text-xs text-red-400">{t('admin.broadcast.linkInvalid')}</p>
          ) : null}
        </div>
      </section>

      {/* ── Step 1: dry run ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={runDryRun}
        data-testid="broadcast-dry-run"
        disabled={!composed || busy !== null || guard.disabled}
        title={guard.title}
        aria-busy={busy === 'dry'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-admin-sm border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50 sm:w-auto"
      >
        {busy === 'dry' ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <ScanSearch aria-hidden className="h-4 w-4" />}
        {busy === 'dry' ? t('admin.broadcast.dryRunning') : t('admin.broadcast.dryRun')}
      </button>

      {expiredNotice && !isFresh ? (
        <p
          data-testid="broadcast-expired"
          className="rounded-admin-md border border-border bg-card px-4 py-3 text-xs text-muted-foreground"
        >
          {t('admin.broadcast.expired')}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="broadcast-error"
          className="flex items-start gap-2 rounded-admin-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {/* ── Step 2: the resolved audience, and only then the send control ── */}
      {isFresh && plan ? (
        <section
          aria-labelledby="bc-review"
          data-testid="broadcast-review"
          className="space-y-4 rounded-admin-md border border-border bg-card p-4"
        >
          <h2 id="bc-review" className="text-sm font-semibold text-foreground">
            {t('admin.broadcast.review')}
          </h2>

          {/* Counts and a hash. No name, no email, no endpoint — there is
              nothing here that identifies a recipient. */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['admin.broadcast.audience', String(plan.audienceSize), 'broadcast-audience-size'],
              ['admin.broadcast.chunks', String(plan.chunkCount), 'broadcast-chunk-count'],
              ['admin.broadcast.excluded', String(plan.excluded.banned + plan.excluded.suspended + plan.excluded.noProfile), 'broadcast-excluded'],
              ['admin.broadcast.fingerprint', plan.audienceFingerprint, 'broadcast-fingerprint'],
            ].map(([key, value, testid]) => (
              <div key={key}>
                <dt className="text-xs text-muted-foreground">{t(key)}</dt>
                <dd data-testid={testid} className="mt-0.5 break-all text-sm font-semibold text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-xs text-muted-foreground">
            {t('admin.broadcast.excludedBreakdown')
              .replace('{banned}', String(plan.excluded.banned))
              .replace('{suspended}', String(plan.excluded.suspended))
              .replace('{noProfile}', String(plan.excluded.noProfile))}
          </p>

          {plan.audienceSize === 0 ? (
            <p data-testid="broadcast-empty-audience" className="text-xs text-muted-foreground">
              {t('admin.broadcast.emptyAudience')}
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="bc-phrase" className="mb-1 block text-xs text-muted-foreground">
                  {/* The phrase is interpolated rather than translated, so both
                      languages ask for the same characters. */}
                  {t('admin.broadcast.confirmLabel').replace('{phrase}', CONFIRM_PHRASE)}
                </label>
                <input
                  id="bc-phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  data-testid="broadcast-phrase"
                  autoComplete="off"
                  spellCheck={false}
                  className={field}
                  disabled={busy !== null}
                />
              </div>

              <button
                type="submit"
                data-testid="broadcast-send"
                disabled={!phraseOk || busy !== null || guard.disabled}
                title={guard.title}
                aria-busy={busy === 'send'}
                className="inline-flex w-full items-center justify-center gap-2 rounded-admin-sm border border-border bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition disabled:opacity-40 sm:w-auto"
              >
                {busy === 'send' ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Radio aria-hidden className="h-4 w-4" />}
                {busy === 'send'
                  ? t('admin.broadcast.sending')
                  : t('admin.broadcast.sendNow').replace('{count}', String(plan.audienceSize))}
              </button>
            </>
          )}
        </section>
      ) : null}

      {/* ── Result ──────────────────────────────────────────────────────── */}
      {result ? (
        <section
          aria-labelledby="bc-result"
          data-testid="broadcast-result"
          className="rounded-admin-md border border-border bg-card p-4"
        >
          <h2 id="bc-result" className="mb-2 text-sm font-semibold text-foreground">
            {t('admin.broadcast.result')}
          </h2>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['admin.broadcast.accepted', result.accepted],
              ['admin.broadcast.failed', result.failed],
              ['admin.broadcast.gone', result.gone],
              ['admin.broadcast.unreachable', result.unreachable],
            ].map(([key, value]) => (
              <div key={String(key)}>
                <dt className="text-xs text-muted-foreground">{t(String(key))}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-foreground">{String(value)}</dd>
              </div>
            ))}
          </dl>
          {/* U-5: the campaign id is SHOWN so an operator can quote it when
              asking for a resume, and there is deliberately no input to type one
              back in. Resume stays a backend capability. */}
          <p className="mt-3 break-all text-xs text-muted-foreground" data-testid="broadcast-campaign-id">
            {t('admin.broadcast.campaignId')}: {result.campaignId}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('admin.broadcast.result.note')}</p>
        </section>
      ) : null}
    </form>
  )
}
