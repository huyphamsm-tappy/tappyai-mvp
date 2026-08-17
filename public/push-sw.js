// TappyAI push notification service worker
// Scope: / (entire app — registered separately from supertux-sw.js which scopes to /games/)

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch { /* ignore parse errors */ }

  const title = data.title || 'TappyAI'
  const options = {
    body: data.body || '',
    // Fallback branding for a payload that omits them — the otter, not the retired infinity-mark
    // /logo.png. The server (src/lib/notifications/send.ts) sets both fields on every push, so in
    // practice these defaults only cover pushes sent from elsewhere.
    icon: data.icon || '/tappy/wave.png',
    badge: data.badge || '/tappy/wave.png',
    image: data.image || undefined,
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: false,
  }

  // Only notifications the BACKEND classified as `tappy_identity` earn the identity sound. A sound
  // that plays for everything is just a notification sound, not an identity. Missing or unknown
  // kinds are `normal`, so every notification written before this existed keeps working.
  const kind = (data.data && data.data.kind) === 'tappy_identity' ? 'tappy_identity' : 'normal'

  event.waitUntil(
    // If a tab is in the foreground, tell it to play the Tappy identity — in addition to the OS
    // notification, which always shows so the title/body stay visible.
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const foreground = clientList.find(c => c.visibilityState === 'visible')
      // The message carries NO payload, deliberately. Nothing on the page ever consumed it, and
      // sending it put the notification body one property access away from the line that triggers
      // speech. Now the page is told THAT to play a sound, never WHAT was in the notification —
      // so reading content aloud is not something a future edit can reach for.
      if (foreground && kind === 'tappy_identity') {
        foreground.postMessage({ type: 'TAPPY_IDENTITY' })
      }
      return self.registration.showNotification(title, options)
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
