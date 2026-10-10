// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bindFreshGraph, configureNoStore, configureSharedStore, resetLimiterEnv } from '@/lib/security/__tests__/sharedLimiterHarness'

// SEC4 slice 2e (docs/phase8/SEC4-ROUTE-MATRIX.md): POST /api/reviews/upload had a PRIVATE in-file daily counter (a Map: per instance, reset at UTC midnight). It now uses the
// shared per-day limiter (`publicDailyRateLimit`): shared store when configured, in-process only when none is configured, fail closed when configured but down.
// Same cap (10 uploads per day) and same key (the user). ONE DOCUMENTED CHANGE: the day now ends at VIETNAM midnight (like every other daily cap in this product), not UTC midnight
// (07:00 Vietnam time). Storage is never reached: an admitted request stops at the multipart parse (400).

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, bodyReads: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))
vi.mock('@/lib/account/requireEligibleUser', () => ({ refuseIneligible: async () => null }))

async function fresh() {
  vi.resetModules()
  await bindFreshGraph()
  return (await import('./route')).POST
}
const call = (post: Awaited<ReturnType<typeof fresh>>) => {
  const req = new Request('http://localhost/api/reviews/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  const real = req.formData.bind(req)
  Object.defineProperty(req, 'formData', { value: () => { h.bodyReads++; return real() } })
  return post(req as never)
}
const refused = (r: Response) => r.status === 429
const admitted = (r: Response) => r.status !== 429
const LIMIT = 10

beforeEach(() => { h.user = { id: 'caller-1', is_anonymous: false }; h.bodyReads = 0; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T03:00:00Z')) }) // 10:00 in Vietnam
afterEach(() => { vi.useRealTimers(); resetLimiterEnv() })

describe('POST /api/reviews/upload — daily cap on the shared limiter', () => {
  it('admits 10 per day per user, then 429 with the existing "daily limit" copy, before the body is read', async () => {
    configureSharedStore()
    const post = await fresh()
    for (let i = 0; i < LIMIT; i++) expect(admitted(await call(post)), `upload ${i + 1}`).toBe(true)
    h.bodyReads = 0
    const res = await call(post)
    expect(refused(res)).toBe(true)
    expect((await res.json()).error).toBe('rate_limit')
    expect(h.bodyReads).toBe(0)
  })

  it('keying: another user has their own allowance', async () => {
    configureSharedStore()
    const post = await fresh()
    for (let i = 0; i < LIMIT; i++) await call(post)
    expect(refused(await call(post))).toBe(true)
    h.user = { id: 'caller-2', is_anonymous: false }
    expect(admitted(await call(post))).toBe(true)
  })

  it('shared across instances: the day\'s budget is spent on two lambdas together (the old in-file Map admitted 20)', async () => {
    const store = configureSharedStore()
    const a = await fresh()
    const b = await fresh()
    for (let i = 0; i < 5; i++) expect(admitted(await call(a))).toBe(true)
    for (let i = 5; i < LIMIT; i++) expect(admitted(await call(b))).toBe(true)
    expect(refused(await call(a))).toBe(true)
    expect(store.calls()).toBe(LIMIT + 1)
  })

  it('the day ends at VIETNAM midnight: still refused at 23:59 VN, admitted again at 00:01 VN (it used to reset at 07:00 VN, UTC midnight)', async () => {
    configureSharedStore()
    const post = await fresh()
    for (let i = 0; i < LIMIT; i++) await call(post)
    expect(refused(await call(post))).toBe(true)
    vi.setSystemTime(new Date('2026-10-10T16:59:00Z')) // 23:59 in Vietnam (UTC+7), same VN day
    expect(refused(await call(post))).toBe(true)
    vi.setSystemTime(new Date('2026-10-10T17:01:00Z')) // 00:01 on the next VN day
    expect(admitted(await call(post))).toBe(true)
  })

  it('store configured but not answering → FAIL CLOSED (429, body never read); recovers when the store answers', async () => {
    const store = configureSharedStore()
    const post = await fresh()
    store.failNext('throw')
    expect(refused(await call(post))).toBe(true)
    store.failNext('malformed')
    expect(refused(await call(post))).toBe(true)
    expect(h.bodyReads).toBe(0)
    store.failNext(null)
    expect(admitted(await call(post))).toBe(true)
  })

  it('no store configured → the in-process daily limiter with the same cap (per instance)', async () => {
    configureNoStore()
    const post = await fresh()
    for (let i = 0; i < LIMIT; i++) expect(admitted(await call(post))).toBe(true)
    expect(refused(await call(post))).toBe(true)
    expect(admitted(await call(await fresh()))).toBe(true)
  })

  it('order of checks is unchanged: signed out → 401 and anonymous → refused, neither spends the allowance', async () => {
    const store = configureSharedStore()
    const post = await fresh()
    h.user = null
    expect((await call(post)).status).toBe(401)
    h.user = { id: 'anon', is_anonymous: true }
    expect((await call(post)).status).toBe(403)
    expect(store.calls()).toBe(0)
  })
})
