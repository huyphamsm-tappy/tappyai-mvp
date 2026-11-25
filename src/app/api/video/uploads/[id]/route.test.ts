import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const ID = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'

const h = vi.hoisted(() => ({
  s: {
    user: { id: '4dcce7cf-5f49-4c58-9901-2d586e31352d' } as { id: string } | null,
    rlOk: true,
    asset: { id: '9a1b2c3d-5f49-4c58-9901-2d586e31352d', owner_id: '4dcce7cf-5f49-4c58-9901-2d586e31352d', state: 'uploaded' } as Record<string, unknown> | null,
    bucket: 'tappyai-video-source' as string | null,
    advanced: { assetId: 'x', state: 'processing', action: 'started' } as { state: string } | null,
    advanceThrows: false,
    advanceCalls: [] as unknown[],
    order: [] as string[],
  },
}))

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => { h.s.order.push('auth'); return { user: h.s.user, supabase: {} } } }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => { h.s.order.push('rate'); return { ok: h.s.rlOk, retryAfter: 1 } } }))
vi.mock('@/lib/security/rateLimitResponse', () => ({ rateLimitedResponse: () => new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429 }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/media/video/assetStore', () => ({ supabaseVideoAssetStore: () => ({ get: async () => { h.s.order.push('get'); return h.s.asset } }) }))
vi.mock('@/lib/media/video/sourceStorage', () => ({ videoSourceBucket: () => h.s.bucket }))
vi.mock('@/lib/media/video/transcoder', () => ({ getTranscoderClient: () => ({ tag: 'transcoder' }) }))
vi.mock('@/lib/media/video/processing', () => ({
  advanceVideoAsset: async (id: string, deps: unknown) => { h.s.advanceCalls.push({ id, deps }); if (h.s.advanceThrows) throw new Error('boom'); return h.s.advanced },
}))

import { GET } from './route'

const call = (id = ID) => GET(new NextRequest(`https://www.tappyai.com/api/video/uploads/${id}`), { params: { id } })
beforeEach(() => {
  vi.unstubAllEnvs()
  Object.assign(h.s, { user: { id: OWNER }, rlOk: true, asset: { id: ID, owner_id: OWNER, state: 'uploaded' }, bucket: 'tappyai-video-source', advanced: { assetId: ID, state: 'processing', action: 'started' }, advanceThrows: false, advanceCalls: [], order: [] })
})
const on = () => vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', 'true')

describe('GET /api/video/uploads/[id]', () => {
  it('🚨 is OFF by default: 404 and nothing runs', async () => {
    expect((await call()).status).toBe(404)
    expect(h.s.order).toEqual([])
    expect(h.s.advanceCalls).toEqual([])
  })

  it('authenticates, limits, reads the caller\'s asset, advances it one step and answers with the state only', async () => {
    on()
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ assetId: ID, state: 'processing' })
    expect(h.s.order).toEqual(['auth', 'rate', 'get'])
    expect(h.s.advanceCalls).toHaveLength(1)
    expect((h.s.advanceCalls[0] as { deps: { bucket: string } }).deps.bucket).toBe('tappyai-video-source')
  })

  it('401 without a session, 429 over the limit, and a non-uuid id is a 404 that never reads the database', async () => {
    on(); h.s.user = null
    expect((await call()).status).toBe(401)
    h.s.user = { id: OWNER }; h.s.rlOk = false
    expect((await call()).status).toBe(429)
    h.s.rlOk = true; h.s.order = []
    expect((await call('not-a-uuid')).status).toBe(404)
    expect(h.s.order).not.toContain('get')
  })

  it('🚨 someone else\'s asset and an unknown id answer the SAME 404 and never advance anything', async () => {
    on()
    h.s.asset = { id: ID, owner_id: '11111111-1111-4111-8111-111111111111', state: 'uploaded' }
    const other = await call()
    h.s.asset = null
    const missing = await call()
    expect(other.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await other.json()).toEqual(await missing.json())
    expect(h.s.advanceCalls).toEqual([])
  })

  it('a step that throws still answers with the last known state (the app polls again)', async () => {
    on(); h.s.advanceThrows = true
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ assetId: ID, state: 'uploaded' })
  })

  it('with no source bucket configured it only reports the state, without advancing', async () => {
    on(); h.s.bucket = null
    const res = await call()
    expect(await res.json()).toEqual({ assetId: ID, state: 'uploaded' })
    expect(h.s.advanceCalls).toEqual([])
  })

  it('never returns a key, a job id or an error detail, whatever the asset row holds', async () => {
    on()
    h.s.asset = { id: ID, owner_id: OWNER, state: 'processing', source_object_key: `vsrc/${OWNER}/k.mp4`, transcode_job_id: 'projects/1/locations/x/jobs/j' }
    const text = JSON.stringify(await (await call()).json())
    expect(text).not.toMatch(/vsrc|projects\/|job/)
  })
})
