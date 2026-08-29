// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

// POST /api/admin/notifications/send — the Controller's authorization boundary.
//
// 🔑 THE POINT: a page that hides a button has not stopped anybody calling an
// endpoint. Every test below issues a REQUEST, never a click, because that is
// how the boundary is actually attacked.
//
// The real PDP decision is exercised through a mocked `requirePermission` that
// behaves exactly as the real one does (throws AdminError on refusal), so the
// handler's ordering — guard first, everything else after — is what is tested.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  rateLimit: vi.fn(),
  dispatch: vi.fn(),
  profiles: vi.fn(),
  sameOrigin: vi.fn(() => true),
}))

class FakeAdminError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

vi.mock('@/lib/admin/permissions', async () => {
  const real = await vi.importActual<typeof import('@/lib/admin/permissions')>('@/lib/admin/permissions')
  return { ...real, requirePermission: h.requirePermission }
})
vi.mock('@/lib/admin/rbac', async () => {
  const real = await vi.importActual<typeof import('@/lib/admin/rbac')>('@/lib/admin/rbac')
  return {
    ...real,
    isSameOrigin: h.sameOrigin,
    adminErrorResponse: (e: unknown) =>
      e instanceof FakeAdminError
        ? Response.json({ error: { code: e.code } }, { status: e.status })
        : Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 }),
  }
})
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
vi.mock('@/lib/notifications/dispatchService', async () => {
  const real = await vi.importActual<typeof import('@/lib/notifications/dispatchService')>(
    '@/lib/notifications/dispatchService'
  )
  return { ...real, dispatchNotification: h.dispatch }
})
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ in: h.profiles }) }) }),
}))

import { POST } from './route'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

