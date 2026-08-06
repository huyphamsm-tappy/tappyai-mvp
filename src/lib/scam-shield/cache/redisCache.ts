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

export async function getCachedDirectory(): Promise<unknown[] | null> {
  const client = await getRedis()
  if (!client) return null
  try {
    const raw = await client.get('ss:directory')
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
    await client.set('ss:directory', JSON.stringify(entities), {
      ex: Math.ceil(ttlMs / 1000),
    })
  } catch {
    // Cache write failure is non-blocking
  }
}
