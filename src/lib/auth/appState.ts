// I6 / ANDROID-REQUESTS R24 (security 30/09, level High): "force the app into the attacker's account with a crafted link".
//
// The native apps finish a web sign-in (Zalo) at `/auth/confirm?…&platform=android|ios`, which hands the session tokens to
// the app's custom scheme. Before this, ANY such link did it: an attacker minted a magic link for THEIR account, added
// `&platform=android`, and the victim's app was switched into the attacker's account (or a raw
// `tappyai://auth-callback#access_token=…` did the same).
//
// Now the app starts every web sign-in with a random `app_state` (base64url, ≥ 256 bits). The server keeps it in an
// httpOnly / Secure / SameSite=Lax cookie in the SAME browser for 5 minutes, carries it to `/auth/confirm`, and hands a
// session to the app only when the link's `app_state` equals that cookie and is not expired. The cookie is cleared on
// use (single use). The fragment echoes it back as `state` (Android reads that) and `app_state`, so the app, which keeps
// its own copy, accepts only a callback for a sign-in it started. An attacker's link opened in the victim's browser has
// no matching cookie → no session.
import { timingSafeEqual } from 'node:crypto'

export const APP_STATE_COOKIE = 'app_login_state'
export const APP_STATE_TTL_S = 300
/** Android: 32 random bytes base64url = 43 chars. Up to 128 leaves room for iOS; nothing else is accepted. */
const APP_STATE_RE = /^[A-Za-z0-9_-]{43,128}$/

export type NativePlatform = 'android' | 'ios'
export const isNativePlatform = (p: string | null | undefined): p is NativePlatform => p === 'android' || p === 'ios'

export function validAppState(v: string | null | undefined): v is string {
  return typeof v === 'string' && APP_STATE_RE.test(v)
}

/** The cookie value: issue time + state, so the server enforces the 5 minutes itself (not only the browser's maxAge). */
export function appStateCookieValue(state: string, nowMs = Date.now()): string {
  return `${Math.floor(nowMs / 1000)}.${state}`
}

export const appStateCookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge: APP_STATE_TTL_S, path: '/' }

export type AppStateVerdict = 'ok' | 'missing' | 'malformed' | 'mismatch' | 'expired'

/** Does the `app_state` a link carries belong to the sign-in this browser started, within 5 minutes? */
export function checkAppState(fromLink: string | null | undefined, cookieValue: string | null | undefined, nowMs = Date.now()): AppStateVerdict {
  if (!fromLink || !cookieValue) return 'missing'
  if (!validAppState(fromLink)) return 'malformed'
  const dot = cookieValue.indexOf('.')
  const issued = Number(cookieValue.slice(0, dot))
  const saved = cookieValue.slice(dot + 1)
  if (dot <= 0 || !Number.isFinite(issued) || !validAppState(saved)) return 'malformed'
  const a = Buffer.from(fromLink), b = Buffer.from(saved)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'mismatch'
  const age = Math.floor(nowMs / 1000) - issued
  if (age < 0 || age > APP_STATE_TTL_S) return 'expired'
  return 'ok'
}

/** The state stored in the cookie (for carrying it forward in the flow), or null. */
export function appStateFromCookie(cookieValue: string | null | undefined): string | null {
  if (!cookieValue) return null
  const s = cookieValue.slice(cookieValue.indexOf('.') + 1)
  return validAppState(s) ? s : null
}
