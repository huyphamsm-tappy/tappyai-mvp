// Server-side completion check for client-direct uploads.
//
// WHY THIS EXISTS — measured in production, not assumed:
//
//   preflight OPTIONS  -> 200 WITH Access-Control-Allow-Origin
//   actual PUT         -> 200 with NO Access-Control-* headers at all
//   browser XHR        -> onerror, status 0, empty response headers
//   the object         -> written, byte-identical
//
// The browser cannot read the PUT response, so the client genuinely cannot
// tell a completed upload from a failed one. It must not guess. Instead the
// server — which has the credential and no CORS involved — independently looks
// the object up, and only then may the application accept the URL.
//
// The binding is the KEY POLICY that already exists: the server issued
// `${prefix}/${ownerId}/${random}.${ext}`, so it can re-derive that the key
// belongs to the authenticated caller and to a kind this endpoint may mint.
// That is what stops this endpoint becoming a "check any GCS object" oracle.

import { describe, it, expect, vi } from 'vitest'
import {
  assertOwnedUploadKey,
  completeUploadResponse,
  COMPLETE_UPLOAD_TYPE,
  isCompleteUploadBody,
} from './uploadCompletion'
import { MediaUploadRejectedError } from './uploadPolicy'
import { createSessionlessProvider } from './__fixtures__/sessionlessProvider'
import type { MediaProvider } from './types'

const OWNER = 'f9077a52-b0f3-453a-a497-97da115ae386'
const OTHER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const BUCKET = 'tappyai-media-prod'
const KEY = `deals/${OWNER}/gNo9UHx2a6ADO3bHymj1E4Uf.png`

/** A gcs provider whose statObject answer is scripted. */
function provider(stat: { size: number; contentType: string } | null, id: 'gcs' | 'blob' = 'gcs') {
  const statObject = vi.fn(async () => stat)
  return {
    p: { id, statObject, publicUrl: (k: string) => `https://storage.googleapis.com/${BUCKET}/${k}` } as unknown as MediaProvider,
    statObject,
  }
}

const ctx = { ownerId: OWNER, allowedKinds: ['dealLogo', 'dealBanner'] as const }
const body = (over: Record<string, unknown> = {}) => ({
  type: COMPLETE_UPLOAD_TYPE,
  kind: 'dealLogo',
  key: KEY,
  ...over,
})

// --------------------------------------------------------------- key binding
describe('assertOwnedUploadKey — only keys this server issued to THIS caller', () => {
  it('accepts a key of exactly the shape the policy mints', () => {
    expect(() => assertOwnedUploadKey(KEY, 'dealLogo', OWNER, ctx.allowedKinds)).not.toThrow()
  })

  // The whole anti-oracle property.
  it('rejects another owner’s object even in an allowed prefix', () => {
    expect(() =>
      assertOwnedUploadKey(`deals/${OTHER}/abc.png`, 'dealLogo', OWNER, ctx.allowedKinds)
    ).toThrow(MediaUploadRejectedError)
  })

  it('rejects a prefix that does not belong to the kind', () => {
    expect(() =>
      assertOwnedUploadKey(`avatars/${OWNER}/abc.png`, 'dealLogo', OWNER, ctx.allowedKinds)
    ).toThrow(MediaUploadRejectedError)
  })

  it('rejects a kind this endpoint may not mint', () => {
    expect(() =>
      assertOwnedUploadKey(`videos/${OWNER}/abc.mp4`, 'video' as never, OWNER, ctx.allowedKinds)
    ).toThrow(MediaUploadRejectedError)
  })

  it.each([
    [`deals/${OWNER}/../../etc/passwd`, 'traversal'],
    [`deals/${OWNER}/nested/deep.png`, 'extra segment'],
    [`deals/${OWNER}`, 'no object segment'],
    ['deals/abc.png', 'no owner segment'],
    [`/deals/${OWNER}/abc.png`, 'absolute path'],
    [`https://storage.googleapis.com/${BUCKET}/deals/${OWNER}/abc.png`, 'absolute URL'],
    [`https://evil.test/deals/${OWNER}/abc.png`, 'foreign URL'],
    ['', 'empty'],
  ])('rejects %s (%s)', (key) => {
    expect(() => assertOwnedUploadKey(key, 'dealLogo', OWNER, ctx.allowedKinds)).toThrow(
      MediaUploadRejectedError
    )
  })

  it('rejects an extension the kind does not allow', () => {
    expect(() =>
      assertOwnedUploadKey(`deals/${OWNER}/abc.mp4`, 'dealLogo', OWNER, ctx.allowedKinds)
    ).toThrow(MediaUploadRejectedError)
  })
})

