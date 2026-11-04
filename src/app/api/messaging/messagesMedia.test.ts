import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Pictures in the send route and the history route (migration 20261109_chat_media.sql).
 * GET: each message that has a picture comes back with a SHORT-LIVED signed link made by the server (only for rows the caller's own client could read).
 * POST: a message is text, a picture, or both; the picture is the PATH the upload route returned and must be exactly "<thread>/<caller>/<file>" and really exist.
 */

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
    rows: [] as unknown[],
    i: 0,
    inserted: [] as Array<Record<string, unknown>>,
    selected: [] as string[],
    /** path -> link; a path absent from this map has no object in storage. */
    links: new Map<string, string>(),
    signCalls: [] as string[][],
  }
  const builder: Record<string, unknown> = {}
  for (const m of ['from', 'eq', 'in', 'limit', 'maybeSingle', 'single', 'order', 'lt', 'or']) builder[m] = () => builder
  builder.select = (cols: string) => { state.selected.push(cols); return builder }
  builder.insert = (v: Record<string, unknown>) => { state.inserted.push(v); return builder }
  ;(builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(state.rows[state.i++] ?? { data: null, error: null }).then(res, rej)
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  const admin = {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          state.signCalls.push(paths)
          return { data: paths.map(p => state.links.has(p) ? { path: p, signedUrl: state.links.get(p)!, error: null } : { path: p, signedUrl: null, error: 'not found' }), error: null }
        },
      }),
    },
  }
  return { state, getRequestUser, admin }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))

import { GET, POST } from './threads/[id]/messages/route'

const T = '11111111-1111-4111-8111-111111111111'
const params = { params: { id: T } }
const url = `http://localhost/api/messaging/threads/${T}/messages`
const get = () => GET(new Request(url) as never, params as never)
const send = (body: unknown) =>
  POST(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never, params as never)

const THREAD_FOUND = { data: { id: T, kind: 'direct' }, error: null }
const PATH = `${T}/u1/1730000000000-abcDEF123456.webp`
const row = (over: Record<string, unknown> = {}) => ({
  id: 'm1', thread_id: T, sender_id: 'u1', body: '', created_at: '2026-11-05T01:00:00.000Z',
  media_path: PATH, media_type: 'image', media_width: 800, media_height: 600, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1', is_anonymous: false }
  h.state.rows = []
  h.state.i = 0
  h.state.inserted = []
  h.state.selected = []
  h.state.links = new Map([[PATH, 'https://storage.example/signed/abc?token=1']])
  h.state.signCalls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET history with pictures', () => {
  it('asks for the media columns', async () => {
    h.state.rows = [THREAD_FOUND, { data: [], error: null }]
    await get()
    const cols = h.state.selected.find(c => c.includes('created_at'))!
    for (const c of ['media_path', 'media_type', 'media_width', 'media_height']) expect(cols).toContain(c)
  })

  it('a message with a picture carries a signed link, its size and type; a text message carries media: null', async () => {
    h.state.rows = [THREAD_FOUND, { data: [row({ id: 'm2' }), row({ id: 'm1', body: 'hi', media_path: null, media_type: null, media_width: null, media_height: null })], error: null }]
    const body = await (await get()).json()
    const byId = Object.fromEntries(body.messages.map((m: { id: string }) => [m.id, m]))
    expect(byId.m2.media).toEqual({ type: 'image', url: 'https://storage.example/signed/abc?token=1', width: 800, height: 600 })
    expect(byId.m1.media).toBeNull()
    expect(byId.m2.body).toBe('')
  })

  it('links are made for the pictures of the rows the caller\'s own client returned, once each, and not at all when there are none', async () => {
    h.state.rows = [THREAD_FOUND, { data: [row({ id: 'm2' }), row({ id: 'm3' })], error: null }]
    await get()
    expect(h.state.signCalls).toEqual([[PATH]]) // the same path twice is signed once
    h.state.i = 0; h.state.signCalls = []
    h.state.rows = [THREAD_FOUND, { data: [row({ id: 'm9', body: 'x', media_path: null, media_type: null })], error: null }]
    await get()
    expect(h.state.signCalls).toEqual([])
  })

  it('a picture that cannot be linked (object gone) still comes back as a picture, with url null — the page shows a placeholder, the history is not lost', async () => {
    h.state.links = new Map()
    h.state.rows = [THREAD_FOUND, { data: [row()], error: null }]
    const body = await (await get()).json()
    expect(body.messages[0].media).toEqual({ type: 'image', url: null, width: 800, height: 600 })
  })

  it('an EXPIRED picture (retention period over) asks for no link and comes back as expired with url null; a live one beside it is still linked', async () => {
    h.state.rows = [THREAD_FOUND, { data: [row({ id: 'm1', media_expired_at: '2026-12-01T00:00:00.000Z' }), row({ id: 'm2', media_path: `${T}/u1/live.webp` })], error: null }]
    h.state.links.set(`${T}/u1/live.webp`, 'https://storage.example/signed/live')
    const body = await (await get()).json()
    const byId = Object.fromEntries(body.messages.map((m: { id: string }) => [m.id, m]))
    expect(byId.m1.media).toEqual({ type: 'image', url: null, width: 800, height: 600, expired: true })
    expect(byId.m2.media.url).toBe('https://storage.example/signed/live')
    expect(byId.m2.media.expired).toBeUndefined()
    expect(h.state.signCalls).toEqual([[`${T}/u1/live.webp`]]) // the expired object is never signed
  })

  it('the history read asks for media_expired_at', async () => {
    h.state.rows = [THREAD_FOUND, { data: [], error: null }]
    await get()
    expect(h.state.selected.find(c => c.includes('created_at'))).toContain('media_expired_at')
  })

  it('the response has no `media_path` or `path` field: the client only needs the link (the signed link itself names the object — it IS the capability)', async () => {
    h.state.rows = [THREAD_FOUND, { data: [row()], error: null }]
    const body = await (await get()).json()
    for (const m of body.messages) {
      expect('media_path' in m).toBe(false)
      expect(m.media && 'path' in m.media).toBeFalsy()
    }
  })
})

