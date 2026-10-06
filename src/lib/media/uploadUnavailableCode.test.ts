/**
 * UAT bugs 4/5 — a storage / credential outage must be reported as such on EVERY upload path
 * (avatar, cover, review photo, video, group avatar), never as success and never as a generic
 * retryable failure. These pin the video (client-direct session) path and the shared client.
 */
import { describe, it, expect, vi } from 'vitest'
import { createUploadSessionResponse, CREATE_UPLOAD_SESSION_TYPE } from './uploadRoute'
import { uploadMedia, MediaUploadError, type UploadTransport } from './client'
import type { MediaProvider } from './types'

const failing = (err: Error): MediaProvider =>
  ({ id: 'gcs', createUploadSession: async () => { throw err } }) as unknown as MediaProvider
const named = (name: string, extra: Record<string, unknown> = {}) => Object.assign(new Error('x'), { name }, extra)
const body = { type: CREATE_UPLOAD_SESSION_TYPE, kind: 'video', contentType: 'video/mp4', size: 1024 }
const ctx = { ownerId: 'u1', allowedKinds: ['video'] as const }

describe('createUploadSessionResponse — outage classification', () => {
  it('a WIF refusal -> 502 with code upload_unavailable and no credential detail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await createUploadSessionResponse(body, ctx, failing(named('WifExchangeError', { stage: 'oidc' })))
    expect(res.status).toBe(502)
    expect(res.body.code).toBe('upload_unavailable')
    expect(res.body.uploadUrl).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toMatch(/oidc|sts|token/i)
  })

  it('an unclassified failure keeps the plain 502 with no code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await createUploadSessionResponse(body, ctx, failing(new Error('boom')))
    expect(res.status).toBe(502)
    expect(res.body.code).toBeUndefined()
  })

  it('unsupported type and oversize are still refused before the provider is called', async () => {
    const p = failing(new Error('must not be called'))
    expect((await createUploadSessionResponse({ ...body, contentType: 'text/html' }, ctx, p)).status).toBe(415)
    expect((await createUploadSessionResponse({ ...body, size: 10 ** 12 }, ctx, p)).status).toBe(413)
  })
})

describe('uploadMedia — failed session is an error, never a URL', () => {
  it('carries the server code so the UI can say "unavailable"', async () => {
    const transport: UploadTransport = {
      postJson: async () => ({ status: 502, json: { error: 'Không thể tạo phiên tải lên.', code: 'upload_unavailable' } }),
      putBytes: async () => { throw new Error('must not PUT') },
    }
    const file = new File([new Uint8Array(8)], 'a.mp4', { type: 'video/mp4' })
    const err = await uploadMedia({ endpoint: '/api/upload/video', kind: 'videoThumbnail', file }, transport).catch((e) => e)
    expect(err).toBeInstanceOf(MediaUploadError)
    expect(err.code).toBe('upload_unavailable')
    expect(err.status).toBe(502)
  })
})
