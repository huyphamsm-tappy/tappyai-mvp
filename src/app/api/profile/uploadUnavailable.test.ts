/**
 * P2a (2026-09-28) — avatar / cover upload when the storage service is unreachable.
 *
 * On UAT (a Vercel PREVIEW deployment) the GCP WIF provider's attribute condition only admits
 * `environment:production`, so STS refuses every exchange. That is an infrastructure fix, not a
 * code one; what the code owes the user is an honest message: the SERVICE is unavailable (503,
 * `upload_unavailable`), not "your upload failed, try again" — and nothing written to the row.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  writes: 0,
  putError: null as Error | null,
}))

vi.mock('@/lib/auth/getRequestUser', () => {
  const b: any = {
    select: () => b, eq: () => b, update: () => { h.writes++; return b }, upsert: () => { h.writes++; return b },
    single: () => Promise.resolve({ data: null, error: null }),
    then: (res: any) => Promise.resolve({ data: null, error: null }).then(res),
  }
  const client = { from: () => b, auth: { updateUser: async () => ({ error: null }) } }
  return { getRequestUser: () => Promise.resolve({ user: { id: 'u1', is_anonymous: false, user_metadata: {} }, supabase: client }) }
})
vi.mock('@/lib/media', () => ({
  getMediaProvider: () => ({}),
  randomMediaSuffix: () => 'sfx',
  putMedia: async (key: string) => {
    if (h.putError) throw h.putError
    return { url: `https://storage.googleapis.com/b/${key}` }
  },
}))

import { POST } from './route'
import { isUploadServiceUnavailable } from '@/lib/media/uploadAvailability'
import { uploadErrorKey } from '@/lib/profile/uploadError'

const JPEG = new Uint8Array(Buffer.from(
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJUAB//Z',
  'base64',
))
const post = (field: 'avatar' | 'cover', lang = 'vi') => {
  const fd = new FormData()
  fd.append(field, new File([JPEG as unknown as BlobPart], 'x.jpg', { type: 'image/jpeg' }))
  return POST(new Request('http://t/api/profile', { method: 'POST', body: fd, headers: { 'accept-language': lang } }) as any)
}
const named = (name: string, extra: Record<string, unknown> = {}) => Object.assign(new Error('x'), { name }, extra)

beforeEach(() => { h.writes = 0; h.putError = null })

describe.each(['avatar', 'cover'] as const)('POST %s while storage is unavailable', (field) => {
  it('a WIF refusal (the UAT preview failure) → 503 upload_unavailable, localized, nothing written', async () => {
    h.putError = named('WifExchangeError', { stage: 'sts', status: 400, reason: 'unauthorized_client' })
    const res = await post(field)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('upload_unavailable')
    expect(body.message).toMatch(/tạm gián đoạn/)
    expect(JSON.stringify(body)).not.toMatch(/unauthorized_client|sts/)
    expect(h.writes).toBe(0)
  })

  it('English when asked', async () => {
    h.putError = named('WifTimeoutError', { stage: 'impersonation' })
    const body = await (await post(field, 'en')).json()
    expect(body.message).toMatch(/temporarily unavailable/)
  })

  it('any other storage failure keeps the generic 500 upload_failed', async () => {
    h.putError = named('MediaUploadFailedError')
    const res = await post(field)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('upload_failed')
  })
})

describe('classification helpers', () => {
  it('isUploadServiceUnavailable: credential / timeout errors only', () => {
    for (const n of ['WifExchangeError', 'WifTimeoutError', 'MediaCredentialsUnavailableError', 'MediaTimeoutError']) {
      expect(isUploadServiceUnavailable(named(n)), n).toBe(true)
    }
    expect(isUploadServiceUnavailable({ stage: 'oidc' })).toBe(true)
    expect(isUploadServiceUnavailable(named('MediaUploadFailedError'))).toBe(false)
    expect(isUploadServiceUnavailable(new Error('boom'))).toBe(false)
    expect(isUploadServiceUnavailable(null)).toBe(false)
  })

  it('uploadErrorKey: 413 → too large, 502/503/504 → unavailable, else null', () => {
    expect(uploadErrorKey(413)).toBe('editProfile.err.requestTooLarge')
    for (const s of [502, 503, 504]) expect(uploadErrorKey(s)).toBe('editProfile.err.uploadUnavailable')
    expect(uploadErrorKey(500)).toBeNull()
    expect(uploadErrorKey(undefined)).toBeNull()
  })
})
