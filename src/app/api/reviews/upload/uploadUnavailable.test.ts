// @vitest-environment node
// Phase 7 closeout CP9 — /reviews/new photo upload: a storage-credential outage (the WIF provider refusing a non-production
// deployment — the measured cause of "Không thể tải ảnh lên") is 503 upload_unavailable; any other storage failure stays 500.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ state: { fail: null as unknown, user: { id: 'u1', is_anonymous: false } as { id: string; is_anonymous: boolean } } }))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: { rpc: () => Promise.resolve({ data: [{ has_dob: true, age_years: 30, age_band: '25_34', corrections_used: 0 }], error: null }), from: () => ({}) } }),
}))
vi.mock('@/lib/media', () => ({
  getMediaProvider: () => 'test-provider',
  putMedia: () => (h.state.fail ? Promise.reject(h.state.fail) : Promise.resolve({ url: 'https://cdn.example/reviews/x.png' })),
}))
import { POST } from './route'

const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC', 'base64'))
async function upload() {
  const fd = new FormData()
  fd.append('file', new File([PNG], 'photo.png', { type: 'image/png' }))
  const res = await POST({ headers: new Headers(), nextUrl: new URL('http://localhost/api/reviews/upload'), formData: () => Promise.resolve(fd) } as never)
  return { status: res.status, body: await res.json() }
}
beforeEach(() => { h.state.fail = null; h.state.user = { id: `u-${Math.random().toString(36).slice(2)}`, is_anonymous: false } })

describe('upload failure classification', () => {
  it('a WIF / credential refusal → 503 upload_unavailable (no futile retry)', async () => {
    h.state.fail = Object.assign(new Error('sts refused'), { name: 'WifExchangeError', stage: 'sts' })
    const r = await upload()
    expect(r.status).toBe(503)
    expect(r.body.error).toBe('upload_unavailable')
  })
  it('any other storage failure → 500 upload_failed', async () => {
    h.state.fail = new Error('bucket 500')
    const r = await upload()
    expect(r.status).toBe(500)
    expect(r.body.error).toBe('upload_failed')
  })
  it('a healthy store → 200 with the media URL', async () => {
    const r = await upload()
    expect(r.status).toBe(200)
    expect(r.body.url).toContain('https://cdn.example/reviews/')
  })
})
