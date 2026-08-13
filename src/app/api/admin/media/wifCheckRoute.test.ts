// Guards on the WIF health endpoint. It performs a privileged operation, so it
// must be no more reachable than the media-upload endpoint it borrows its
// permission from.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(() => ({ ok: true, retryAfter: 0 })),
  checkWifHealth: vi.fn(),
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
vi.mock('@/lib/media/wifHealth', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, checkWifHealth: h.checkWifHealth }
})
vi.mock('@/lib/media/providers/gcs', () => ({
  createGcsProvider: () => ({ id: 'gcs', createUploadSession: h.createUploadSession }),
}))

import { GET } from './wif-check/route'
import { AdminError } from '@/lib/admin/rbac'

const req = () => new Request('http://localhost/api/admin/media/wif-check') as never

beforeEach(() => {
  vi.clearAllMocks()
  h.requirePermission.mockResolvedValue({ user: { id: 'admin-1' } })
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockReturnValue({ ok: true, retryAfter: 0 })
  h.checkWifHealth.mockResolvedValue({
    ok: true,
    stage: 'complete',
    oidc: { issuer: 'i', audience: 'a', subject: 's', expiresInSeconds: 3600 },
    bucket: 'tappyai-media-prod',
  })
  delete process.env.MEDIA_PROVIDER
})

describe('GET /api/admin/media/wif-check — guards', () => {
  it('401 when unauthenticated, and runs no credential exchange', async () => {
    h.requirePermission.mockRejectedValue(new AdminError('UNAUTHORIZED', 'Auth required', 401))
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(h.checkWifHealth).not.toHaveBeenCalled()
  })

  it('403 without the media-upload permission', async () => {
    h.requirePermission.mockRejectedValue(new AdminError('FORBIDDEN', 'Missing permission', 403))
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(h.checkWifHealth).not.toHaveBeenCalled()
  })

  it('403 on a cross-origin request', async () => {
    h.isSameOrigin.mockReturnValue(false)
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(h.checkWifHealth).not.toHaveBeenCalled()
  })

  it('429 when rate limited', async () => {
    h.rateLimit.mockReturnValue({ ok: false, retryAfter: 30 })
    const res = await GET(req())
    expect(res.status).toBe(429)
    expect(h.checkWifHealth).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/media/wif-check — verdict', () => {
  it('200 and reports the active provider on a healthy chain', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.stage).toBe('complete')
    expect(body.activeProvider).toBe('blob') // unchanged by running the check
  })

  // A broken chain must not read as healthy to a monitor.
  it('503 when the chain is broken, naming the stage', async () => {
    h.checkWifHealth.mockResolvedValue({ ok: false, stage: 'sts', reason: 'chain rejected' })
    const res = await GET(req())
    expect(res.status).toBe(503)
    expect((await res.json()).stage).toBe('sts')
  })

  it('reports gcs as active once the flag is on', async () => {
    process.env.MEDIA_PROVIDER = 'gcs'
    expect((await (await GET(req())).json()).activeProvider).toBe('gcs')
    delete process.env.MEDIA_PROVIDER
  })
})
