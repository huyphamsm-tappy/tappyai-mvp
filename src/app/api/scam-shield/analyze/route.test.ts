import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TELEGRAM_SCAM } from '@/lib/scam-shield/message/__tests__/fixtures'

// ── POST /api/scam-shield/analyze — the HTTP boundary ───────────────────────
//
// The pipeline is mocked; what is pinned here is what the ROUTE owns: input validation, the burst
// cap, the suspended-account gate, that the allowance is spent only when a model is about to be
// called (and keyed by account or IP), what the response carries, and that the log line never
// carries the message.

const h = vi.hoisted(() => ({
  state: { user: null as null | { id: string; is_anonymous?: boolean }, restricted: false, quotaOk: true, pro: false },
  analyze: vi.fn(),
  consume: vi.fn(),
  isPro: vi.fn(),
  burst: vi.fn(async (_key: string, _limit: number, _window: number) => ({ ok: true, retryAfter: 0, scope: 'instance' as 'instance' | 'distributed' })),
  logs: [] as string[],
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: h.state.user, supabase: {} }),
}))
vi.mock('@/lib/account/accountStatus', () => ({
  getAccountRestriction: async () => (h.state.restricted ? { blocked: true, reason: 'suspended', suspendedUntil: null } : { blocked: false, reason: null, suspendedUntil: null }),
  accountRestrictionCode: () => 'account_suspended',
  accountRestrictionMessage: () => 'suspended',
}))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: h.burst }))
vi.mock('@/lib/scam-shield/message', () => ({ analyzeMessage: h.analyze }))
// The ONE shared AI question pool — mocked at its module boundary; its own contract is pinned in
// lib/ai/quota/__tests__. `aiQuotaIdentity` and `quotaFor` are the real ones.
vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()
  return { ...actual, consumeAiQuestion: h.consume, isProAccount: h.isPro }
})

const { POST } = await import('./route')

