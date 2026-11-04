import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/messaging/threads/[id]/media — upload ONE picture for a message of this conversation (owner 04/11/2026; migration 20261109_chat_media.sql).
 * The server is the only writer of the private bucket. It checks the session, the thread (row-level security: a thread the caller is not in is a 404, before the
 * body is even read), the size and the REAL type (magic bytes: JPEG, PNG, WebP — not GIF, SVG, HTML), strips the metadata (EXIF/GPS) by re-encoding, and stores
 * the object under "<thread>/<caller>/<random file>". It answers with the path (and the picture's size); the message that uses it is a second request.
 */

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
    thread: { data: { id: 't1', kind: 'direct' } as unknown, error: null as unknown },
    memoryOk: true,
    stripThrows: false,
    uploadError: null as { message: string } | null,
    uploads: [] as Array<{ bucket: string; path: string; bytes: Buffer; opts: Record<string, unknown> }>,
    order: [] as string[],
    size: { width: 800, height: 600 },
    consentRefused: false,
    verdict: 'ok' as 'ok' | 'blocked' | 'unavailable' | 'off',
  }
  const own: Record<string, unknown> = {}
  own.from = (t: string) => { state.order.push(`from:${t}`); return own }
  own.select = () => own
  own.eq = () => own
  own.maybeSingle = () => Promise.resolve(state.thread)
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: own }))
  const admin = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Buffer, opts: Record<string, unknown>) => {
          state.order.push('upload')
          state.uploads.push({ bucket, path, bytes, opts })
          return { data: state.uploadError ? null : { path }, error: state.uploadError }
        },
      }),
    },
  }
  const stripImageMetadata = vi.fn(async (input: Uint8Array) => {
    if (state.stripThrows) throw new Error('cannot decode')
    state.order.push('strip')
    return { bytes: Buffer.concat([Buffer.from('STRIPPED:'), Buffer.from(input)]), reencoded: true }
  })
  const sharp = vi.fn(() => ({ metadata: async () => ({ width: state.size.width, height: state.size.height }) }))
  return { state, getRequestUser, admin, stripImageMetadata, sharp }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: h.state.memoryOk }) }))
vi.mock('@/lib/media/stripImageMetadata', () => ({ stripImageMetadata: h.stripImageMetadata }))
vi.mock('sharp', () => ({ default: h.sharp }))
vi.mock('@/lib/ai/consent/aiConsentGuard', () => ({
  refuseWithoutAiConsent: async () => {
    h.state.order.push('consent')
    return h.state.consentRefused ? new Response(JSON.stringify({ error: 'ai_consent_required' }), { status: 403 }) : null
  },
}))
vi.mock('@/lib/messaging/imageScan', () => ({
  scanChatImage: async () => { h.state.order.push('scan'); return h.state.verdict },
}))

import { POST } from './route'

const T = '11111111-1111-4111-8111-111111111111'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 9, 9])
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2])
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

