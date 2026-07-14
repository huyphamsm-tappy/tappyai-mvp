// Authentication event emission (Phase 1, Step 1). Emits the approved auth events
// through the ONE unified analytics pipeline (tracker.ts) — no new tracking system,
// no rollups/dashboards/APIs/dimension. Event names + properties per Event Catalog
// §4 and the approved spec §3. Reusable emitters (SR-4), browser-only.

import { track } from '@/lib/tracking/tracker'

const PENDING_KEY = 'tappy_auth_pending'
const EMITTED_KEY = 'tappy_auth_emitted'

// Open `method` vocabulary (spec §3). New providers just pass a new string.
export type AuthMethod = 'google' | 'zalo' | 'apple' | 'email_otp' | 'email' | 'facebook' | (string & {})
export type LoginFailReason = 'invalid_credentials' | 'expired' | 'oauth_denied' | 'network'

// Mark an in-progress auth attempt so the global listener can attribute the
// resulting session to the right provider. sessionStorage is per-tab and
// survives the OAuth redirect round-trip.
export function markAuthPending(method: AuthMethod) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ method, at: Date.now() })) } catch { /* ignore */ }
}

export function getPendingMethod(): AuthMethod | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    return (JSON.parse(raw) as { method: string }).method || null
  } catch { return null }
}

function clearPending() { try { sessionStorage.removeItem(PENDING_KEY) } catch { /* ignore */ } }

export function emitAuthLoginFailed(method: AuthMethod, reason: LoginFailReason) {
  track('auth_login_failed', { method, reason })
  clearPending()
}

export function emitAuthLogout(method?: AuthMethod) {
  track('auth_logout_completed', method ? { method } : {})
  clearPending()
}

// Called by the global auth listener when a session becomes available. Emits the
// login — and, for a first-time account, the signup — exactly once per real
// login. Guarded by (a) the pending marker (so page-loads with an existing
// session don't emit) and (b) an emitted marker (so a repeated SIGNED_IN /
// INITIAL_SESSION for the same login does not duplicate). DB-level event_id
// dedup is the second line of defence.
export function emitAuthLoginFromSession(user: { id: string; created_at?: string }) {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return // not a fresh login attempt
    const pending = JSON.parse(raw) as { method: string; at: number }
    if (!pending?.method || Date.now() - pending.at > 10 * 60 * 1000) { clearPending(); return }

    const stamp = `${user.id}:${pending.at}`
    if (sessionStorage.getItem(EMITTED_KEY) === stamp) return // already emitted for this login

    const isFirst = !!user.created_at && (Date.now() - new Date(user.created_at).getTime() < 2 * 60 * 1000)
    if (isFirst) track('auth_signup_completed', { method: pending.method })
    track('auth_login_completed', { method: pending.method, is_first_login: isFirst })

    sessionStorage.setItem(EMITTED_KEY, stamp)
    clearPending()
  } catch { /* best-effort */ }
}
