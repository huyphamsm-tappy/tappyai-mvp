import { PROVIDER_REGISTRY } from '@/lib/ccp/registry'
import { FRESHNESS_TTL_MS } from '@/lib/providers/travelData'
import type { AdapterDeps, AdapterState, BookingContext, HttpPost, Outcome, OutcomeReason, RealtimeAdapter, RealtimeProviderId, SearchResult } from './types'

// ── Shared plumbing for the realtime adapters: flags, credentials, bounded HTTP, validation, freshness ────────────────────────
// Nothing here holds a secret: credentials are read from the server env by NAME at call time and only ever placed in a request header.

/** Feature flag ON only for the literal '1'. Default OFF — a provider is switched on after the provider has granted access. */
export const flagOn = (env: AdapterDeps['env'], flagEnv: string): boolean => env[flagEnv] === '1'

export function adapterState(adapter: Pick<RealtimeAdapter, 'flagEnv' | 'credentialEnv'>, env: AdapterDeps['env']): { state: AdapterState; missing: string[] } {
  if (!flagOn(env, adapter.flagEnv)) return { state: 'OFF', missing: [] }
  const missing = adapter.credentialEnv.filter(n => !env[n]?.trim())
  return missing.length ? { state: 'BLOCKED_CREDENTIALS', missing } : { state: 'READY', missing: [] }
}

export const fail = (reason: OutcomeReason, detail?: string): Outcome<never> => ({ ok: false, reason, ...(detail ? { detail } : {}) })
export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value })

/** Default HTTP: one POST, hard timeout, JSON in/out. Never throws — a network failure is an Outcome, not a crash. */
export const defaultHttp: HttpPost = async (url, init) => {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), init.timeoutMs)
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...init.headers }, body: JSON.stringify(init.body), signal: ctl.signal })
    let json: unknown = null
    try { json = await res.json() } catch { json = null }
    return { status: res.status, json }
  } finally {
    clearTimeout(timer)
  }
}

/** One bounded provider call → Outcome. Timeout and transport errors are mapped; the error text is never returned (it can echo a header). */
export async function post(deps: AdapterDeps, url: string, headers: Record<string, string>, body: unknown): Promise<Outcome<unknown>> {
  try {
    const r = await deps.http(url, { headers, body, timeoutMs: deps.timeoutMs ?? 6_000 })
    if (r.status === 401 || r.status === 403) return fail('credentials_missing', `http_${r.status}`)
    if (r.status < 200 || r.status >= 300) return fail('provider_error', `http_${r.status}`)
    return ok(r.json)
  } catch (e) {
    return fail(e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'provider_error')
  }
}

// ── untrusted-input readers: an invalid value is dropped, never repaired ──────────────────────────────────────────────────────
export const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
export const text = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** A price: a finite number ≥ 0, a numeric string, or {amount|value|total|price}. Anything else → null. */
export function amount(v: unknown, depth = 0): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v)
  const r = depth < 2 ? asRecord(v) : null
  if (!r) return null
  for (const k of ['amount', 'value', 'total', 'price']) {
    const n = amount(r[k], depth + 1)
    if (n !== null) return n
  }
  return null
}

export const currencyOf = (v: unknown): 'VND' | 'USD' | null => (v === 'VND' || v === 'USD' ? v : null)

/** A booking URL survives only if it is https, has no userinfo, and sits on the provider's OWN registry hosts. */
export function ownedUrl(provider: RealtimeProviderId, v: unknown): string | null {
  const s = text(v, 2000)
  if (!s) return null
  let u: URL
  try { u = new URL(s) } catch { return null }
  if (u.protocol !== 'https:' || u.username || u.password) return null
  const hosts: readonly string[] = PROVIDER_REGISTRY.find(p => p.providerId === provider)?.allowedHosts ?? []
  return hosts.includes(u.hostname.toLowerCase()) ? u.toString() : null
}

/** A provider may return its URL as a string or as an object ({web, app}, v3 "unified url"). Never assume which; read both. */
export function pickUrls(v: unknown, deepLinkField?: unknown): { web: unknown; app: unknown } {
  const r = asRecord(v)
  if (r) return { web: r.web ?? r.url ?? r.href ?? null, app: r.app ?? r.deep_link ?? deepLinkField ?? null }
  return { web: v ?? null, app: deepLinkField ?? null }
}

// ── context preservation: which searched fields the final URL visibly carries ─────────────────────────────────────────────────
const KEY_ALIASES: Record<string, string[]> = {
  checkIn: ['checkin', 'checkIn', 'check_in', 'checkin_date'],
  checkOut: ['checkout', 'checkOut', 'check_out', 'checkout_date'],
  adults: ['adults', 'group_adults', 'numberOfAdults', 'adult'],
  rooms: ['rooms', 'no_rooms', 'numberOfRooms'],
}
const FIELD_VALUE: Record<string, (c: BookingContext) => string | undefined> = {
  checkIn: c => c.checkIn,
  checkOut: c => c.checkOut,
  adults: c => (c.adults === undefined ? undefined : String(c.adults)),
  rooms: c => (c.rooms === undefined ? undefined : String(c.rooms)),
}

/** The searched stay fields whose value is NOT in the URL query. Empty = the page opens with the whole search applied. */
export function missingInUrl(url: string | null, context: BookingContext): string[] {
  if (!url) return Object.keys(KEY_ALIASES).filter(k => FIELD_VALUE[k](context) !== undefined)
  let q: URLSearchParams
  try { q = new URL(url).searchParams } catch { return [] }
  const out: string[] = []
  for (const [field, aliases] of Object.entries(KEY_ALIASES)) {
    const want = FIELD_VALUE[field](context)
    if (want === undefined) continue
    if (!aliases.some(a => q.get(a) === want)) out.push(field)
  }
  return out
}

// ── freshness: a number is "realtime" only inside its TTL of lastCheckedAt ───────────────────────────────────────────────────────
export const PRICE_TTL_MS = FRESHNESS_TTL_MS.fare
export const AVAILABILITY_TTL_MS = FRESHNESS_TTL_MS.availability

export function ageMs(r: Pick<SearchResult, 'lastCheckedAt'>, now: Date): number | null {
  const t = r.lastCheckedAt ? Date.parse(r.lastCheckedAt) : NaN
  if (!Number.isFinite(t)) return null
  const age = now.getTime() - t
  return age < -60_000 ? null : age // a timestamp from the future is not evidence
}

/** The price Tappy may state as live: only a REALTIME_TAPPY result inside the price TTL. Else null — and the UI says "kiểm tra trên trang". */
export function claimablePrice(r: SearchResult, now: Date): number | null {
  if (r.source !== 'REALTIME_TAPPY' || r.price === null) return null
  const age = ageMs(r, now)
  return age !== null && age <= PRICE_TTL_MS ? r.price : null
}

export function claimableAvailability(r: SearchResult, now: Date): SearchResult['availabilityStatus'] {
  if (r.source !== 'REALTIME_TAPPY') return 'unknown'
  const age = ageMs(r, now)
  return age !== null && age <= AVAILABILITY_TTL_MS ? r.availabilityStatus : 'unknown'
}

/** Structured log line; never a header, token or request body. */
export function logRealtime(provider: RealtimeProviderId, step: string, o: { ok: boolean; reason?: string; latencyMs?: number; results?: number }): void {
  try { console.log(JSON.stringify({ type: 'tappyai_realtime', provider, step, ...o })) } catch { /* logging never breaks a turn */ }
}
