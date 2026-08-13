import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  __setRateLimitStore,
  __resetRateLimitStore,
  type RateLimitStore,
} from '@/lib/security/distributedRateLimit'

// Controller V2 — Component 10, route-level contract.
//
// The limiter is deliberately NOT mocked here. Every other admin route test
// mocks it to isolate route logic, which means none of them can tell whether a
// 429 carries `Retry-After` — the header was missing on all 11 admin routes
// until this component, and a mocked limiter would never have revealed it.
//
// Only authentication is stubbed. The rate-limit decision is real.

const h = vi.hoisted(() => ({ userId: 'user-alpha' }))

vi.mock('@/lib/admin/permissions', () => ({
  requirePermission: vi.fn(async () => ({ user: { id: h.userId }, actor: { userId: h.userId } })),
  PERMISSIONS: { SETTINGS_CONFIG_READ: 'settings.config.read' },
}))

/** Minimal faithful shared store — members are a set, as in Redis. */
function createStore(): RateLimitStore & { breakIt(): void } {
  const sets = new Map<string, Map<string, number>>()
  let broken = false
  return {
    breakIt() {
      broken = true
    },
    async evalSlidingWindow(key, nowMs, windowMs, limit, member) {
      if (broken) throw new Error('store unreachable')
      const set = sets.get(key) ?? new Map<string, number>()
      for (const [m, s] of set) if (s <= nowMs - windowMs) set.delete(m)
      if (set.size >= limit) {
        sets.set(key, set)
        return [0, Math.min(...set.values())]
      }
      set.set(member, nowMs)
      sets.set(key, set)
      return [1, 0]
    },
  }
}

// Imported statically on purpose. A dynamic import combined with
// vi.resetModules() gives the route its own copy of the limiter module, whose
// injected store would be empty — the route would then fail closed and the test
// would "pass" for entirely the wrong reason.
import { GET } from './settings/route'

let store: ReturnType<typeof createStore>
const call = () => GET(new Request('https://www.tappyai.com/api/admin/settings'))

beforeEach(() => {
  store = createStore()
  __setRateLimitStore(store)
  h.userId = 'user-alpha'
})

afterEach(() => {
  __resetRateLimitStore()
})

describe('C10 — a real admin route returns 429 / RATE_LIMITED / Retry-After', () => {
  it('admits up to the route limit, then rejects with the full contract', async () => {
    // /api/admin/settings is documented at 100 per 60s.
    for (let i = 0; i < 100; i++) {
      expect((await call()).status).toBe(200)
    }

    const denied = await call()
    expect(denied.status).toBe(429)

    const body = (await denied.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('RATE_LIMITED')

    const retryAfter = denied.headers.get('Retry-After')
    expect(retryAfter).not.toBeNull()
    expect(Number(retryAfter)).toBeGreaterThan(0)
    expect(Number(retryAfter)).toBeLessThanOrEqual(60)
  })

  it('isolates a different admin actor on the same route', async () => {
    for (let i = 0; i < 100; i++) await call()
    expect((await call()).status).toBe(429)

    h.userId = 'user-beta'
    expect((await call()).status).toBe(200)
  })

  it('fails CLOSED when the shared store is unavailable', async () => {
    expect((await call()).status).toBe(200)

    store.breakIt()
    const denied = await call()
    expect(denied.status).toBe(429)
    expect(((await denied.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED')
    expect(denied.headers.get('Retry-After')).not.toBeNull()
  })

  it('does not leak the admin user id into the 429 response', async () => {
    for (let i = 0; i < 100; i++) await call()
    const denied = await call()
    const text = await denied.text()
    expect(text).not.toContain('user-alpha')
    expect(denied.headers.get('Retry-After')).not.toContain('user-alpha')
  })
})
