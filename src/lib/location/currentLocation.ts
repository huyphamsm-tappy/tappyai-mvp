/**
 * "Where the user is NOW" on the web client (Round 42, location rules approved by Huy 13/10/2026).
 *
 * `localStorage['tappy_location']` keeps the last device fix across sessions — it is never deleted here.
 * A fix only counts as the CURRENT location when it was taken in this tab session: `sessionStorage`
 * holds the `ts` of that fix (D3, no minute threshold). A fix from an earlier session (a trip to
 * Đà Nẵng three days ago) stays stored but is not sent as where the user stands.
 *
 * "Gần tôi" requests (the 📍 chip and typed messages with a phrase below, D2) ask the device for a
 * NEW fix (maximumAge 0). If that fails, the caller sends WITHOUT a location and the server asks.
 */

export interface StoredLocation { lat: number; lng: number; address: string; ts?: number }

const STORE_KEY = 'tappy_location'
const SESSION_KEY = 'tappy_location_session'

// Fixed list (allowlist C). Deliberately NOT "gần đây" (also "lately"), "gần chợ …", "xung quanh <place>", "gần nhà".
const NEAR_ME = /(?:^|[^a-z0-9])(?:gan toi|gan minh|gan cho toi|gan cho minh|quanh day|xung quanh day|near me|nearby|around here)(?![a-z0-9])/

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

export function isNearMeRequest(text: string): boolean {
  return NEAR_ME.test(fold(text || ''))
}

/**
 * Round 42 (LOC-CHIP-01 / LOC-DEFAULT-HCM-01): the ONE definition of "the device sent a usable current location" — finite coordinates in range.
 * A place the user names is not a current location; only the fix the request carries counts.
 */
export function hasValidCurrentLocation(loc: { lat?: unknown; lng?: unknown } | null | undefined): boolean {
  if (!loc) return false
  const { lat, lng } = loc
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

/** Stores a fix taken now and marks it as this tab session's. */
export function saveSessionFix(loc: StoredLocation): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(loc))
    sessionStorage.setItem(SESSION_KEY, String(loc.ts))
  } catch { /* storage unavailable */ }
}

/** The stored fix, only when it was taken in this tab session; otherwise null (the stored copy is left as it is). */
export function readSessionFix(): StoredLocation | null {
  try {
    const s = localStorage.getItem(STORE_KEY)
    if (!s) return null
    const loc = JSON.parse(s) as StoredLocation
    if (loc?.ts == null || sessionStorage.getItem(SESSION_KEY) !== String(loc.ts)) return null
    return loc
  } catch { return null }
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'vi', 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' } }
    )
    if (resp.ok) { const d = await resp.json(); return (d?.display_name as string) || '' }
  } catch {}
  return ''
}

/** Asks the device for a NEW fix. Resolves null on refusal, timeout, error or no API — never an older fix. */
export function requestFreshFix(): Promise<StoredLocation | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const loc: StoredLocation = { lat, lng, address: await reverseGeocode(lat, lng), ts: Date.now() }
        saveSessionFix(loc)
        resolve(loc)
      },
      () => resolve(null),
      { maximumAge: 0, timeout: 10000 }
    )
  })
}
