import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  activeProviderId,
  assertSafeMediaKey,
  getMediaProvider,
  InvalidMediaKeyError,
  MediaCredentialsUnavailableError,
  MediaUploadFailedError,
  mediaUrl,
  putMedia,
  WifExchangeError,
} from './index'
import { createGcsProvider, gcsPublicUrl } from './providers/gcs'
import { createSessionlessProvider } from './__fixtures__/sessionlessProvider'

const BUCKET = 'tappyai-media-prod'
const bytes = new Uint8Array([1, 2, 3])

function mockGcs(status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return { ok: status >= 200 && status < 300, status } as Response
  }) as unknown as typeof fetch
  const provider = createGcsProvider({
    bucket: BUCKET,
    getAccessToken: async () => 'ya29.test-token',
    fetchImpl,
  })
  return { provider, calls }
}

// ---------------------------------------------------------------- J. key safety
describe('media key safety', () => {
  it('accepts the real producer keys', () => {
    for (const k of [
      'avatars/4dcce7cf-5f49-4c58-9901-2d586e31352d.jpg',
      'reviews/4dcce7cf-5f49-4c58-9901-2d586e31352d/1784788512998.png',
      'videos/1784796773809.mp4',
      'thumbnails/1784796771580.jpg',
      'music/1784696004238.mp3',
      'deals/logo-1784696004238-x.png',
    ]) expect(assertSafeMediaKey(k)).toBe(k)
  })

  it.each([
    ['../../etc/passwd', 'traversal above root'],
    ['avatars/../../secret.png', 'traversal inside an allowed prefix'],
    ['/avatars/a.png', 'absolute path'],
    ['avatars//a.png', 'empty segment'],
    ['avatars\\a.png', 'backslash'],
    ['secrets/a.png', 'prefix outside the allowlist'],
    ['a.png', 'no prefix'],
    ['', 'empty'],
  ])('rejects %s (%s)', (key) => {
    expect(() => assertSafeMediaKey(key)).toThrow(InvalidMediaKeyError)
  })

  it('rejects control characters without embedding one in source', () => {
    expect(() => assertSafeMediaKey('avatars/a' + String.fromCharCode(10) + 'b.png')).toThrow(
      InvalidMediaKeyError
    )
  })

  it('rejects an over-long key', () => {
    expect(() => assertSafeMediaKey('avatars/' + 'a'.repeat(600) + '.png')).toThrow(
      InvalidMediaKeyError
    )
  })
})

// -------------------------------------------------- A–D, F, M. writes reach GCS
describe('GCS provider writes', () => {
  it.each([
    ['A image', 'reviews/u1/1.png', 'image/png'],
    ['B video', 'videos/1.mp4', 'video/mp4'],
    ['C audio', 'music/1.mp3', 'audio/mpeg'],
    ['D avatar', 'avatars/u1.jpg', 'image/jpeg'],
  ])('%s uploads to the bucket and returns an absolute URL', async (_label, key, ct) => {
    const { provider, calls } = mockGcs()
    const res = await provider.put(key, bytes, { contentType: ct })

    expect(res.key).toBe(key)
    expect(res.url).toBe(`https://storage.googleapis.com/${BUCKET}/${key}`)
    expect(res.url).toMatch(/^https:\/\//) // F: absolute
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain(`/b/${BUCKET}/o`)
    expect(calls[0].url).toContain(`name=${encodeURIComponent(key)}`)
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe(ct)
  })

  it('never writes outside the bucket even if a producer passes a hostile key', async () => {
    const { provider, calls } = mockGcs()
    await expect(provider.put('../../other-bucket/x.png', bytes, { contentType: 'image/png' }))
      .rejects.toThrow(InvalidMediaKeyError)
    expect(calls).toHaveLength(0) // never reached the network
  })
})

// ------------------------------------------------------- N. no silent success
describe('failure handling', () => {
  it('throws when GCS rejects the upload — never reports success', async () => {
    const { provider } = mockGcs(403)
    await expect(provider.put('avatars/u1.jpg', bytes, { contentType: 'image/jpeg' }))
      .rejects.toThrow(MediaUploadFailedError)
  })

  it('throws when no credentials were injected', async () => {
    const provider = createGcsProvider({ bucket: BUCKET, getAccessToken: null })
    await expect(provider.put('avatars/u1.jpg', bytes, { contentType: 'image/jpeg' }))
      .rejects.toThrow(MediaCredentialsUnavailableError)
  })

  // O. errors must not leak credential material
  it('error messages contain no token or key material', async () => {
    const { provider } = mockGcs(500)
    const err = await provider
      .put('avatars/u1.jpg', bytes, { contentType: 'image/jpeg' })
      .catch((e: Error) => e)
    expect(String(err)).not.toContain('ya29')
    expect(String(err)).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/)
    expect(String(err)).not.toContain('Bearer')
  })
})

