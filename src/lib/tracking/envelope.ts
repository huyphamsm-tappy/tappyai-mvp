// Shared client-side analytics envelope (Analytics Architecture §3 / §8A).
// Attached to EVERY event by the one tracker (tracker.ts). This is NOT a second
// tracking system — it is the single shared envelope builder that all events
// (current and future) reuse. Browser-only.
//
// Server sets the authoritative fields it owns: user_id (from session),
// server_timestamp (created_at), country (from IP). The client supplies the
// device/session context and the idempotency key.

import { detectDeviceContext, type DeviceContext } from './deviceContext'

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
  // Full cross-platform device contract (Android/iOS fill the identical shape).
  // The flat fields above (os_name/os_version/device_type/app_version/platform,
  // language←locale) are PROJECTED from this same object — one detection path,
  // no duplicated logic. They are kept flat for the existing rollups/dimension
  // that index them; device_context is the complete, forward-scalable record.
  device_context: DeviceContext
}

// Build the envelope for a single event. event_id is generated here — at event
// creation — so retries/duplicate flushes reuse it and dedup server-side (§8A.1).
// Device signals are detected ONCE (detectDeviceContext); the flat envelope
// fields are projected from that single detection so callers and existing
// consumers are unchanged.
export function buildEnvelope(): AnalyticsEnvelope {
  const device = detectDeviceContext()
  return {
    event_id: uuid(),
    schema_version: SCHEMA_VERSION,
    anon_id: getAnonId(),
    platform: 'web',
    app_version: device.app_version,
    build_number: device.build_number,
    os_name: device.os_name,
    os_version: device.os_version,
    device_type: device.device_type,
    language: device.locale,
    session_id: getSessionId(),
    client_timestamp: new Date().toISOString(),
    device_context: device,
  }
}
