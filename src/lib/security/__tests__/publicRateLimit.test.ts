import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { isDistributedStoreConfigured, __setRateLimitStore, __resetRateLimitStore, type RateLimitStore } from '../distributedRateLimit'
import { publicRateLimit, publicDailyRateLimit } from '../publicRateLimit'
import { vnToday } from '@/lib/config/product'

// ── P1-5: public LLM endpoints get a cap that actually caps ──────────────────
//
// WHAT WAS WRONG. `/api/translate`, `/api/scan` and `/api/viet-content` call a model without
// requiring an account, and counted requests in a module-level Map. rateLimit.ts says so in its
// own header: "Scoped per serverless instance (not a global guarantee)". On Vercel the real
// ceiling was N × limit with N chosen by the platform.
//
// WHAT MUST NOT BREAK WHILE FIXING IT. `distributedRateLimit` is fail-closed by the C10 contract —
// no store means refuse. Applied unchanged to a public endpoint that would take the feature down
// entirely on any deployment without credentials, and take it down silently. So the wrapper has to
// tell "never configured" from "configured and not answering", and these tests are about that
// distinction more than about counting.

const KEY = 'route:1.2.3.4'

/** A store that admits the first `limit` calls per key, like the real Lua script. */
function countingStore(): RateLimitStore & { calls: string[] } {
  const seen = new Map<string, number>()
  const calls: string[] = []
  return {
    calls,
    async evalSlidingWindow(key, nowMs, _windowMs, limit) {
      calls.push(key)
      const n = (seen.get(key) ?? 0) + 1
      if (n > limit) return [0, nowMs - 1_000]
      seen.set(key, n)
      return [1, nowMs]
    },
  }
}

const failingStore = (): RateLimitStore => ({
  async evalSlidingWindow() { throw new Error('store unreachable') },
})

const CONFIGURED = { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 't' }

beforeEach(() => {
  __resetRateLimitStore()
  vi.unstubAllEnvs()
})
afterEach(() => {
  __resetRateLimitStore()
  vi.unstubAllEnvs()
})

