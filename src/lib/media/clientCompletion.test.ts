// The browser side of the completion check.
//
// Production fact this encodes: the PUT to a GCS resumable session URI returns
// 200 with no Access-Control-* headers, so the browser reports `onerror` with
// status 0 and no headers. The client therefore CANNOT distinguish success from
// failure on its own — and must not try. It asks our server, which reads the
// object with its own credential and no CORS in the way.
//
// The rule these tests exist to enforce: an unreadable PUT response is
// INDETERMINATE, never a success. Only the server's verdict persists a URL.

import { describe, it, expect, vi } from 'vitest'
import { uploadMedia, type UploadTransport } from './client'

const SESSION = 'https://storage.googleapis.com/upload/…?upload_id=SECRET'
const KEY = 'deals/f9077a52-b0f3-453a-a497-97da115ae386/gNo9UHx2a6ADO3bHymj1E4Uf.png'
const VERIFIED_URL = `https://storage.googleapis.com/tappyai-media-prod/${KEY}`

const file = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) as unknown as File

const input = {
  endpoint: '/api/admin/deals/upload',
  kind: 'dealLogo' as const,
  file: file(),
}

/**
 * `put` describes what the browser could observe:
 *   'readable'      -> a normal, readable 200
 *   'unreadable'    -> CORS-blocked response: status 0, onerror  (PRODUCTION)
 *   'rejected'      -> a readable non-2xx
 */
function transport(opts: {
  put?: 'readable' | 'unreadable' | 'rejected'
  complete?: { status: number; json: unknown }
}) {
  const calls: { post: Array<Record<string, unknown>>; put: number } = { post: [], put: 0 }
  const t: UploadTransport = {
    postJson: vi.fn(async (_url: string, b: unknown) => {
      const body = b as Record<string, unknown>
      calls.post.push(body)
      if (body.type === 'media.create-upload-session') {
        return {
          status: 200,
          json: { provider: 'gcs', uploadUrl: SESSION, url: VERIFIED_URL, key: KEY, contentType: 'image/png' },
        }
      }
      return opts.complete ?? { status: 200, json: { ok: true, url: VERIFIED_URL } }
    }),
    putBytes: vi.fn(async () => {
      calls.put += 1
      if (opts.put === 'rejected') return { readable: true, status: 403 }
      if (opts.put === 'readable') return { readable: true, status: 200 }
      return { readable: false, status: 0 } // production shape
    }),
  }
  return { t, calls }
}

const completionCalls = (calls: { post: Array<Record<string, unknown>> }) =>
  calls.post.filter((b) => b.type === 'media.complete-upload')

describe('an unreadable PUT is resolved by the server, not guessed', () => {
  // THE production case.
  it('verifies with the server and returns the server-confirmed URL', async () => {
    const { t, calls } = transport({ put: 'unreadable' })
    const res = await uploadMedia(input, t)

    const done = completionCalls(calls)
    expect(done).toHaveLength(1)
    expect(done[0]).toMatchObject({ kind: 'dealLogo', key: KEY })
    expect(res.url).toBe(VERIFIED_URL)
  })

  // The anti-fake-success rule, stated directly.
  it('does NOT treat status 0 as success when the server says the object is missing', async () => {
    const { t, calls } = transport({
      put: 'unreadable',
      complete: { status: 422, json: { error: 'Tải lên chưa hoàn tất.' } },
    })
    await expect(uploadMedia(input, t)).rejects.toThrow()
    expect(completionCalls(calls)).toHaveLength(1)
  })

  it('never returns a URL when verification fails', async () => {
    const { t } = transport({
      put: 'unreadable',
      complete: { status: 422, json: { error: 'Tải lên chưa hoàn tất.' } },
    })
    const err = await uploadMedia(input, t).catch((e: Error) => e)
    expect(String(err)).not.toContain(VERIFIED_URL)
  })

  // The client must not shortcut verification just because the PUT looked fine.
  it('verifies even when the PUT response WAS readable and 200', async () => {
    const { t, calls } = transport({ put: 'readable' })
    const res = await uploadMedia(input, t)
    expect(completionCalls(calls)).toHaveLength(1)
    expect(res.url).toBe(VERIFIED_URL)
  })

  it('surfaces the server message when verification refuses', async () => {
    const { t } = transport({
      put: 'unreadable',
      complete: { status: 422, json: { error: 'Tải lên chưa hoàn tất.' } },
    })
    await expect(uploadMedia(input, t)).rejects.toThrow('Tải lên chưa hoàn tất.')
  })

  // A readable non-2xx is a definite failure; do not bother the server.
  it('fails fast on a readable non-2xx without verifying', async () => {
    const { t, calls } = transport({ put: 'rejected' })
    await expect(uploadMedia(input, t)).rejects.toThrow()
    expect(completionCalls(calls)).toHaveLength(0)
  })

  it('uses the server-confirmed URL, never the session URI', async () => {
    const { t } = transport({ put: 'unreadable' })
    const res = await uploadMedia(input, t)
    expect(res.url).not.toContain('upload_id')
    expect(res.url).not.toContain('SECRET')
  })
})

describe('a Blob session produces no upload at all', () => {
  // This used to assert the Blob path skipped completion, which was correct while that path
  // existed. It no longer does: a 'blob' answer is now a malformed session, and the right outcome
  // is a failure rather than an upload the completion check never verified.
  it('refuses instead of uploading, and never returns a Blob URL', async () => {
    const calls: Array<Record<string, unknown>> = []
    const t: UploadTransport = {
      postJson: vi.fn(async (_u: string, b: unknown) => {
        calls.push(b as Record<string, unknown>)
        return { status: 200, json: { provider: 'blob' } }
      }),
      putBytes: vi.fn(async () => ({ readable: true, status: 200 })),
    }
    await expect(uploadMedia(input, t)).rejects.toThrow()
    expect(calls.filter((b) => b.type === 'media.complete-upload')).toHaveLength(0)
    expect(t.putBytes).not.toHaveBeenCalled()
  })
})
