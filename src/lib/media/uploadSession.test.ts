// WIF-4 — client-direct uploads via GCS resumable upload session URIs.
//
// The A–T security matrix for this layer. Every letter has at least one test
// below or in `uploadRoutes.test.ts`; the letter is named in the test comment
// so a reviewer can walk the matrix top to bottom.
//
//   A  unauthenticated video upload            -> 401, no session minted
//   B  unauthenticated audio upload            -> 401, no session minted
//   C  deals upload without the permission     -> 403, no session minted
//   D  deals upload cross-origin               -> 403, no session minted
//   E  rate limit exhausted                    -> 429, no session minted
//   F  client-supplied key/pathname is ignored -> key is server-derived
//   G  hostile key can never reach GCS         -> assertSafeMediaKey guards the init
//   H  content type outside the kind allowlist -> 415, no session minted
//   I  declared size over the kind cap         -> 413, no session minted
//   J  session binds content type + length at init
//   K  session URI returned only after authz, and never logged
//   L  errors leak no token, no bearer, no session URI
//   M  GCS refusing the init is never reported as success
//   N  MEDIA_PROVIDER=blob keeps today's behaviour, and calls no GCS endpoint
//   O  MEDIA_PROVIDER=gcs refuses the legacy Blob-token handshake
//   P  no service-account key material anywhere in the new source
//   Q  credential-exchange failure fails closed, never falls back to Blob
//   R  the credential legs stay time-bounded on the session path
//   S  the session init itself is time-bounded
//   T  bucket CORS is restricted to real TappyAI origins, never '*'

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MEDIA_UPLOAD_POLICIES,
  MediaUploadRejectedError,
  resolveUploadTarget,
} from './uploadPolicy'
import {
  CREATE_UPLOAD_SESSION_TYPE,
  createUploadSessionResponse,
  isCreateUploadSessionBody,
} from './uploadRoute'
import { createGcsProvider } from './providers/gcs'
import { createSessionlessProvider } from './__fixtures__/sessionlessProvider'
import { getMediaProvider } from './index'
import {
  MediaTimeoutError,
  MediaUploadSessionError,
  MediaCredentialsUnavailableError,
} from './types'
import { WifExchangeError } from './gcpAuth'

const BUCKET = 'tappyai-media-prod'
const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const SESSION_URI =
  'https://storage.googleapis.com/upload/storage/v1/b/tappyai-media-prod/o?uploadType=resumable&upload_id=ABC123secret'

/** Mocks the resumable-init POST. `status` selects the outcome. */
function mockSession(status = 200, location: string | null = SESSION_URI) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h: string) => (h.toLowerCase() === 'location' ? location : null) },
    } as unknown as Response
  }) as unknown as typeof fetch
  const provider = createGcsProvider({
    bucket: BUCKET,
    getAccessToken: async () => 'ya29.test-token',
    fetchImpl,
  })
  return { provider, calls, fetchImpl }
}