describe('POST a picture', () => {
  const STORED = (over: Record<string, unknown> = {}) => ({ data: row(over), error: null })
  const media = (over: Record<string, unknown> = {}) => ({ path: PATH, width: 800, height: 600, ...over })

  it('a picture with NO text is a message (the body is empty), stored with its path, type and size, and the answer carries the signed link', async () => {
    h.state.rows = [THREAD_FOUND, STORED()]
    const res = await send({ media: media() })
    expect(res.status).toBe(200)
    expect(h.state.inserted[0]).toEqual({ thread_id: T, sender_id: 'u1', body: '', media_path: PATH, media_type: 'image', media_width: 800, media_height: 600 })
    expect((await res.json()).message.media).toEqual({ type: 'image', url: 'https://storage.example/signed/abc?token=1', width: 800, height: 600 })
  })

  it('a picture WITH a caption keeps the caption (trimmed)', async () => {
    h.state.rows = [THREAD_FOUND, STORED({ body: 'món này ngon' })]
    await send({ body: '  món này ngon  ', media: media() })
    expect(h.state.inserted[0]).toMatchObject({ body: 'món này ngon', media_path: PATH })
  })

  it('nothing at all (no text, no picture) is still refused, and a text-only message is stored exactly as before (no media keys)', async () => {
    h.state.rows = [THREAD_FOUND]
    expect((await send({})).status).toBe(400)
    expect((await send({ body: '   ' })).status).toBe(400)
    h.state.i = 0; h.state.rows = [THREAD_FOUND, STORED({ body: 'hi', media_path: null, media_type: null, media_width: null, media_height: null })]
    await send({ body: 'hi' })
    expect(h.state.inserted).toEqual([{ thread_id: T, sender_id: 'u1', body: 'hi' }])
  })

  it.each([
    ['another thread', `99999999-9999-4999-8999-999999999999/u1/x.webp`],
    ['another person\'s folder', `${T}/u2/x.webp`],
    ['a path that climbs out', `${T}/u1/../u2/x.webp`],
    ['a link instead of a path', 'https://evil.example/x.png'],
    ['an empty path', ''],
  ])('a picture whose path is %s is refused (400), nothing stored', async (_n, path) => {
    h.state.rows = [THREAD_FOUND]
    const res = await send({ media: media({ path }) })
    expect(res.status).toBe(400)
    expect(h.state.inserted).toHaveLength(0)
  })

  it('a non-object `media`, or a path that is not a string, is a 400', async () => {
    for (const m of ['x', 5, [], { path: 5 }, { width: 10 }]) {
      h.state.i = 0; h.state.rows = [THREAD_FOUND]
      expect((await send({ media: m })).status, JSON.stringify(m)).toBe(400)
    }
    expect(h.state.inserted).toHaveLength(0)
  })

  it('a path that was never uploaded (no object in storage) is a 400 — a message cannot point at nothing', async () => {
    h.state.links = new Map()
    h.state.rows = [THREAD_FOUND]
    const res = await send({ media: media() })
    expect(res.status).toBe(400)
    expect(h.state.inserted).toHaveLength(0)
  })

  it('a width or height that is not a sane integer is dropped (null), not trusted and not an error', async () => {
    h.state.rows = [THREAD_FOUND, STORED({ media_width: null, media_height: null })]
    await send({ media: media({ width: -5, height: 'big' }) })
    expect(h.state.inserted[0]).toMatchObject({ media_width: null, media_height: null })
    h.state.i = 0; h.state.inserted = []; h.state.rows = [THREAD_FOUND, STORED({ media_width: null, media_height: null })]
    await send({ media: media({ width: 99999, height: 1.5 }) })
    expect(h.state.inserted[0]).toMatchObject({ media_width: null, media_height: null })
  })

  it('the same picture attached to a second message (unique violation on the path) is a 400 — one picture, one message', async () => {
    h.state.rows = [THREAD_FOUND, { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "chat_messages_media_path_uniq"' } }]
    const res = await send({ media: media() })
    expect(res.status).toBe(400)
  })

  it('the existing refusals are unchanged for a picture message: RLS (not a participant, or a block) is a 404', async () => {
    h.state.rows = [THREAD_FOUND, { data: null, error: { code: '42501', message: 'row-level security' } }]
    expect((await send({ media: media() })).status).toBe(404)
  })

  it('a repeat of a picture send that is already stored (same clientId) answers 200 with the stored message and its link', async () => {
    const CID = '22222222-2222-4222-8222-222222222222'
    h.state.rows = [THREAD_FOUND, { data: null, error: { code: '23505', message: 'duplicate key' } }, STORED()]
    const res = await send({ media: media(), clientId: CID })
    expect(res.status).toBe(200)
    expect((await res.json()).message.media.url).toBe('https://storage.example/signed/abc?token=1')
  })
})
