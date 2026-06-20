'use client'
import { useEffect } from 'react'

// Silently pre-warms the browser Cache API with the SuperTux large assets
// so that /game/supertux loads faster when the user navigates there.
// Uses the same cache name as supertux-sw.js so the SW serves from it.
export function SupertuxPreload({ dataUrl, wasmUrl }: { dataUrl: string; wasmUrl: string }) {
  useEffect(() => {
    if (!dataUrl && !wasmUrl) return
    if (!('caches' in window)) return

    const urls = [dataUrl, wasmUrl].filter(Boolean)

    caches.open('supertux-assets-v1').then(cache => {
      for (const url of urls) {
        // Only fetch if not already cached — check first to avoid wasted bandwidth
        cache.match(url).then(hit => {
          if (hit) return
          // Low-priority background fetch into the cache
          fetch(url, { credentials: 'omit' })
            .then(res => { if (res.ok) cache.put(url, res) })
            .catch(() => {})
        })
      }
    }).catch(() => {})
  }, [dataUrl, wasmUrl])

  return null
}
