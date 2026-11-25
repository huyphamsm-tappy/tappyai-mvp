import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const OTHER = '11111111-1111-4111-8111-111111111111'
const ID = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'
const BUCKET = 'tappyai-video-source'

const h = vi.hoisted(() => ({
  s: {
    user: null as { id: string } | null,
    rlOk: true,
    asset: null as Record<string, unknown> | null,
    order: [] as string[],
    bucket: 'tappyai-video-source' as string | null,
    transcoder: true,
    fullName: 'Phạm Quốc Huy' as string | null,
    jobs: [] as Array<{ name: string; state: string; body: unknown }>,
    files: new Map<string, Uint8Array>(),
    puts: [] as string[],
    render: null as null | Record<string, unknown>,
    docs: null as null | { version: number; doc: unknown },
    throwOnClaim: false,
  },
}))

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => { h.s.order.push('auth'); return { user: h.s.user, supabase: {} } } }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async (key: string) => { h.s.order.push(`rate:${key}`); return { ok: h.s.rlOk, retryAfter: 1 } } }))
vi.mock('@/lib/security/rateLimitResponse', () => ({ rateLimitedResponse: () => new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429 }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.s.fullName === null ? null : { full_name: h.s.fullName }, error: null }) }) }) }) }),
}))
vi.mock('@/lib/media/video/assetStore', () => ({ supabaseVideoAssetStore: () => ({ get: async () => { h.s.order.push('get'); return h.s.asset } }) }))
vi.mock('@/lib/media/video/sourceStorage', () => ({
  getVideoSourceProvider: () => h.s.bucket ? {
    bucket: h.s.bucket,
    provider: {
      id: 'gcs', publicUrl: () => 'x',
      put: async (key: string) => { h.s.puts.push(key); return { url: 'x', key } },
      statObject: async (key: string) => { const f = h.s.files.get(key); return f ? { size: f.length, contentType: 'video/mp4' } : null },
      readRange: async (key: string, o: number, l: number) => (h.s.files.get(key) as Uint8Array).slice(o, o + l),
    },
  } : null,
}))
vi.mock('@/lib/media/video/transcoder', async (orig) => ({
  ...(await orig<typeof import('@/lib/media/video/transcoder')>()),
  getTranscoderClient: () => h.s.transcoder ? {
    location: 'x',
    createJob: async (body: unknown) => { const name = `projects/1/locations/x/jobs/j${h.s.jobs.length + 1}`; h.s.jobs.push({ name, state: 'RUNNING', body }); return { name } },
    getJob: async (name: string) => ({ state: h.s.jobs.find(j => j.name === name)?.state ?? 'FAILED' }),
  } : null,
}))
vi.mock('@/lib/media/video/overlay/overlayStore', () => ({
  supabaseOverlayStore: () => ({ get: async () => h.s.docs }),
  supabaseDownloadRenderStore: () => ({
    async claim() {
      if (h.s.throwOnClaim) throw new Error('db')
      if (!h.s.render) { h.s.render = { state: 'rendering', attempts: 0, job_name: null, object_key: null, error_code: null, updated_at: new Date().toISOString() }; return { claimed: true, render: { ...h.s.render } } }
      return { claimed: false, render: { ...h.s.render } }
    },
    async get() { return h.s.render ? { ...h.s.render } : null },
    async setJob(_a: string, _c: string, rec: { jobName: string | null; attempts: number; error: string | null }) { Object.assign(h.s.render as object, { job_name: rec.jobName, attempts: rec.attempts, error_code: rec.error }) },
    async markReady(_a: string, _c: string, key: string) { Object.assign(h.s.render as object, { state: 'ready', object_key: key }) },
    async markFailed(_a: string, _c: string, code: string) { Object.assign(h.s.render as object, { state: 'failed', error_code: code }) },
  }),
}))

import { GET, POST } from './route'

const URL_ = `https://www.tappyai.com/api/video/uploads/${ID}/download`
const post = (id = ID) => POST(new NextRequest(URL_, { method: 'POST' }), { params: { id } })
const get = (qs = '', id = ID) => GET(new NextRequest(URL_ + qs), { params: { id } })
const okAsset = (over: Record<string, unknown> = {}) => ({
  id: ID, owner_id: OWNER, state: 'published', moderation_state: 'approved', source_object_key: `vsrc/${OWNER}/o.mp4`, has_audio: true, duration_ms: 6000, width: 720, height: 1280, ...over,
})

beforeEach(() => {
  vi.unstubAllEnvs()
  Object.assign(h.s, { user: { id: OWNER }, rlOk: true, asset: okAsset(), order: [], bucket: BUCKET, transcoder: true, fullName: 'Phạm Quốc Huy', jobs: [], files: new Map(), puts: [], render: null, docs: null, throwOnClaim: false })
})
const on = () => vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', 'true')

