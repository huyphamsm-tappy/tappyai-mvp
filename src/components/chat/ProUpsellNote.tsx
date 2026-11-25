'use client'

// 17/11/2026 (owner: under every Free answer) - a one-line note under every finished answer of a person on the Free plan (a visitor
// included): the Pro plan answers smarter and with more accurate data. Drawn only when the plans are on sale (GET /api/config
// `flags.subscriptions`): with the plans off there is no Pro to buy and Free answers with every tool, so the note would promise a
// difference that does not exist. The plan is read once per page load from GET /api/subscription (the same answer the composer's quota
// line reads) and shared; until it answers nothing is drawn (a note that appears late is fine, one that appears and is wrong is not).

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useSubscriptionsFlag } from '@/lib/subscription/useSubscriptionsFlag'

let pending: Promise<boolean> | null = null
let resolved: boolean | null = null

/** True when the person's plan is Free. Any failure reads as "not Free": the note is an offer, never shown on a guess. */
function loadIsFree(): Promise<boolean> {
  if (!pending) {
    pending = Promise.resolve()
      .then(() => fetch('/api/subscription'))
      .then(r => (r?.ok ? r.json() : null))
      .then(body => (resolved = !!(body && typeof body === 'object' && (body as { plan?: unknown }).plan === 'free')))
      .catch(() => (resolved = false))
  }
  return pending
}

/** For tests: forget the shared answer. */
export function __resetProUpsellNote() { pending = null; resolved = null }

export function ProUpsellNote() {
  const { t } = useTranslation()
  const { subscriptions } = useSubscriptionsFlag()
  const [free, setFree] = useState<boolean>(resolved ?? false)
  useEffect(() => {
    let live = true
    loadIsFree().then(v => { if (live) setFree(v) })
    return () => { live = false }
  }, [])
  if (!subscriptions || !free) return null
  return (
    <p role="note" data-testid="pro-upsell-note" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
      <Sparkles size={13} className="shrink-0 text-amber-500" aria-hidden="true" />
      <span>{t('pres.proNote')}</span>
      <Link href="/subscription" className="font-medium text-blue-600 hover:underline dark:text-blue-400">{t('pres.proNote.cta')}</Link>
    </p>
  )
}
