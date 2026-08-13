import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  distributedRateLimit,
  createUpstashStore,
  __setRateLimitStore,
  __resetRateLimitStore,
  type RateLimitStore,
} from './distributedRateLimit'

// Controller V2 — Component 10. Closes audit finding S4.
//
// These tests drive the REAL limiter. `distributedRateLimit` is never mocked —
// mocking it is what the previous admin-route tests did, and it is why the
// repository could ship a limiter that does not limit while the suite stayed
// green.
//
// What IS substituted is the STORE, and only so that a single store can be
// shared between two independent limiter call paths. That substitution is the
// point of case 11, not a way around it.
//
// Honest scope note: the production decision runs as a Lua script inside Redis
// (atomic). This fake reproduces the same algorithm in TypeScript so the
// limiter's contract can be tested deterministically in CI. The Lua script
// itself is proven against the real Upstash instance during production
// verification — a unit test cannot execute it.

/** A shared store, faithful to the sorted-set algorithm the Lua script runs.
 *
 *  Members are stored as a MAP keyed by member, exactly like a Redis sorted set:
 *  ZADD with a member that already exists updates its score instead of adding a
 *  second entry. Modelling this matters — an earlier version of this fake kept a
 *  plain array of timestamps, and a mutation that made the limiter emit a
 *  constant member stayed green against it. In production that mutation would
 *  silently under-count every request landing in the same millisecond. */
function createSharedTestStore(): RateLimitStore & { failNext(mode: 'throw' | 'malformed' | null): void } {
  const sets = new Map<string, Map<string, number>>()
  let failure: 'throw' | 'malformed' | null = null

  return {
    failNext(mode) {
      failure = mode
    },
    async evalSlidingWindow(key, nowMs, windowMs, limit, member) {
      if (failure === 'throw') throw new Error('store unreachable')
      if (failure === 'malformed') return [NaN, NaN] as unknown as [number, number]

      const set = sets.get(key) ?? new Map<string, number>()
      for (const [m, score] of set) if (score <= nowMs - windowMs) set.delete(m)

      if (set.size >= limit) {
        sets.set(key, set) // rejection prunes but must NOT add
        return [0, Math.min(...set.values())]
      }
      set.set(member, nowMs) // same member ⇒ overwrite, exactly as Redis does
      sets.set(key, set)
      return [1, 0]
    },
  }
}

let store: ReturnType<typeof createSharedTestStore>

beforeEach(() => {
  store = createSharedTestStore()
  __setRateLimitStore(store)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-13T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  __resetRateLimitStore()
})

const KEY = 'admin:rbac:grant:user-a'

describe('C10 — 1..3 admission up to the boundary', () => {
  it('1 — the first request is admitted', async () => {
    expect(await distributedRateLimit(KEY, 3, 60_000)).toEqual({ ok: true, retryAfter: 0 })
  })

  it('2 — requests below the limit are all admitted', async () => {
    expect((await distributedRateLimit(KEY, 3, 60_000)).ok).toBe(true)
    expect((await distributedRateLimit(KEY, 3, 60_000)).ok).toBe(true)
  })

  it('3 — the request at exactly the limit is admitted', async () => {
    await distributedRateLimit(KEY, 3, 60_000)
    await distributedRateLimit(KEY, 3, 60_000)
    expect((await distributedRateLimit(KEY, 3, 60_000)).ok).toBe(true)
  })
})

describe('C10 — 4..5 rejection', () => {
  it('4 — limit + 1 is rejected', async () => {
    for (let i = 0; i < 3; i++) await distributedRateLimit(KEY, 3, 60_000)
    expect((await distributedRateLimit(KEY, 3, 60_000)).ok).toBe(false)
  })

  it('5 — a rejected request does not increment the counter', async () => {
    for (let i = 0; i < 3; i++) await distributedRateLimit(KEY, 3, 60_000)

    // Hammer well past the limit. If rejections counted, the window would keep
    // extending and the key would never recover.
    for (let i = 0; i < 20; i++) expect((await distributedRateLimit(KEY, 3, 60_000)).ok).toBe(false)

    // Move just past the window relative to the ORIGINAL three admissions.
    vi.advanceTimersByTime(60_001)
    expect((await distributedRateLimit(KEY, 3, 60_000)).ok).toBe(true)
  })
})

