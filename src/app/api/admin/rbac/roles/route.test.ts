import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controller V2 component 1 — constitutional guards on role granting.
// The DATABASE is the authority (fn_grant_admin_role + the lockdown REVOKE);
// these tests cover the application-side mirror that turns a raw Postgres
// error into a useful API response, and prove the handler no longer INSERTs.

const h = vi.hoisted(() => ({
  requireAdminRole: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(() => ({ ok: true, retryAfter: 0 })),
  rpc: vi.fn(),
  insert: vi.fn(),
  writeAuditLog: vi.fn(),
}))

// requireOwner stays REAL — it is the thing under test.
vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    requireAdminRole: h.requireAdminRole,
    isSameOrigin: h.isSameOrigin,
    invalidateRoleCache: vi.fn(),
  }
})
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: h.rateLimit, clientIp: () => 'ip' }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: h.writeAuditLog }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: h.rpc,
    from: () => ({ insert: h.insert, select: () => ({ order: () => ({ data: [], error: null }) }) }),
  }),
}))

import { POST } from './route'

const OWNER = '11111111-1111-1111-1111-111111111111'
const ADMIN = '22222222-2222-2222-2222-222222222222'
const TARGET = '33333333-3333-3333-3333-333333333333'

const ctx = (isOwner: boolean, userId = isOwner ? OWNER : ADMIN) => ({
  user: { id: userId, email: 'a@b.c' },
  role: 'super_admin',
  actor: { userId, email: 'a@b.c', isOwner, roles: ['super_admin'], highestRole: 'super_admin', source: 'cookie', resolvedAt: 0 },
})

const req = (body: unknown) =>
  new Request('http://localhost/api/admin/rbac/roles', {
    method: 'POST',
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockReturnValue({ ok: true, retryAfter: 0 })
  h.rpc.mockResolvedValue({ data: { id: 'r1', user_id: TARGET, role: 'admin' }, error: null })
})

describe('POST /api/admin/rbac/roles — constitutional guards', () => {
  it('REGRESSION (G1): a non-Owner super_admin CANNOT grant super_admin', async () => {
    h.requireAdminRole.mockResolvedValue(ctx(false))
    const res = await POST(req({ user_id: TARGET, role: 'super_admin' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toMatch(/Platform Owner/i)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('the Platform Owner CAN grant super_admin', async () => {
    h.requireAdminRole.mockResolvedValue(ctx(true))
    const res = await POST(req({ user_id: TARGET, role: 'super_admin' }))
    expect(res.status).toBe(200)
    expect(h.rpc).toHaveBeenCalledWith('fn_grant_admin_role', expect.objectContaining({
      p_actor_id: OWNER, p_user_id: TARGET, p_role: 'super_admin',
    }))
  })

  it('nobody may promote themselves — even the Owner', async () => {
    h.requireAdminRole.mockResolvedValue(ctx(true))
    const res = await POST(req({ user_id: OWNER, role: 'admin' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toMatch(/self-promotion/i)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('a non-Owner super_admin may still grant lower roles', async () => {
    h.requireAdminRole.mockResolvedValue(ctx(false))
    const res = await POST(req({ user_id: TARGET, role: 'moderator' }))
    expect(res.status).toBe(200)
    expect(h.rpc).toHaveBeenCalled()
  })

  it('never INSERTs into admin_roles directly (the lockdown revokes that privilege)', async () => {
    h.requireAdminRole.mockResolvedValue(ctx(true))
    await POST(req({ user_id: TARGET, role: 'admin' }))
    expect(h.insert).not.toHaveBeenCalled()
    expect(h.rpc).toHaveBeenCalled()
  })
})

describe('POST /api/admin/rbac/roles — database error mapping', () => {
  it('maps 42501 (guard raised in the DB) to 403', async () => {
    h.requireAdminRole.mockResolvedValue(ctx(true))
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'FORBIDDEN: only the Platform Owner may grant super_admin' } })
    const res = await POST(req({ user_id: TARGET, role: 'super_admin' }))
    expect(res.status).toBe(403)
  })

  it('maps 23505 (duplicate) to 409', async () => {
    h.requireAdminRole.mockResolvedValue(ctx(true))
    h.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    const res = await POST(req({ user_id: TARGET, role: 'admin' }))
    expect(res.status).toBe(409)
  })

  it('maps unexpected errors to 500 without leaking the message', async () => {
    h.requireAdminRole.mockResolvedValue(ctx(true))
    h.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal detail' } })
    const res = await POST(req({ user_id: TARGET, role: 'admin' }))
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('internal detail')
  })
})

describe('POST /api/admin/rbac/roles — audit', () => {
  it('audits a super_admin grant under its own owner.* action', async () => {
    h.requireAdminRole.mockResolvedValue(ctx(true))
    await POST(req({ user_id: TARGET, role: 'super_admin' }))
    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'owner.super_admin_granted' })
    )
  })

  it('audits ordinary grants under rbac.role_granted', async () => {
    h.requireAdminRole.mockResolvedValue(ctx(false))
    await POST(req({ user_id: TARGET, role: 'analyst' }))
    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rbac.role_granted' })
    )
  })
})