// ------------------------------------------------------- F, G, H, I. the policy
describe('upload policy — server owns the key', () => {
  // F: nothing the caller sends contributes to the object name.
  it('derives the key from the kind and owner, never from client input', () => {
    const a = resolveUploadTarget(
      { kind: 'video', contentType: 'video/mp4', sizeBytes: 1024, ownerId: OWNER },
      ['video']
    )
    expect(a.key.startsWith(`videos/${OWNER}/`)).toBe(true)
    expect(a.key.endsWith('.mp4')).toBe(true)
    // ...and it is unpredictable, so a public bucket is not enumerable.
    const b = resolveUploadTarget(
      { kind: 'video', contentType: 'video/mp4', sizeBytes: 1024, ownerId: OWNER },
      ['video']
    )
    expect(b.key).not.toBe(a.key)
  })

  // F: the extension comes from the allowlisted content type, not a filename.
  it.each([
    ['videoThumbnail', 'image/jpeg', 'thumbnails', 'jpg'],
    ['audio', 'audio/mpeg', 'music', 'mp3'],
    ['audioCover', 'image/webp', 'music', 'webp'],
    ['dealLogo', 'image/png', 'deals', 'png'],
    ['dealBanner', 'image/webp', 'deals', 'webp'],
  ] as const)('%s -> %s/… .%s', (kind, ct, prefix, ext) => {
    const t = resolveUploadTarget(
      { kind, contentType: ct, sizeBytes: 512, ownerId: OWNER },
      [kind]
    )
    expect(t.key.startsWith(`${prefix}/${OWNER}/`)).toBe(true)
    expect(t.key.endsWith(`.${ext}`)).toBe(true)
  })

  // G: whatever the policy produces must survive the key validator.
  it('every kind produces a key the key validator accepts', () => {
    for (const kind of Object.keys(MEDIA_UPLOAD_POLICIES) as Array<
      keyof typeof MEDIA_UPLOAD_POLICIES
    >) {
      const ct = MEDIA_UPLOAD_POLICIES[kind].contentTypes[0]
      expect(() =>
        resolveUploadTarget({ kind, contentType: ct, sizeBytes: 1, ownerId: OWNER }, [kind])
      ).not.toThrow()
    }
  })

  // G: a hostile owner id must not become a path segment.
  it.each([
    ['../../etc', 'traversal'],
    ['a/b', 'nested path'],
    ['', 'empty'],
    ['x\\y', 'backslash'],
  ])('rejects an owner id containing %s (%s)', (ownerId) => {
    expect(() =>
      resolveUploadTarget({ kind: 'video', contentType: 'video/mp4', sizeBytes: 1, ownerId }, [
        'video',
      ])
    ).toThrow(MediaUploadRejectedError)
  })

  // H
  it.each([
    ['video', 'application/x-msdownload'],
    ['video', 'text/html'],
    ['audio', 'video/mp4'],
    ['videoThumbnail', 'video/mp4'],
    ['dealLogo', 'application/pdf'],
  ] as const)('%s rejects content type %s with 415', (kind, ct) => {
    const err = catchReject(() =>
      resolveUploadTarget({ kind, contentType: ct, sizeBytes: 1, ownerId: OWNER }, [kind])
    )
    expect(err).toBeInstanceOf(MediaUploadRejectedError)
    expect(err.status).toBe(415)
  })

  it('normalises a content type carrying parameters', () => {
    const t = resolveUploadTarget(
      { kind: 'audio', contentType: 'AUDIO/MPEG; charset=binary', sizeBytes: 1, ownerId: OWNER },
      ['audio']
    )
    expect(t.contentType).toBe('audio/mpeg')
  })

  // I
  it('rejects a declared size over the kind cap with 413', () => {
    const cap = MEDIA_UPLOAD_POLICIES.audioCover.maxBytes
    const err = catchReject(() =>
      resolveUploadTarget(
        { kind: 'audioCover', contentType: 'image/jpeg', sizeBytes: cap + 1, ownerId: OWNER },
        ['audioCover']
      )
    )
    expect(err.status).toBe(413)
  })

  it.each([[0], [-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'rejects a nonsensical declared size (%s)',
    (sizeBytes) => {
      const err = catchReject(() =>
        resolveUploadTarget(
          { kind: 'video', contentType: 'video/mp4', sizeBytes, ownerId: OWNER },
          ['video']
        )
      )
      expect(err).toBeInstanceOf(MediaUploadRejectedError)
      expect(err.status).toBe(400)
    }
  )

  it('accepts a size exactly at the cap', () => {
    const cap = MEDIA_UPLOAD_POLICIES.video.maxBytes
    expect(() =>
      resolveUploadTarget(
        { kind: 'video', contentType: 'video/mp4', sizeBytes: cap, ownerId: OWNER },
        ['video']
      )
    ).not.toThrow()
  })

  // The endpoint scope is part of authorization: the video endpoint must not be
  // able to mint a deals key, and the deals endpoint must not mint a video key.
  it('refuses a kind the endpoint does not allow', () => {
    const err = catchReject(() =>
      resolveUploadTarget(
        { kind: 'dealBanner', contentType: 'image/png', sizeBytes: 1, ownerId: OWNER },
        ['video', 'videoThumbnail']
      )
    )
    expect(err.status).toBe(400)
  })

  it('refuses an unknown kind', () => {
    const err = catchReject(() =>
      resolveUploadTarget(
        { kind: 'anything' as never, contentType: 'image/png', sizeBytes: 1, ownerId: OWNER },
        ['video']
      )
    )
    expect(err.status).toBe(400)
  })

  // The caps must not silently drift from what the composer enforces today.
  it('keeps the size caps that were in force under Blob', () => {
    expect(MEDIA_UPLOAD_POLICIES.videoThumbnail.maxBytes).toBe(10 * 1024 * 1024)
    expect(MEDIA_UPLOAD_POLICIES.audio.maxBytes).toBe(20 * 1024 * 1024)
    expect(MEDIA_UPLOAD_POLICIES.audioCover.maxBytes).toBe(5 * 1024 * 1024)
    expect(MEDIA_UPLOAD_POLICIES.dealLogo.maxBytes).toBe(5 * 1024 * 1024)
    expect(MEDIA_UPLOAD_POLICIES.dealBanner.maxBytes).toBe(5 * 1024 * 1024)
  })
})

// --------------------------------------------- G, J, M, S. the resumable session
describe('GCS resumable upload session', () => {
  // J
  it('binds the content type and the declared length at init', async () => {
    const { provider, calls } = mockSession()
    const s = await provider.createUploadSession!({
      key: `videos/${OWNER}/abc.mp4`,
      contentType: 'video/mp4',
      sizeBytes: 4096,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('uploadType=resumable')
    expect(calls[0].url).toContain(`/b/${BUCKET}/o`)
    expect(calls[0].url).toContain(`name=${encodeURIComponent(`videos/${OWNER}/abc.mp4`)}`)
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['X-Upload-Content-Type']).toBe('video/mp4')
    expect(headers['X-Upload-Content-Length']).toBe('4096')
    expect(headers.Authorization).toBe('Bearer ya29.test-token')

    expect(s.uploadUrl).toBe(SESSION_URI)
    expect(s.url).toBe(`https://storage.googleapis.com/${BUCKET}/videos/${OWNER}/abc.mp4`)
  })

  // G
  it('never opens a session for a hostile key', async () => {
    const { provider, calls } = mockSession()
    await expect(
      provider.createUploadSession!({
        key: '../../other-bucket/x.png',
        contentType: 'image/png',
        sizeBytes: 1,
      })
    ).rejects.toThrow()
    expect(calls).toHaveLength(0) // never reached the network
  })

  // M
  it('throws when GCS refuses the init — never reports a usable session', async () => {
    const { provider } = mockSession(403)
    await expect(
      provider.createUploadSession!({
        key: `videos/${OWNER}/abc.mp4`,
        contentType: 'video/mp4',
        sizeBytes: 1,
      })
    ).rejects.toThrow(MediaUploadSessionError)
  })

  // M: a 200 with no Location header is not a session.
  it('throws when the init succeeds but returns no session URI', async () => {
    const { provider } = mockSession(200, null)
    await expect(
      provider.createUploadSession!({
        key: `videos/${OWNER}/abc.mp4`,
        contentType: 'video/mp4',
        sizeBytes: 1,
      })
    ).rejects.toThrow(MediaUploadSessionError)
  })

  it('throws when no credentials were injected', async () => {
    const provider = createGcsProvider({ bucket: BUCKET, getAccessToken: null })
    await expect(
      provider.createUploadSession!({
        key: `videos/${OWNER}/abc.mp4`,
        contentType: 'video/mp4',
        sizeBytes: 1,
      })
    ).rejects.toThrow(MediaCredentialsUnavailableError)
  })

  // S
  it('bounds the init with a timeout instead of hanging', async () => {
    const fetchImpl = vi.fn(async () => {
      const e = new Error('The operation was aborted due to timeout')
      e.name = 'TimeoutError'
      throw e
    }) as unknown as typeof fetch
    const provider = createGcsProvider({
      bucket: BUCKET,
      getAccessToken: async () => 'ya29.test-token',
      fetchImpl,
      timeoutMs: 25,
    })
    await expect(
      provider.createUploadSession!({
        key: `videos/${OWNER}/abc.mp4`,
        contentType: 'video/mp4',
        sizeBytes: 1,
      })
    ).rejects.toThrow(MediaTimeoutError)
  })

  // S: the budget actually reaches fetch.
  it('passes the configured budget as an abort signal', async () => {
    const seen: number[] = []
    const { fetchImpl } = mockSession()
    const provider = createGcsProvider({
      bucket: BUCKET,
      getAccessToken: async () => 'ya29.test-token',
      fetchImpl,
      timeoutMs: 4321,
      makeTimeoutSignal: (ms: number) => {
        seen.push(ms)
        return AbortSignal.timeout(60_000)
      },
    })
    await provider.createUploadSession!({
      key: `videos/${OWNER}/abc.mp4`,
      contentType: 'video/mp4',
      sizeBytes: 1,
    })
    expect(seen).toEqual([4321])
  })

  // L
  it('errors leak no token, no bearer and no session URI', async () => {
    const { provider } = mockSession(500)
    const err = String(
      await provider
        .createUploadSession!({
          key: `videos/${OWNER}/abc.mp4`,
          contentType: 'video/mp4',
          sizeBytes: 1,
        })
        .catch((e: Error) => e)
    )
    expect(err).not.toContain('ya29')
    expect(err).not.toContain('Bearer')
    expect(err).not.toContain('upload_id')
    expect(err).not.toContain('ABC123secret')
  })
})

// ----------------------------------------------------- K, N, O, Q. route helper
describe('upload session route helper', () => {
  const gcs = (status = 200) => mockSession(status).provider

  it('recognises only the new request shape', () => {
    expect(isCreateUploadSessionBody({ type: CREATE_UPLOAD_SESSION_TYPE })).toBe(true)
    expect(isCreateUploadSessionBody({ type: 'blob.generate-client-token' })).toBe(false)
    expect(isCreateUploadSessionBody(null)).toBe(false)
    expect(isCreateUploadSessionBody('string')).toBe(false)
  })

  // K: the session URI is handed back only for an authorized, valid request.
  it('returns the session URI and the final public URL', async () => {
    const res = await createUploadSessionResponse(
      {
        type: CREATE_UPLOAD_SESSION_TYPE,
        kind: 'video',
        contentType: 'video/mp4',
        size: 2048,
      },
      { ownerId: OWNER, allowedKinds: ['video', 'videoThumbnail'] },
      gcs()
    )
    expect(res.status).toBe(200)
    expect(res.body.provider).toBe('gcs')
    expect(res.body.uploadUrl).toBe(SESSION_URI)
    expect(String(res.body.url)).toBe(
      `https://storage.googleapis.com/${BUCKET}/${String(res.body.key)}`
    )
  })

  // N: under Blob the helper mints nothing and names no GCS endpoint.
  // Was: "tells the client to use the legacy path when the provider is blob". A provider with no
  // session concept now fails closed instead, because the legacy path let the BROWSER choose the
  // object name — the one thing the server-owned key policy exists to prevent.
  it('fails closed when the provider cannot open a session', async () => {
    const res = await createUploadSessionResponse(
      { type: CREATE_UPLOAD_SESSION_TYPE, kind: 'video', contentType: 'video/mp4', size: 1 },
      { ownerId: OWNER, allowedKinds: ['video'] },
      createSessionlessProvider()
    )
    expect(res.status).toBe(502)
    expect(JSON.stringify(res.body)).not.toContain('blob')
  })

  // H/I surfaced as HTTP status by the helper.
  it.each([
    [{ kind: 'video', contentType: 'text/html', size: 1 }, 415],
    [{ kind: 'video', contentType: 'video/mp4', size: 10 ** 12 }, 413],
    [{ kind: 'dealLogo', contentType: 'image/png', size: 1 }, 400],
    [{ kind: 'video', contentType: 'video/mp4', size: 'big' }, 400],
    [{ contentType: 'video/mp4', size: 1 }, 400],
  ])('rejects %j with %i and mints nothing', async (payload, status) => {
    const { provider, calls } = mockSession()
    const res = await createUploadSessionResponse(
      { type: CREATE_UPLOAD_SESSION_TYPE, ...payload },
      { ownerId: OWNER, allowedKinds: ['video', 'videoThumbnail'] },
      provider
    )
    expect(res.status).toBe(status)
    expect(calls).toHaveLength(0)
    expect(res.body.uploadUrl).toBeUndefined()
  })

  // Q: a failed credential exchange must not degrade into a Blob upload.
  it('fails closed when the credential exchange fails, never falling back to blob', async () => {
    const provider = createGcsProvider({
      bucket: BUCKET,
      getAccessToken: async () => {
        throw new WifExchangeError('sts', 400)
      },
    })
    const res = await createUploadSessionResponse(
      { type: CREATE_UPLOAD_SESSION_TYPE, kind: 'video', contentType: 'video/mp4', size: 1 },
      { ownerId: OWNER, allowedKinds: ['video'] },
      provider
    )
    expect(res.status).toBe(502)
    expect(res.body.provider).not.toBe('blob')
    expect(res.body.uploadUrl).toBeUndefined()
  })

  // L: the error body must never carry credential or capability material.
  it('the error body leaks nothing', async () => {
    const res = await createUploadSessionResponse(
      { type: CREATE_UPLOAD_SESSION_TYPE, kind: 'video', contentType: 'video/mp4', size: 1 },
      { ownerId: OWNER, allowedKinds: ['video'] },
      gcs(500)
    )
    const text = JSON.stringify(res.body)
    expect(text).not.toContain('ya29')
    expect(text).not.toContain('Bearer')
    expect(text).not.toContain('upload_id')
  })
})

// ------------------------------------------------------------ R. wiring inherits
describe('production wiring for sessions', () => {
  // N
  // Was: the production provider had no session either, because it defaulted to Blob. Now the only
  // provider that lacks one is the test fixture.
  it('the production provider always offers a session; only the fixture lacks one', () => {
    expect(createSessionlessProvider().createUploadSession).toBeUndefined()
    expect(getMediaProvider({} as NodeJS.ProcessEnv).createUploadSession).toBeTypeOf('function')
  })

  // R/Q: MEDIA_PROVIDER=gcs off Vercel has no OIDC token -> fails closed.
  it('a session request with no deployment identity fails loudly', async () => {
    const env = { MEDIA_PROVIDER: 'gcs' } as unknown as NodeJS.ProcessEnv
    const p = getMediaProvider(env)
    expect(p.createUploadSession).toBeTypeOf('function')
    await expect(
      p.createUploadSession!({
        key: `videos/${OWNER}/abc.mp4`,
        contentType: 'video/mp4',
        sizeBytes: 1,
      })
    ).rejects.toThrow(WifExchangeError)
  })
})

// ------------------------------------------ P. no key material in the new source
describe('no credential material in the session source', () => {
  const root = join(__dirname, '..', '..', '..')
  const files = [
    'src/lib/media/uploadPolicy.ts',
    'src/lib/media/uploadRoute.ts',
    'src/lib/media/client.ts',
    'src/lib/media/providers/gcs.ts',
    'src/app/api/upload/video/route.ts',
    'src/app/api/upload/audio/route.ts',
    'src/app/api/admin/deals/upload/route.ts',
  ]

  it.each(files)('%s contains no private key or SA JSON', (rel) => {
    const src = readFileSync(join(root, rel), 'utf8')
    expect(src).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/)
    expect(src).not.toMatch(/"type"\s*:\s*"service_account"/)
    expect(src).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS/)
    expect(src).not.toMatch(/private_key/)
  })

  // K: the session URI is a bearer capability for one object. It must never be
  // written to a log line anywhere on the path that produces it.
  it.each([
    'src/lib/media/uploadRoute.ts',
    'src/lib/media/providers/gcs.ts',
    'src/app/api/upload/video/route.ts',
    'src/app/api/upload/audio/route.ts',
    'src/app/api/admin/deals/upload/route.ts',
  ])('%s never logs a session URI', (rel) => {
    const src = readFileSync(join(root, rel), 'utf8')
    // No console call anywhere in the file may take an interpolated session
    // value; the simplest enforceable rule is that these files log no upload
    // session identifiers at all.
    expect(src).not.toMatch(/console\.[a-z]+\([^)]*uploadUrl/i)
    expect(src).not.toMatch(/console\.[a-z]+\([^)]*sessionUri/i)
    expect(src).not.toMatch(/console\.[a-z]+\([^)]*session\b/i)
  })
})

// -------------------------------------------------------------------- T. CORS
describe('bucket CORS is restricted', () => {
  const root = join(__dirname, '..', '..', '..')
  const cors = JSON.parse(
    readFileSync(join(root, 'infra', 'gcs', 'cors.json'), 'utf8')
  ) as Array<{ origin: string[]; method: string[]; responseHeader: string[]; maxAgeSeconds: number }>

  it('never allows a wildcard origin', () => {
    for (const rule of cors) {
      expect(rule.origin).not.toContain('*')
      for (const o of rule.origin) expect(o).toMatch(/^https:\/\/([a-z0-9-]+\.)*tappyai\.com$/)
    }
  })

  it('allows only the methods a browser upload needs', () => {
    for (const rule of cors) {
      for (const m of rule.method) expect(['PUT', 'POST', 'GET', 'HEAD', 'OPTIONS']).toContain(m)
      expect(rule.method).not.toContain('DELETE')
      expect(rule.method).not.toContain('PATCH')
    }
  })

  it('exposes the headers a resumable PUT needs and no credential headers', () => {
    const exposed = cors.flatMap((r) => r.responseHeader.map((h) => h.toLowerCase()))
    expect(exposed).toContain('content-type')
    expect(exposed).not.toContain('authorization')
  })
})

// ------------------------------------ the config prerequisites for the flip
// These are inert while MEDIA_PROVIDER is blob and load-bearing the moment it
// is not, which is exactly the kind of thing that gets forgotten. Pin them.
describe('next.config.mjs is ready for the provider flip', () => {
  const config = readFileSync(join(__dirname, '..', '..', '..', 'next.config.mjs'), 'utf8')

  it('lets next/image serve Cloud Storage objects', () => {
    const remotePatterns = config.slice(
      config.indexOf('remotePatterns'),
      config.indexOf('async headers()')
    )
    expect(remotePatterns).toContain("hostname: 'storage.googleapis.com'")
  })

  // Without this the browser's PUT to the session URI is blocked by CSP.
  it('lets the browser connect to Cloud Storage', () => {
    const connectSrc = config.slice(
      config.indexOf('connect-src'),
      config.indexOf('connect-src') + 600
    )
    expect(connectSrc).toContain('https://storage.googleapis.com')
  })

  it('still allows the Blob hosts that serve every existing object', () => {
    expect(config).toContain('*.public.blob.vercel-storage.com')
  })
})

/** Runs `fn`, returning the thrown MediaUploadRejectedError. */
function catchReject(fn: () => unknown): MediaUploadRejectedError {
  try {
    fn()
  } catch (e) {
    return e as MediaUploadRejectedError
  }
  throw new Error('expected the call to be rejected, but it succeeded')
}