const post = (body: unknown) =>
  new Request('http://localhost/api/admin/notifications/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const VALID = { userIds: [UUID_A], title: 'T', body: 'B' }

const asActor = (over: Record<string, unknown> = {}) => ({
  user: { id: 'admin-1', email: 'admin@tappyai.com' },
  actor: { isOwner: false, highestRole: 'admin', ...over },
})

beforeEach(() => {
  vi.clearAllMocks()
  h.sameOrigin.mockReturnValue(true)
  h.requirePermission.mockResolvedValue(asActor())
  h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
  h.profiles.mockResolvedValue({ data: [{ id: UUID_A }, { id: UUID_B }], error: null })
  h.dispatch.mockResolvedValue({
    ok: true, recipients: 1, accepted: 1, failed: 0, gone: 0, unreachable: 0, errored: 0,
    perRecipient: [{ userId: UUID_A, notificationId: 'n1', accepted: 1, failed: 0, gone: 0, reachable: true }],
  })
})

describe('authorization is enforced at the route, not by the UI', () => {
  it('an authorized actor succeeds', async () => {
    const res = await POST(post(VALID))
    expect(res.status).toBe(200)
    expect(h.requirePermission.mock.calls[0][1]).toBe('notifications.send.user')
  })

  it('🔑 an unauthorized actor is refused — no dispatch, no database read', async () => {
    h.requirePermission.mockRejectedValue(new FakeAdminError(403, 'FORBIDDEN'))
    const res = await POST(post(VALID))
    expect(res.status).toBe(403)
    expect(h.dispatch).not.toHaveBeenCalled()
    expect(h.profiles).not.toHaveBeenCalled()
  })

  it('an unauthenticated request is refused', async () => {
    h.requirePermission.mockRejectedValue(new FakeAdminError(401, 'UNAUTHORIZED'))
    expect((await POST(post(VALID))).status).toBe(401)
    expect(h.dispatch).not.toHaveBeenCalled()
  })

  it('🔑 the Founder passes through Actor.isOwner, holding no role', async () => {
    h.requirePermission.mockResolvedValue(asActor({ isOwner: true, highestRole: null }))
    expect((await POST(post(VALID))).status).toBe(200)
    expect(h.dispatch.mock.calls[0][0].origin).toMatchObject({ isPlatformOwner: true, actorRole: 'owner' })
  })

  it('🔑 no email is read anywhere in the handler', () => {
    const code = readFileSync('src/app/api/admin/notifications/send/route.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    // `user.email` is passed to the AUDIT writer, which records the acting
    // administrator — it is never compared against anything.
    expect(code).not.toMatch(/email\s*===|=== *['"`].*@/)
    expect(code).not.toContain('@tappyai.com')
  })

  it('a cross-origin request is refused', async () => {
    h.sameOrigin.mockReturnValue(false)
    expect((await POST(post(VALID))).status).toBe(403)
    expect(h.dispatch).not.toHaveBeenCalled()
  })
})

describe('recipient re-authorization', () => {
  it('🔑 a client-supplied id that resolves to no user refuses the WHOLE request', async () => {
    // Silently dropping it would tell an operator "sent" for people who do not
    // exist. Refusing the batch keeps the count they see truthful.
    h.profiles.mockResolvedValue({ data: [{ id: UUID_A }], error: null })
    const res = await POST(post({ ...VALID, userIds: [UUID_A, UUID_B] }))
    expect(res.status).toBe(422)
    expect(h.dispatch).not.toHaveBeenCalled()
  })

  it('🔑 the refusal does not echo which ids were unknown', async () => {
    // Echoing them turns the endpoint into an oracle for probing the user table.
    h.profiles.mockResolvedValue({ data: [], error: null })
    const res = await POST(post({ ...VALID, userIds: [UUID_A] }))
    const body = await res.text()
    expect(body).not.toContain(UUID_A)
    expect(body).toMatch(/1 recipient/)
  })

  it('every submitted id is looked up server-side', async () => {
    await POST(post({ ...VALID, userIds: [UUID_A, UUID_B] }))
    expect(h.profiles).toHaveBeenCalledWith('id', [UUID_A, UUID_B])
  })

  it('duplicate ids are de-duplicated before the lookup', async () => {
    await POST(post({ ...VALID, userIds: [UUID_A, UUID_A, UUID_B] }))
    expect(h.profiles).toHaveBeenCalledWith('id', [UUID_A, UUID_B])
  })
})

describe('validation', () => {
  it.each([
    ['no recipients', { ...VALID, userIds: [] }],
    ['a non-uuid recipient', { ...VALID, userIds: ['not-a-uuid'] }],
    ['an empty title', { ...VALID, title: '   ' }],
    ['an empty body', { ...VALID, body: '' }],
    ['an absolute link', { ...VALID, link: 'https://evil.example' }],
    ['a protocol-relative link', { ...VALID, link: '//evil.example' }],
    ['a javascript link', { ...VALID, link: 'javascript:alert(1)' }],
  ])('rejects %s', async (_label, body) => {
    const res = await POST(post(body))
    expect(res.status).toBe(422)
    expect(h.dispatch).not.toHaveBeenCalled()
  })

  it('accepts a relative internal link', async () => {
    expect((await POST(post({ ...VALID, link: '/explore' }))).status).toBe(200)
  })

  it('rejects a malformed body without reaching the dispatcher', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/notifications/send', { method: 'POST', body: '{not json' })
    )
    expect(res.status).toBe(422)
    expect(h.dispatch).not.toHaveBeenCalled()
  })
})

describe('rate limiting and duplicate handling', () => {
  it('reuses the shared limiter and refuses when it says so', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    const res = await POST(post(VALID))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(h.dispatch).not.toHaveBeenCalled()
  })

  it('a suppressed duplicate returns 409, not a fake success', async () => {
    h.dispatch.mockResolvedValue({ ok: false, reason: 'DUPLICATE', retryAfter: 12 })
    const res = await POST(post(VALID))
    expect(res.status).toBe(409)
    expect(res.headers.get('Retry-After')).toBe('12')
  })

  it('over-cap recipients are refused with the cap named', async () => {
    h.dispatch.mockResolvedValue({ ok: false, reason: 'TOO_MANY_RECIPIENTS', limit: 500 })
    const res = await POST(post(VALID))
    expect(res.status).toBe(422)
    expect(await res.text()).toContain('500')
  })
})

describe('the response reports honestly', () => {
  it('returns the four distinct outcomes, and never the word delivered', async () => {
    h.dispatch.mockResolvedValue({
      ok: true, recipients: 4, accepted: 1, failed: 1, gone: 1, unreachable: 1, errored: 0, perRecipient: [],
    })
    const res = await POST(post(VALID))
    const json = await res.json()
    expect(json.data).toMatchObject({ recipients: 4, accepted: 1, failed: 1, gone: 1, unreachable: 1 })
    expect(JSON.stringify(json).toLowerCase()).not.toContain('delivered')
  })

  it('🔑 per-recipient detail carries outcome counts only — no name, email or token', async () => {
    const res = await POST(post(VALID))
    const json = await res.json()
    const keys = Object.keys(json.data.perRecipient[0])
    expect(keys.sort()).toEqual(['accepted', 'failed', 'gone', 'notificationId', 'reachable', 'userId'])
  })
})

describe('the handler never becomes a second writer or a broadcast path', () => {
  const code = readFileSync('src/app/api/admin/notifications/send/route.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('does not insert notifications or call a provider directly', () => {
    expect(code).not.toMatch(/from\(['"]notifications['"]\)/)
    expect(code).not.toContain('emitNotification')
    for (const forbidden of ['fcm', 'webpush', 'web-push', 'CRON_SECRET']) {
      expect(code.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('🔑 has no broadcast path — that is a different permission and a later phase', () => {
    expect(code).not.toContain('NOTIFICATIONS_SEND_BROADCAST')
    expect(code).not.toContain('getAllSubscribedUserIds')
    expect(code).toContain('NOTIFICATIONS_SEND_USER')
  })
})
