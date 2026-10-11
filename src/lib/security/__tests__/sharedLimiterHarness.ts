// Test harness for routes that use the shared limiter (`publicRateLimit` → `distributedRateLimit`). NOT a test file (no `.test.`): import it from route tests.
// The store models a Redis sorted set exactly like distributedRateLimit.test.ts does (members in a Map, so a constant member would under-count), and can be made
// to fail so the store-failure behaviour of a route is measured, not assumed. Nothing here talks to a network; no key, URL or token is real.

import { vi } from 'vitest'
import { __resetRateLimitStore, __setRateLimitStore, type RateLimitStore } from '../distributedRateLimit'

export type SharedTestStore = RateLimitStore & { failNext(mode: 'throw' | 'malformed' | null): void; calls(): number }

export function createSharedTestStore(): SharedTestStore {
  const sets = new Map<string, Map<string, number>>()
  let failure: 'throw' | 'malformed' | null = null
  let calls = 0
  return {
    failNext(mode) { failure = mode },
    calls: () => calls,
    async evalSlidingWindow(key, nowMs, windowMs, limit, member) {
      calls++
      if (failure === 'throw') throw new Error('store unreachable')
      if (failure === 'malformed') return [NaN, NaN] as unknown as [number, number]
      const set = sets.get(key) ?? new Map<string, number>()
      for (const [m, score] of set) if (score <= nowMs - windowMs) set.delete(m)
      if (set.size >= limit) { sets.set(key, set); return [0, Math.min(...set.values())] }
      set.set(member, nowMs)
      sets.set(key, set)
      return [1, 0]
    },
  }
}

let current: SharedTestStore | null = null

/**
 * After `vi.resetModules()` a route is imported with a FRESH module graph (a new lambda): its own copy of the limiter module has no injected store. Call this
 * right after the reset and before importing the route, so the fresh graph talks to the same fake store (or to none).
 */
export async function bindFreshGraph(): Promise<void> {
  const mod = await import('../distributedRateLimit')
  if (current) mod.__setRateLimitStore(current)
  else mod.__resetRateLimitStore()
}

/** The deployment shape "a shared store is configured": credentials present (by name only) and a fake store injected. */
export function configureSharedStore(store: SharedTestStore = createSharedTestStore()): SharedTestStore {
  vi.stubEnv('KV_REST_API_URL', 'https://kv.invalid')
  vi.stubEnv('KV_REST_API_TOKEN', 'test-token-not-real')
  current = store
  __setRateLimitStore(store)
  return store
}

/** The deployment shape "no store configured" (a preview, a fork, a local run): the limiter falls back to the in-process counter. */
export function configureNoStore(): void {
  vi.stubEnv('KV_REST_API_URL', '')
  vi.stubEnv('KV_REST_API_TOKEN', '')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  current = null
  __resetRateLimitStore()
}

export function resetLimiterEnv(): void {
  vi.unstubAllEnvs()
  current = null
  __resetRateLimitStore()
}