// ------------------------------------- E, K. existing Blob URLs keep working
describe('existing Blob media is untouched', () => {
  const legacy =
    'https://y5ozy0i9wdb73mam.public.blob.vercel-storage.com/videos/1784796773809.mp4'

  it('passes an absolute Blob URL through unchanged, even when GCS is active', () => {
    const gcs = createGcsProvider({ bucket: BUCKET, getAccessToken: null })
    expect(mediaUrl(legacy, gcs)).toBe(legacy)
  })

  it('resolves a bare key against the active provider', () => {
    const gcs = createGcsProvider({ bucket: BUCKET, getAccessToken: null })
    expect(mediaUrl('videos/1.mp4', gcs)).toBe(gcsPublicUrl(BUCKET, 'videos/1.mp4'))
  })

  it('leaves empty values alone', () => {
    expect(mediaUrl('')).toBe('')
  })
})

// ------------------------------------------------------------ provider routing
describe('provider selection', () => {
  // Was: "defaults to blob so nothing changes until the bridge is switched on". The bridge is on,
  // proven in production, and the Blob default has been removed — an unset MEDIA_PROVIDER used to
  // send new media to a store that had already hit its transfer ceiling.
  it('defaults to gcs, with no environment needed to get there', () => {
    expect(activeProviderId({} as NodeJS.ProcessEnv)).toBe('gcs')
    expect(getMediaProvider({} as NodeJS.ProcessEnv).id).toBe('gcs')
  })

  it('selects gcs only when MEDIA_PROVIDER=gcs', () => {
    const env = { MEDIA_PROVIDER: 'gcs' } as unknown as NodeJS.ProcessEnv
    expect(activeProviderId(env)).toBe('gcs')
    expect(getMediaProvider(env).id).toBe('gcs')
  })

  // Production now federates via WIF. Off Vercel there is no OIDC token, so a
  // gcs write must fail closed — never silently fall back to Blob.
  it('a gcs write with no deployment identity fails loudly, not silently', async () => {
    const env = { MEDIA_PROVIDER: 'gcs' } as unknown as NodeJS.ProcessEnv
    await expect(
      putMedia('avatars/u1.jpg', bytes, { contentType: 'image/jpeg' }, getMediaProvider(env))
    ).rejects.toThrow(WifExchangeError)
  })

  it('still throws MediaCredentialsUnavailableError when no token source is injected', async () => {
    const provider = createGcsProvider({ bucket: 'tappyai-media-prod', getAccessToken: null })
    await expect(provider.put('avatars/u1.jpg', bytes, { contentType: 'image/jpeg' }))
      .rejects.toThrow(MediaCredentialsUnavailableError)
  })

  it('routes putMedia through the blob provider by default', async () => {
    const putImpl = vi.fn(async () => ({ url: 'https://blob.example/avatars/u1.jpg' }))
    const provider = createSessionlessProvider(putImpl as never)
    const res = await putMedia('avatars/u1.jpg', bytes, { contentType: 'image/jpeg' }, provider)
    expect(res.url).toBe('https://blob.example/avatars/u1.jpg')
    expect(putImpl).toHaveBeenCalledOnce()
  })
})

// ------------------- P. no service-account key material anywhere in the source
describe('no credential material in source', () => {
  const root = join(__dirname, '..', '..', '..')
  const files = [
    'src/lib/media/index.ts',
    'src/lib/media/key.ts',
    'src/lib/media/types.ts',
    'src/lib/media/providers/gcs.ts',
    'src/app/api/profile/route.ts',
    'src/app/api/reviews/upload/route.ts',
  ]

  it.each(files)('%s contains no private key or SA JSON', (rel) => {
    const src = readFileSync(join(root, rel), 'utf8')
    expect(src).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/)
    expect(src).not.toMatch(/"type"\s*:\s*"service_account"/)
    expect(src).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS/)
    expect(src).not.toMatch(/private_key/)
  })

  it('the producers no longer import @vercel/blob directly', () => {
    for (const rel of ['src/app/api/profile/route.ts', 'src/app/api/reviews/upload/route.ts']) {
      const src = readFileSync(join(root, rel), 'utf8')
      expect(src).not.toMatch(/from '@vercel\/blob'/)
      expect(src).toMatch(/from '@\/lib\/media'/)
    }
  })
})
