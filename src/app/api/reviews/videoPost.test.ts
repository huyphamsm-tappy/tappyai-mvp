/**
 * Explore video — POST /api/reviews with a `videoAssetId` (publishing slice).
 *
 * Pins: with the pipeline flag OFF the field is ignored and nothing video-related runs (the route is exactly what it always was); with it ON the video must be inspected BEFORE
 * the duplicate check and claimed only AFTER it, the server (not the client) decides the media URL / type / post id, a retry of an existing post writes nothing, and a video that
 * cannot be posted answers with a code. The video functions themselves are proven in src/lib/media/video/publishPost.test.ts and supabase/tests/video_assets_publish_delivery.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>
const VIDEO = '22222222-2222-4222-8222-222222222222'
const POST = '55555555-5555-4555-8555-555555555555'

const h = vi.hoisted(() => {
  const s = {
    inserted: [] as Row[],
    duplicate: false,
    insertError: null as { code?: string; message?: string } | null,
    order: [] as string[],
    inspect: { ok: true, reused: false, reviewId: null } as Record<string, unknown>,
    claim: { ok: true, reused: false, reviewId: '55555555-5555-4555-8555-555555555555', manifestUrl: 'https://media.example.com/vdel/o/a/manifest.m3u8', durationSec: 12 } as Record<string, unknown>,
    inspectCalls: [] as unknown[],
    claimCalls: [] as unknown[],
    existingById: true,
  }
  const builder = (writes: boolean): any => {
    let table = ''
    const b: any = {
      select: () => b, eq: () => b, lt: () => b, limit: () => b, order: () => b, in: () => b, or: () => b,
      maybeSingle: () => {
        // the duplicate check reads `reviews` through the caller's client; the 23505 follow-up reads it through the writer
        if (table === 'reviews' && !writes) { s.order.push('duplicate-check'); return Promise.resolve({ data: s.duplicate ? { id: 'x' } : null, error: null }) }
        if (table === 'reviews' && writes) return Promise.resolve({ data: s.existingById ? { id: 'x' } : null, error: null })
        return Promise.resolve({ data: null, error: null })
      },
      insert: (row: Row) => {
        if (!writes) throw new Error('caller client used for INSERT')
        s.order.push('insert'); s.inserted.push(row)
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data: s.insertError ? null : { id: 'new' }, error: s.insertError }) }) }
      },
      from: (t: string) => { table = t; return b },
    }
    b.from = (t: string) => { table = t; return b }
    return b
  }
  const rpc = (fn: string) => fn === 'user_age_status'
    ? Promise.resolve({ data: [{ has_dob: true, age_years: 30, age_band: '25_34', corrections_used: 0 }], error: null })
    : Promise.resolve({ data: null, error: null })
  return { s, client: { from: (t: string) => builder(false).from(t), rpc }, admin: { from: (t: string) => builder(true).from(t) } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'author-1' }, supabase: h.client }) }))
vi.mock('@/lib/preferences/profileCache', () => ({ rebuildProfile: () => Promise.resolve() }))
vi.mock('@/lib/security/rateLimit', () => ({ dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({ AI: { vision: () => Promise.resolve({ text: 'TEXT: NONE\nSUBJECTS: x' }) } }))
vi.mock('@/lib/media/video/publishPost', async () => {
  const real = await vi.importActual<typeof import('@/lib/media/video/publishPost')>('@/lib/media/video/publishPost')
  return {
    parseVideoAssetId: real.parseVideoAssetId,
    videoPostDepsFromEnv: () => ({ tag: 'deps' }),
    inspectVideoForPost: async (i: unknown) => { h.s.order.push('inspect'); h.s.inspectCalls.push(i); return h.s.inspect },
    claimVideoForPost: async (i: unknown) => { h.s.order.push('claim'); h.s.claimCalls.push(i); return h.s.claim },
  }
})

import { POST as handlePost } from './route'

const post = async (body: Row) => {
  const req = { nextUrl: new URL('http://localhost/api/reviews'), headers: new Headers(), json: () => Promise.resolve(body) }
  const res = await handlePost(req as never)
  return { status: res.status, body: (await res.json()) as Row }
}
const base = { placeId: 'ChIJtest', placeName: 'Quán Ngon', placeAddress: '12 Lê Lợi', rating: 5, body: 'Clip quán bún chả', hashtags: ['anuong'] }
const on = () => vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', 'true')

beforeEach(() => {
  vi.unstubAllEnvs()
  Object.assign(h.s, {
    inserted: [], duplicate: false, insertError: null, order: [], inspectCalls: [], claimCalls: [], existingById: true,
    inspect: { ok: true, reused: false, reviewId: null },
    claim: { ok: true, reused: false, reviewId: POST, manifestUrl: 'https://media.example.com/vdel/o/a/manifest.m3u8', durationSec: 12 },
  })
})

describe('POST /api/reviews — Explore video post', () => {
  it('🚨 flag OFF: videoAssetId is ignored, no video code runs, and the post is written exactly as before (media_url from the body, no id)', async () => {
    const r = await post({ ...base, videoAssetId: VIDEO, content_type: 'video', media_url: 'https://storage.googleapis.com/tappyai-media-prod/videos/u/a.mp4' })
    expect(r.status).toBe(200)
    expect(h.s.order).not.toContain('inspect')
    expect(h.s.order).not.toContain('claim')
    expect(h.s.inserted[0].media_url).toBe('https://storage.googleapis.com/tappyai-media-prod/videos/u/a.mp4')
    expect(h.s.inserted[0]).not.toHaveProperty('id')
    expect(r.body).toEqual({ ok: true, is_verified: false })
  })

  it('flag OFF: a video-only post (no body, no media_url) is still refused like before', async () => {
    expect((await post({ placeId: 'p', placeName: 'n', body: '', videoAssetId: VIDEO })).status).toBe(400)
  })

  it('flag ON: inspects before the duplicate check, claims AFTER it, and the server decides media_url, content type and the post id', async () => {
    on()
    const r = await post({ ...base, videoAssetId: VIDEO, media_url: 'https://evil.example/x.mp4', content_type: 'photo', source_type: 'youtube', source_url: 'https://y', duration: 1 })
    expect(r.status).toBe(200)
    expect(h.s.order).toEqual(['inspect', 'duplicate-check', 'claim', 'insert'])
    expect(h.s.inspectCalls[0]).toEqual({ assetId: VIDEO, ownerId: 'author-1' })
    expect(h.s.claimCalls[0]).toEqual({ assetId: VIDEO, ownerId: 'author-1', resumeReviewId: null })
    expect(h.s.inserted[0]).toMatchObject({ id: POST, user_id: 'author-1', media_url: 'https://media.example.com/vdel/o/a/manifest.m3u8', content_type: 'video' })
    expect(h.s.inserted[0]).not.toHaveProperty('source_url')
    expect(h.s.inserted[0]).not.toHaveProperty('source_type')
    expect(r.body).toMatchObject({ ok: true, review_id: POST })
  })

  it('flag ON: a video-only post (no text) is allowed', async () => {
    on()
    expect((await post({ placeId: 'p', placeName: 'n', body: '', videoAssetId: VIDEO })).status).toBe(200)
  })

  it('🚨 a place the user already reviewed is 409 BEFORE the video is claimed (nothing is published for a post that will not be written)', async () => {
    on()
    h.s.duplicate = true
    const r = await post({ ...base, videoAssetId: VIDEO })
    expect(r.status).toBe(409)
    expect(h.s.order).not.toContain('claim')
    expect(h.s.inserted).toEqual([])
  })

  it('a retry of a post that already exists answers with it and writes nothing (no duplicate post)', async () => {
    on()
    h.s.inspect = { ok: true, reused: true, reviewId: POST }
    const r = await post({ ...base, videoAssetId: VIDEO })
    expect(r).toEqual({ status: 200, body: { ok: true, reused: true, review_id: POST } })
    expect(h.s.order).toEqual(['inspect'])
    expect(h.s.inserted).toEqual([])
  })

  it('a resumed claim (the first attempt died after publishing) writes the post with the SAME id', async () => {
    on()
    h.s.inspect = { ok: true, reused: false, reviewId: POST }
    await post({ ...base, videoAssetId: VIDEO })
    expect(h.s.claimCalls[0]).toMatchObject({ resumeReviewId: POST })
    expect(h.s.inserted[0].id).toBe(POST)
  })

  it('a claim that finds the video on another post (a race) returns that post and writes nothing', async () => {
    on()
    h.s.claim = { ok: true, reused: true, reviewId: 'other-post' }
    const r = await post({ ...base, videoAssetId: VIDEO })
    expect(r.body).toEqual({ ok: true, reused: true, review_id: 'other-post' })
    expect(h.s.inserted).toEqual([])
  })

  it('a video that cannot be posted answers with its code and status, and writes nothing', async () => {
    on()
    for (const [f, status] of [[{ status: 404, error: 'video_not_found' }, 404], [{ status: 409, error: 'video_not_ready' }, 409], [{ status: 503, error: 'video_unavailable' }, 503]] as const) {
      h.s.inspect = { ok: false, ...f }; h.s.order = []
      const r = await post({ ...base, videoAssetId: VIDEO })
      expect(r.status).toBe(status)
      expect(r.body.error).toBe(f.error)
      expect(typeof r.body.message).toBe('string')
      expect(h.s.inserted).toEqual([])
    }
    h.s.inspect = { ok: true, reused: false, reviewId: null }
    h.s.claim = { ok: false, status: 503, error: 'video_promoting' }
    expect((await post({ ...base, videoAssetId: VIDEO })).status).toBe(503)
    expect(h.s.inserted).toEqual([])
  })

  it('a malformed videoAssetId is 400 and nothing runs', async () => {
    on()
    for (const bad of ['not-a-uuid', 12, { x: 1 }]) {
      const r = await post({ ...base, videoAssetId: bad })
      expect(r.status).toBe(400)
    }
    expect(h.s.order).not.toContain('inspect')
  })

  it('two retries racing to write the same post id: the duplicate key is "already there", not a failure — but a real insert error still is', async () => {
    on()
    h.s.insertError = { code: '23505', message: 'duplicate key' }
    expect((await post({ ...base, videoAssetId: VIDEO })).status).toBe(200)
    h.s.existingById = false
    expect((await post({ ...base, videoAssetId: VIDEO })).status).toBe(500)
    h.s.insertError = { code: '57014', message: 'timeout' }
    h.s.existingById = true
    expect((await post({ ...base, videoAssetId: VIDEO })).status).toBe(500)
  })
})
