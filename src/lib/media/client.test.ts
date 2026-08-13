// WIF-4 — the browser side of a client-direct upload.
//
// The helper asks the endpoint for an upload session and PUTs the bytes to it.
// Transport is injected so it is testable without a network or a DOM.
//
// Matrix letters covered here:
//   F  the client cannot choose the stored object key
//   K  the session URI is used for the PUT and never returned as the media URL
//   L  a failed session request surfaces the server's message, nothing else
//   N  a Blob session is refused rather than honoured (the fallback is gone)
//   M  a failed PUT is never reported as a successful upload

import { describe, it, expect, vi } from 'vitest'
import { MediaUploadError, uploadMedia, type UploadTransport } from './client'

const SESSION = 'https://storage.googleapis.com/upload/storage/v1/b/b/o?upload_id=SECRET'
const PUBLIC = 'https://storage.googleapis.com/tappyai-media-prod/videos/u-1/abc.mp4'

const file = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }) as unknown as File

function transport(overrides: Partial<UploadTransport> = {}) {
  const calls = {
    post: [] as Array<{ url: string; body: Record<string, unknown> }>,
    put: [] as Array<{ url: string; contentType: string }>,
  }
  const t: UploadTransport = {
    postJson: vi.fn(async (url: string, body: unknown) => {
      calls.post.push({ url, body: body as Record<string, unknown> })
      // The endpoint now answers two questions: open a session, and confirm the
      // object landed (the browser cannot read its own PUT response).
      if ((body as { type?: string })?.type === 'media.complete-upload') {
        return { status: 200, json: { ok: true, url: PUBLIC, key: 'videos/u-1/abc.mp4' } }
      }
      return { status: 200, json: { provider: 'gcs', uploadUrl: SESSION, url: PUBLIC, key: 'videos/u-1/abc.mp4' } }
    }),
    // The production shape: CORS-blocked response, so nothing is readable.
    putBytes: vi.fn(async (url: string, _f: Blob, contentType: string) => {
      calls.put.push({ url, contentType })
      return { readable: false, status: 0 }
    }),
    ...overrides,
  }
  return { t, calls }
}

const input = {
  endpoint: '/api/upload/video',
  kind: 'video' as const,
  file: file(),
}

describe('uploadMedia — GCS session path', () => {
  it('asks for a session, PUTs the bytes to it, and returns the public URL', async () => {
    const { t, calls } = transport()
    const res = await uploadMedia(input, t)

    // Two posts now: open the session, then have the server confirm the object
    // — the browser cannot read its own PUT response.
    expect(calls.post).toHaveLength(2)
    expect(calls.post[0].url).toBe('/api/upload/video')
    expect(calls.post[0].body).toMatchObject({
      type: 'media.create-upload-session',
      kind: 'video',
      contentType: 'video/mp4',
      size: 3,
    })
    expect(calls.post[1].body).toMatchObject({
      type: 'media.complete-upload',
      kind: 'video',
      key: 'videos/u-1/abc.mp4',
    })

    expect(calls.put).toEqual([{ url: SESSION, contentType: 'video/mp4' }])
    // K: the caller gets the durable public URL, never the bearer session URI.
    expect(res.url).toBe(PUBLIC)
    expect(res.url).not.toContain('upload_id')
  })

  // F: the client never proposes an object name on the GCS path.
  it('sends no pathname or key the server could honour', async () => {
    const { t, calls } = transport()
    await uploadMedia(input, t)
    const body = calls.post[0].body
    expect(body.pathname).toBeUndefined()
    expect(body.key).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('1784796773809')
  })

  it('forwards progress and the abort signal to the PUT', async () => {
    const onProgress = vi.fn()
    const ctrl = new AbortController()
    const seen: Array<{ signal?: AbortSignal; onProgress?: (n: number) => void }> = []
    const { t } = transport({
      putBytes: vi.fn(async (_u: string, _f: Blob, _c: string, opts) => {
        seen.push(opts)
        opts.onProgress?.(42)
        return { readable: false, status: 0 }
      }),
    })
    await uploadMedia({ ...input, onProgress, signal: ctrl.signal }, t)
    expect(seen[0].signal).toBe(ctrl.signal)
    expect(onProgress).toHaveBeenCalledWith(42)
  })

  // M
  it('throws when the PUT fails — never reports a successful upload', async () => {
    const { t } = transport({
      putBytes: vi.fn(async () => {
        throw new Error('network')
      }),
    })
    await expect(uploadMedia(input, t)).rejects.toThrow()
  })

  // L
  it('surfaces the server error and never PUTs when the session is refused', async () => {
    const { t, calls } = transport({
      postJson: vi.fn(async () => ({ status: 413, json: { error: 'File too large' } })),
    })
    await expect(uploadMedia(input, t)).rejects.toThrow('File too large')
    expect(calls.put).toHaveLength(0)
  })

  it('fails cleanly when the session response is malformed', async () => {
    const { t, calls } = transport({
      postJson: vi.fn(async () => ({ status: 200, json: { provider: 'gcs' } })),
    })
    await expect(uploadMedia(input, t)).rejects.toThrow()
    expect(calls.put).toHaveLength(0)
  })
})

// ------------------------------------------------------------------------- N
// The Blob fallback used to live here: a `provider: 'blob'` session made the client upload to Vercel
// Blob under a name the BROWSER chose. Both halves are gone — the server cannot answer 'blob', and
// the client could not act on it if something did. That second half is what these assert, because a
// client that still knew how to upload to Blob would be one env var away from doing it again.
describe('uploadMedia — a Blob session is refused, not honoured', () => {
  const blobSession = {
    postJson: vi.fn(async () => ({ status: 200, json: { provider: 'blob' } })),
  }

  it('fails rather than falling back when the server answers blob', async () => {
    const { t } = transport(blobSession)
    await expect(uploadMedia(input, t)).rejects.toThrow(MediaUploadError)
    expect(t.putBytes).not.toHaveBeenCalled()
  })

  it('has no transport capable of uploading to Blob at all', () => {
    const { t } = transport()
    expect('blobUpload' in t).toBe(false)
  })

  it('never returns a Blob URL to persist', async () => {
    const { t } = transport(blobSession)
    await uploadMedia(input, t).catch((e: Error) => {
      expect(e.message).not.toContain('blob.vercel-storage.com')
    })
  })
})
