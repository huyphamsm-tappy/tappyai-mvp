// ── Web Push endpoints are browser push services, nothing else (security audit 2026-09-30) ─────
//
// A Web Push subscription's `endpoint` is a URL the SERVER later POSTs to (web-push, with our VAPID
// signature) every time the user is notified. It arrives from the client — through
// POST /api/notifications/subscribe, and directly through PostgREST, where the owner-scoped
// "ALL" policy on notification_subscriptions lets a user write any subscription_data they like.
// Unchecked, that made every like/comment/follow on the account a server-side request to a URL of
// the account holder's choosing: a blind SSRF and a way to make our deployment call third parties.
//
// Real browsers only ever hand out endpoints on their vendor's push service, so the rule is an
// allowlist of those hosts, https on the default port. Checked at subscribe time (a clear 400) and
// again at send time (the only check PostgREST cannot skip).

/** Push services of the browsers that implement the Push API. A host matches exactly or as a subdomain. */
export const WEB_PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',               // Chrome, Edge (Chromium), Opera, Samsung Internet, Brave
  'android.googleapis.com',           // legacy GCM endpoints still held by old Chrome subscriptions
  'push.services.mozilla.com',        // Firefox (updates.push.services.mozilla.com)
  'push.apple.com',                   // Safari 16+ / iOS web apps (web.push.apple.com)
  'notify.windows.com',               // legacy Edge / WNS (*.notify.windows.com)
] as const

export function isAllowedWebPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false
  let url: URL
  try { url = new URL(endpoint) } catch { return false }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false
  const host = url.hostname.toLowerCase()
  return WEB_PUSH_SERVICE_HOSTS.some(h => host === h || host.endsWith(`.${h}`))
}
