// Shared client-side analytics envelope (Analytics Architecture §3 / §8A).
// Attached to EVERY event by the one tracker (tracker.ts). This is NOT a second
// tracking system — it is the single shared envelope builder that all events
// (current and future) reuse. Browser-only.
//
// Server sets the authoritative fields it owns: user_id (from session),
// server_timestamp (created_at), country (from IP). The client supplies the
// device/session context and the idempotency key.

const SCHEMA_VERSION = 1

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* fall through */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Stable per-device anonymous id (Analytics §8D). Client-readable (localStorage),
// distinct from the httpOnly auth anon cookie.
function getAnonId(): string {
  try {
    let id = localStorage.getItem('tappy_analytics_anon')
    if (!id) { id = uuid(); localStorage.setItem('tappy_analytics_anon', id) }
    return id
  } catch { return uuid() }
}

// Session id: new after 30 min inactivity (Data Dictionary §4 session rule).
function getSessionId(): string {
  const THIRTY_MIN = 30 * 60 * 1000
  try {
    const now = Date.now()
    const raw = sessionStorage.getItem('tappy_analytics_session')
    if (raw) {
      const s = JSON.parse(raw) as { id: string; last: number }
      if (s.id && now - s.last < THIRTY_MIN) {
        sessionStorage.setItem('tappy_analytics_session', JSON.stringify({ id: s.id, last: now }))
        return s.id
      }
    }
    const id = uuid()
    sessionStorage.setItem('tappy_analytics_session', JSON.stringify({ id, last: now }))
    return id
  } catch { return uuid() }
}

function getDeviceType(): 'phone' | 'tablet' | 'desktop' | 'unknown' {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  if (/iPad|Tablet/i.test(ua)) return 'tablet'
  if (/Mobi|Android|iPhone/i.test(ua)) return 'phone'
  if (typeof window !== 'undefined') return 'desktop'
  return 'unknown'
}

function getOs(): { name: string; version: string } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  if (/Android/i.test(ua)) return { name: 'Android', version: (ua.match(/Android ([\d.]+)/) || [])[1] || '' }
  if (/iPhone|iPad|iPod/i.test(ua)) return { name: 'iOS', version: ((ua.match(/OS ([\d_]+)/) || [])[1] || '').replace(/_/g, '.') }
  if (/Windows/i.test(ua)) return { name: 'Windows', version: (ua.match(/Windows NT ([\d.]+)/) || [])[1] || '' }
  if (/Mac OS X/i.test(ua)) return { name: 'macOS', version: '' }
  if (/Linux/i.test(ua)) return { name: 'Linux', version: '' }
  return { name: 'unknown', version: '' }
}

export interface AnalyticsEnvelope {
  event_id: string
  schema_version: number
  anon_id: string
  platform: 'web'
  app_version: string
  build_number: string
  os_name: string
  os_version: string
  device_type: string
  language: string
  session_id: string
  client_timestamp: string
}

// Build the envelope for a single event. event_id is generated here — at event
// creation — so retries/duplicate flushes reuse it and dedup server-side (§8A.1).
export function buildEnvelope(): AnalyticsEnvelope {
  const os = getOs()
  return {
    event_id: uuid(),
    schema_version: SCHEMA_VERSION,
    anon_id: getAnonId(),
    platform: 'web',
    app_version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
    build_number: process.env.NEXT_PUBLIC_BUILD_NUMBER || 'unknown',
    os_name: os.name,
    os_version: os.version,
    device_type: getDeviceType(),
    language: (typeof navigator !== 'undefined' && navigator.language) || 'unknown',
    session_id: getSessionId(),
    client_timestamp: new Date().toISOString(),
  }
}
