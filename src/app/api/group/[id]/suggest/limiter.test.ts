// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bindFreshGraph, configureNoStore, configureSharedStore, createSharedTestStore, resetLimiterEnv } from '@/lib/security/__tests__/sharedLimiterHarness'

// SEC4 slice 2a (docs/phase8/SEC4-ROUTE-MATRIX.md): POST /api/group/[id]/suggest — a paid LLM call, creator-only — moved from the in-process `rateLimit` to the SHARED
// limiter (`publicRateLimit`: shared store when configured, in-process only when NO store is configured, FAIL CLOSED when a store is configured but does not answer).
// Same limit (5 per minute) and same key (`group-suggest:<user id>`) as before. The LLM and the database are stubs; nothing leaves the process.

const h = vi.hoisted(() => ({ user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null, llm: 0, dbReads: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: h.user,
    supabase: { from: () => { h.dbReads++; const b: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'order']) b[m] = () => b; b.single = async () => ({ data: null, error: { message: 'none' } }); return b } },
  }),
}))
vi.mock('@/lib/ai/llm', () => ({ AI: { generate: async () => { h.llm++; return { text: '{}' } } } }))

async function freshRoute() {
  vi.resetModules() // a new module graph = a new lambda: its in-process counters start empty
  await bindFreshGraph()
  return (await import('./route')).POST
}
const call = (post: Awaited<ReturnType<typeof freshRoute>>) =>
  post(new Request('http://localhost/api/group/g1/suggest', { method: 'POST' }) as never, { params: { id: 'g1' } } as never)

beforeEach(() => { h.user = { id: 'u1', is_anonymous: false }; h.llm = 0; h.dbReads = 0; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T03:00:00Z')) })
afterEach(() => { vi.useRealTimers(); resetLimiterEnv() })

/** What an ADMITTED request looks like with these stubs: it passes the limiter and stops at the group lookup (404). */
const admitted = (r: Response) => r.status === 404
const limited = (r: Response) => r.status === 429

describe('shared store configured', () => {
  it('limit 5 per minute per USER: the 6th is 429 with the existing body, before any database read or model call', async () => {
    configureSharedStore()
    const post = await freshRoute()
    for (let i = 0; i < 5; i++) expect(admitted(await call(post)), `request ${i + 1}`).toBe(true)
    const res = await call(post)
    expect(limited(res)).toBe(true)
    expect((await res.json()).error).toBe('rate_limit')
    expect(h.dbReads).toBe(5) // the 6th never reached the database
    expect(h.llm).toBe(0)
  })

  it('keying: another user has their own bucket, and one user\'s two requests share one bucket', async () => {
    configureSharedStore()
    const post = await freshRoute()
    for (let i = 0; i < 5; i++) await call(post)
    expect(limited(await call(post))).toBe(true)
    h.user = { id: 'u2', is_anonymous: false }
    expect(admitted(await call(post))).toBe(true)
  })

  it('SHARED across instances: 3 requests on one lambda + 3 on another exhaust the same budget (the old in-process limiter admitted all 6)', async () => {
    const store = configureSharedStore()
    const a = await freshRoute()
    const b = await freshRoute() // second module graph = second lambda, same store
    for (let i = 0; i < 3; i++) expect(admitted(await call(a))).toBe(true)
    for (let i = 0; i < 2; i++) expect(admitted(await call(b))).toBe(true)
    expect(limited(await call(b))).toBe(true) // the 6th request overall, on the other instance
    expect(store.calls()).toBe(6)
  })

  it('the window slides: admitted again after a minute', async () => {
    configureSharedStore()
    const post = await freshRoute()
    for (let i = 0; i < 5; i++) await call(post)
    expect(limited(await call(post))).toBe(true)
    vi.setSystemTime(Date.now() + 30_000)
    expect(limited(await call(post))).toBe(true) // still inside the minute: the window is not shorter than promised
    vi.setSystemTime(Date.now() + 31_000)
    expect(admitted(await call(post))).toBe(true)
  })

  it('STORE FAILURE → FAIL CLOSED (the store is configured but does not answer): 429, no database read, no model call', async () => {
    const store = configureSharedStore()
    const post = await freshRoute()
    store.failNext('throw')
    const res = await call(post)
    expect(limited(res)).toBe(true)
    expect(h.dbReads).toBe(0); expect(h.llm).toBe(0)
    store.failNext('malformed')
    expect(limited(await call(post))).toBe(true)
    store.failNext(null) // and it recovers as soon as the store answers again
    expect(admitted(await call(post))).toBe(true)
  })
})

describe('no store configured (preview, fork, local run)', () => {
  it('falls back to the in-process limiter with the same limit — never worse than before, per instance', async () => {
    configureNoStore()
    const post = await freshRoute()
    for (let i = 0; i < 5; i++) expect(admitted(await call(post))).toBe(true)
    expect(limited(await call(post))).toBe(true)
    const other = await freshRoute() // a different instance has its own count: this is exactly the weakness the shared store removes
    expect(admitted(await call(other))).toBe(true)
  })
})

describe('order of checks is unchanged', () => {
  it('signed out → 401 and an anonymous session → refused before the limiter spends anything', async () => {
    const store = configureSharedStore()
    const post = await freshRoute()
    h.user = null
    expect((await call(post)).status).toBe(401)
    h.user = { id: 'anon', is_anonymous: true }
    expect((await call(post)).status).toBe(403)
    expect(store.calls()).toBe(0)
  })
})
