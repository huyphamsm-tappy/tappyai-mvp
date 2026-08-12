// WIF-4 — the three client-direct upload endpoints.
//
// Matrix letters covered here (see uploadSession.test.ts for the full table):
//   A  unauthenticated video upload   -> 401, no session minted
//   B  unauthenticated audio upload   -> 401, no session minted
//   C  deals upload without the permission -> 403, no session minted
//   D  deals upload cross-origin      -> 403, no session minted
//   E  rate limit exhausted           -> 429, no session minted
//   K  the session is minted only after every guard has passed
//   N  MEDIA_PROVIDER=blob keeps the legacy Blob handshake working unchanged
//   O  MEDIA_PROVIDER=gcs refuses the legacy Blob handshake outright
//
// The session-minting logic itself is mocked out here on purpose: this file is
// about the guards and the provider gate, not about the GCS wire format.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CREATE_UPLOAD_SESSION_TYPE } from './uploadRoute'

const h = vi.hoisted(() => ({
  user: { id: 'u-1' } as { id: string } | null,
  getRequestUser: vi.fn(),
  requirePermission: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(() => ({ ok: true, retryAfter: 0 })),
  handleUpload: vi.fn(async () => ({ type: 'blob.generate-client-token', clientToken: 'vercel_blob_client_xxx' })),
  createUploadSessionResponse: vi.fn(
    async (): Promise<{ status: number; body: Record<string, unknown> }> => ({
      status: 200,
      body: { provider: 'gcs', uploadUrl: 'https://session', url: 'https://public', key: 'videos/u-1/k.mp4' },
    })
  ),
}))

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: h.rateLimit, clientIp: () => 'ip' }))
vi.mock('@vercel/blob/client', () => ({ handleUpload: h.handleUpload }))
vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, isSameOrigin: h.isSameOrigin }
})
vi.mock('@/lib/admin/permissions', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requirePermission: h.requirePermission }
})
vi.mock('@/lib/media/uploadRoute', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, createUploadSessionResponse: h.createUploadSessionResponse }
})

import { POST as videoPost } from '@/app/api/upload/video/route'
import { POST as audioPost } from '@/app/api/upload/audio/route'
import { POST as dealsPost } from '@/app/api/admin/deals/upload/route'
import { AdminError } from '@/lib/admin/rbac'

type Route = (req: never) => Promise<Response>

const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never

const sessionBody = (kind: string) => ({
  type: CREATE_UPLOAD_SESSION_TYPE,
  kind,
  contentType: 'video/mp4',
  size: 1024,
})
const legacyBody = { type: 'blob.generate-client-token', payload: { pathname: 'videos/anything.mp4' } }

const ENDPOINTS = [
  { name: 'video', route: videoPost as Route, path: '/api/upload/video', kind: 'video', kinds: ['video', 'videoThumbnail'] },
  { name: 'audio', route: audioPost as Route, path: '/api/upload/audio', kind: 'audio', kinds: ['audio', 'audioCover'] },
  { name: 'deals', route: dealsPost as Route, path: '/api/admin/deals/upload', kind: 'dealLogo', kinds: ['dealLogo', 'dealBanner'] },
] as const

const original = process.env.MEDIA_PROVIDER

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'u-1' }
  h.getRequestUser.mockImplementation(async () => ({ user: h.user, supabase: {} }))
  h.requirePermission.mockResolvedValue({ user: { id: 'admin-1' }, actor: { userId: 'admin-1', isOwner: true, roles: [] } })
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockReturnValue({ ok: true, retryAfter: 0 })
  h.handleUpload.mockResolvedValue({ type: 'blob.generate-client-token', clientToken: 'vercel_blob_client_xxx' })
  h.createUploadSessionResponse.mockResolvedValue({
    status: 200,
    body: { provider: 'gcs', uploadUrl: 'https://session', url: 'https://public', key: 'videos/u-1/k.mp4' },
  })
  delete process.env.MEDIA_PROVIDER
})

afterEach(() => {
  if (original === undefined) delete process.env.MEDIA_PROVIDER
  else process.env.MEDIA_PROVIDER = original
})

