// Service worker for caching large SuperTux assets (supertux2.data ~245MB, supertux2.wasm ~6MB).
// Registered from supertux2.html (injected by /games/supertux route handler).
// Scope: /games/  — covers the iframe page at /games/supertux.

const CACHE_NAME = 'supertux-assets-v1'

// Match any URL whose pathname ends with supertux2.data or supertux2.wasm,
// regardless of origin (handles both local static paths and Vercel Blob URLs).
function isSupertuxAsset(url) {
  try {
    const p = new URL(url).pathname
    return p.endsWith('/supertux2.data') || p.endsWith('/supertux2.wasm')
  } catch {
    return false
  }
}

self.addEventListener('install', event => {
  // Skip waiting so the new SW activates immediately on first visit.
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  // Claim all clients so existing open pages are controlled by this SW.
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('supertux-assets-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  if (!isSupertuxAsset(event.request.url)) return

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request.url).then(cached => {
        if (cached) {
          console.log('[ST SW] cache hit:', event.request.url)
          return cached
        }
        console.log('[ST SW] fetching and caching:', event.request.url)
        return fetch(event.request).then(response => {
          // Only cache successful responses
          if (response.ok) {
            cache.put(event.request.url, response.clone())
          }
          return response
        })
      })
    )
  )
})
