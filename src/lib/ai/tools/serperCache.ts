// ── SHARED SERPER CACHE (L2) — owner requirement 2026-09-29 ──────────────────────────────────
//
// "Cache Serper theo (truy vấn chuẩn hoá + khu vực) ≥ 24 giờ, dùng chung."
//
// The in-memory caches in common.ts / serperPlaces.ts are PER INSTANCE and live 5–30 min, so every
// warm lambda paid for the same question again. This is one cache every instance reads, in the
// same Upstash store (and the same credential pair, same env namespace) as the rate limiter and
// the daily credit counter. The in-memory cache stays in FRONT of it as L1.
//
//   key    namespacedKey('serper:v1:<endpoint>[:<variant>]:<sha256(cacheKeyPart(query))>:<area>')
//          · cacheKeyPart: NFC + lowercase + whitespace collapsed. Diacritics are NOT folded
//            (see cacheKeys.ts — "quán ăn" and "quan an" are different upstream calls).
//          · the query is HASHED so raw user-derived query text is never written to the store;
//            equality is unchanged (same normalised text ⇒ same hash).
//          · area: lat/lng rounded to 2 decimals (~1.1 km) + zoom, or a normalised location
//            string, or 'none'.
//          · namespacedKey separates production / preview / local, like every other KV key.
//   TTL    86,400 s (24 h, as the owner asked). Override: SERPER_CACHE_TTL_SECONDS.
//   store  only non-empty arrays from a successful call; never an error, never an empty answer,
//          never anything over 200 KB of JSON.
//   fails  OPEN. No config, a timeout (300 ms), an HTTP error, a malformed value — all behave as a
//          MISS on read and a no-op on write. This never throws: a cache outage must cost credits,
//          never answers.
//
// ⚠️ MAPS / SERPER TERMS CAVEAT. `/maps` returns Google Maps content (cid, placeId, googleusercontent
// thumbnails). serperPlaces.ts records the standing rule: this is live retrieval, nothing is
// persisted beyond the TTL, and nothing is written to a database. This cache honours that — every
// entry carries a hard EX TTL and expires on its own — but the TTL is now 24 h rather than 30 min
// because the OWNER ASKED FOR 24 h. Whether 24 h of shared retention fits the Maps-content terms is
// the owner's call, not this file's.
//
// 🚫 PHOTOS ARE EXCLUDED. `/images` lookups (fetchPlacePhotosByName) are NOT cached here, pending the
// owner's decision on persisting imagery. Only 'search' | 'shopping' | 'maps' are accepted.

import { createHash } from 'node:crypto'
import { cacheKeyPart } from './cacheKeys'
import { isDistributedStoreConfigured, namespacedKey } from '@/lib/security/distributedRateLimit'
import { sanitizeSerperJson } from './serperUntrusted'
import { areaKeyV2, normalizeQueryV2, serperCacheV2Enabled, serperTtlV2 } from './serperCacheV2'

export type SerperCachedEndpoint = 'search' | 'shopping' | 'maps'

/** Where a request was targeted: coordinates (maps `ll`), a location string, or nothing. */
export type SerperCacheArea = { lat: number; lng: number; zoom?: number } | string | null | undefined

const DEFAULT_TTL_SECONDS = 86_400
export const SERPER_CACHE_MAX_BYTES = 200 * 1024
export const SERPER_CACHE_TIMEOUT_MS = 300
const CACHEABLE: ReadonlySet<string> = new Set<SerperCachedEndpoint>(['search', 'shopping', 'maps'])

export function serperCacheTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SERPER_CACHE_TTL_SECONDS)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_TTL_SECONDS
}

/** The area segment of the key. Coordinates at 2 decimals (~1.1 km) + zoom; strings normalised. */
export function serperAreaKey(area: SerperCacheArea): string {
  if (area && typeof area === 'object') {
    if (!Number.isFinite(area.lat) || !Number.isFinite(area.lng)) return 'none'
    return `ll=${area.lat.toFixed(2)},${area.lng.toFixed(2)},${area.zoom ?? 14}`
  }
  const loc = cacheKeyPart(typeof area === 'string' ? area : '')
  return loc ? `loc=${encodeURIComponent(loc)}` : 'none'
}

/** The key AS STORED (environment-namespaced). `variant` separates request shapes, e.g. `n20`. */
export function serperSharedCacheKey(
  endpoint: SerperCachedEndpoint,
  query: string,
  area: SerperCacheArea,
  variant?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const ep = variant ? `${endpoint}:${variant}` : endpoint
  // SERPER_CACHE_V2 (default OFF): normalised query + area (serperCacheV2.ts); v1 keys are never read under v2.
  if (serperCacheV2Enabled(env)) {
    const q2 = createHash('sha256').update(normalizeQueryV2(query)).digest('hex')
    return namespacedKey(`serper:v2:${ep}:${q2}:${areaKeyV2(area)}`, env)
  }
  const q = createHash('sha256').update(cacheKeyPart(query)).digest('hex')
  return namespacedKey(`serper:v1:${ep}:${q}:${serperAreaKey(area)}`, env)
}

/** One Upstash REST command, bounded by the timeout. Throws on anything but a clean answer. */
async function kvCommand(cmd: string[], env: NodeJS.ProcessEnv): Promise<unknown> {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const res = await Promise.race([
      fetch(`${url}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
        signal: ctrl.signal,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { ctrl.abort(); reject(new Error('serper cache timeout')) }, SERPER_CACHE_TIMEOUT_MS)
      }),
    ])
    if (!res.ok) throw new Error(`serper cache HTTP ${res.status}`)
    const body = (await res.json()) as { result?: unknown; error?: string }
    if (!body || typeof body !== 'object' || body.error) throw new Error('serper cache store error')
    return body.result
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Shared-cache read. A non-empty array on a hit; `null` on a miss, a disabled cache, or ANY failure.
 * Never throws. Never logs the key or the value.
 */
export async function serperCacheGet<T>(
  endpoint: SerperCachedEndpoint,
  query: string,
  area: SerperCacheArea,
  variant?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T[] | null> {
  if (!CACHEABLE.has(endpoint) || !query.trim() || !isDistributedStoreConfigured(env)) return null
  try {
    const raw = await kvCommand(['GET', serperSharedCacheKey(endpoint, query, area, variant, env)], env)
    if (typeof raw !== 'string' || !raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as T[]) : null
  } catch {
    return null
  }
}

/**
 * Shared-cache write. Stores only a non-empty array under the size cap, with a hard EX TTL.
 * Never throws — a failed write only means the next instance pays for the call.
 */
export async function serperCacheSet(
  endpoint: SerperCachedEndpoint,
  query: string,
  area: SerperCacheArea,
  value: unknown,
  variant?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!CACHEABLE.has(endpoint) || !query.trim() || !isDistributedStoreConfigured(env)) return
  if (!Array.isArray(value) || value.length === 0) return
  try {
    const v2 = serperCacheV2Enabled(env)
    // v2 shares only cleaned public text: an injected title/snippet never reaches another user's turn raw (serperUntrusted.ts).
    const json = JSON.stringify(v2 ? sanitizeSerperJson(value).body : value)
    if (new TextEncoder().encode(json).length > SERPER_CACHE_MAX_BYTES) return
    const ttl = v2 ? serperTtlV2(endpoint, query, env) : serperCacheTtlSeconds(env)
    await kvCommand(['SET', serperSharedCacheKey(endpoint, query, area, variant, env), json, 'EX', String(ttl)], env)
  } catch {
    /* fail open */
  }
}
