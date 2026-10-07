import { describe, it, expect, vi, beforeEach } from 'vitest'
import sharp from 'sharp'
import { hasGpsMetadata, hasImageMetadata } from '@/lib/media/stripImageMetadata'

// ── Security audit 2026-09-30 · the group picture must not publish where it was taken ─────────
//
// R-2 stripped EXIF from review photos, avatars and covers, but POST /api/group/[id]/avatar stored
// the caller's bytes untouched. These tests send a JPEG that really carries a GPS IFD through the
// route and inspect the bytes handed to storage.

const h = vi.hoisted(() => {
  const state = { user: { id: 'creator-1' } as { id: string } | null, creatorId: 'creator-1', stored: null as Buffer | null }
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    from: () => builder,
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    single: async () => ({ data: { id: 'g1', creator_id: state.creatorId }, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'g1' }], error: null }).then(res),
  })
  return { state, builder }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: h.state.user, supabase: h.builder }),
}))
vi.mock('@/lib/auth/socialWriteAccess', () => ({ refuseAnonymousSocialWrite: () => null }))
vi.mock('@/lib/media', () => ({
  getMediaProvider: () => ({}),
  randomMediaSuffix: () => 'abc',
  putMedia: async (key: string, body: Buffer | Blob) => {
    h.state.stored = Buffer.isBuffer(body) ? body : Buffer.from(await (body as Blob).arrayBuffer())
    return { url: `https://storage.example/${key}` }
  },
}))

import { POST } from './route'

/** A JPEG with an APP1/Exif segment holding IFD0 → GPS IFD, laid out as a phone writes it. */
async function jpegWithGps(): Promise<Buffer> {
  const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
  const entry = (tag: number, type: number, count: number, value: Buffer) => Buffer.concat([u16(tag), u16(type), u32(count), value])
  const gpsOffset = 8 + 2 + 12 + 4
  const ifd0 = Buffer.concat([u16(1), entry(0x8825, 4, 1, u32(gpsOffset)), u32(0)])
  const gps = Buffer.concat([u16(1), entry(0x0001, 2, 2, Buffer.from([0x4e, 0, 0, 0])), u32(0)])
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0x49, 0x49, 0x2a, 0x00]), u32(8), ifd0, gps])
  const base = await sharp({ create: { width: 32, height: 16, channels: 3, background: '#3391ff' } }).jpeg().toBuffer()
  const len = Buffer.alloc(2); len.writeUInt16BE(exif.length + 2)
  return Buffer.concat([base.subarray(0, 2), Buffer.from([0xff, 0xe1]), len, exif, base.subarray(2)])
}

function upload(bytes: Buffer): Request {
  const form = new FormData()
  form.append('avatar', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'group.jpg')
  return new Request('http://localhost/api/group/g1/avatar', { method: 'POST', body: form })
}

beforeEach(() => {
  h.state.user = { id: 'creator-1' }
  h.state.creatorId = 'creator-1'
  h.state.stored = null
})

describe('POST /api/group/[id]/avatar — metadata never reaches storage', () => {
  it('the fixture really carries a GPS block', async () => {
    expect(await hasGpsMetadata(await jpegWithGps())).toBe(true)
  })

  it('🚨 stores the picture WITHOUT its EXIF / GPS block', async () => {
    const res = await POST(upload(await jpegWithGps()) as never, { params: { id: 'g1' } })
    expect(res.status).toBe(200)
    expect(h.state.stored).not.toBeNull()
    expect(await hasGpsMetadata(h.state.stored!)).toBe(false)
    expect(await hasImageMetadata(h.state.stored!)).toBe(false)
    // Still a decodable JPEG of the same picture.
    const meta = await sharp(h.state.stored!).metadata()
    expect(meta.format).toBe('jpeg')
    expect([meta.width, meta.height]).toEqual([32, 16])
  })

  it('refuses bytes that pass the signature check but cannot be decoded — never stores them as-is', async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)])
    const res = await POST(upload(fake) as never, { params: { id: 'g1' } })
    expect(res.status).toBe(400)
    expect(h.state.stored).toBeNull()
  })

  it('a non-creator is refused before any bytes are stored', async () => {
    h.state.creatorId = 'someone-else'
    const res = await POST(upload(await jpegWithGps()) as never, { params: { id: 'g1' } })
    expect(res.status).toBe(403)
    expect(h.state.stored).toBeNull()
  })
})
