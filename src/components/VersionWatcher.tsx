'use client'

import { useEffect } from 'react'

// The commit SHA baked into THIS bundle at build time (see next.config.mjs).
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'dev'

// Auto-recovers stale tabs: iOS Safari aggressively caches the app's HTML/JS, so
// after a deploy users kept seeing an old build. On load and whenever the tab is
// re-focused, this asks the server for the live commit SHA; if it differs from
// the SHA in this bundle, the tab is stale and reloads itself to pick up the new
// code. A per-version sessionStorage guard means it reloads AT MOST once per new
// version, so a cache that refuses to refresh can never cause a reload loop.
export default function VersionWatcher() {
  useEffect(() => {
    if (BUILD_ID === 'dev') return // no version tracking in local dev
    let cancelled = false

    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { v } = await res.json()
        if (cancelled || !v || v === BUILD_ID) return
        const key = 'tappy_vw_reloaded'
        if (sessionStorage.getItem(key) === v) return // already tried for this version
        sessionStorage.setItem(key, v)
        window.location.reload()
      } catch { /* offline / transient — ignore */ }
    }

    check()
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  return null
}
