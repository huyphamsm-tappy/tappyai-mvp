// Regression: the bridge could not see its own deployment identity in production.
//
// Vercel exposes the OIDC token two different ways, and only one of them exists
// in a running function:
//
//   builds + local development -> process.env.VERCEL_OIDC_TOKEN
//   deployed Vercel function   -> the `x-vercel-oidc-token` REQUEST header
//
// The bridge read only the environment variable. That works locally — which is
// why every earlier test passed — and is always empty inside a deployed
// function, so production failed closed at the very first stage with
// "no deployment identity available", never reaching STS.
//
// These tests pin the deployed-function shape specifically: env var ABSENT,
// header PRESENT. That is the case the old code got wrong.

import { describe, it, expect, vi } from 'vitest'
import { readDeploymentOidcToken, VERCEL_OIDC_HEADER } from './gcpAuth'
import { getMediaProvider } from './index'
import { checkWifHealth } from './wifHealth'

const HEADER_TOKEN = 'header.deployed.token'
const ENV_TOKEN = 'env.build.token'

/** A request as it arrives inside a deployed Vercel function. */
const requestWithToken = (token: string | null) =>
  new Request('https://www.tappyai.com/api/upload/video', {
    headers: token ? { [VERCEL_OIDC_HEADER]: token } : {},
  })

const noEnv = {} as NodeJS.ProcessEnv
const withEnv = { VERCEL_OIDC_TOKEN: ENV_TOKEN } as unknown as NodeJS.ProcessEnv

describe('readDeploymentOidcToken', () => {
  // THE production case. This is what was broken.
  it('reads the token from the request header when running as a function', () => {
    expect(readDeploymentOidcToken(requestWithToken(HEADER_TOKEN), noEnv)).toBe(HEADER_TOKEN)
  })

  it('falls back to the environment variable in builds and local development', () => {
    expect(readDeploymentOidcToken(undefined, withEnv)).toBe(ENV_TOKEN)
    expect(readDeploymentOidcToken(requestWithToken(null), withEnv)).toBe(ENV_TOKEN)
  })

  // A deployed function may also carry a stale build-time env var; the
  // per-request token is the live one and must win.
  it('prefers the request header over the environment variable', () => {
    expect(readDeploymentOidcToken(requestWithToken(HEADER_TOKEN), withEnv)).toBe(HEADER_TOKEN)
  })

  it('returns null when neither source has a token', () => {
    expect(readDeploymentOidcToken(requestWithToken(null), noEnv)).toBeNull()
    expect(readDeploymentOidcToken(undefined, noEnv)).toBeNull()
    expect(readDeploymentOidcToken(null, noEnv)).toBeNull()
  })

  it('treats an empty header or empty env value as absent', () => {
    expect(readDeploymentOidcToken(requestWithToken(''), noEnv)).toBeNull()
    expect(
      readDeploymentOidcToken(undefined, { VERCEL_OIDC_TOKEN: '' } as unknown as NodeJS.ProcessEnv)
    ).toBeNull()
  })
})

describe('getMediaProvider carries the deployment identity', () => {
  const gcsEnv = { MEDIA_PROVIDER: 'gcs' } as unknown as NodeJS.ProcessEnv

  // The regression, end to end: with only a header (the production shape) the
  // provider must get PAST the oidc stage and actually attempt the exchange.
  it('a gcs write in a deployed function reaches STS instead of failing at oidc', async () => {
    const seen: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(String(url))
      return { ok: false, status: 400, json: async () => ({}) } as unknown as Response
    }) as unknown as typeof fetch

    const provider = getMediaProvider(gcsEnv, requestWithToken(HEADER_TOKEN), fetchImpl)
    await provider
      .put('avatars/u1.jpg', new Uint8Array([1]), { contentType: 'image/jpeg' })
      .catch(() => undefined)

    // Reaching sts.googleapis.com at all is the proof: the old code threw
    // WifExchangeError('oidc') before any network call.
    expect(seen.some((u) => u.includes('sts.googleapis.com'))).toBe(true)
  })

  it('still fails closed when the function has no identity at all', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response)
    const provider = getMediaProvider(gcsEnv, requestWithToken(null), fetchImpl as never)
    await expect(
      provider.put('avatars/u1.jpg', new Uint8Array([1]), { contentType: 'image/jpeg' })
    ).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  // Was: "unchanged for blob — the request is simply unused". There is no Blob provider to select
  // any more, so an empty environment yields GCS and the request identity still matters.
  it('yields a GCS provider even with an empty environment', () => {
    expect(getMediaProvider({} as NodeJS.ProcessEnv, requestWithToken(HEADER_TOKEN)).id).toBe('gcs')
  })
})

describe('the health check sees the deployment identity too', () => {
  it('does not report the oidc stage when the header carries a valid token', async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const jwt = `${b64({ alg: 'RS256' })}.${b64({
      iss: 'https://oidc.vercel.com/huyphamsm-tappys-projects',
      aud: 'https://vercel.com/huyphamsm-tappys-projects',
      sub: 'owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:production',
      exp: 4_000_000_000,
    })}.sig`

    const r = await checkWifHealth({
      bucket: 'tappyai-media-prod',
      getOidcToken: () => readDeploymentOidcToken(requestWithToken(jwt), noEnv),
      createUploadSession: async () => ({ uploadUrl: 'u', url: 'p', key: 'videos/health/x.mp4' }),
    })

    expect(r.ok).toBe(true)
    expect(r.stage).toBe('complete')
    expect(r.oidc?.subject).toContain('environment:production')
  })
})
