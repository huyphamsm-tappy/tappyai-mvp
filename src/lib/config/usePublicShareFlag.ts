'use client'

import { useEffect, useState } from 'react'

// The Web client's view of the A5 public-share kill switch (`publicShareEnabled` in
// ./product, env SHOW_PUBLIC_SHARE). The flag is a SERVER env value, so the browser reads it the
// way native clients do: `GET /api/config` → `flags.publicShare`.
//
// Hidden until the server says yes: the "public link" action never flashes on and then vanishes.
// A missing field (older server) or an unreachable /api/config counts as ON — the create/preview
// routes answer 404 `not_available` on their own when the switch is off, so the UI is a courtesy,
// not the enforcement. One request per page load, shared by every caller.

let cached: boolean | null = null
let inflight: Promise<boolean> | null = null

export function parsePublicShareFlag(body: unknown): boolean {
  const flags = (body as { flags?: { publicShare?: unknown } } | null)?.flags
  return flags?.publicShare !== false
}

function loadPublicShareFlag(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached)
  inflight ??= fetch('/api/config')
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => (cached = body === null ? true : parsePublicShareFlag(body)))
    .catch(() => (cached = true))
  return inflight
}

/** `active=false` skips the request entirely (a surface with no public-link action). */
export function usePublicShareEnabled(active = true): boolean {
  const [enabled, setEnabled] = useState<boolean>(cached ?? false)
  useEffect(() => {
    if (!active) return
    let alive = true
    void loadPublicShareFlag().then((v) => { if (alive) setEnabled(v) })
    return () => { alive = false }
  }, [active])
  return enabled
}

/** Tests only: forget the per-page cache. */
export function resetPublicShareFlagForTests(): void {
  cached = null
  inflight = null
}
