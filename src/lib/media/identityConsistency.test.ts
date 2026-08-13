// The diagnostic and the exchange must agree about whether an identity exists.
//
// Production reported, from the SAME request:
//
//   identity: { source: "header", headerPresent: true }   <- diagnostic
//   stage:    "oidc", "no deployment identity available"  <- health check
//
// Both cannot be true. The cause is that `checkWifHealth` used
// `readOidcClaims()` as its presence test, and that function returns null for
// four different reasons — only ONE of which is "there is no token". The other
// three are "there is a token but I could not decode it", which is a cosmetic
// problem, not an identity problem. Conflating them reported a present token as
// a missing one and returned before the exchange ever ran.
//
// Decoding claims is operator convenience. Google is the authority on whether a
// token is acceptable, and the only way to learn that is to attempt the
// exchange. These tests pin that separation.
//
// No test prints a token, a claim, or a token length.

import { describe, it, expect, vi } from 'vitest'
import {
  describeDeploymentIdentity,
  readDeploymentOidcToken,
  VERCEL_OIDC_HEADER,
} from './gcpAuth'
import { checkWifHealth } from './wifHealth'

const noEnv = {} as NodeJS.ProcessEnv

/** The exact production shape: no env var, token on the request header. */
const productionRequest = (token: string) =>
  new Request('https://www.tappyai.com/api/admin/media/wif-check', {
    headers: { [VERCEL_OIDC_HEADER]: token },
  })

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const DECODABLE = `${b64({ alg: 'RS256' })}.${b64({
  iss: 'https://oidc.vercel.com/huyphamsm-tappys-projects',
  aud: 'https://vercel.com/huyphamsm-tappys-projects',
  sub: 'owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:production',
  exp: 4_000_000_000,
})}.sig`

/** A token that exists but that `readOidcClaims` cannot decode. */
const UNDECODABLE = 'this-is-a-token-but-not-a-decodable-jwt'

const health = (token: string, createUploadSession = vi.fn(async () => ({
  uploadUrl: 'u',
  url: 'p',
  key: 'videos/health/x.mp4',
}))) => {
  const req = productionRequest(token)
  return {
    req,
    createUploadSession,
    run: () =>
      checkWifHealth({
        bucket: 'tappyai-media-prod',
        getOidcToken: () => readDeploymentOidcToken(req, noEnv),
        createUploadSession,
      }),
  }
}

// ------------------------------------------------- the helper is not the bug
describe('readDeploymentOidcToken in the production shape', () => {
  it('returns a token when the env var is absent and the header is present', () => {
    const token = readDeploymentOidcToken(productionRequest(DECODABLE), noEnv)
    // Asserted as a boolean and a source, never by value.
    expect(token).not.toBeNull()
    expect(typeof token).toBe('string')
    expect(describeDeploymentIdentity(productionRequest(DECODABLE), noEnv).source).toBe('header')
  })

  it('returns the token even when it is not a decodable JWT', () => {
    expect(readDeploymentOidcToken(productionRequest(UNDECODABLE), noEnv)).not.toBeNull()
  })
})

// ------------------------------------------------------------ THE INVARIANT
describe('the diagnostic and the exchange agree', () => {
  // This is the exact production contradiction.
  it.each([
    ['a decodable token', DECODABLE],
    ['an undecodable token', UNDECODABLE],
  ])('source=header (%s) must never report "no deployment identity"', async (_label, token) => {
    const h = health(token)
    expect(describeDeploymentIdentity(h.req, noEnv).source).toBe('header')

    const r = await h.run()
    expect(r.stage).not.toBe('oidc')
    expect(r.reason).not.toBe('no deployment identity available')
  })

  // The point of having an identity is to spend it. If a token exists the chain
  // MUST be attempted — otherwise we never learn what Google thinks of it.
  it('attempts the exchange whenever a token exists, decodable or not', async () => {
    for (const token of [DECODABLE, UNDECODABLE]) {
      const h = health(token)
      await h.run()
      expect(h.createUploadSession).toHaveBeenCalledOnce()
    }
  })

  it('an undecodable token still completes when the exchange succeeds', async () => {
    const r = await health(UNDECODABLE).run()
    expect(r.ok).toBe(true)
    expect(r.stage).toBe('complete')
  })

  // Operators still need to know whether the claims were readable, without the
  // claims themselves becoming a requirement for success.
  it('reports claim readability separately from success', async () => {
    expect((await health(DECODABLE).run()).claimsReadable).toBe(true)
    expect((await health(UNDECODABLE).run()).claimsReadable).toBe(false)
  })
})

// -------------------------------------------------------- fail-closed intact
describe('a genuinely absent identity still fails closed', () => {
  it('reports the oidc stage and never calls the exchange', async () => {
    const createUploadSession = vi.fn(async () => ({ uploadUrl: 'u', url: 'p', key: 'k' }))
    const r = await checkWifHealth({
      bucket: 'tappyai-media-prod',
      getOidcToken: () => readDeploymentOidcToken(new Request('https://x.test'), noEnv),
      createUploadSession,
    })
    expect(r.ok).toBe(false)
    expect(r.stage).toBe('oidc')
    expect(r.reason).toBe('no deployment identity available')
    expect(createUploadSession).not.toHaveBeenCalled()
  })

  it('treats an empty header value as absent', async () => {
    const r = await checkWifHealth({
      bucket: 'tappyai-media-prod',
      getOidcToken: () => readDeploymentOidcToken(productionRequest(''), noEnv),
      createUploadSession: async () => ({ uploadUrl: 'u', url: 'p', key: 'k' }),
    })
    expect(r.stage).toBe('oidc')
  })
})

// ------------------------------------------------------------- no leakage
describe('the verdict still leaks nothing', () => {
  it.each([
    ['decodable', DECODABLE],
    ['undecodable', UNDECODABLE],
  ])('carries no token material for %s', async (_l, token) => {
    const text = JSON.stringify(await health(token).run())
    expect(text).not.toContain(token)
    expect(text).not.toContain(String(token.length))
    expect(text).not.toContain('ya29')
    expect(text).not.toContain('Bearer')
  })
})
