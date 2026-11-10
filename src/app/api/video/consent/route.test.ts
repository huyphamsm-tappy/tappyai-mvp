import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({
  s: { user: { id: '4dcce7cf-5f49-4c58-9901-2d586e31352d' } as { id: string } | null, anon: null as unknown, rlOk: true, has: false, record: [] as string[], withdraw: [] as string[], writeFails: false, order: [] as string[] },
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => { h.s.order.push('auth'); return { user: h.s.user, supabase: {} } } }))
vi.mock('@/lib/auth/socialWriteAccess', () => ({ refuseAnonymousSocialWrite: () => { h.s.order.push('anon'); return h.s.anon } }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => { h.s.order.push('rate'); return { ok: h.s.rlOk, retryAfter: 1 } } }))
vi.mock('@/lib/security/rateLimitResponse', () => ({ rateLimitedResponse: () => NextResponse.json({ error: 'rate_limit' }, { status: 429 }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/media/video/clipConsent', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  hasClipConsent: async () => h.s.has,
  recordClipConsent: async (_a: unknown, id: string) => { if (h.s.writeFails) throw new Error('x'); h.s.record.push(id) },
  withdrawClipConsent: async (_a: unknown, id: string) => { if (h.s.writeFails) throw new Error('x'); h.s.withdraw.push(id) },
}))

import { GET, POST, DELETE } from './route'
import { VIDEO_CLIP_CONSENT_VERSION } from '@/lib/media/video/clipConsent'

const U = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const req = (method: string, body?: unknown) => new NextRequest('https://www.tappyai.com/api/video/consent', { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
beforeEach(() => { vi.unstubAllEnvs(); Object.assign(h.s, { user: { id: U }, anon: null, rlOk: true, has: false, record: [], withdraw: [], writeFails: false, order: [] }) })
const on = () => vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', 'true')

describe('/api/video/consent', () => {
  it('🚨 is OFF by default: 404 on every method and nothing runs', async () => {
    for (const call of [() => GET(req('GET')), () => POST(req('POST', { accepted: true, version: VIDEO_CLIP_CONSENT_VERSION })), () => DELETE(req('DELETE'))]) expect((await call()).status).toBe(404)
    expect(h.s.order).toEqual([])
    expect(h.s.record).toEqual([])
  })

  it('GET reports whether the account has accepted the current wording', async () => {
    on()
    expect(await (await GET(req('GET'))).json()).toEqual({ accepted: false, version: VIDEO_CLIP_CONSENT_VERSION })
    h.s.has = true
    expect(await (await GET(req('GET'))).json()).toEqual({ accepted: true, version: VIDEO_CLIP_CONSENT_VERSION })
  })

  it('POST records the acceptance for the CALLER only', async () => {
    on()
    const res = await POST(req('POST', { accepted: true, version: VIDEO_CLIP_CONSENT_VERSION, userId: 'someone-else' }))
    expect(res.status).toBe(200)
    expect(h.s.record).toEqual([U])
  })

  it.each([
    ['not json', 'nope{'], ['accepted false', { accepted: false, version: VIDEO_CLIP_CONSENT_VERSION }], ['accepted as text', { accepted: 'true', version: VIDEO_CLIP_CONSENT_VERSION }],
    ['stale version', { accepted: true, version: VIDEO_CLIP_CONSENT_VERSION - 1 }], ['future version', { accepted: true, version: VIDEO_CLIP_CONSENT_VERSION + 1 }], ['no version', { accepted: true }],
  ])('POST refuses %s without writing', async (_n, body) => {
    on()
    expect((await POST(req('POST', body as never))).status).toBe(400)
    expect(h.s.record).toEqual([])
  })

  it('DELETE withdraws the acceptance of the caller', async () => {
    on()
    expect((await DELETE(req('DELETE'))).status).toBe(200)
    expect(h.s.withdraw).toEqual([U])
  })

  it('401 without a session; an anonymous account cannot write; 429 over the limit', async () => {
    on(); h.s.user = null
    expect((await GET(req('GET'))).status).toBe(401)
    h.s.user = { id: U }; h.s.anon = NextResponse.json({ error: 'anon' }, { status: 403 })
    expect((await POST(req('POST', { accepted: true, version: VIDEO_CLIP_CONSENT_VERSION }))).status).toBe(403)
    expect((await DELETE(req('DELETE'))).status).toBe(403)
    expect(h.s.record).toEqual([])
    h.s.anon = null; h.s.rlOk = false
    expect((await POST(req('POST', { accepted: true, version: VIDEO_CLIP_CONSENT_VERSION }))).status).toBe(429)
  })

  it('a write that fails answers 503, never "saved"', async () => {
    on(); h.s.writeFails = true
    expect((await POST(req('POST', { accepted: true, version: VIDEO_CLIP_CONSENT_VERSION }))).status).toBe(503)
    expect((await DELETE(req('DELETE'))).status).toBe(503)
  })
})
