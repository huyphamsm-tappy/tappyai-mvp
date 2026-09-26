import { describe, it, expect, vi } from 'vitest'
import { completeUploadResponse, COMPLETE_UPLOAD_TYPE } from './uploadCompletion'
import { resolveUploadTarget, MediaUploadRejectedError } from './uploadPolicy'
import { uploadMedia, type UploadTransport } from './client'
import type { MediaProvider } from './types'
import { androidMp4, iphoneMov, ISO6709 } from './__fixtures__/clipFixtures'
import { neutralizeClipMetadata } from './clipMetadata'

// F-099 (P1, owner 2026-09-26) — the enforcement half at upload completion, the policy change, and
// the client sending neutralised bytes.

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const KEY = `videos/${OWNER}/abcdefghijklmnopqrstuvwx.mp4`
const ctx = { ownerId: OWNER, allowedKinds: ['video', 'videoThumbnail'] as const }
const body = { type: COMPLETE_UPLOAD_TYPE, kind: 'video', key: KEY }

function storedAs(bytes: Uint8Array, contentType = 'video/mp4', opts: { readThrows?: boolean; noRange?: boolean } = {}) {
  const deleteObject = vi.fn(async () => true)
  const p = {
    id: 'gcs',
    statObject: async () => ({ size: bytes.length, contentType }),
    publicUrl: (k: string) => `https://storage.googleapis.com/tappyai-media-prod/${k}`,
    deleteObject,
    ...(opts.noRange ? {} : { readRange: async (_k: string, o: number, n: number) => { if (opts.readThrows) throw new Error('boom'); return bytes.slice(o, o + n) } }),
  } as unknown as MediaProvider
  return { p, deleteObject }
}

describe('completion refuses a clip that still carries identifying metadata', () => {
  it('🚨 raw iPhone MOV: 422, reasons listed, the object is DELETED, no URL', async () => {
    const { p, deleteObject } = storedAs(iphoneMov(), 'video/quicktime')
    const out = await completeUploadResponse({ ...body, key: KEY.replace('.mp4', '.mov') }, ctx, p)
    expect(out.status).toBe(422)
    expect(out.body.error).toBe('identifying_metadata')
    expect(out.body.reasons).toEqual(expect.arrayContaining(['location', 'device-or-author']))
    expect(out.body.url).toBeUndefined()
    expect(deleteObject).toHaveBeenCalledWith(KEY.replace('.mp4', '.mov'))
    expect(JSON.stringify(out.body)).not.toContain(ISO6709) // reasons are codes, never the values
  })

  it('the same clip after the client neutraliser: 200 with the URL', async () => {
    const clean = new Uint8Array(await (await neutralizeClipMetadata(new Blob([androidMp4()]))).arrayBuffer())
    const { p, deleteObject } = storedAs(clean)
    const out = await completeUploadResponse(body, ctx, p)
    expect(out.status).toBe(200)
    expect(out.body.url).toContain(KEY)
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('fails CLOSED when the stored object cannot be read, or the provider cannot read ranges', async () => {
    expect((await completeUploadResponse(body, ctx, storedAs(androidMp4(), 'video/mp4', { readThrows: true }).p)).status).toBe(502)
    expect((await completeUploadResponse(body, ctx, storedAs(androidMp4(), 'video/mp4', { noRange: true }).p)).status).toBe(502)
  })
})

describe('the video kind no longer takes images — photos go through the server-stripped path', () => {
  it('image/jpeg under kind video is refused before any session is opened', () => {
    expect(() => resolveUploadTarget({ kind: 'video', contentType: 'image/jpeg', sizeBytes: 100, ownerId: OWNER }, ['video'])).toThrow(MediaUploadRejectedError)
  })
  it('video types are still accepted', () => {
    for (const t of ['video/mp4', 'video/quicktime', 'video/webm']) {
      expect(resolveUploadTarget({ kind: 'video', contentType: t, sizeBytes: 100, ownerId: OWNER }, ['video']).contentType).toBe(t)
    }
  })
})

describe('the client sends neutralised bytes for a clip', () => {
  it('what reaches the PUT has the same size and no location', async () => {
    let sent: Blob | null = null
    let declared = -1
    const transport: UploadTransport = {
      postJson: async (_u, b) => {
        const req = b as { type: string; size?: number }
        if (req.type === COMPLETE_UPLOAD_TYPE) return { status: 200, json: { ok: true, url: 'https://x/y' } }
        declared = req.size ?? -1
        return { status: 200, json: { uploadUrl: 'https://upload', url: 'https://x/y', key: KEY, contentType: 'video/quicktime' } }
      },
      putBytes: async (_u, file) => { sent = file; return { readable: true, status: 200 } },
    }
    const src = iphoneMov()
    await uploadMedia({ endpoint: '/api/upload/video', kind: 'video', file: new File([src], 'clip.mov', { type: 'video/quicktime' }) }, transport)
    const out = new TextDecoder('latin1').decode(new Uint8Array(await sent!.arrayBuffer()))
    expect(sent!.size).toBe(src.length)
    expect(declared).toBe(src.length)
    expect(out).not.toContain(ISO6709)
    expect(out).not.toContain('iPhone SYN')
  })
})
