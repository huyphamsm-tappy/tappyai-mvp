import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const OTHER = '11111111-1111-4111-8111-111111111111'
const ID = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'

const h = vi.hoisted(() => ({
  s: {
    user: null as { id: string } | null,
    rlOk: true,
    asset: null as Record<string, unknown> | null,
    order: [] as string[],
    saved: null as null | { version: number; doc: unknown },
    saveCalls: [] as unknown[],
    saveStatus: 'saved' as string,
    throws: false,
  },
}))

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => { h.s.order.push('auth'); return { user: h.s.user, supabase: {} } } }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async (key: string) => { h.s.order.push(`rate:${key}`); return { ok: h.s.rlOk, retryAfter: 1 } } }))
vi.mock('@/lib/security/rateLimitResponse', () => ({ rateLimitedResponse: () => new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429 }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/media/video/assetStore', () => ({ supabaseVideoAssetStore: () => ({ get: async () => { h.s.order.push('get'); return h.s.asset } }) }))
vi.mock('@/lib/media/video/overlay/overlayStore', () => ({
  supabaseOverlayStore: () => ({
    get: async () => { if (h.s.throws) throw new Error('db'); return h.s.saved },
    save: async (assetId: string, ownerId: string, expected: number, doc: unknown) => {
      h.s.saveCalls.push({ assetId, ownerId, expected, doc })
      if (h.s.throws) throw new Error('db')
      return { status: h.s.saveStatus, version: h.s.saveStatus === 'conflict' ? 7 : expected + 1 }
    },
  }),
}))

import { GET, PUT } from './route'
import { defaultTextLayer } from '@/lib/media/video/overlay/schema'

const URL_ = `https://www.tappyai.com/api/video/uploads/${ID}/overlay`
const layer = (over: Record<string, unknown> = {}) => ({ ...defaultTextLayer('a1'), text: 'Xin chào', start_ms: 0, end_ms: 3000, ...over })
const body = (doc: unknown, version: unknown = 0, extra: Record<string, unknown> = {}) => JSON.stringify({ version, doc, ...extra })
const get = (id = ID) => GET(new NextRequest(URL_), { params: { id } })
const put = (raw: string, id = ID, headers: Record<string, string> = {}) => PUT(new NextRequest(URL_, { method: 'PUT', body: raw, headers }), { params: { id } })

beforeEach(() => {
  vi.unstubAllEnvs()
  Object.assign(h.s, { user: { id: OWNER }, rlOk: true, asset: { id: ID, owner_id: OWNER, state: 'draft', duration_ms: 6000 }, order: [], saved: null, saveCalls: [], saveStatus: 'saved', throws: false })
})
const on = () => vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', 'true')

describe('overlay route — shared guards', () => {
  it('🚨 is OFF by default: 404 for GET and PUT, and nothing runs', async () => {
    expect((await get()).status).toBe(404)
    expect((await put(body({ schema_version: 1, layers: [] }))).status).toBe(404)
    expect(h.s.order).toEqual([])
    expect(h.s.saveCalls).toEqual([])
  })

  it('401 without a session, 429 over the limit, non-uuid is a 404 that never reads the database', async () => {
    on(); h.s.user = null
    expect((await get()).status).toBe(401)
    expect((await put(body({}))).status).toBe(401)
    h.s.user = { id: OWNER }; h.s.rlOk = false
    expect((await get()).status).toBe(429)
    h.s.rlOk = true; h.s.order = []
    expect((await get('not-a-uuid')).status).toBe(404)
    expect(h.s.order).not.toContain('get')
  })

  it('🚨 someone else\'s asset and an unknown id answer the SAME 404; nothing is saved', async () => {
    on()
    h.s.asset = { id: ID, owner_id: OTHER, state: 'draft' }
    const other = await put(body({ schema_version: 1, layers: [] }))
    h.s.asset = null
    const missing = await put(body({ schema_version: 1, layers: [] }))
    expect(other.status).toBe(404)
    expect(await other.json()).toEqual(await missing.json())
    expect(h.s.saveCalls).toEqual([])
    h.s.asset = { id: ID, owner_id: OTHER, state: 'draft' }
    expect((await get()).status).toBe(404)
  })

  it('limits per user and per route (the save is its own limit)', async () => {
    on()
    await get(); await put(body({ schema_version: 1, layers: [] }))
    expect(h.s.order).toContain(`rate:video-overlay-read:${OWNER}`)
    expect(h.s.order).toContain(`rate:video-overlay-save:${OWNER}`)
  })
})

describe('GET overlay', () => {
  it('returns version 0 and an empty document when nothing was saved', async () => {
    on()
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ version: 0, doc: { schema_version: 1, layers: [] } })
    expect(res.headers.get('cache-control')).toMatch(/no-store/)
  })
  it('returns the saved version and document; a database failure is a 503 with no detail', async () => {
    on()
    h.s.saved = { version: 3, doc: { schema_version: 1, layers: [layer()] } }
    expect(await (await get()).json()).toEqual({ version: 3, doc: h.s.saved.doc })
    h.s.throws = true
    const res = await get()
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).not.toMatch(/db/)
  })
})