// ------------------------------------------------------------- request shape
describe('isCompleteUploadBody', () => {
  it('recognises only the completion shape', () => {
    expect(isCompleteUploadBody({ type: COMPLETE_UPLOAD_TYPE })).toBe(true)
    expect(isCompleteUploadBody({ type: 'media.create-upload-session' })).toBe(false)
    expect(isCompleteUploadBody({ type: 'blob.generate-client-token' })).toBe(false)
    expect(isCompleteUploadBody(null)).toBe(false)
  })
})

// ------------------------------------------------- server-verified completion
describe('completeUploadResponse — the server, not the browser, decides', () => {
  it('confirms only after independently finding the object', async () => {
    const { p, statObject } = provider({ size: 19349, contentType: 'image/png' })
    const res = await completeUploadResponse(body(), ctx, p)

    expect(statObject).toHaveBeenCalledWith(KEY)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    // The URL is derived server-side from the verified key — never echoed from input.
    expect(res.body.url).toBe(`https://storage.googleapis.com/${BUCKET}/${KEY}`)
  })

  it('fails when the object does not exist', async () => {
    const { p } = provider(null)
    const res = await completeUploadResponse(body(), ctx, p)
    expect(res.status).toBe(422)
    expect(res.body.ok).toBeUndefined()
    expect(res.body.url).toBeUndefined()
  })

  // A resumable session that was opened but never PUT to leaves nothing; a
  // truncated upload leaves an empty object. Neither is a success.
  it('fails on a zero-byte object', async () => {
    const { p } = provider({ size: 0, contentType: 'image/png' })
    const res = await completeUploadResponse(body(), ctx, p)
    expect(res.status).toBe(422)
    expect(res.body.url).toBeUndefined()
  })

  it('fails when the stored content type is outside the kind’s allowlist', async () => {
    const { p } = provider({ size: 10, contentType: 'text/html' })
    const res = await completeUploadResponse(body(), ctx, p)
    expect(res.status).toBe(422)
    expect(res.body.url).toBeUndefined()
  })

  it.each([
    [{ key: `deals/${OTHER}/abc.png` }, 'another owner'],
    [{ key: `avatars/${OWNER}/abc.png` }, 'wrong prefix'],
    [{ kind: 'video' }, 'kind outside this endpoint'],
    [{ key: `https://storage.googleapis.com/${BUCKET}/deals/${OWNER}/abc.png` }, 'absolute URL'],
  ])('refuses %j (%s) without ever calling storage', async (over, _label) => {
    const { p, statObject } = provider({ size: 10, contentType: 'image/png' })
    const res = await completeUploadResponse(body(over), ctx, p)
    expect(res.status).toBe(400)
    expect(statObject).not.toHaveBeenCalled() // no oracle
    expect(res.body.url).toBeUndefined()
  })

  it('fails closed when the storage lookup itself throws', async () => {
    const p = {
      id: 'gcs',
      statObject: vi.fn(async () => {
        throw new Error('boom')
      }),
      publicUrl: (k: string) => `https://storage.googleapis.com/${BUCKET}/${k}`,
    } as unknown as MediaProvider
    const res = await completeUploadResponse(body(), ctx, p)
    expect(res.status).toBe(502)
    expect(res.body.url).toBeUndefined()
  })

  // Under Blob there is no client-direct session at all, so completion is not
  // a thing the client should be asking about.
  it('refuses when the active provider is blob', async () => {
    const res = await completeUploadResponse(body(), ctx, createSessionlessProvider())
    expect(res.status).toBe(409)
    expect(res.body.url).toBeUndefined()
  })

  it('leaks nothing on the failure path', async () => {
    const { p } = provider(null)
    const text = JSON.stringify((await completeUploadResponse(body(), ctx, p)).body)
    expect(text).not.toContain('ya29')
    expect(text).not.toContain('upload_id')
    expect(text).not.toContain('Bearer')
  })
})
