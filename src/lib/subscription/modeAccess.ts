'use client'

// Whether the composer's "+" menu offers Deep Research for this account. The SERVER enforces the plan (lib/plans/tiers.ts: a mode the tier
// lacks runs as Chat); this only hides what would not run. Plans not on sale (flag off, /api/payments/me 404), offline or a bad body all mean
// "not known", and not known keeps the menu whole.

import { useEffect, useState } from 'react'
import { useSubscriptionsFlag } from './useSubscriptionsFlag'

/** `me` is the body of GET /api/payments/me, or anything else when it could not be read. */
export function deepResearchOffered(me: unknown): boolean {
  if (!me || typeof me !== 'object') return true
  const body = me as { signedIn?: unknown; subscription?: { state?: unknown; plan?: { id?: unknown } | null } | null }
  if (typeof body.signedIn !== 'boolean') return true
  if (!body.signedIn) return false
  if (body.subscription?.state !== 'ACTIVE') return false
  return body.subscription?.plan?.id !== 'free'
}

export function useDeepResearchOffered(): boolean {
  const { subscriptions } = useSubscriptionsFlag()
  const [offered, setOffered] = useState(true)
  useEffect(() => {
    if (!subscriptions) { setOffered(true); return }
    let live = true
    fetch('/api/payments/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live) setOffered(deepResearchOffered(b)) })
      .catch(() => {})
    return () => { live = false }
  }, [subscriptions])
  return offered
}
