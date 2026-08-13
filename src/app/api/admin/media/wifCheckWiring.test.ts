// The route must hand the health check the SAME request-aware token reader it
// hands the provider.
//
// Production proved this is not a theoretical concern. The route was built with
// two `getOidcToken` callbacks: the provider's read the request header, the
// health check's still read only `process.env`. So the diagnostic reported
// `headerPresent: true` while the health check reported "no deployment identity
// available" — from one request, in one handler.
//
// No existing test could catch it, because the route's other test suite mocks
// `checkWifHealth` entirely. Mocking the collaborator hid the wiring. This file
// deliberately leaves `checkWifHealth` REAL and mocks only the network edge.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VERCEL_OIDC_HEADER } from '@/lib/media/gcpAuth'

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(() => ({ ok: true, retryAfter: 0 })),
  createUploadSession: vi.fn(),
}))

vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, isSameOrigin: h.isSameOrigin }
})
vi.mock('@/lib/admin/permissions', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requirePermission: h.requirePermission }
})
// Only the network edge is faked. checkWifHealth stays real.
vi.mock('@/lib/media/providers/gcs', () => ({
  createGcsProvider: () => ({ id: 'gcs', createUploadSession: h.createUploadSession }),
}))

import { GET } from './wif-check/route'

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const PROD_JWT = `${b64({ alg: 'RS256' })}.${b64({
  iss: 'https://oidc.vercel.com/huyphamsm-tappys-projects',
  aud: 'https://vercel.com/huyphamsm-tappys-projects',
  sub: 'owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:production',
  exp: 4_000_000_000,
})}.sig`

/** The production shape: no env var, token on the request header. */
const deployedRequest = (token = PROD_JWT) =>
  new Request('https://www.tappyai.com/api/admin/media/wif-check', {
    headers: { [VERCEL_OIDC_HEADER]: token },
  }) as never

const savedEnv = process.env.VERCEL_OIDC_TOKEN

beforeEach(() => {
  vi.clearAllMocks()
  h.requirePermission.mockResolvedValue({ user: { id: 'owner-1' } })
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockReturnValue({ ok: true, retryAfter: 0 })
  h.createUploadSession.mockResolvedValue({
    uploadUrl: 'https://storage.googleapis.com/upload/…?upload_id=SECRET',
    url: 'https://storage.googleapis.com/tappyai-media-prod/videos/health/x.mp4',
    key: 'videos/health/x.mp4',
  })
  // A deployed function has no VERCEL_OIDC_TOKEN. This is the whole point.
  delete process.env.VERCEL_OIDC_TOKEN
  delete process.env.MEDIA_PROVIDER
})

afterEach(() => {
  if (savedEnv === undefined) delete process.env.VERCEL_OIDC_TOKEN
  else process.env.VERCEL_OIDC_TOKEN = savedEnv
})

describe('wif-check wiring: env absent, header present', () => {
  // The exact production failure.
  it('completes the chain instead of reporting a missing identity', async () => {
    const res = await GET(deployedRequest())
    const body = await res.json()

    expect(body.stage).not.toBe('oidc')
    expect(body.reason).not.toBe('no deployment identity available')
    expect(body.ok).toBe(true)
    expect(body.stage).toBe('complete')
    expect(res.status).toBe(200)
  })

  it('actually attempts the exchange', async () => {
    await GET(deployedRequest())
    expect(h.createUploadSession).toHaveBeenCalledOnce()
  })

  // The contradiction guard, asserted at the route boundary where it appeared.
  it('never reports headerPresent while also reporting no identity', async () => {
    const body = await (await GET(deployedRequest())).json()
    expect(body.identity.headerPresent).toBe(true)
    if (body.identity.headerPresent) {
      expect(body.stage).not.toBe('oidc')
    }
  })

  it('reports claim readability once an identity is found', async () => {
    const body = await (await GET(deployedRequest())).json()
    expect(body.claimsReadable).toBe(true)
  })

  // A token the platform supplies that we cannot decode is still an identity.
  it('proceeds with an undecodable token and says so', async () => {
    const body = await (await GET(deployedRequest('not-a-decodable-jwt'))).json()
    expect(body.stage).toBe('complete')
    expect(body.claimsReadable).toBe(false)
    expect(h.createUploadSession).toHaveBeenCalledOnce()
  })
})

describe('wif-check wiring: nothing anywhere', () => {
  it('still fails closed with no identity in either source', async () => {
    const res = await GET(
      new Request('https://www.tappyai.com/api/admin/media/wif-check') as never
    )
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.stage).toBe('oidc')
    expect(body.identity.headerPresent).toBe(false)
    expect(h.createUploadSession).not.toHaveBeenCalled()
    expect(res.status).toBe(503)
  })
})

describe('wif-check never leaks the session URI or token', () => {
  it('returns no credential material on the success path', async () => {
    const text = JSON.stringify(await (await GET(deployedRequest())).json())
    expect(text).not.toContain('upload_id')
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain(PROD_JWT)
  })
})
