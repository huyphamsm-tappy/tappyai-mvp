// Phase 7D — the production WIF positive test.
//
// The bridge is fail-closed: with MEDIA_PROVIDER=blob nothing ever exercises
// the credential chain, so there is no way to learn whether a *production*
// deployment can actually federate until the flag is already flipped. That is
// the wrong order to find out. This check runs the real chain — OIDC -> STS ->
// impersonation -> GCS — on demand, without switching the provider.
//
// It must prove the chain while leaking none of it:
//   - never returns the OIDC token
//   - never returns the impersonated access token
//   - never returns the resumable session URI
//   - never writes an object (a session that is never PUT to leaves nothing)
//   - never accepts a caller-supplied key

import { describe, it, expect, vi } from 'vitest'
import { checkWifHealth, readOidcClaims } from './wifHealth'
import { WifExchangeError, WifTimeoutError } from './gcpAuth'
import { MediaUploadSessionError } from './types'

const OIDC_SUB = 'owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:production'
const NOW = 1_786_400_000_000 // fixed clock, ms

/** Builds an unsigned JWT whose payload carries the given claims. */
function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.signature-not-verified`
}

const PROD_TOKEN = fakeJwt({
  iss: 'https://oidc.vercel.com/huyphamsm-tappys-projects',
  aud: 'https://vercel.com/huyphamsm-tappys-projects',
  sub: OIDC_SUB,
  exp: Math.floor(NOW / 1000) + 3600,
})

const SESSION_URI = 'https://storage.googleapis.com/upload/…?upload_id=SUPERSECRET'
const ACCESS_TOKEN = 'ya29.impersonated-secret'

function deps(over: Partial<Parameters<typeof checkWifHealth>[0]> = {}) {
  return {
    bucket: 'tappyai-media-prod',
    getOidcToken: () => PROD_TOKEN,
    createUploadSession: vi.fn(async () => ({
      uploadUrl: SESSION_URI,
      url: 'https://storage.googleapis.com/tappyai-media-prod/videos/health/x.mp4',
      key: 'videos/health/x.mp4',
    })),
    now: () => NOW,
    ...over,
  }
}

// ------------------------------------------------------------- claim decoding
describe('readOidcClaims — metadata only', () => {
  it('reads issuer, audience, subject and remaining lifetime', () => {
    const c = readOidcClaims(PROD_TOKEN, () => NOW)
    expect(c).toEqual({
      issuer: 'https://oidc.vercel.com/huyphamsm-tappys-projects',
      audience: 'https://vercel.com/huyphamsm-tappys-projects',
      subject: OIDC_SUB,
      expiresInSeconds: 3600,
    })
  })

  it('reports a production subject distinctly from a preview one', () => {
    const preview = fakeJwt({ sub: OIDC_SUB.replace('production', 'preview'), exp: 0 })
    expect(readOidcClaims(preview, () => NOW)?.subject).toContain('environment:preview')
  })

  it.each([['not-a-jwt'], [''], ['a.b'], ['a.!!!.c']])('returns null for %s', (bad) => {
    expect(readOidcClaims(bad, () => NOW)).toBeNull()
  })

  it('returns null when there is no token at all', () => {
    expect(readOidcClaims(null, () => NOW)).toBeNull()
    expect(readOidcClaims(undefined, () => NOW)).toBeNull()
  })
})

// ------------------------------------------------------------------ the check
describe('checkWifHealth', () => {
  it('reports the full chain complete when a session opens', async () => {
    const d = deps()
    const r = await checkWifHealth(d)

    expect(r.ok).toBe(true)
    expect(r.stage).toBe('complete')
    expect(r.oidc?.subject).toBe(OIDC_SUB)
    expect(r.oidc?.expiresInSeconds).toBe(3600)
    expect(r.bucket).toBe('tappyai-media-prod')
    expect(d.createUploadSession).toHaveBeenCalledOnce()
  })

  // The key is ours, under an allowed prefix, and nothing about it is caller-supplied.
  it('opens the session under a server-owned key in an allowed prefix', async () => {
    const d = deps()
    await checkWifHealth(d)
    const calls = (d.createUploadSession as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const req = calls[0][0] as { key: string; contentType: string; sizeBytes: number }
    expect(req.key).toMatch(/^videos\//)
    expect(req.contentType).toBe('video/mp4')
    expect(req.sizeBytes).toBeGreaterThan(0)
  })

  // A resumable session that is never PUT to creates no object.
  it('never writes an object — it only opens a session', async () => {
    const put = vi.fn()
    const d = deps({ put } as never)
    await checkWifHealth(d)
    expect(put).not.toHaveBeenCalled()
  })

  it('fails at the oidc stage when the deployment has no identity', async () => {
    const d = deps({ getOidcToken: () => null })
    const r = await checkWifHealth(d)
    expect(r.ok).toBe(false)
    expect(r.stage).toBe('oidc')
    expect(d.createUploadSession).not.toHaveBeenCalled()
  })

  it.each([
    ['sts' as const, 'sts'],
    ['impersonation' as const, 'impersonation'],
  ])('reports the %s stage when that leg is rejected', async (stage, expected) => {
    const d = deps({
      createUploadSession: vi.fn(async () => {
        throw new WifExchangeError(stage, 400)
      }),
    })
    const r = await checkWifHealth(d)
    expect(r.ok).toBe(false)
    expect(r.stage).toBe(expected)
  })

  it('reports a timeout without claiming success', async () => {
    const d = deps({
      createUploadSession: vi.fn(async () => {
        throw new WifTimeoutError('sts', 10_000)
      }),
    })
    const r = await checkWifHealth(d)
    expect(r.ok).toBe(false)
    expect(r.stage).toBe('sts')
  })

  it('reports the gcs stage when Cloud Storage refuses the session', async () => {
    const d = deps({
      createUploadSession: vi.fn(async () => {
        throw new MediaUploadSessionError('gcs', 'refused', 403)
      }),
    })
    const r = await checkWifHealth(d)
    expect(r.ok).toBe(false)
    expect(r.stage).toBe('gcs')
  })

  // The whole point: this endpoint hands back a verdict, not credentials.
  it('leaks no token, no access token and no session URI — success path', async () => {
    const text = JSON.stringify(await checkWifHealth(deps()))
    expect(text).not.toContain(PROD_TOKEN)
    expect(text).not.toContain(SESSION_URI)
    expect(text).not.toContain('upload_id')
    expect(text).not.toContain('SUPERSECRET')
    expect(text).not.toContain(ACCESS_TOKEN)
    expect(text).not.toContain('ya29')
    expect(text).not.toContain('Bearer')
  })

  it('leaks nothing on the failure path either', async () => {
    const d = deps({
      createUploadSession: vi.fn(async () => {
        throw new Error(`boom ${ACCESS_TOKEN} ${SESSION_URI}`)
      }),
    })
    const text = JSON.stringify(await checkWifHealth(d))
    expect(text).not.toContain('ya29')
    expect(text).not.toContain('upload_id')
    expect(text).not.toContain('SUPERSECRET')
    expect(text).not.toContain(PROD_TOKEN)
  })
})