describe('P1-5 · configuration detection', () => {
  it('recognises the Vercel KV pair', () => {
    expect(isDistributedStoreConfigured(CONFIGURED as unknown as NodeJS.ProcessEnv)).toBe(true)
  })

  it('recognises the legacy Upstash pair', () => {
    expect(isDistributedStoreConfigured({
      UPSTASH_REDIS_REST_URL: 'https://u.example', UPSTASH_REDIS_REST_TOKEN: 't',
    } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })

  it('a URL without a token is NOT configured — half a credential is none', () => {
    expect(isDistributedStoreConfigured({ KV_REST_API_URL: 'https://kv.example' } as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(isDistributedStoreConfigured({ KV_REST_API_TOKEN: 't' } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })

  it('an empty environment is not configured', () => {
    expect(isDistributedStoreConfigured({} as NodeJS.ProcessEnv)).toBe(false)
  })
})

describe('P1-5 · with a shared store configured, the cap is shared', () => {
  beforeEach(() => {
    vi.stubEnv('KV_REST_API_URL', CONFIGURED.KV_REST_API_URL)
    vi.stubEnv('KV_REST_API_TOKEN', CONFIGURED.KV_REST_API_TOKEN)
  })

  it('admits under the limit and refuses over it', async () => {
    __setRateLimitStore(countingStore())
    expect((await publicRateLimit(KEY, 2, 60_000)).ok).toBe(true)
    expect((await publicRateLimit(KEY, 2, 60_000)).ok).toBe(true)
    const third = await publicRateLimit(KEY, 2, 60_000)
    expect(third.ok).toBe(false)
    expect(third.scope).toBe('distributed')
    expect(third.retryAfter).toBeGreaterThan(0)
  })

  it('keeps separate routes in separate buckets', async () => {
    const store = countingStore()
    __setRateLimitStore(store)
    await publicRateLimit('translate:1.2.3.4', 1, 60_000)
    const other = await publicRateLimit('scan:1.2.3.4', 1, 60_000)
    // One route exhausting its cap must not lock a caller out of a different feature.
    expect(other.ok).toBe(true)
    expect(new Set(store.calls).size).toBe(2)
  })

  it('keeps separate callers in separate buckets', async () => {
    __setRateLimitStore(countingStore())
    await publicRateLimit('translate:1.1.1.1', 1, 60_000)
    expect((await publicRateLimit('translate:2.2.2.2', 1, 60_000)).ok).toBe(true)
  })

  // THE FAILURE MODE THE OWNER CHOSE (D2). Credentials exist, so a silent answer means an outage —
  // and an outage must not quietly remove the cap on an endpoint that spends money per request.
  it('FAILS CLOSED when the configured store does not answer', async () => {
    __setRateLimitStore(failingStore())
    const out = await publicRateLimit(KEY, 10, 60_000)
    expect(out.ok).toBe(false)
    expect(out.scope).toBe('distributed')
  })

  it('fails closed on the daily cap too', async () => {
    __setRateLimitStore(failingStore())
    expect((await publicDailyRateLimit(KEY, 30)).ok).toBe(false)
  })
})

describe('P1-5 · with NO store configured, behaviour is exactly what shipped', () => {
  // The other half of D2. A deployment without credentials — a preview build, a fork, a local run
  // — must keep working with the in-process cap rather than refusing every request.
  it('falls back to the in-process limiter instead of refusing', async () => {
    const out = await publicRateLimit(`fallback:${Math.random()}`, 2, 60_000)
    expect(out.ok).toBe(true)
    expect(out.scope).toBe('instance')
  })

  it('the in-process fallback still counts', async () => {
    const key = `fallback-count:${Math.random()}`
    expect((await publicRateLimit(key, 2, 60_000)).ok).toBe(true)
    expect((await publicRateLimit(key, 2, 60_000)).ok).toBe(true)
    expect((await publicRateLimit(key, 2, 60_000)).ok).toBe(false)
  })

  it('the daily fallback still counts', async () => {
    const key = `fallback-daily:${Math.random()}`
    expect((await publicDailyRateLimit(key, 1)).ok).toBe(true)
    expect((await publicDailyRateLimit(key, 1)).ok).toBe(false)
  })
})

describe('P1-5 · the daily cap resets on the VN calendar day, not on a rolling 24h', () => {
  beforeEach(() => {
    vi.stubEnv('KV_REST_API_URL', CONFIGURED.KV_REST_API_URL)
    vi.stubEnv('KV_REST_API_TOKEN', CONFIGURED.KV_REST_API_TOKEN)
  })

  it('scopes the shared key to the VN date', async () => {
    // The product copy says "try again tomorrow" and the shipped limiter reset at VN midnight. The
    // shared store only knows sliding windows, so the DATE has to be in the key or the promise
    // silently becomes "a rolling 24 hours".
    const store = countingStore()
    __setRateLimitStore(store)
    await publicDailyRateLimit('translate:1.2.3.4', 30)
    // `local:` = the environment namespace (1b-2) — VERCEL_ENV is unset under vitest.
    expect(store.calls[0]).toBe(`local:translate:1.2.3.4:${vnToday()}`)
  })

  it('a different day is a different bucket', async () => {
    const store = countingStore()
    __setRateLimitStore(store)
    await publicDailyRateLimit('translate:1.2.3.4', 1)
    // Same caller, same route, key from another day — the count must start again.
    const [admitted] = await store.evalSlidingWindow('translate:1.2.3.4:2000-01-01', Date.now(), 86_400_000, 1, 'm')
    expect(admitted).toBe(1)
  })
})

describe('P1-5 · the three public LLM endpoints use the shared limiter', () => {
  // Structural: these three are the endpoints the audit found unprotected, and the failure being
  // prevented is a future route reaching for the in-process limiter because it was copied from an
  // older one.
  const ROUTES = [
    ['translate', 'src/app/api/translate/route.ts', 'publicDailyRateLimit'],
    ['scan', 'src/app/api/scan/route.ts', 'publicDailyRateLimit'],
    ['viet-content', 'src/app/api/viet-content/route.ts', 'publicRateLimit'],
  ] as const

  it.each(ROUTES)('%s calls %s and no longer counts per instance', (_name, path, fn) => {
    const src = readFileSync(path, 'utf8')
    expect(src).toContain(`${fn}(`)
    // The in-process limiters must be gone from these three, not merely shadowed.
    expect(src).not.toMatch(/[^c]\bdailyRateLimit\(/)
    expect(src).not.toMatch(/[^c]\brateLimit\(/)
  })

  it('awaits the limiter — an un-awaited promise is truthy and admits everything', () => {
    // `if (!(await f(...)).ok)` vs `if (!f(...).ok)`: the second reads `.ok` on a Promise, gets
    // undefined, and lets every request through. That is the single likeliest way this change
    // could be silently reverted.
    for (const [, path] of ROUTES) {
      expect(readFileSync(path, 'utf8')).toMatch(/await public(Daily)?RateLimit\(/)
    }
  })
})
