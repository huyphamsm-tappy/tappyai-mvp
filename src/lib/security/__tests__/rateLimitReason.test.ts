// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { distributedRateLimit } from '../distributedRateLimit'
import { publicDailyRateLimit, publicRateLimit } from '../publicRateLimit'
import { logRateLimitRefusal, rateLimitedResponse } from '../rateLimitResponse'
import { configureNoStore, configureSharedStore, resetLimiterEnv } from './sharedLimiterHarness'

// SEC4: a refused request says WHY — a genuine quota breach (`limit_exceeded`) or an infrastructure failure (`store_unavailable`: no store resolved, the store threw, or it
// answered something that is neither admitted nor rejected). The field is additive: `ok`/`retryAfter` are unchanged. The refusal helper keeps the routes' 429 contract and carries
// the distinction in a header and ONE structured log line that never contains the key.

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T03:00:00Z')) })
afterEach(() => { vi.useRealTimers(); resetLimiterEnv() })

describe('distributedRateLimit — reason', () => {
  it('admitted: no reason. Rejected by the store\'s count: limit_exceeded with a computed retryAfter', async () => {
    configureSharedStore()
    const a = await distributedRateLimit('k:a', 1, 60_000)
    expect(a.ok).toBe(true); expect(a.reason).toBeUndefined()
    const b = await distributedRateLimit('k:a', 1, 60_000)
    expect(b).toMatchObject({ ok: false, reason: 'limit_exceeded' })
    expect(b.retryAfter).toBeGreaterThan(0)
  })
  it('the store throws, answers garbage, or is not resolved at all: store_unavailable (fail closed, retryAfter = the window)', async () => {
    const store = configureSharedStore()
    store.failNext('throw')
    expect(await distributedRateLimit('k:b', 5, 60_000)).toEqual({ ok: false, retryAfter: 60, reason: 'store_unavailable' })
    store.failNext('malformed')
    expect(await distributedRateLimit('k:b', 5, 60_000)).toEqual({ ok: false, retryAfter: 60, reason: 'store_unavailable' })
    resetLimiterEnv(); configureNoStore()
    expect(await distributedRateLimit('k:b', 5, 60_000)).toMatchObject({ ok: false, reason: 'store_unavailable' })
  })
})

describe('publicRateLimit / publicDailyRateLimit — reason passes through', () => {
  it('shared store: breach vs outage are told apart, burst and daily', async () => {
    const store = configureSharedStore()
    expect((await publicRateLimit('p:x', 1, 60_000)).ok).toBe(true)
    expect(await publicRateLimit('p:x', 1, 60_000)).toMatchObject({ ok: false, scope: 'distributed', reason: 'limit_exceeded' })
    expect((await publicDailyRateLimit('d:x', 1)).ok).toBe(true)
    expect(await publicDailyRateLimit('d:x', 1)).toMatchObject({ ok: false, reason: 'limit_exceeded' })
    store.failNext('throw')
    expect(await publicRateLimit('p:y', 5, 60_000)).toMatchObject({ ok: false, scope: 'distributed', reason: 'store_unavailable' })
    expect(await publicDailyRateLimit('d:y', 5)).toMatchObject({ ok: false, reason: 'store_unavailable' })
  })
  it('no store configured: the in-process limiter — a refusal is always a quota breach; an admission carries no reason', async () => {
    configureNoStore()
    const ok = await publicRateLimit('p:z', 1, 60_000)
    expect(ok).toMatchObject({ ok: true, scope: 'instance' }); expect(ok.reason).toBeUndefined()
    expect(await publicRateLimit('p:z', 1, 60_000)).toMatchObject({ ok: false, scope: 'instance', reason: 'limit_exceeded' })
    expect(await publicDailyRateLimit('d:z', 1)).toMatchObject({ ok: true })
    expect(await publicDailyRateLimit('d:z', 1)).toMatchObject({ ok: false, reason: 'limit_exceeded' })
  })
})

describe('rateLimitedResponse', () => {
  const req = new Request('http://localhost/api/x', { headers: { 'accept-language': 'vi' } })
  const spy = () => vi.spyOn(console, 'warn').mockImplementation(() => {})

  it('keeps the route contract (429, { error: "rate_limit", message }) and adds the reason header; Retry-After only when a wait is known', async () => {
    const warn = spy()
    const breach = rateLimitedResponse(req, { ok: false, retryAfter: 12, scope: 'distributed', reason: 'limit_exceeded' }, 'unit')
    expect(breach.status).toBe(429)
    expect(await breach.json()).toMatchObject({ error: 'rate_limit' })
    expect(breach.headers.get('X-RateLimit-Reason')).toBe('limit_exceeded')
    expect(breach.headers.get('Retry-After')).toBe('12')
    const daily = rateLimitedResponse(req, { ok: false, retryAfter: 0, scope: 'instance', reason: 'limit_exceeded' }, 'unit')
    expect(daily.headers.get('Retry-After')).toBeNull()
    warn.mockRestore()
  })
  it('a store outage is a 429 with reason store_unavailable (status unchanged on purpose: clients already handle 429)', async () => {
    const warn = spy()
    const res = rateLimitedResponse(req, { ok: false, retryAfter: 60, scope: 'distributed', reason: 'store_unavailable' }, 'unit')
    expect(res.status).toBe(429)
    expect(res.headers.get('X-RateLimit-Reason')).toBe('store_unavailable')
    warn.mockRestore()
  })
  it('a missing reason (an older result shape) is reported as limit_exceeded; a custom message replaces the default copy', async () => {
    const warn = spy()
    const res = rateLimitedResponse(req, { ok: false, retryAfter: 5, scope: 'instance' }, 'unit', 'custom copy')
    expect(res.headers.get('X-RateLimit-Reason')).toBe('limit_exceeded')
    expect((await res.json()).message).toBe('custom copy')
    warn.mockRestore()
  })
  it('logs exactly one structured line per refusal with limit, scope and reason — and nothing that could identify the caller', () => {
    const warn = spy()
    rateLimitedResponse(req, { ok: false, retryAfter: 60, scope: 'distributed', reason: 'store_unavailable' }, 'voice_tts')
    expect(warn).toHaveBeenCalledTimes(1)
    const line = JSON.parse(String(warn.mock.calls[0][0]))
    expect(line).toEqual({ type: 'tappyai_rate_limit', limit: 'voice_tts', scope: 'distributed', reason: 'store_unavailable' })
    warn.mockRestore()
    const w2 = spy()
    logRateLimitRefusal('x', { ok: false, retryAfter: 1, scope: 'instance' })
    expect(JSON.parse(String(w2.mock.calls[0][0])).reason).toBe('limit_exceeded')
    w2.mockRestore()
  })
})
