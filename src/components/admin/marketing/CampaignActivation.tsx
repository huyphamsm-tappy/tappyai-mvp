'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { SkipCounts } from '@/lib/marketing/governance'
import { CONFIRM_PHRASE } from '@/lib/marketing/activationGate'

// ─── V2.2-2 — dry run, then a typed confirmation (M-18, the C-14 pattern) ────
//
// 🚨 THE SEND CONTROL DOES NOT EXIST BEFORE A DRY RUN RETURNS. Absent, not
// disabled — a disabled button is a promise that something is nearly possible,
// and it survives a stale plan. Here there is nothing to click until the server
// has actually resolved an audience for THIS message.
//
// 🚨 EDITING THE MESSAGE, OR FIVE MINUTES PASSING, INVALIDATES THE DRY RUN.
// The plan describes an audience for a specific text at a specific moment;
// quiet hours turn on, caps expire, people unsubscribe. Sending against a stale
// plan means the operator confirmed something other than what happens.
//
// 🔑 NONE OF THIS IS THE GUARD. The server re-authorizes, re-resolves the
// audience, re-checks the floor and re-checks the activation gate on the real
// request. This component cannot make a send legal; it can only make an
// accidental one harder.

// The confirmation phrase is IMPORTED from the gate (see the import above), not
// re-declared here. Two string literals in two files are two guards that can
// drift; the server checks the value it holds, and this must be the same one.
// Re-exported so tests can assert against the single definition.
export { CONFIRM_PHRASE }

/** How long a dry run stays valid. Same five minutes C-14 uses. */
export const DRY_RUN_TTL_MS = 5 * 60 * 1000

export interface DryRunPlan {
  audienceSize: number
  candidates: number
  skipped: SkipCounts
  chunkCount: number
  audienceFingerprint: string
}

const SKIP_ORDER: (keyof SkipCounts)[] = [
  'consent',
  'unsubscribed',
  'frequency_24h',
  'frequency_7d',
  'quiet_hours',
  'ineligible',
]

interface Fresh {
  plan: DryRunPlan
  /** The exact message this plan was resolved for. */
  signature: string
  expiresAt: number
}

export function CampaignActivation({
  campaignId,
  signature,
}: {
  campaignId: string
  /** Title + body + link. Changing it must invalidate the plan. */
  signature: string
}) {
  const { t } = useTranslation()
  const [result, setResult] = useState<Fresh | null>(null)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [belowFloor, setBelowFloor] = useState(false)

  // Derived at RENDER, never stored as a boolean. A stored flag would be
  // computed once and stay true after the message changed underneath it.
  const isFresh =
    result !== null && result.signature === signature && Date.now() < result.expiresAt

  const call = async (body: Record<string, unknown>) => {
    return fetch(`/api/admin/marketing/campaigns/${campaignId}/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  const dryRun = async () => {
    setBusy(true)
    setError(null)
    setBelowFloor(false)
    setResult(null)
    setPhrase('')
    try {
      const res = await call({ dryRun: true })
      if (!res.ok) {
        // 403 here is the floor refusal, which carries no number by design.
        if (res.status === 403) setBelowFloor(true)
        else setError(t('admin.marketing.campaigns.saveError'))
        return
      }
      const { data } = await res.json()
      setResult({
        plan: data as DryRunPlan,
        signature,
        expiresAt: Date.now() + DRY_RUN_TTL_MS,
      })
    } catch {
      setError(t('admin.marketing.campaigns.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      // The flag is sent EXPLICITLY. Relying on omission would mean a client
      // that forgot a field sent a campaign to everyone who consented.
      const res = await call({ dryRun: false, confirm: phrase })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = body?.error?.message ?? body?.error?.code ?? String(res.status)
        setError(`${t('admin.marketing.campaigns.sendRefused')} ${message}`)
        return
      }
      setResult(null)
      setPhrase('')
    } catch {
      setError(t('admin.marketing.campaigns.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
      <button
        onClick={dryRun}
        disabled={busy}
        className="rounded-lg border border-indigo-300 dark:border-indigo-800 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-300 disabled:opacity-50"
      >
        {t('admin.marketing.campaigns.dryRun')}
      </button>

      {belowFloor && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
          {t('admin.marketing.campaigns.belowFloor')}
        </p>
      )}

      {result !== null && !isFresh && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t('admin.marketing.campaigns.dryRunStale')}
        </p>
      )}

      {isFresh && result && (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
            {t('admin.marketing.campaigns.dryRunHeading')}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-content-secondary">{t('admin.marketing.campaigns.audienceSize')}</dt>
            <dd className="text-gray-900 dark:text-white">{result.plan.audienceSize}</dd>
            <dt className="text-content-secondary">{t('admin.marketing.campaigns.candidates')}</dt>
            <dd className="text-gray-900 dark:text-white">{result.plan.candidates}</dd>
            <dt className="text-content-secondary">{t('admin.marketing.campaigns.chunks')}</dt>
            <dd className="text-gray-900 dark:text-white">{result.plan.chunkCount}</dd>
            <dt className="text-content-secondary">{t('admin.marketing.campaigns.fingerprint')}</dt>
            <dd className="font-mono text-gray-900 dark:text-white">
              {result.plan.audienceFingerprint}
            </dd>
          </dl>

          {/*
            Counts only, never a list (M-9b, M-31a). "17 skipped by quiet hours"
            is the whole of what an operator may see; a reason attached to
            identities would be exactly the per-user surface the contract
            forbids.
          */}
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 pt-1">
            {t('admin.marketing.campaigns.skippedHeading')}
          </p>
          <ul className="text-xs space-y-0.5">
            {SKIP_ORDER.filter((k) => result.plan.skipped[k] > 0).map((k) => (
              <li key={k} className="flex justify-between">
                <span className="text-content-secondary">
                  {t(`admin.marketing.campaigns.skip.${k}`)}
                </span>
                <span className="text-gray-900 dark:text-white">{result.plan.skipped[k]}</span>
              </li>
            ))}
          </ul>

          <label className="block pt-1">
            <span className="text-xs text-content-secondary">
              {t('admin.marketing.campaigns.confirmLabel')}
            </span>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1.5 text-sm font-mono"
              aria-label={t('admin.marketing.campaigns.confirmLabel')}
            />
          </label>

          {/*
            🚨 ABSENT until the phrase matches EXACTLY — not disabled. There is
            nothing to click, so there is nothing to click by accident.
          */}
          {phrase === CONFIRM_PHRASE && (
            <button
              onClick={send}
              disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {t('admin.marketing.campaigns.send')}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