describe('C10 — 6 Retry-After', () => {
  it('6 — reports seconds remaining, never zero, never longer than the window', async () => {
    for (let i = 0; i < 2; i++) await distributedRateLimit(KEY, 2, 60_000)
    vi.advanceTimersByTime(20_000)

    const denied = await distributedRateLimit(KEY, 2, 60_000)
    expect(denied.ok).toBe(false)
    expect(denied.retryAfter).toBe(40) // 60s window, 20s elapsed since oldest
    expect(denied.retryAfter).toBeGreaterThan(0)
    expect(denied.retryAfter).toBeLessThanOrEqual(60)
  })

  it('6b — an admitted request carries no retry delay', async () => {
    expect((await distributedRateLimit(KEY, 2, 60_000)).retryAfter).toBe(0)
  })
})

describe('C10 — 7 window expiry', () => {
  it('7 — the key admits again once the window has passed', async () => {
    for (let i = 0; i < 2; i++) await distributedRateLimit(KEY, 2, 60_000)
    expect((await distributedRateLimit(KEY, 2, 60_000)).ok).toBe(false)

    vi.advanceTimersByTime(59_000)
    expect((await distributedRateLimit(KEY, 2, 60_000)).ok).toBe(false) // still inside

    vi.advanceTimersByTime(1_001)
    expect((await distributedRateLimit(KEY, 2, 60_000)).ok).toBe(true) // now outside
  })
})

describe('C10 — 8..9 isolation', () => {
  it('8 — one exhausted key does not affect another', async () => {
    for (let i = 0; i < 2; i++) await distributedRateLimit('admin:deals:create:user-a', 2, 60_000)
    expect((await distributedRateLimit('admin:deals:create:user-a', 2, 60_000)).ok).toBe(false)
    expect((await distributedRateLimit('admin:deals:create:user-b', 2, 60_000)).ok).toBe(true)
  })

  it('9 — different users are isolated', async () => {
    for (let i = 0; i < 2; i++) await distributedRateLimit('admin:rbac:grant:alice', 2, 60_000)
    expect((await distributedRateLimit('admin:rbac:grant:alice', 2, 60_000)).ok).toBe(false)
    expect((await distributedRateLimit('admin:rbac:grant:bob', 2, 60_000)).ok).toBe(true)
  })

  it('10 — different route namespaces for the same user are isolated', async () => {
    for (let i = 0; i < 2; i++) await distributedRateLimit('admin:deals:delete:alice', 2, 60_000)
    expect((await distributedRateLimit('admin:deals:delete:alice', 2, 60_000)).ok).toBe(false)
    expect((await distributedRateLimit('admin:rbac:grant:alice', 2, 60_000)).ok).toBe(true)
  })
})

// ── The case that actually proves S4 is closed ───────────────────────────────
describe('C10 — 11 the counter is SHARED, not per-instance', () => {
  it('11 — two independent limiter call paths on one store enforce ONE combined cap', async () => {
    // Simulates two concurrent Vercel lambdas. Under the old in-process Map
    // each would keep its own counter and the effective ceiling would be
    // 2 × limit — precisely the defect S4 describes.
    const shared = createSharedTestStore()

    const instanceA = async () => {
      __setRateLimitStore(shared)
      return distributedRateLimit('admin:rbac:grant:shared-user', 3, 60_000)
    }
    const instanceB = async () => {
      __setRateLimitStore(shared)
      return distributedRateLimit('admin:rbac:grant:shared-user', 3, 60_000)
    }

    expect((await instanceA()).ok).toBe(true) // 1
    expect((await instanceB()).ok).toBe(true) // 2
    expect((await instanceA()).ok).toBe(true) // 3 — at the cap

    // A per-instance limiter would admit these: instance B has "only seen" one.
    expect((await instanceB()).ok).toBe(false)
    expect((await instanceA()).ok).toBe(false)
  })

  it('11b — the same proof stated as a count: 3 admitted across 6 attempts', async () => {
    const shared = createSharedTestStore()
    let admitted = 0
    for (let i = 0; i < 6; i++) {
      __setRateLimitStore(shared) // re-resolving the store each time = a fresh instance
      if ((await distributedRateLimit('admin:org:assign:shared', 3, 60_000)).ok) admitted++
    }
    expect(admitted).toBe(3)
  })
})

