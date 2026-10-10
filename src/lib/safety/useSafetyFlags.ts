'use client'

// WEB-ONLY Phase 8 / WP-06 — which safety surfaces to DRAW, from GET /api/config (`p8`), fetched once per page load and shared by every component.
// Until it answers everything is OFF: a button that appears late is fine, a button that appears and then 404s is not. Enforcement never depends
// on this — every guarded route answers 404 on its own while its flag is off.

import { useEffect, useState } from 'react'

export interface SafetyFlags {
  /** REPORTS_ENABLED — comment and user reports. (Post/clip reports are always on.) */
  reports: boolean
  /** USER_BLOCKS_ENABLED — block / unblock. */
  userBlocks: boolean
}

const OFF: SafetyFlags = { reports: false, userBlocks: false }

let pending: Promise<SafetyFlags> | null = null
let resolved: SafetyFlags | null = null

function load(): Promise<SafetyFlags> {
  if (!pending) {
    pending = fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((body): SafetyFlags => {
        const p8 = body && typeof body === 'object' && body.p8 && typeof body.p8 === 'object' ? body.p8 : {}
        const next: SafetyFlags = { reports: p8.reports === true, userBlocks: p8.userBlocks === true }
        resolved = next
        return next
      })
      .catch((): SafetyFlags => (resolved = OFF))
  }
  return pending
}

export function useSafetyFlags(): SafetyFlags {
  const [flags, setFlags] = useState<SafetyFlags>(resolved ?? OFF)
  useEffect(() => {
    let live = true
    void load().then((f) => { if (live) setFlags(f) })
    return () => { live = false }
  }, [])
  return flags
}

/** Test seam. */
export function __resetSafetyFlags(): void {
  pending = null
  resolved = null
}
