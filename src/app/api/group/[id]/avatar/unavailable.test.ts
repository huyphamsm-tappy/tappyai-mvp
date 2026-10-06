import { describe, it, expect, vi, beforeAll } from 'vitest'
import sharp from 'sharp'

const h = vi.hoisted(() => ({ err: null as Error | null, updates: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => {
  const b: Record<string, unknown> = {}
  Object.assign(b, {
    from: () => b, select: () => b, eq: () => b, update: () => { h.updates++; return b },
    single: async () => ({ data: { id: 'g1', creator_id: 'c1' }, error: null }),
  })
  return { getRequestUser: async () => ({ user: { id: 'c1' }, supabase: b }) }
})
vi.mock('@/lib/auth/socialWriteAccess', () => ({ refuseAnonymousSocialWrite: () => null }))
vi.mock('@/lib/media', () => ({
  getMediaProvider: () => ({}),
  randomMediaSuffix: () => 'abc',
  putMedia: async () => { throw h.err },
}))
import { POST } from './route'

let JPEG: Buffer
beforeAll(async () => { JPEG = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#3391ff' } }).jpeg().toBuffer() })
const req = () => {
  const fd = new FormData()
  fd.append('avatar', new File([new Uint8Array(JPEG)], 'g.jpg', { type: 'image/jpeg' }))
  return new Request('http://t/api/group/g1/avatar', { method: 'POST', body: fd }) as never
}

describe('POST /api/group/[id]/avatar — storage failure is truthful', () => {
  it('WIF refusal -> 503 upload_unavailable, row untouched', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.err = Object.assign(new Error('x'), { name: 'WifExchangeError', stage: 'sts' })
    const res = await POST(req(), { params: { id: 'g1' } })
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('upload_unavailable')
    expect(h.updates).toBe(0)
  })
  it('other failure -> 500 upload_failed, row untouched', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.err = new Error('disk')
    const res = await POST(req(), { params: { id: 'g1' } })
    expect(res.status).toBe(500)
    expect(h.updates).toBe(0)
  })
})
