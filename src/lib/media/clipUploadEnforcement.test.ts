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

// F-102 (owner 2026-09-26): the declared type is the uploader's claim. The check reads the bytes.
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d])
const EXIF_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, ...Array.from('Exif\0\0', c => c.charCodeAt(0)), 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0xff, 0xd9])
const CLEAN_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 0x90, 0x77, 0x53, 0xde])

describe('the format is judged from the bytes, never the declared type', () => {
  it('🚨 WebM bytes declared as video/mp4: 422 unsupported_format, the object is DELETED, the message names MP4/MOV', async () => {
    const { p, deleteObject } = storedAs(WEBM, 'video/mp4')
    const out = await completeUploadResponse(body, ctx, p)
    expect(out.status).toBe(422)
    expect(out.body.error).toBe('unsupported_format')
    expect(out.body.message).toMatch(/MP4 hoặc MOV/)
    expect(out.body.url).toBeUndefined()
    expect(deleteObject).toHaveBeenCalledWith(KEY)
  })

  it('a GPS clip is caught whichever accepted type it is declared as', async () => {
    for (const [ct, ext] of [['video/mp4', 'mp4'], ['video/quicktime', 'mov']] as const) {
      const { p } = storedAs(androidMp4(), ct)
      const out = await completeUploadResponse({ ...body, key: KEY.replace('.mp4', `.${ext}`) }, ctx, p)
      expect(out.body.error).toBe('identifying_metadata')
    }
  })

  it('a file with ISO boxes but no movie (`moov`) is not a recognised MP4/MOV', async () => {
    const onlyFree = new Uint8Array([0, 0, 0, 16, 0x66, 0x72, 0x65, 0x65, 0, 0, 0, 0, 0, 0, 0, 0])
    const out = await completeUploadResponse(body, ctx, storedAs(onlyFree).p)
    expect(out.body.error).toBe('unsupported_format')
  })

  it('a poster frame whose bytes are JPEG but declared PNG is refused; a real PNG passes', async () => {
    const thumb = { type: COMPLETE_UPLOAD_TYPE, kind: 'videoThumbnail', key: `thumbnails/${OWNER}/abcdefghijklmnopqrstuvwx.png` }
    expect((await completeUploadResponse(thumb, ctx, storedAs(EXIF_JPEG, 'image/png').p)).body.error).toBe('unsupported_format')
    expect((await completeUploadResponse(thumb, ctx, storedAs(CLEAN_PNG, 'image/png').p)).status).toBe(200)
  })
})

describe('the client surfaces a named refusal as its message, with the code alongside', () => {
  it('unsupported_format → MediaUploadError(message, 422, code)', async () => {
    const transport: UploadTransport = {
      postJson: async (_u, b) => (b as { type: string }).type === COMPLETE_UPLOAD_TYPE
        ? { status: 422, json: { error: 'unsupported_format', message: 'Chỉ nhận video MP4 hoặc MOV. Bạn xuất lại thành một trong hai định dạng này rồi thử lại nhé.' } }
        : { status: 200, json: { uploadUrl: 'https://upload', url: 'https://x/y', key: KEY, contentType: 'video/mp4' } },
      putBytes: async () => ({ readable: true, status: 200 }),
    }
    const err = await uploadMedia({ endpoint: '/api/upload/video', kind: 'video', file: new File([WEBM], 'x.mp4', { type: 'video/mp4' }) }, transport).catch(e => e)
    expect(err.message).toMatch(/MP4 hoặc MOV/)
    expect(err.status).toBe(422)
    expect(err.code).toBe('unsupported_format')
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
