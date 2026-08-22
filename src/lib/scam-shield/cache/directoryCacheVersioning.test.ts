import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OfficialEntity } from '../types'

/**
 * C08 deployment hazard — a directory change must be live on the first request after deploy.
 *
 * ============================================================================
 * THE FAILURE THIS PREVENTS
 * ============================================================================
 * The official directory was cached in Redis under the fixed key `ss:directory` for one hour.
 * C09 then added `aliases`, which is the entire reason `vcb-secure-login.net` scores 79/HIGH
 * instead of 19/LOW.
 *
 * 🚨 With a fixed key, the first hour after that deploy serves the PREVIOUS directory: new code,
 * old data, bank phishing still scoring LOW. That hour is exactly when a release gets verified, so
 * the verification would have failed and the cause — a cache key nobody documented — would not
 * have been visible in any diff.
 *
 * The key is now derived from the directory's content, so different data is simply a different
 * key. These tests hold that property.
 */

const BASE: OfficialEntity[] = [
  { id: 'vcb', brand: 'Vietcombank', category: 'bank', domains: ['vietcombank.com.vn'], website: 'https://vietcombank.com.vn' },
]
const WITH_ALIAS: OfficialEntity[] = [
  { ...BASE[0], aliases: ['VCB'] },
]

/** An in-memory stand-in for Upstash, so the test exercises the real key logic. */
function fakeRedis() {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    mget: vi.fn(async (...ks: string[]) => ks.map((k) => store.get(k) ?? null)),
    set: vi.fn(async (k: string, v: string, _opts?: { ex?: number }) => { store.set(k, v); return 'OK' }),
  }
}

let redis: ReturnType<typeof fakeRedis>

vi.mock('@upstash/redis', () => ({
  Redis: class { constructor() { return redis } },
}))

beforeEach(() => {
  vi.resetModules()
  redis = fakeRedis()
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
})

async function cacheModule() {
  return import('./redisCache')
}

describe('C08 — the directory cache is content-addressed', () => {
  it('a directory change lands on a DIFFERENT key', async () => {
    const { setCachedDirectory } = await cacheModule()
    await setCachedDirectory(BASE)
    await setCachedDirectory(WITH_ALIAS)

    const keys = [...redis.store.keys()]
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
    for (const k of keys) expect(k).toMatch(/^ss:directory:[0-9a-f]{12}$/)
  })

  it('🚨 adding an alias does NOT read back the pre-alias directory', async () => {
    // The exact deploy scenario: yesterday's directory is already in Redis with an hour to live,
    // and today's code ships aliases. A fixed key would return yesterday's copy.
    const { setCachedDirectory, getCachedDirectory } = await cacheModule()
    await setCachedDirectory(BASE)                       // the deployed-yesterday state
    const hit = await getCachedDirectory(WITH_ALIAS)     // today's code asks for today's directory
    expect(hit, 'a stale directory was served after a content change').toBeNull()
  })

  it('the same directory still hits the cache — this is a cache, not a bypass', async () => {
    const { setCachedDirectory, getCachedDirectory } = await cacheModule()
    await setCachedDirectory(WITH_ALIAS)
    const hit = await getCachedDirectory(WITH_ALIAS)
    expect(hit).toEqual(WITH_ALIAS)
    expect(redis.get).toHaveBeenCalledOnce()
  })

  it('a TTL is still set, so an abandoned key expires on its own', async () => {
    const { setCachedDirectory } = await cacheModule()
    await setCachedDirectory(BASE)
    const opts = redis.set.mock.calls[0][2]
    expect(opts?.ex, 'without a TTL, superseded keys accumulate forever').toBeGreaterThan(0)
  })

  it('no caller can reach the old fixed key by accident', async () => {
    const { setCachedDirectory } = await cacheModule()
    await setCachedDirectory(WITH_ALIAS)
    expect([...redis.store.keys()]).not.toContain('ss:directory')
  })
})

describe('C08 — the cache degrades safely', () => {
  it('with no Redis configured, the directory is simply not cached', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    const { getCachedDirectory, setCachedDirectory } = await cacheModule()
    await expect(setCachedDirectory(BASE)).resolves.toBeUndefined()
    await expect(getCachedDirectory(BASE)).resolves.toBeNull()
  })
})
