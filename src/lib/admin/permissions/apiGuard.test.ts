import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controller V2 — Component 4: the API enforcement point.
//
// `requirePermission` gates all 12 `/api/admin/*` handlers and had NO direct
// test. Its security ordering was covered only indirectly, through
// `requireAdminRole` — the rank-ladder shim Component 4 deletes. These tests
// carry that coverage across so retiring the shim loses nothing, and add the
// decision-auditing the shim never had.

const h = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  checkOwnerGate: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, resolveActor: h.resolveActor }
})
vi.mock('@/lib/admin/owner', () => ({
  checkOwnerGate: h.checkOwnerGate,
  isPlatformOwner: vi.fn(async () => false),
}))
vi.mock('@/lib/admin/audit', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, writeAuditLog: h.writeAuditLog }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }))

import { requirePermission } from './guards'
import { PERMISSIONS } from './registry'
import { ACTION_ACCESS_DENIED, ACTION_OWNER_OVERRIDE, resetDecisionAuditThrottle } from './decisionAudit'

const USER = { id: 'u-1', email: 'admin@tappyai.com' }
const req = () => new Request('http://localhost/api/admin/x')

const ctx = (roles: string[], isOwner = false) => ({
  user: USER,
  actor: {
    userId: USER.id,
    email: USER.email,
    isOwner,
    roles,
    highestRole: roles[roles.length - 1] ?? null,
    capabilities: [],
    source: 'cookie',
    resolvedAt: 0,
  },
})

const run = async (permission: string) => {
  try {
    return { ok: true as const, ctx: await requirePermission(req(), permission as never) }
  } catch (err) {
    return { ok: false as const, status: (err as { status?: number }).status, message: (err as Error).message }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // The decision-audit throttle is module state that deliberately survives
  // calls. Without this reset an earlier test burns the key and a later one
  // silently observes no write — which is exactly what it caught here.
  resetDecisionAuditThrottle()
  h.checkOwnerGate.mockResolvedValue({ ok: true })
  h.resolveActor.mockResolvedValue(ctx(['admin']))
})

describe('requirePermission — decision order (ported from requireAdminRole)', () => {
  it('401 when unauthenticated', async () => {
    h.resolveActor.mockResolvedValue(null)

    const r = await run(PERMISSIONS.AUDIT_LOG_READ)

    expect(r).toMatchObject({ ok: false, status: 401 })
    expect(h.checkOwnerGate).not.toHaveBeenCalled()
  })

  it('SECURITY ORDERING: the Owner Gate is evaluated BEFORE authorization', async () => {
    // Proven by an actor who would ALSO fail the permission check — the error
    // must be the gate's, not the permission's.
    h.checkOwnerGate.mockResolvedValue({ ok: false, reason: 'ENV_MISMATCH' })
    h.resolveActor.mockResolvedValue(ctx(['analyst']))

    const r = await run(PERMISSIONS.SECURITY_ROLES_GRANT)

    expect(r).toMatchObject({ ok: false, status: 403 })
    expect((r as { message: string }).message).toMatch(/ownership assertion failed/)
  })

  it('denies even a valid super_admin when the gate fails', async () => {
    h.checkOwnerGate.mockResolvedValue({ ok: false, reason: 'ENV_SET_BUT_NO_OWNER' })
    h.resolveActor.mockResolvedValue(ctx(['super_admin']))

    const r = await run(PERMISSIONS.SECURITY_ROLES_READ)

    expect((r as { message: string }).message).toMatch(/ownership assertion failed/)
  })

  it('403 when the actor lacks the permission', async () => {
    h.resolveActor.mockResolvedValue(ctx(['analyst']))

    const r = await run(PERMISSIONS.SECURITY_ROLES_GRANT)

    expect(r).toMatchObject({ ok: false, status: 403 })
  })

  it('returns user, actor and the admitting decision on success', async () => {
    const r = await run(PERMISSIONS.COMMERCE_DEALS_READ)

    expect(r.ok).toBe(true)
    expect(r).toMatchObject({
      ctx: { user: { id: USER.id }, actor: { roles: ['admin'] }, decision: { allowed: true, reason: 'ROLE_GRANT' } },
    })
  })

  it('an undeclared permission fails CLOSED', async () => {
    h.resolveActor.mockResolvedValue(ctx(['super_admin']))

    const r = await run('not.a.real.permission')

    expect(r).toMatchObject({ ok: false, status: 403 })
  })
})

describe('requirePermission — decisions are audited (Component 4)', () => {
  it('a denial writes an rbac.access_denied row', async () => {
    h.resolveActor.mockResolvedValue(ctx(['analyst']))

    await run(PERMISSIONS.SECURITY_ROLES_GRANT)

    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ACTION_ACCESS_DENIED,
        actorId: USER.id,
        actorRole: 'analyst',
        targetId: PERMISSIONS.SECURITY_ROLES_GRANT,
        metadata: expect.objectContaining({ surface: 'api', reason: 'NO_GRANT' }),
      })
    )
  })

  it('a denial audit row carries the request, so IP and user-agent land in it', async () => {
    h.resolveActor.mockResolvedValue(ctx(['analyst']))

    await run(PERMISSIONS.SECURITY_ROLES_GRANT)

    expect(h.writeAuditLog.mock.calls[0][0].req).toBeInstanceOf(Request)
  })

  it('an Owner bypass on a non-read writes an owner.override row', async () => {
    h.resolveActor.mockResolvedValue(ctx([], true))

    const r = await run(PERMISSIONS.SECURITY_ROLES_GRANT)

    expect(r.ok).toBe(true)
    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: ACTION_OWNER_OVERRIDE, actorRole: 'owner' })
    )
  })

  it('an Owner bypass on a READ writes nothing — the documented volume rule', async () => {
    h.resolveActor.mockResolvedValue(ctx([], true))

    const r = await run(PERMISSIONS.DASHBOARD_HOME_VIEW)

    expect(r.ok).toBe(true)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('an ordinary authorized action writes nothing here — the handler audits its own effect', async () => {
    const r = await run(PERMISSIONS.COMMERCE_DEALS_DELETE)

    expect(r.ok).toBe(true)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('a failed Owner Gate is NOT recorded as an RBAC denial', async () => {
    // The Controller is down; that is not an authorization decision about this
    // actor, and mislabelling it would poison denial analytics.
    h.checkOwnerGate.mockResolvedValue({ ok: false, reason: 'ENV_MISMATCH' })

    await run(PERMISSIONS.AUDIT_LOG_READ)

    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })
})
