import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({
  s: {
    user: { id: '4dcce7cf-5f49-4c58-9901-2d586e31352d' } as { id: string } | null,
    rlOk: true,
    age: null as unknown,
    consent: null as unknown,
    clipConsent: true,
    anon: null as unknown,
    target: { provider: { id: 'gcs' }, bucket: 'tappyai-video-source' } as { provider: unknown; bucket: string } | null,
    startCalls: [] as unknown[],
    completeCalls: [] as unknown[],
    order: [] as string[],
    advanced: 'processing' as string | null,
    advanceThrows: false,
    completeBody: { assetId: 'a1', state: 'uploaded' } as Record<string, unknown>,
  },
}))

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => { h.s.order.push('auth'); return { user: h.s.user, supabase: {} } } }))
vi.mock('@/lib/auth/socialWriteAccess', () => ({ refuseAnonymousSocialWrite: () => { h.s.order.push('anon'); return h.s.anon } }))
vi.mock('@/lib/account/requireEligibleUser', () => ({ refuseIneligible: async () => { h.s.order.push('age'); return h.s.age } }))
vi.mock('@/lib/ai/consent/aiConsentGuard', () => ({ refuseWithoutAiConsent: async () => { h.s.order.push('consent'); return h.s.consent } }))
vi.mock('@/lib/media/video/clipConsent', () => ({ hasClipConsent: async () => { h.s.order.push('clip'); return h.s.clipConsent } }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => { h.s.order.push('rate'); return { ok: h.s.rlOk, retryAfter: 1 } } }))
vi.mock('@/lib/security/rateLimitResponse', () => ({ rateLimitedResponse: () => NextResponse.json({ error: 'rate_limit' }, { status: 429 }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/media/video/assetStore', () => ({ supabaseVideoAssetStore: () => ({ tag: 'store' }) }))
vi.mock('@/lib/media/video/sourceStorage', () => ({ getVideoSourceProvider: () => { h.s.order.push('bucket'); return h.s.target } }))
vi.mock('@/lib/media/video/transcoder', () => ({ getTranscoderClient: () => ({ tag: 'transcoder' }) }))
vi.mock('@/lib/media/video/processing', () => ({
  advanceVideoAsset: async (id: string) => { h.s.order.push('advance'); if (h.s.advanceThrows) throw new Error('boom'); return h.s.advanced ? { assetId: id, state: h.s.advanced } : null },
}))
vi.mock('@/lib/media/video/uploadFlow', () => ({
  startVideoUpload: async (input: unknown) => { h.s.startCalls.push(input); return { status: 200, body: { assetId: 'a1', state: 'uploading', uploadUrl: 'https://session', contentType: 'video/mp4' } } },
  completeVideoUpload: async (input: unknown) => { h.s.completeCalls.push(input); return { status: 200, body: h.s.completeBody } },
}))

import { POST as create } from './route'
import { POST as complete } from './[id]/complete/route'

const ID = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'
const req = (body: unknown, url = 'https://www.tappyai.com/api/video/uploads') =>
  new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
const good = { idempotencyKey: 'client-generated-key-0001', contentType: 'video/mp4', size: 5_000_000 }

beforeEach(() => {
  vi.unstubAllEnvs()
  Object.assign(h.s, { user: { id: '4dcce7cf-5f49-4c58-9901-2d586e31352d' }, rlOk: true, age: null, consent: null, clipConsent: true, anon: null, target: { provider: { id: 'gcs' }, bucket: 'tappyai-video-source' }, startCalls: [], completeCalls: [], order: [], advanced: 'processing', advanceThrows: false, completeBody: { assetId: 'a1', state: 'uploaded' } })
})
const on = () => vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', 'true')

describe('POST /api/video/uploads', () => {
  it('🚨 is OFF by default: 404 and NOTHING else runs (no auth, no limit, no storage, no database)', async () => {
    const res = await create(req(good))
    expect(res.status).toBe(404)
    expect(h.s.order).toEqual([])
    expect(h.s.startCalls).toEqual([])
  })

  it.each(['', '1', 'TRUE', 'yes', ' true'])('stays off for the flag value %j', async (v) => {
    vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', v)
    expect((await create(req(good))).status).toBe(404)
    expect(h.s.startCalls).toEqual([])
  })

  it('runs the guards in order: session, not anonymous, rate limit, 18+, AI consent, private bucket', async () => {
    on()
    const res = await create(req(good))
    expect(res.status).toBe(200)
    expect(h.s.order).toEqual(['auth', 'anon', 'rate', 'age', 'clip', 'consent', 'bucket'])
    expect(await res.json()).toEqual({ assetId: 'a1', state: 'uploading', uploadUrl: 'https://session', contentType: 'video/mp4' })
  })

  it('passes the caller, never a client-chosen owner, to the flow', async () => {
    on()
    await create(req({ ...good, ownerId: 'someone-else', key: 'vsrc/x/y.mp4', bucket: 'public' }))
    expect(h.s.startCalls).toHaveLength(1)
    expect(h.s.startCalls[0]).toMatchObject({ ownerId: '4dcce7cf-5f49-4c58-9901-2d586e31352d', idempotencyKey: good.idempotencyKey, contentType: 'video/mp4', size: 5_000_000 })
    expect(JSON.stringify(h.s.startCalls[0])).not.toMatch(/someone-else|vsrc|public/)
  })

  it('401 without a session', async () => {
    on(); h.s.user = null
    expect((await create(req(good))).status).toBe(401)
    expect(h.s.startCalls).toEqual([])
  })

  it('an anonymous account is refused before anything is limited, checked or opened', async () => {
    on(); h.s.anon = NextResponse.json({ error: 'anon' }, { status: 403 })
    expect((await create(req(good))).status).toBe(403)
    expect(h.s.order).toEqual(['auth', 'anon'])
    expect(h.s.startCalls).toEqual([])
  })

  it('429 when over the limit, and no session is opened', async () => {
    on(); h.s.rlOk = false
    expect((await create(req(good))).status).toBe(429)
    expect(h.s.startCalls).toEqual([])
  })

  it('an ineligible (under 18) account gets no session', async () => {
    on(); h.s.age = NextResponse.json({ error: 'age' }, { status: 403 })
    expect((await create(req(good))).status).toBe(403)
    expect(h.s.startCalls).toEqual([])
    expect(h.s.order).not.toContain('consent')
  })

  it('🚨 an account that has NOT accepted the clip conditions gets no session, whatever its AI-data state (a web-only account is not assumed to agree)', async () => {
    on(); h.s.clipConsent = false
    const res = await create(req(good))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('video_consent_required')
    expect(h.s.startCalls).toEqual([])
    expect(h.s.order).not.toContain('consent')
    expect(h.s.order).not.toContain('bucket')
  })

  it('🚨 no AI consent, no session (owner 05/11/2026: accept the conditions or do not post a clip)', async () => {
    on(); h.s.consent = NextResponse.json({ error: 'ai_consent_required' }, { status: 403 })
    const res = await create(req(good))
    expect(res.status).toBe(403)
    expect(h.s.startCalls).toEqual([])
    expect(h.s.order).not.toContain('bucket')
  })

  it('503 when the private bucket is not configured (no default, nothing is written anywhere)', async () => {
    on(); h.s.target = null
    expect((await create(req(good))).status).toBe(503)
    expect(h.s.startCalls).toEqual([])
  })

  it.each([
    ['not json', 'nope{'],
    ['missing key', { contentType: 'video/mp4', size: 1 }],
    ['size as text', { ...good, size: '5000000' }],
    ['content type as number', { ...good, contentType: 5 }],
    ['null body', 'null'],
  ])('400 for %s, before the flow', async (_n, body) => {
    on()
    expect((await create(req(body as never))).status).toBe(400)
    expect(h.s.startCalls).toEqual([])
  })
})

describe('POST /api/video/uploads/[id]/complete', () => {
  const call = (id = ID) => complete(req({}, `https://www.tappyai.com/api/video/uploads/${id}/complete`), { params: { id } })

  it('🚨 is OFF by default: 404 and nothing runs', async () => {
    const res = await call()
    expect(res.status).toBe(404)
    expect(h.s.order).toEqual([])
    expect(h.s.completeCalls).toEqual([])
  })

  it('authenticates, limits, then completes the CALLER\'s asset', async () => {
    on()
    const res = await call()
    expect(res.status).toBe(200)
    expect(h.s.order).toEqual(['auth', 'anon', 'rate', 'bucket', 'advance'])
    expect(h.s.completeCalls).toEqual([{ ownerId: '4dcce7cf-5f49-4c58-9901-2d586e31352d', assetId: ID }])
    // the verified upload starts the transcode at once, so the answer already says where the video is now
    expect(await res.json()).toEqual({ assetId: ID, state: 'processing' })
  })

  it('🚨 a transcode that cannot start NEVER turns a verified upload into an error: the answer stays "uploaded" and the sweep carries on', async () => {
    on(); h.s.advanceThrows = true
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ assetId: 'a1', state: 'uploaded' })
  })

  it('does not start a transcode when the upload was refused or is still incomplete', async () => {
    on(); h.s.completeBody = { error: 'upload_incomplete' }
    const res = await call()
    expect(await res.json()).toEqual({ error: 'upload_incomplete' })
    expect(h.s.order).not.toContain('advance')
  })

  it('401 without a session; 429 over the limit; a non-uuid id is a 404 that never reaches the flow', async () => {
    on(); h.s.user = null
    expect((await call()).status).toBe(401)
    h.s.user = { id: '4dcce7cf-5f49-4c58-9901-2d586e31352d' }; h.s.rlOk = false
    expect((await call()).status).toBe(429)
    h.s.rlOk = true
    expect((await call('not-a-uuid')).status).toBe(404)
    expect((await call("1'; drop table video_assets;--")).status).toBe(404)
    expect(h.s.completeCalls).toEqual([])
  })

  it('an anonymous account is refused before the limit or the flow', async () => {
    on(); h.s.anon = NextResponse.json({ error: 'anon' }, { status: 403 })
    expect((await call()).status).toBe(403)
    expect(h.s.order).toEqual(['auth', 'anon'])
    expect(h.s.completeCalls).toEqual([])
  })

  it('is NOT gated by 18+ or consent (it only confirms bytes an authorised session already stored)', async () => {
    on(); h.s.age = NextResponse.json({ error: 'age' }, { status: 403 }); h.s.consent = NextResponse.json({ error: 'c' }, { status: 403 })
    expect((await call()).status).toBe(200)
    expect(h.s.order).not.toContain('age')
    expect(h.s.order).not.toContain('consent')
  })

  it('503 when the private bucket is not configured', async () => {
    on(); h.s.target = null
    expect((await call()).status).toBe(503)
    expect(h.s.completeCalls).toEqual([])
  })
})