const upload = (bytes: Uint8Array | null, over: { type?: string; name?: string } = {}) => {
  const fd = new FormData()
  if (bytes) fd.append('file', new File([bytes as unknown as BlobPart], over.name ?? 'photo.png', { type: over.type ?? 'image/png' }))
  return POST(new Request(`http://localhost/api/messaging/threads/${T}/media`, { method: 'POST', body: fd }) as never, { params: { id: T } } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1', is_anonymous: false }
  h.state.thread = { data: { id: T, kind: 'direct' }, error: null }
  h.state.memoryOk = true
  h.state.stripThrows = false
  h.state.uploadError = null
  h.state.uploads = []
  h.state.order = []
  h.state.size = { width: 800, height: 600 }
  h.state.consentRefused = false
  h.state.verdict = 'ok'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('who may upload, and where', () => {
  it('401 when signed out; 403 for an anonymous session; nothing is stored', async () => {
    h.state.user = null
    expect((await upload(PNG)).status).toBe(401)
    h.state.user = { id: 'anon', is_anonymous: true }
    expect((await upload(PNG)).status).toBe(403)
    expect(h.state.uploads).toHaveLength(0)
  })

  it('429 when the caller is uploading too fast (before anything else is read)', async () => {
    h.state.memoryOk = false
    expect((await upload(PNG)).status).toBe(429)
    expect(h.state.order).toEqual([])
    expect(h.state.uploads).toHaveLength(0)
  })

  it('a thread the caller is not in (row-level security returns nothing) is a 404 — answered BEFORE the file is read, nothing stored', async () => {
    h.state.thread = { data: null, error: null }
    expect((await upload(PNG)).status).toBe(404)
    expect(h.state.order).toEqual(['from:chat_threads'])
    expect(h.state.uploads).toHaveLength(0)
  })
})

describe('the safety scan', () => {
  it('without AI consent the answer is the consent 403, BEFORE the file is read: nothing scanned, nothing stored', async () => {
    h.state.consentRefused = true
    expect((await upload(PNG)).status).toBe(403)
    expect(h.state.order).toEqual(['from:chat_threads', 'consent'])
    expect(h.state.uploads).toHaveLength(0)
  })

  it('the scan runs on the cleaned picture AFTER the metadata strip and BEFORE the object is stored', async () => {
    expect((await upload(PNG)).status).toBe(200)
    expect(h.state.order).toEqual(['from:chat_threads', 'consent', 'strip', 'scan', 'upload'])
  })

  it('a blocked picture is a 422 image_blocked with a neutral message, and nothing is stored', async () => {
    h.state.verdict = 'blocked'
    const res = await upload(PNG)
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('image_blocked')
    expect(h.state.uploads).toHaveLength(0)
  })

  it('a scan that could not be completed refuses the upload (503), nothing stored', async () => {
    h.state.verdict = 'unavailable'
    const res = await upload(PNG)
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('scan_unavailable')
    expect(h.state.uploads).toHaveLength(0)
  })

  it('with the scan switched off explicitly the picture is stored', async () => {
    h.state.verdict = 'off'
    expect((await upload(PNG)).status).toBe(200)
    expect(h.state.uploads).toHaveLength(1)
  })
})

describe('the file', () => {
  it('no file → 400', async () => {
    expect((await upload(null)).status).toBe(400)
  })

  it('over 5 MB → 400 image_too_large, nothing stored', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set(PNG)
    const res = await upload(big)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('image_too_large')
    expect(h.state.uploads).toHaveLength(0)
  })

  it.each([['GIF', GIF], ['SVG', SVG]])('%s is refused by its REAL bytes, even when labelled image/jpeg', async (_n, bytes) => {
    const res = await upload(bytes, { type: 'image/jpeg', name: 'cute.jpg' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('bad_image_type')
    expect(h.state.uploads).toHaveLength(0)
  })

  it('a real JPEG labelled as something else is accepted by its bytes, and stored with the JPEG content type and extension', async () => {
    const res = await upload(JPEG, { type: 'application/octet-stream', name: 'x.bin' })
    expect(res.status).toBe(200)
    expect(h.state.uploads[0]!.opts).toMatchObject({ contentType: 'image/jpeg' })
    expect(h.state.uploads[0]!.path.endsWith('.jpg')).toBe(true)
  })

  it('a file that passes the signature but cannot be decoded is refused, not stored untouched', async () => {
    h.state.stripThrows = true
    const res = await upload(PNG)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('bad_image_type')
    expect(h.state.uploads).toHaveLength(0)
  })
})

describe('what is stored and what comes back', () => {
  it('the STRIPPED bytes (never the originals) go to the private chat-media bucket, once, never overwriting', async () => {
    const res = await upload(PNG)
    expect(res.status).toBe(200)
    expect(h.state.uploads).toHaveLength(1)
    const u = h.state.uploads[0]!
    expect(u.bucket).toBe('chat-media')
    expect(u.bytes.toString().startsWith('STRIPPED:')).toBe(true)
    expect(u.opts).toMatchObject({ contentType: 'image/png', upsert: false })
    expect(h.state.order).toEqual(['from:chat_threads', 'consent', 'strip', 'scan', 'upload']) // metadata is stripped BEFORE anything is stored
  })

  it('the path is "<thread>/<caller>/<file>" — the caller from the SESSION, the thread from the URL — and is what the response carries, with the size and type', async () => {
    const res = await upload(WEBP)
    const body = await res.json()
    const path = h.state.uploads[0]!.path
    expect(path.startsWith(`${T}/u1/`)).toBe(true)
    expect(path.endsWith('.webp')).toBe(true)
    expect(body).toEqual({ media: { path, type: 'image', width: 800, height: 600 } })
  })

  it('two uploads of the same picture get different paths', async () => {
    await upload(PNG); await upload(PNG)
    expect(h.state.uploads[0]!.path).not.toBe(h.state.uploads[1]!.path)
  })

  it('the response never contains a link (the picture is shown through the message, which the server signs on read)', async () => {
    const body = await (await upload(PNG)).json()
    expect(JSON.stringify(body)).not.toMatch(/https?:|token|signed/i)
  })

  it('a storage failure is a 500 and returns no path', async () => {
    h.state.uploadError = { message: 'storage down' }
    const res = await upload(PNG)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain(T)
  })

  it('a size that cannot be read is not an error: the picture is stored and the size is null', async () => {
    h.sharp.mockImplementationOnce(() => ({ metadata: async () => { throw new Error('bad') } }) as never)
    const body = await (await upload(PNG)).json()
    expect(body.media).toMatchObject({ type: 'image', width: null, height: null })
  })
})