describe('PUT overlay', () => {
  it('validates, saves with the caller\'s expected version, and answers with the new version', async () => {
    on()
    const res = await put(body({ schema_version: 1, layers: [layer({ color: '#FFAA00' })] }, 2))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ version: 3 })
    expect(h.s.saveCalls).toHaveLength(1)
    const call = h.s.saveCalls[0] as { ownerId: string; expected: number; doc: { layers: Array<{ color: string }> } }
    expect([call.ownerId, call.expected]).toEqual([OWNER, 2])
    expect(call.doc.layers[0].color).toBe('#ffaa00') // the normalised copy is what is stored
  })

  it('🚨 a stale version is a 409 with the current version and nothing is overwritten', async () => {
    on(); h.s.saveStatus = 'conflict'
    const res = await put(body({ schema_version: 1, layers: [] }, 1))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'version_conflict', message: expect.any(String), version: 7 })
  })

  it('a deleted asset is refused (409), and the database\'s not_found is the usual 404', async () => {
    on()
    h.s.saveStatus = 'deleted'
    expect((await put(body({ schema_version: 1, layers: [] }))).status).toBe(409)
    h.s.saveStatus = 'not_found'
    expect((await put(body({ schema_version: 1, layers: [] }))).status).toBe(404)
  })

  it('🚨 an invalid document is a 400 naming the fields, and is never saved', async () => {
    on()
    const bads: unknown[] = [
      { schema_version: 2, layers: [] },
      { schema_version: 1, layers: [], extra: 1 },
      { schema_version: 1, layers: [layer({ x: 5 })] },
      { schema_version: 1, layers: [layer({ text: '' })] },
      { schema_version: 1, layers: [layer({ end_ms: 99_999 })] }, // past the clip (6000 ms)
      { schema_version: 1, layers: [{ ...layer(), onclick: 'x' }] },
    ]
    for (const doc of bads) {
      const res = await put(body(doc))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_overlay')
    }
    expect(h.s.saveCalls).toEqual([])
  })

  it('the times are checked against the clip\'s own length from the file header', async () => {
    on()
    expect((await put(body({ schema_version: 1, layers: [layer({ end_ms: 6000 })] }))).status).toBe(200)
    expect((await put(body({ schema_version: 1, layers: [layer({ end_ms: 6001 })] }))).status).toBe(400)
  })

  it('a malformed body, a missing/ill-typed version, extra top-level fields and non-objects are 400', async () => {
    on()
    for (const raw of ['{not json', '[]', 'null', '"x"', body({ schema_version: 1, layers: [] }, '1'), body({ schema_version: 1, layers: [] }, -1), body({ schema_version: 1, layers: [] }, 1.5), body({ schema_version: 1, layers: [] }, 0, { evil: 1 }), JSON.stringify({ doc: { schema_version: 1, layers: [] } })]) {
      expect((await put(raw)).status).toBe(400)
    }
    expect(h.s.saveCalls).toEqual([])
  })

  it('an oversized body is a 413 before anything is parsed', async () => {
    on()
    expect((await put('x'.repeat(100_000))).status).toBe(413)
    expect((await put('{}', ID, { 'content-length': '999999' })).status).toBe(413)
    expect(h.s.saveCalls).toEqual([])
  })

  it('warns about characters the renderer font cannot draw, and still saves', async () => {
    on()
    const res = await put(body({ schema_version: 1, layers: [layer({ text: 'xin 日本' })] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ version: 1, warnings: { unsupported_chars: ['日', '本'] } })
  })

  it('a database failure is a 503 with no detail', async () => {
    on(); h.s.throws = true
    const res = await put(body({ schema_version: 1, layers: [] }))
    expect(res.status).toBe(503)
  })
})
