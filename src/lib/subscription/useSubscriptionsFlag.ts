'use client'

// Whether to draw the subscription surfaces, from GET /api/config (`flags.subscriptions`), fetched once per page load and shared.
// Until it answers it is OFF: a card that appears late is fine, a card that appears and then 404s is not.

import { useEffect, useState } from 'react'

let pending: Promise<boolean> | null = null
let resolved: boolean | null = null

function load(): Promise<boolean> {
  if (!pending) {
    pending = Promise.resolve()
      .then(() => fetch('/api/config'))
      .then((r) => (r?.ok ? r.json() : null))
      .then((body) => (resolved = !!(body && typeof body === 'object' && body.flags && body.flags.subscriptions === true)))
      .catch(() => (resolved = false))
  }
  return pending
}

export function useSubscriptionsFlag(): { subscriptions: boolean } {
  const [on, setOn] = useState<boolean>(resolved ?? false)
  useEffect(() => {
    let live = true
    load().then((v) => { if (live) setOn(v) })
    return () => { live = false }
  }, [])
  return { subscriptions: on }
}

/** Test seam. */
export function __resetSubscriptionsFlag(): void {
  pending = null
  resolved = null
}
