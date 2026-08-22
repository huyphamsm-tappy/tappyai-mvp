import { createHash } from 'node:crypto'
import type { ProviderSignal } from '../types'
import { CACHE_TTLS } from '../config'

interface CacheClient {
  get(key: string): Promise<string | null>
  mget(...keys: string[]): Promise<(string | null)[]>
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>
}

let redis: CacheClient | null = null

async function getRedis(): Promise<CacheClient | null> {
  if (redis) return redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    const { Redis } = await import('@upstash/redis')
    redis = new Redis({ url, token })
    return redis
  } catch {
    return null
  }
}

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

function cacheKey(provider: string, url: string): string {
  return `ss:${provider}:${hashUrl(url)}`
}

export async function getCachedSignals(
  providers: string[],
  url: string,
): Promise<Map<string, ProviderSignal>> {
  const client = await getRedis()
  const result = new Map<string, ProviderSignal>()
  if (!client || providers.length === 0) return result
  try {
    const keys = providers.map(p => cacheKey(p, url))
    const values = await client.mget(...keys)
    for (let i = 0; i < providers.length; i++) {
      const v = values[i]
      if (v) {
        const signal = (typeof v === 'string' ? JSON.parse(v) : v) as ProviderSignal
        signal.cachedAt = signal.cachedAt ?? Date.now()
        result.set(providers[i], signal)
      }
    }
  } catch {
    // Cache failure is non-blocking
  }
  return result
}

export async function setCachedSignal(
  provider: string,
  url: string,
  signal: ProviderSignal,
): Promise<void> {
  const client = await getRedis()
  if (!client) return
  const ttlMs = CACHE_TTLS[provider] ?? 60_000
  try {
    await client.set(cacheKey(provider, url), JSON.stringify(signal), {
      ex: Math.ceil(ttlMs / 1000),
    })
  } catch {
    // Cache write failure is non-blocking
  }
}

/**
 * The Redis key for the official directory, derived from the directory's own CONTENT.
 *
 * ============================================================================
 * WHY THE KEY IS VERSIONED (C08 deployment hazard)
 * ============================================================================
 * This used to be the fixed key `ss:directory` with a one-hour TTL. That is fine while the
 * directory never changes — and actively dangerous the moment it does.
 *
 * 🚨 C09 added `aliases` to fourteen entities, which is what makes `vcb-secure-login.net` score
 * 79/HIGH instead of 19/LOW. With a fixed key, the first hour after that deploy would still serve
 * the PREVIOUS directory out of Redis: the code would be new, the data would be old, and a bank
 * phishing domain would keep scoring LOW. Anyone verifying the deploy in that window — which is
 * exactly when a release is verified — would conclude the fix did not work, and the only remedy
 * would be to know to flush a cache key nobody documented.
 *
 * Hashing the content means a changed directory simply lands on a different key. The new data is
 * live on the first request after deploy, the old key expires on its own, and there is nothing to
 * remember to invalidate. Cache invalidation stops being a step someone can forget.
 */
function directoryKey(entities: unknown[]): string {
  const digest = createHash('sha256').update(JSON.stringify(entities)).digest('hex').slice(0, 12)
  return `ss:directory:${digest}`
}

/**
 * Reads the cached directory for THIS EXACT content.
 *
 * The caller passes the directory it is about to fall back to, which is what lets the key be
 * content-addressed: a hit can only be a copy of the same data, so a stale one is impossible by
 * construction rather than by TTL.
 */
export async function getCachedDirectory(expected: unknown[]): Promise<unknown[] | null> {
  const client = await getRedis()
  if (!client) return null
  try {
    const raw = await client.get(directoryKey(expected))
    if (!raw) return null
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as unknown[]
  } catch {
    return null
  }
}

export async function setCachedDirectory(entities: unknown[]): Promise<void> {
  const client = await getRedis()
  if (!client) return
  const ttlMs = CACHE_TTLS.directory ?? 60 * 60_000
  try {
    await client.set(directoryKey(entities), JSON.stringify(entities), {
      ex: Math.ceil(ttlMs / 1000),
    })
  } catch {
    // Cache write failure is non-blocking
  }
}