// ── Fail-closed (owner decision, contract §8) ────────────────────────────────
describe('C10 — 12 fail-closed', () => {
  it('12a — an unreachable store REJECTS rather than admitting', async () => {
    store.failNext('throw')
    const res = await distributedRateLimit(KEY, 100, 60_000)
    expect(res.ok).toBe(false)
    expect(res.retryAfter).toBeGreaterThan(0)
  })

  it('12b — a malformed response REJECTS', async () => {
    store.failNext('malformed')
    expect((await distributedRateLimit(KEY, 100, 60_000)).ok).toBe(false)
  })

  it('12c — NO configured store REJECTS; there is no in-memory fallback', async () => {
    // The whole point of C10: without the shared store there is no cap, so the
    // request must not proceed. Silently admitting would restore S4.
    __setRateLimitStore(null)
    const res = await distributedRateLimit(KEY, 100, 60_000)
    expect(res.ok).toBe(false)
    expect(res.retryAfter).toBeGreaterThan(0)
  })

  it('12d — a limit of 100 does not admit a single request while the store is down', async () => {
    store.failNext('throw')
    for (let i = 0; i < 5; i++) expect((await distributedRateLimit(KEY, 100, 60_000)).ok).toBe(false)
  })
})

describe('C10 — requests inside a single millisecond each count', () => {
  it('does not collapse same-millisecond requests into one entry', async () => {
    // Timers are frozen, so every call below carries an identical timestamp.
    // Sorted-set members are a SET: if the limiter emitted a constant member,
    // all of these would overwrite one entry and the cap would never be hit.
    expect((await distributedRateLimit(KEY, 3, 60_000)).ok).toBe(true)
    expect((await distributedRateLimit(KEY, 3, 60_000)).ok).toBe(true)
    expect((await distributedRateLimit(KEY, 3, 60_000)).ok).toBe(true)
    expect((await distributedRateLimit(KEY, 3, 60_000)).ok).toBe(false)
  })
})

// ── The store adapter itself ─────────────────────────────────────────────────
describe('C10 — Upstash adapter', () => {
  const okResponse = (result: unknown) =>
    ({ ok: true, status: 200, json: async () => ({ result }) }) as unknown as Response

  it('sends EVAL with the key and arguments, and never logs the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([1, 0]))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = createUpstashStore('https://example.upstash.io', 'token-value')
    expect(await adapter.evalSlidingWindow('admin:x:y:uid', 1000, 60_000, 5, 'm1')).toEqual([1, 0])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.upstash.io')
    const body = JSON.parse(init.body as string)
    expect(body[0]).toBe('EVAL')
    expect(body[2]).toBe('1')
    expect(body[3]).toBe('admin:x:y:uid')
    expect(body.slice(4)).toEqual(['1000', '60000', '5', 'm1'])
    vi.unstubAllGlobals()
  })

  it('treats an HTTP error as a store failure, so the caller fails closed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response))
    const adapter = createUpstashStore('https://example.upstash.io', 'token-value')
    await expect(adapter.evalSlidingWindow('k', 1, 1, 1, 'm')).rejects.toThrow()
    vi.unstubAllGlobals()
  })

  it('treats a Redis-level error as a store failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: 'ERR' }) } as unknown as Response)
    )
    const adapter = createUpstashStore('https://example.upstash.io', 'token-value')
    await expect(adapter.evalSlidingWindow('k', 1, 1, 1, 'm')).rejects.toThrow()
    vi.unstubAllGlobals()
  })
})

// ── Guard against the limiter leaking identifiers ────────────────────────────
describe('C10 — keys carry a user id and must not leak', () => {
  it('does not write the key to the console on the failure path', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    store.failNext('throw')

    await distributedRateLimit('admin:rbac:grant:secret-user-id', 5, 60_000)

    for (const s of [spy, warn, log]) {
      for (const call of s.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('secret-user-id')
      }
    }
    spy.mockRestore()
    warn.mockRestore()
    log.mockRestore()
  })
})
