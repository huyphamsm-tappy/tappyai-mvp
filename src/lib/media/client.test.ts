// WIF-4 — the browser side of a client-direct upload.
//
// The helper is provider-agnostic: it asks the endpoint for an upload session
// and, if the server says the active provider is still Blob, falls back to the
// exact call the pages made before. Transport is injected so both paths are
// testable without a network or a DOM.
//
// Matrix letters covered here:
//   F  the client cannot choose the stored object key
//   K  the session URI is used for the PUT and never returned as the media URL
//   L  a failed session request surfaces the server's message, nothing else
//   N  MEDIA_PROVIDER=blob keeps the legacy client call byte-for-byte
//   M  a failed PUT is never reported as a successful upload

import { describe, it, expect, vi } from 'vitest'
import { uploadMedia, type UploadTransport } from './client'

const SESSION = 'https://storage.googleapis.com/upload/storage/v1/b/b/o?upload_id=SECRET'
const PUBLIC = 'https://storage.googleapis.com/tappyai-media-prod/videos/u-1/abc.mp4'

const file = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }) as unknown as File

function transport(overrides: Partial<UploadTransport> = {}) {
  const calls = {
    post: [] as Array<{ url: string; body: Record<string, unknown> }>,
    put: [] as Array<{ url: string; contentType: string }>,
    blob: [] as Array<{ pathname: string; opts: Record<string, unknown> }>,
  }
  const t: UploadTransport = {
    postJson: vi.fn(async (url: string, body: unknown) => {
      calls.post.push({ url, body: body as Record<string, unknown> })
      return { status: 200, json: { provider: 'gcs', uploadUrl: SESSION, url: PUBLIC, key: 'videos/u-1/abc.mp4' } }
    }),
    putBytes: vi.fn(async (url: string, _f: Blob, contentType: string) => {
      calls.put.push({ url, contentType })
    }),
    blobUpload: vi.fn(async (pathname: string, _f: Blob, opts: Record<string, unknown>) => {
      calls.blob.push({ pathname, opts })
      return { url: 'https://legacy.public.blob.vercel-storage.com/videos/1.mp4' }
    }),
    ...overrides,
  }
  return { t, calls }
}

const input = {
  endpoint: '/api/upload/video',
  kind: 'video' as const,
  file: file(),
  legacyPathname: 'videos/1784796773809.mp4',
}

describe('uploadMedia — GCS session path', () => {
  it('asks for a session, PUTs the bytes to it, and returns the public URL', async () => {
    const { t, calls } = transport()
    const res = await uploadMedia(input, t)

    expect(calls.post).toHaveLength(1)
    expect(calls.post[0].url).toBe('/api/upload/video')
    expect(calls.post[0].body).toMatchObject({
      type: 'media.create-upload-session',
      kind: 'video',
      contentType: 'video/mp4',
      size: 3,
    })

    expect(calls.put).toEqual([{ url: SESSION, contentType: 'video/mp4' }])
    // K: the caller gets the durable public URL, never the bearer session URI.
    expect(res.url).toBe(PUBLIC)
    expect(res.url).not.toContain('upload_id')
    expect(t.blobUpload).not.toHaveBeenCalled()
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
describe('uploadMedia — Blob fallback path', () => {
  const blobSession = {
    postJson: vi.fn(async () => ({ status: 200, json: { provider: 'blob' } })),
  }

  it('makes exactly the legacy call the pages made before', async () => {
    const { t, calls } = transport(blobSession)
    const res = await uploadMedia(
      { ...input, legacyClientPayload: 'thumbnail', onProgress: vi.fn() },
      t
    )

    expect(calls.blob).toHaveLength(1)
    expect(calls.blob[0].pathname).toBe('videos/1784796773809.mp4')
    expect(calls.blob[0].opts).toMatchObject({
      access: 'public',
      handleUploadUrl: '/api/upload/video',
      clientPayload: 'thumbnail',
    })
    expect(res.url).toBe('https://legacy.public.blob.vercel-storage.com/videos/1.mp4')
    expect(t.putBytes).not.toHaveBeenCalled()
  })

  it('omits clientPayload entirely when the caller has none', async () => {
    const { t, calls } = transport(blobSession)
    await uploadMedia(input, t)
    expect('clientPayload' in calls.blob[0].opts).toBe(false)
  })

  it('forwards progress on the legacy path too', async () => {
    const onProgress = vi.fn()
    const { t, calls } = transport(blobSession)
    await uploadMedia({ ...input, onProgress }, t)
    const opts = calls.blob[0].opts as { onUploadProgress?: (e: { percentage: number }) => void }
    opts.onUploadProgress?.({ percentage: 77 })
    expect(onProgress).toHaveBeenCalledWith(77)
  })
})
