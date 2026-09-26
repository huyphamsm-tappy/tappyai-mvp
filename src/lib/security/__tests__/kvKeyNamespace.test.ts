// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  distributedRateLimit, distributedCountInWindow, envKeyPrefix, namespacedKey,
  __setRateLimitStore, __resetRateLimitStore, type RateLimitStore,
} from '../distributedRateLimit'
import { publicRateLimit, publicDailyRateLimit } from '../publicRateLimit'
import { incrDailyCounter, __resetKvCounters } from '../kvCounter'
import { vnToday } from '@/lib/config/product'

// ── 1b-2 (2026-09-20): ONE Upstash database, THREE deployments ───────────────────────────────
//
// The Vercel Upstash integration sets KV_REST_API_* for All Environments, so Production, Preview
// and a local run with pulled credentials share one Redis. With bare keys, a tester on a preview
// URL shared `chat:ip:<ip>` with a real user on the same network, and — worse — preview traffic
// counted against the PRODUCTION `serper:credits:<day>` ceiling. Every key is now prefixed with
// `${VERCEL_ENV}:` at the store boundary; unset VERCEL_ENV (local, tests) reads `local:`.
//
// These tests build keys under two environments and assert they land in DIFFERENT buckets, for
// every key shape the product uses: chat:ip / chat:user / chat:pro / serper:credits / admin.

/** Records every key the store is asked about, and admits the first `limit` per key. */
function recordingStore(): RateLimitStore & { keys: string[] } {
  const seen = new Map<string, number>()
  const keys: string[] = []
  return {
    keys,
    async evalSlidingWindow(key, nowMs, _windowMs, limit) {
      keys.push(key)
      const n = (seen.get(key) ?? 0) + 1
      if (n > limit) return [0, nowMs - 1_000]
      seen.set(key, n)
      return [1, nowMs]
    },
    async countInWindow(key) { keys.push(key); return seen.get(key) ?? 0 },
  }
}

const CONFIGURED = { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 't' }

beforeEach(() => { __resetRateLimitStore(); __resetKvCounters() })
afterEach(() => { __resetRateLimitStore(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('the environment prefix', () => {
  it('is VERCEL_ENV, and `local` when VERCEL_ENV is unset or empty', () => {
    expect(envKeyPrefix({} as unknown as NodeJS.ProcessEnv)).toBe('local:')
    expect(envKeyPrefix({ VERCEL_ENV: '' } as unknown as NodeJS.ProcessEnv)).toBe('local:')
    expect(envKeyPrefix({ VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toBe('production:')
    expect(envKeyPrefix({ VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv)).toBe('preview:')
    expect(namespacedKey('chat:ip:1.2.3.4', { VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv)).toBe('preview:chat:ip:1.2.3.4')
  })
})

describe('the sliding-window limiter (chat:ip, chat:user, admin)', () => {
  it.each(['chat:ip:203.0.113.7', 'chat:user:u-1', 'admin:deals:list:u-1'])(
    '%s: production and preview do not share a bucket, and an unset VERCEL_ENV lands in `local:`',
    async (key) => {
      const store = recordingStore()
      __setRateLimitStore(store)

      vi.stubEnv('VERCEL_ENV', 'production')
      for (let i = 0; i < 2; i++) expect((await distributedRateLimit(key, 2, 60_000)).ok).toBe(true)
      expect((await distributedRateLimit(key, 2, 60_000)).ok).toBe(false) // production is full

      vi.stubEnv('VERCEL_ENV', 'preview')
      expect((await distributedRateLimit(key, 2, 60_000)).ok).toBe(true) // preview is untouched

      vi.stubEnv('VERCEL_ENV', '')
      expect((await distributedRateLimit(key, 2, 60_000)).ok).toBe(true)

      expect(new Set(store.keys)).toEqual(new Set([`production:${key}`, `preview:${key}`, `local:${key}`]))
      expect(store.keys.some(k => k === key)).toBe(false) // the bare key never reaches the store
    },
  )

  it('the READ-ONLY count uses the same prefixed key as the write', async () => {
    const store = recordingStore()
    __setRateLimitStore(store)
    vi.stubEnv('VERCEL_ENV', 'production')
    await distributedRateLimit('ai:q:u:u1', 5, 60_000)
    expect(await distributedCountInWindow('ai:q:u:u1', 60_000)).toBe(1)
    expect(store.keys).toEqual(['production:ai:q:u:u1', 'production:ai:q:u:u1'])
  })

  it('reaches the public wrappers unchanged: chat:pro carries prefix, key and VN date', async () => {
    const store = recordingStore()
    __setRateLimitStore(store)
    vi.stubEnv('KV_REST_API_URL', CONFIGURED.KV_REST_API_URL)
    vi.stubEnv('KV_REST_API_TOKEN', CONFIGURED.KV_REST_API_TOKEN)
    vi.stubEnv('VERCEL_ENV', 'preview')
    await publicRateLimit('chat:ip:203.0.113.7', 3, 60_000)
    await publicDailyRateLimit('chat:pro:u-1', 300)
    expect(store.keys).toEqual(['preview:chat:ip:203.0.113.7', `preview:chat:pro:u-1:${vnToday()}`])
  })
})

describe('the shared daily counter (serper:credits)', () => {
  it('production and preview increment DIFFERENT keys; unset VERCEL_ENV is `local:`', async () => {
    const bodies: string[][][] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(String((init as RequestInit).body)) as string[][])
      return new Response(JSON.stringify([{ result: 3 }, { result: 1 }]), { status: 200 })
    })
    const day = vnToday()
    await incrDailyCounter('serper:credits', 3, { ...CONFIGURED, VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)
    await incrDailyCounter('serper:credits', 3, { ...CONFIGURED, VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv)
    await incrDailyCounter('serper:credits', 3, { ...CONFIGURED } as unknown as NodeJS.ProcessEnv)
    expect(bodies.map(b => b[0][1])).toEqual([
      `production:serper:credits:${day}`,
      `preview:serper:credits:${day}`,
      `local:serper:credits:${day}`,
    ])
    // EXPIRE targets the same prefixed key as INCRBY — a TTL on the bare key would never expire anything.
    expect(bodies.map(b => b[1][1])).toEqual(bodies.map(b => b[0][1]))
  })

  it('the in-process fallback is namespaced the same way, so a later store recovery reads its own shadow', async () => {
    const a = await incrDailyCounter('serper:credits', 3, { VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)
    const b = await incrDailyCounter('serper:credits', 3, { VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv)
    expect(a).toEqual({ count: 3, scope: 'instance' })
    expect(b).toEqual({ count: 3, scope: 'instance' }) // not 6: a different environment is a different counter
  })
})
