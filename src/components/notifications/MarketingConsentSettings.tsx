'use client'

import { useCallback, useEffect, useState } from 'react'
import { Megaphone, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// ─── V2.2-2 — the person's own marketing consent ─────────────────────────────
//
// Contract: M-1 (absence = opted out) · M-3 (per channel) · M-10 (global
// unsubscribe honored immediately) · M-33 (EN/VI).
//
// 🔑 DELIBERATELY SEPARATE FROM THE PUSH TOGGLE ABOVE IT. Turning push on is a
// DEVICE PERMISSION; opting in to marketing is a decision about what may be
// sent. One control meaning both would make granting a browser permission
// double as marketing consent, which is exactly what opt-in is supposed to
// prevent.
//
// 🚨 THIS COMPONENT IS NOT THE GUARD. Every rule it describes — the 1/day and
// 4/week caps, the 22:00–07:00 quiet window, the unsubscribe override — is
// enforced server-side at dispatch. What is rendered here is a REPORT of state
// the server owns, and hiding a control would not stop a single send.

interface ConsentView {
  channels: { push: boolean; email: boolean; in_app: boolean }
  globallyUnsubscribed: boolean
}

const ENDPOINT = '/api/notifications/marketing-consent'

export default function MarketingConsentSettings() {
  const { t } = useTranslation()
  const [view, setView] = useState<ConsentView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch(ENDPOINT)
        // 🚨 `fetch` RESOLVES on 401/403/500 — it only rejects on a network
        // failure. Without this check a signed-out response would be parsed as
        // consent state and the toggles would render whatever `undefined`
        // coerces to.
        if (!res.ok) return
        const { data } = await res.json()
        if (alive) setView(data as ConsentView)
      } catch {
        /* leave `view` null; the section simply does not render */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const save = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      // Same trap as above, and this is the one that bites: an optimistic
      // update here would leave a toggle showing ON after a refused write.
      if (!res.ok) {
        setError(t('notifications.marketing.error'))
        return
      }
      const { data } = await res.json()
      // Render what the SERVER read back, never what we asked for.
      setView(data as ConsentView)
    } catch {
      setError(t('notifications.marketing.error'))
    } finally {
      setBusy(false)
    }
  }, [t])

  // Not signed in, or the read failed: render nothing rather than a control
  // that cannot work.
  if (!view) return null

  const { push } = view.channels
  const unsubscribed = view.globallyUnsubscribed

  return (
    <div className="card p-5 space-y-4">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
        {t('notifications.marketing.heading')}
      </p>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center flex-shrink-0">
            <Megaphone size={18} className="text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {t('notifications.marketing.push.title')}
            </p>
            <p className="text-xs text-content-secondary mt-0.5">
              {t('notifications.marketing.push.desc')}
            </p>
          </div>
        </div>

        <button
          onClick={() => save({ channel: 'push', optedIn: !push })}
          // Disabled while the global unsubscribe is on: the override means the
          // per-channel value cannot change the outcome, and a toggle that
          // appears to work while changing nothing is worse than one that does
          // not appear to work.
          disabled={busy || unsubscribed}
          className={`
            relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            ${push && !unsubscribed ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-700'}
          `}
          role="switch"
          aria-checked={push && !unsubscribed}
          aria-label={t('notifications.marketing.push.toggleAria')}
        >
          {busy ? (
            <Loader2 size={14} className="absolute inset-0 m-auto animate-spin text-white" />
          ) : (
            <span
              className={`
                pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                transition duration-200 ease-in-out
                ${push && !unsubscribed ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          )}
        </button>
      </div>

      {!push && !unsubscribed && (
        <p className="text-xs text-content-secondary">{t('notifications.marketing.optedOutNote')}</p>
      )}

      <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {t('notifications.marketing.unsubscribeAll.title')}
          </p>
          <p className="text-xs text-content-secondary mt-0.5">
            {t('notifications.marketing.unsubscribeAll.desc')}
          </p>
        </div>

        <button
          onClick={() => save({ globallyUnsubscribed: !unsubscribed })}
          disabled={busy}
          className={`
            relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            ${unsubscribed ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'}
          `}
          role="switch"
          aria-checked={unsubscribed}
          aria-label={t('notifications.marketing.unsubscribeAll.aria')}
        >
          <span
            className={`
              pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
              transition duration-200 ease-in-out
              ${unsubscribed ? 'translate-x-5' : 'translate-x-0'}
            `}
          />
        </button>
      </div>

      {unsubscribed && (
        <p className="text-xs text-red-500">{t('notifications.marketing.unsubscribed')}</p>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {t('notifications.marketing.transactionalNote')}
      </p>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