// ------------------------------------------------------------------ A, B, C, D
describe('authorization comes before anything is minted', () => {
  // A / B
  it.each([
    ['video', videoPost as Route, '/api/upload/video', 'video'],
    ['audio', audioPost as Route, '/api/upload/audio', 'audio'],
  ])('%s: 401 when unauthenticated', async (_n, route, path, kind) => {
    h.user = null
    const res = await route(post(path, sessionBody(kind)))
    expect(res.status).toBe(401)
    expect(h.createUploadSessionResponse).not.toHaveBeenCalled()
    expect(h.handleUpload).not.toHaveBeenCalled()
  })

  // C
  it('deals: 403 when the permission is missing', async () => {
    h.requirePermission.mockRejectedValue(new AdminError('FORBIDDEN', 'Missing permission', 403))
    const res = await dealsPost(post('/api/admin/deals/upload', sessionBody('dealLogo')))
    expect(res.status).toBe(403)
    expect(h.createUploadSessionResponse).not.toHaveBeenCalled()
    expect(h.handleUpload).not.toHaveBeenCalled()
  })

  // D
  it('deals: 403 on a cross-origin request', async () => {
    h.isSameOrigin.mockReturnValue(false)
    const res = await dealsPost(post('/api/admin/deals/upload', sessionBody('dealLogo')))
    expect(res.status).toBe(403)
    expect(h.createUploadSessionResponse).not.toHaveBeenCalled()
    expect(h.handleUpload).not.toHaveBeenCalled()
  })
})

// ------------------------------------------------------------------------- E
describe('rate limiting still gates session minting', () => {
  it.each(ENDPOINTS)('$name: 429 when the limit is exhausted', async ({ route, path, kind }) => {
    h.rateLimit.mockReturnValue({ ok: false, retryAfter: 30 })
    const res = await route(post(path, sessionBody(kind)))
    expect(res.status).toBe(429)
    expect(h.createUploadSessionResponse).not.toHaveBeenCalled()
    expect(h.handleUpload).not.toHaveBeenCalled()
  })
})

// ------------------------------------------------------------------------- K
describe('an authorized session request is scoped to the endpoint', () => {
  it.each(ENDPOINTS)('$name: mints with the caller id and only its own kinds', async ({ route, path, kind, kinds }) => {
    const res = await route(post(path, sessionBody(kind)))
    expect(res.status).toBe(200)
    expect(h.createUploadSessionResponse).toHaveBeenCalledTimes(1)

    const [body, ctx] = h.createUploadSessionResponse.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { ownerId: string; allowedKinds: readonly string[] },
    ]
    expect(body.kind).toBe(kind)
    expect(ctx.ownerId).toBeTruthy()
    expect([...ctx.allowedKinds].sort()).toEqual([...kinds].sort())
    // The legacy Blob token path must not also have run.
    expect(h.handleUpload).not.toHaveBeenCalled()
  })

  it.each(ENDPOINTS)('$name: passes the helper status through unchanged', async ({ route, path, kind }) => {
    h.createUploadSessionResponse.mockResolvedValue({ status: 413, body: { error: 'too large' } })
    const res = await route(post(path, sessionBody(kind)))
    expect(res.status).toBe(413)
  })
})

// ------------------------------------------------------------------------- N
describe('MEDIA_PROVIDER=blob — today’s behaviour is unchanged', () => {
  it.each(ENDPOINTS)('$name: the legacy Blob handshake is still served', async ({ route, path }) => {
    const res = await route(post(path, legacyBody))
    expect(res.status).toBe(200)
    expect(h.handleUpload).toHaveBeenCalledTimes(1)
    expect(await res.json()).toMatchObject({ type: 'blob.generate-client-token' })
  })
})

// ------------------------------------------------------------------------- O
describe('MEDIA_PROVIDER=gcs — the legacy Blob handshake is refused', () => {
  beforeEach(() => {
    process.env.MEDIA_PROVIDER = 'gcs'
  })

  it.each(ENDPOINTS)('$name: refuses to mint a Blob client token', async ({ route, path }) => {
    const res = await route(post(path, legacyBody))
    expect(res.status).toBe(409)
    expect(h.handleUpload).not.toHaveBeenCalled()
    // Nothing resembling a Blob client token may appear in the response.
    expect(JSON.stringify(await res.json())).not.toContain('vercel_blob_client')
  })

  it.each(ENDPOINTS)('$name: the guards still run first', async ({ route, path }) => {
    h.rateLimit.mockReturnValue({ ok: false, retryAfter: 30 })
    const res = await route(post(path, legacyBody))
    expect(res.status).toBe(429)
    expect(h.handleUpload).not.toHaveBeenCalled()
  })
})

// ------------------------------------------------------------ malformed bodies
describe('malformed request bodies', () => {
  it.each(ENDPOINTS)('$name: a non-JSON body is a 400, not a 500', async ({ route, path }) => {
    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }) as never
    const res = await route(req)
    expect(res.status).toBe(400)
    expect(h.createUploadSessionResponse).not.toHaveBeenCalled()
    expect(h.handleUpload).not.toHaveBeenCalled()
  })
})