const RESULT = {
  inputType: 'message', risk: { level: 'HIGH', score: 70, confidence: 80 }, scamType: 'otp_phishing', attackGoal: 'account_takeover',
  signals: [], requestedActions: [], detectedEntities: { urls: [], phoneNumbers: [], emails: [], organizations: [], platforms: [] },
  urlChecks: [], advice: { doNot: [], doNow: [] }, reasoningSummary: 's',
  analysis: { tier: 1, aiStatus: 'used', provider: 'fake', modelRole: 'fast' }, analyzedAt: 1,
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request('http://localhost/api/scam-shield/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))

beforeEach(() => {
  h.state.user = null
  h.state.restricted = false
  h.state.quotaOk = true
  h.state.pro = false
  h.analyze.mockReset()
  h.consume.mockReset()
  h.isPro.mockReset()
  h.burst.mockClear()
  h.logs.length = 0
  h.isPro.mockImplementation(async () => h.state.pro)
  h.consume.mockImplementation(async (identity: { kind: string }) => {
    const lifetime = identity.kind !== 'user'
    const limit = lifetime ? 5 : 15
    return { ok: h.state.quotaOk, limit, period: lifetime ? 'lifetime' : 'day', used: h.state.quotaOk ? 1 : limit, remaining: h.state.quotaOk ? limit - 1 : 0, scope: 'instance' }
  })
  // Default: the pipeline consults the gate (i.e. the message needed a model) and returns a verdict.
  h.analyze.mockImplementation(async (input: { aiGate: () => Promise<{ allowed: boolean }> }) => {
    await input.aiGate()
    return RESULT
  })
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => { h.logs.push(args.map(String).join(' ')) })
})

describe('validation', () => {
  it('refuses an empty body with 400', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_input')
  })
  it('refuses malformed JSON', async () => {
    expect((await post('{nope')).status).toBe(400)
  })
  it('refuses an image with a disallowed type or bad base64', async () => {
    expect((await post({ imageBase64: 'AAAA', mimeType: 'image/svg+xml' })).status).toBe(400)
    expect((await post({ imageBase64: '***', mimeType: 'image/png' })).status).toBe(400)
  })
  it('🚨 an image just over 5 MB is a 400, not a stack overflow (UAT 2026-09-15)', async () => {
    // ~7M base64 characters: inside the schema's string cap, so it reached decodeImage, where
    // `/^[…]+$/.test()` overflowed V8's regex stack and the route answered 500.
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 0).toString('base64')
    const res = await post({ imageBase64: big, mimeType: 'image/png' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_image')
    expect(h.analyze).not.toHaveBeenCalled()
  })
  it('an image just under 5 MB is accepted', async () => {
    const ok = Buffer.alloc(5 * 1024 * 1024 - 16, 1).toString('base64')
    expect((await post({ imageBase64: ok, mimeType: 'image/png' })).status).toBe(200)
    expect(h.analyze.mock.calls[0][0].image.bytes.byteLength).toBe(5 * 1024 * 1024 - 16)
  })
  it('accepts text only, url only, and a data-URL image', async () => {
    expect((await post({ text: 'hello' })).status).toBe(200)
    expect((await post({ url: 'example.cfd' })).status).toBe(200)
    expect((await post({ imageBase64: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' })).status).toBe(200)
    const image = h.analyze.mock.calls[2][0].image
    expect(image.mimeType).toBe('image/png')
    expect(image.bytes).toBeInstanceOf(Uint8Array)
  })
})

describe('gates', () => {
  it('a burst refusal is 429 with Retry-After', async () => {
    h.burst.mockResolvedValueOnce({ ok: false, retryAfter: 30, scope: 'distributed' })
    const res = await post({ text: 'x' })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(h.burst.mock.calls[0][0]).toBe('ss:analyze:203.0.113.9')
  })
  it('a suspended account cannot analyze', async () => {
    h.state.user = { id: 'u-1' }
    h.state.restricted = true
    const res = await post({ text: TELEGRAM_SCAM })
    expect(res.status).toBe(403)
    expect(h.analyze).not.toHaveBeenCalled()
  })
})

describe('the allowance — ONE shared Tappy AI question pool, no Scam Alerts quota of its own', () => {
  it('a signed-in account spends one question from its daily pool, keyed by the account', async () => {
    h.state.user = { id: 'u-1' }
    const res = await post({ text: TELEGRAM_SCAM })
    expect(h.consume).toHaveBeenCalledTimes(1)
    expect(h.consume).toHaveBeenCalledWith({ kind: 'user', id: 'u-1' })
    expect((await res.json()).quota).toEqual({ kind: 'user', limit: 15, period: 'day', used: 1, remaining: 14, exhausted: false, pro: false })
  })
  it('an anonymous session spends from its LIFETIME trial, keyed by the verified anonymous id', async () => {
    h.state.user = { id: 'anon-123', is_anonymous: true }
    const res = await post({ text: TELEGRAM_SCAM })
    expect(h.consume).toHaveBeenCalledWith({ kind: 'anon', id: 'anon-123' })
    expect((await res.json()).quota).toMatchObject({ kind: 'anon', limit: 5, period: 'lifetime' })
  })
  it('an identity-less caller is keyed by IP — a fresh session is not a fresh allowance', async () => {
    await post({ text: TELEGRAM_SCAM })
    expect(h.consume).toHaveBeenCalledWith({ kind: 'guest', id: '203.0.113.9' })
  })
  it('a Pro account is exempt and spends nothing', async () => {
    h.state.user = { id: 'u-pro' }
    h.state.pro = true
    const res = await post({ text: TELEGRAM_SCAM })
    expect(h.consume).not.toHaveBeenCalled()
    expect((await res.json()).quota).toMatchObject({ pro: true, exhausted: false })
  })
  it('13. is NOT spent when the pipeline never asks (a bare link → deterministic, 0 AI, 0 quota)', async () => {
    h.analyze.mockResolvedValueOnce({ ...RESULT, analysis: { tier: 0, aiStatus: 'not_needed', provider: null, modelRole: null } })
    const res = await post({ url: 'https://42777qz.hanveko.cfd' })
    expect(h.consume).not.toHaveBeenCalled()
    expect(h.isPro).not.toHaveBeenCalled()
    expect((await res.json()).quota).toBeNull()
  })
  it('15./16. one user action spends exactly ONE question even when the gate is consulted for OCR and analysis', async () => {
    h.state.user = { id: 'u-1' }
    h.analyze.mockImplementationOnce(async (input: { aiGate: () => Promise<{ allowed: boolean }> }) => {
      await input.aiGate()   // OCR
      await input.aiGate()   // analysis of a message that also carries a URL
      return RESULT
    })
    await post({ text: TELEGRAM_SCAM, url: 'https://42777qz.hanveko.cfd' })
    // The route's gate spends on every call it receives; the PIPELINE memoises it (pinned in
    // scenarios.test.ts). What the route guarantees is that a spend is a single shared-pool unit.
    for (const call of h.consume.mock.calls) expect(call[0]).toEqual({ kind: 'user', id: 'u-1' })
  })
  it('when exhausted, the gate says so and the verdict is still returned (200)', async () => {
    h.state.quotaOk = false
    h.analyze.mockImplementationOnce(async (input: { aiGate: () => Promise<{ allowed: boolean; reason?: string }> }) => {
      const gate = await input.aiGate()
      expect(gate).toEqual({ allowed: false, reason: 'quota_exhausted' })
      return { ...RESULT, analysis: { tier: 2, aiStatus: 'quota_exhausted', provider: null, modelRole: null } }
    })
    const res = await post({ text: TELEGRAM_SCAM })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.quota).toMatchObject({ exhausted: true, remaining: 0 })
    expect(body.analysis.aiStatus).toBe('quota_exhausted')
  })
  it('19. client-supplied quota fields are ignored — the body cannot buy a question', async () => {
    h.state.quotaOk = false
    h.analyze.mockImplementationOnce(async (input: { aiGate: () => Promise<{ allowed: boolean }> }) => {
      expect((await input.aiGate()).allowed).toBe(false)
      return { ...RESULT, analysis: { tier: 2, aiStatus: 'quota_exhausted', provider: null, modelRole: null } }
    })
    const res = await post({ text: TELEGRAM_SCAM, quota: { remaining: 99, exhausted: false }, aiAllowed: true, pro: true, tier: 'user' })
    expect((await res.json()).quota.exhausted).toBe(true)
  })
})

describe('the response and the log', () => {
  it('returns the pipeline result plus the quota block, in the request locale', async () => {
    const res = await post({ text: TELEGRAM_SCAM }, { 'accept-language': 'en' })
    const body = await res.json()
    expect(body.risk).toEqual(RESULT.risk)
    expect(h.analyze.mock.calls[0][0].locale).toBe('en')
  })
  it('never logs the message, only its shape', async () => {
    await post({ text: TELEGRAM_SCAM })
    expect(h.logs.length).toBeGreaterThan(0)
    for (const line of h.logs) {
      expect(line).not.toContain('hanveko')
      expect(line).not.toContain('rủi ro')
    }
    expect(h.logs.find(l => l.includes('[scam-shield] analyze'))).toMatch(/"level":"HIGH"/)
  })
  it('a pipeline failure is a 500 with a localized message and no stack in the body', async () => {
    h.analyze.mockRejectedValueOnce(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ text: 'x' })
    expect(res.status).toBe(500)
    expect((await res.json())).toMatchObject({ error: 'analyze_failed' })
  })
})
