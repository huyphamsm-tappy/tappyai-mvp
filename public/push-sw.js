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

  event.waitUntil(
    // Check if app is in foreground — if so, post a message so the page can
    // play the Tappy chime instead of (in addition to) the OS notification
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const foreground = clientList.find(c => c.visibilityState === 'visible')
      if (foreground) foreground.postMessage({ type: 'TAPPY_PUSH', payload: data })
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
