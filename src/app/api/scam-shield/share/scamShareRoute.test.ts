import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The wedge route: anonymous-callable, deterministic content, capped, no LLM,
// and the response never echoes the raw checked URL.

const store = { createSharedResult: vi.fn() }
vi.mock('@/lib/share/sharedResultStore', () => ({
  createSharedResult: (...a: unknown[]) => store.createSharedResult(...a),
  SharedResultError: class extends Error { constructor(public code: string, m?: string) { super(m ?? code) } },
}))
const auth = { user: null as null | { id: string; is_anonymous?: boolean } }
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: auth.user, supabase: {} }) }))
vi.mock('@/lib/security/publicRateLimit', () => ({
  publicDailyRateLimit: async () => ({ ok: true, retryAfter: 0, scope: 'instance' }),
  publicRateLimit: async () => ({ ok: true, retryAfter: 0, scope: 'instance' }), // M4: burst caps are distributed too
}))
const check = vi.fn()
vi.mock('@/lib/scam-shield', () => ({ checkUrl: (...a: unknown[]) => check(...a) }))

import { POST } from './route'

const req = (body: unknown) => new NextRequest(new Request('https://www.tappyai.com/api/scam-shield/share', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.1.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body),
}))
const verdict = {
  inputType: 'url', url: 'https://bad.example/x?token=SECRET', risk: { score: 90, confidence: 80, level: 'HIGH' },
  evidence: { items: [], summary: { criticalCount: 1, warningCount: 0, safeCount: 0, totalSources: 3, respondedSources: 3 } },
  officialMatch: null, actions: [], checkedAt: 0, cached: true,
}
const row = { id: 'sid', slug: 'AbCdEfGh12', payload: { title: 'T' }, domain: 'scam', owner_is_anonymous: true, parent_id: null }

beforeEach(() => { vi.clearAllMocks(); auth.user = { id: 'u1', is_anonymous: false } })

describe('POST /api/scam-shield/share', () => {
  it('owner 28/11/2026: nobody signed in (401) and a visitor session (403) cannot publish a verdict page; the checker and the store are never touched', async () => {
    auth.user = null
    expect((await POST(req({ url: 'bad.example/x' }))).status).toBe(401)
    auth.user = { id: 'visitor', is_anonymous: true }
    expect((await POST(req({ url: 'bad.example/x' }))).status).toBe(403)
    expect(check).not.toHaveBeenCalled()
    expect(store.createSharedResult).not.toHaveBeenCalled()
  })
  it('an account publishes a verdict page (server-generated content) and never sees the raw token in the answer', async () => {
    check.mockResolvedValueOnce(verdict); store.createSharedResult.mockResolvedValueOnce({ ...row, owner_is_anonymous: false })
    const res = await POST(req({ url: 'bad.example/x?token=SECRET' }))
    expect(res.status).toBe(201)
    const out = await res.json()
    expect(out).toMatchObject({ slug: 'AbCdEfGh12', host: 'bad.example', level: 'HIGH', listed: true })
    expect(JSON.stringify(out)).not.toContain('SECRET')
    expect(store.createSharedResult).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'u1', ownerIsAnonymous: false }))
    const payload = store.createSharedResult.mock.calls[0][0].payload
    expect(payload.kind).toBe('scam_check'); expect(payload.domain).toBe('scam')
    expect(JSON.stringify(payload)).not.toContain('SECRET')
  })
  it('a real account owns a listed verdict page', async () => {
    auth.user = { id: 'u1', is_anonymous: false }
    check.mockResolvedValueOnce(verdict); store.createSharedResult.mockResolvedValueOnce({ ...row, owner_is_anonymous: false })
    const res = await POST(req({ url: 'https://bad.example/x', locale: 'en' }))
    expect(res.status).toBe(201)
    expect((await res.json()).listed).toBe(true)
    expect(store.createSharedResult).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'u1', ownerIsAnonymous: false }))
    expect(store.createSharedResult.mock.calls[0][0].payload.locale).toBe('en')
  })
  it('validates input and never calls the checker on a bad body', async () => {
    expect((await POST(req({}))).status).toBe(400)
    expect((await POST(req({ url: 'ab' }))).status).toBe(400)
    expect(check).not.toHaveBeenCalled()
  })
  it('maps a private/internal address to 400 and a checker failure to 500, with messages', async () => {
    check.mockRejectedValueOnce(new Error('private address'))
    const priv = await POST(req({ url: 'http://10.0.0.1/' }))
    expect(priv.status).toBe(400); expect((await priv.json()).message).toBeTruthy()
    check.mockRejectedValueOnce(new Error('boom'))
    expect((await POST(req({ url: 'https://x.example/' }))).status).toBe(500)
  })
})
