// -- Sign in with Apple: is it REALLY available? (iOS handoff, 2026-10-05) ----------------------------------------------------
//
// iOS signs in natively (ASAuthorizationAppleIDProvider -> Apple identity token -> Supabase `signInWithIdToken({provider:'apple'})`).
// The token is exchanged with SUPABASE AUTH directly; this Next.js app has no Apple endpoint and needs none. So the one thing that
// decides whether the Apple button may be shown is whether the Supabase project has the Apple provider ENABLED (dashboard:
// Authentication > Providers > Apple, with the iOS bundle id under "Client IDs").
//
// The repository cannot know that from code or env, and a hand-set flag drifts (a button that fails is worse than no button).
// Policy context: Apple Guideline 4.8 requires an equivalent login service when the covered third-party/social login pattern applies;
// Tappy is using Sign in with Apple as that equivalent option. Supabase publishes the non-secret provider state at
// GET <project>/auth/v1/settings -> { external: { apple: boolean, google: boolean, ... } } (public, readable with the public anon key).
// That is the capability source here, read through `appleProviderEnabled`.
//
// Rules: fail CLOSED (any error, timeout, redirect, malformed body, missing env -> false); only the literal `true` counts; the public key
// is sent only to that one path and never logged or returned; redirects are refused so the key can never be forwarded; the answer is
// cached for 5 minutes (30 s after a failure) so /api/config never hammers Supabase.
//
// Limits (documented, not hidden): `external.apple === true` proves the provider is enabled, not that `com.tappyai.ios` is in its
// Client IDs - that list is not public. Token revocation on account deletion (Apple 5.1.1(v)) is a separate dependency.

export const APPLE_SETTINGS_TTL_MS = 5 * 60_000
export const APPLE_SETTINGS_FAIL_TTL_MS = 30_000
export const APPLE_SETTINGS_TIMEOUT_MS = 2_500
const MAX_BODY_CHARS = 20_000

/** Supabase `/auth/v1/settings` body -> is the Apple provider enabled. Only the literal `true`. */
export function appleProviderEnabled(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const external = (body as { external?: unknown }).external
  if (!external || typeof external !== 'object') return false
  return (external as { apple?: unknown }).apple === true
}

export interface AppleCapabilityDeps {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

let cache: { key: string; at: number; ttl: number; value: boolean } | null = null
export function __resetAppleCapabilityCache(): void { cache = null }

function settingsUrl(raw: string | undefined): URL | null {
  if (!raw) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null
  if (u.username || u.password) return null
  return new URL('/auth/v1/settings', u.origin)
}

async function probe(url: URL, anonKey: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ ok: boolean; enabled: boolean }> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url.toString(), { method: 'GET', headers: { apikey: anonKey }, signal: ctl.signal, redirect: 'error', cache: 'no-store' })
    if (!res.ok) return { ok: false, enabled: false }
    const text = await res.text()
    if (text.length > MAX_BODY_CHARS) return { ok: false, enabled: false }
    return { ok: true, enabled: appleProviderEnabled(JSON.parse(text)) }
  } catch {
    return { ok: false, enabled: false }
  } finally {
    clearTimeout(timer)
  }
}

/** True ONLY when the Supabase project this app talks to reports the Apple provider as enabled. Never throws. */
export async function appleSignInAvailable(deps: AppleCapabilityDeps = {}): Promise<boolean> {
  const env = deps.env ?? process.env
  const now = (deps.now ?? Date.now)()
  const url = settingsUrl(env.NEXT_PUBLIC_SUPABASE_URL)
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return false
  const key = url.origin
  if (cache && cache.key === key && now - cache.at < cache.ttl) return cache.value
  const r = await probe(url, anonKey, deps.fetchImpl ?? fetch, deps.timeoutMs ?? APPLE_SETTINGS_TIMEOUT_MS)
  cache = { key, at: now, ttl: r.ok ? APPLE_SETTINGS_TTL_MS : APPLE_SETTINGS_FAIL_TTL_MS, value: r.enabled }
  return r.enabled
}