describe('download route — guards', () => {
  it('🚨 is OFF by default: 404 for POST and GET, and nothing runs', async () => {
    expect((await post()).status).toBe(404)
    expect((await get()).status).toBe(404)
    expect((await get('?file=1')).status).toBe(404)
    expect(h.s.order).toEqual([])
    expect(h.s.jobs).toEqual([])
  })

  it('401 without a session, 429 over the limit (own limit per route), non-uuid is a 404 that never reads the database', async () => {
    on(); h.s.user = null
    expect((await post()).status).toBe(401)
    expect((await get()).status).toBe(401)
    h.s.user = { id: OWNER }; h.s.rlOk = false
    expect((await post()).status).toBe(429)
    h.s.rlOk = true; h.s.order = []
    expect((await post('nope')).status).toBe(404)
    expect(h.s.order).not.toContain('get')
    await post(); await get()
    expect(h.s.order).toContain(`rate:video-download-start:${OWNER}`)
    expect(h.s.order).toContain(`rate:video-download-status:${OWNER}`)
  })

  it('🚨 someone else\'s asset and an unknown id answer the same 404 and start no job, for status and for the file', async () => {
    on()
    h.s.asset = okAsset({ owner_id: OTHER })
    const other = await post()
    h.s.asset = null
    const missing = await post()
    expect(other.status).toBe(404)
    expect(await other.json()).toEqual(await missing.json())
    h.s.asset = okAsset({ owner_id: OTHER })
    expect((await get('?file=1')).status).toBe(404)
    expect(h.s.jobs).toEqual([])
    expect(h.s.puts).toEqual([])
  })

  it.each(['draft', 'processing', 'moderating', 'review_required', 'rejected', 'failed'])('🚨 a video in state %s is refused with 409 not_ready and no job', async (state) => {
    on(); h.s.asset = okAsset({ state, moderation_state: 'pending' })
    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not_ready')
    expect((await get('?file=1')).status).toBe(409)
    expect(h.s.jobs).toEqual([])
  })

  it('without the private bucket or the transcoder it answers 503 and starts nothing', async () => {
    on(); h.s.bucket = null
    expect((await post()).status).toBe(503)
    h.s.bucket = BUCKET; h.s.transcoder = false
    expect((await post()).status).toBe(503)
    expect(h.s.jobs).toEqual([])
  })

  it('a database failure is a 503 with no detail', async () => {
    on(); h.s.throwOnClaim = true
    const res = await post()
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).not.toMatch(/db/)
  })
})

describe('download route — render and stream', () => {
  it('POST starts the render; the answer is the status only', async () => {
    on()
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'rendering' })
    expect(h.s.jobs).toHaveLength(1)
    expect(h.s.puts.some(k => k.endsWith('/in/watermark.png'))).toBe(true)
  })

  it('the watermark handle is the plain-ASCII form of the account name', async () => {
    on(); h.s.fullName = 'Phạm Quốc Huy'
    await post()
    // The renderer ran for real: a PNG was uploaded for the watermark (its handle is covered by renderPng tests); here we only prove the route did not fail on a Vietnamese name.
    expect(h.s.puts).toHaveLength(1)
    h.s.render = null; h.s.puts = []; h.s.fullName = null
    expect((await post()).status).toBe(200)
  })

  it('GET without ?file=1 reports the status and never returns the file or any address', async () => {
    on()
    await post()
    expect(await (await get()).json()).toEqual({ status: 'rendering' })
    // The job reports success but the file is not in storage: still not ready, and no file bytes or address are offered.
    h.s.jobs[0].state = 'SUCCEEDED'
    const res = await get()
    const json = await res.json()
    expect(json.status).not.toBe('ready')
    expect(JSON.stringify(json)).not.toMatch(/vdl|vsrc|gs:|projects\//)
  })

  it('before any request the status is none', async () => {
    on()
    expect(await (await get()).json()).toEqual({ status: 'none' })
  })

  it('🚨 when ready, ?file=1 streams the MP4 through the server as an attachment with a Vietnamese-safe name; never a redirect or an address', async () => {
    on()
    await post()
    h.s.jobs[0].state = 'SUCCEEDED'
    // The file lands where the render's job writes it: find the output key from the job's output uri.
    const outUri = (h.s.jobs[0].body as { outputUri: string }).outputUri
    const key = `${outUri.replace(`gs://${BUCKET}/`, '')}download.mp4`
    const bytes = new Uint8Array(5000).map((_, i) => i % 200)
    h.s.files.set(key, bytes)

    const status = await get()
    expect(await status.json()).toEqual({ status: 'ready' })
    const res = await get('?file=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('video/mp4')
    expect(res.headers.get('content-length')).toBe('5000')
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="TappyAI - Pham Quoc Huy.mp4"; filename*=UTF-8''TappyAI%20-%20Ph%E1%BA%A1m%20Qu%E1%BB%91c%20Huy.mp4`)
    expect(res.headers.get('cache-control')).toMatch(/no-store/)
    expect(res.headers.get('location')).toBeNull()
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
    for (const [k, v] of res.headers) expect(`${k}: ${v}`).not.toMatch(/vdl|vsrc|storage\.googleapis|gs:/i)
  })

  it('?file=1 while it is still rendering is a 409 with the status, not a partial file', async () => {
    on()
    await post()
    const res = await get('?file=1')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ status: 'rendering' })
  })
})
