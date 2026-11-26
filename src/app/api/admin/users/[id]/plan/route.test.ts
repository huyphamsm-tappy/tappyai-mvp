/**
 * POST /api/admin/users/[id]/plan — grant a paid plan (owner 26/11/2026).
 *
 * What this proves: who reaches the grant, what it writes (through THE one grant function, channel "admin"), that nothing about authority can ride on
 * it, and what the audit record says. The SQL function behind it (`p8_apply_entitlement`) has its own database suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminError } from '@/lib/admin/rbac'

const h = vi.hoisted(() => ({
  granted: true,
  sameOrigin: true,
  rateOk: true,
  target: { data: { user: { id: '33333333-3333-3333-3333-333333333333', is_anonymous: false } } as { user: unknown } | null, error: null as unknown },
  grantCalls: [] as Array<unknown[]>,
  audit: [] as Array<Record<string, any>>,
  grantResult: { status: 'applied', changed: true, plan: 'promax1m', beforeEnd: null as string | null, afterEnd: '2026-12-26T00:00:00.000Z' } as Record<string, unknown>,
}))

vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, isSameOrigin: () => h.sameOrigin }
})
vi.mock('@/lib/admin/permissions', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    requirePermission: async (_req: unknown, id: string) => {
      if (id !== 'users.plan.grant') throw new Error(`wrong permission asked: ${id}`)
      if (!h.granted) throw new AdminError('FORBIDDEN', 'Permission denied', 403)
      return { user: { id: ACTOR, email: 'founder@tappyai.com' }, actor: { userId: ACTOR, isOwner: true, roles: [] } }
    },
  }
})
vi.mock('@/lib/admin/permissions/decisionAudit', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, auditActorRole: () => 'owner' }
})
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: async () => ({ ok: h.rateOk, retryAfter: 5 }) }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (p: Record<string, any>) => { h.audit.push(p) } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { getUserById: async () => h.target } } }) }))
vi.mock('@/lib/payments/grantPlan', () => ({
  grantPlan: async (...args: unknown[]) => { h.grantCalls.push(args); return h.grantResult },
}))

import { POST } from './route'
import { permissionRegistry } from '@/lib/admin/permissions/registry'
import { permissionEngine } from '@/lib/admin/permissions/engine'

const ACTOR = '22222222-2222-2222-2222-222222222222'
const SUBJECT = '33333333-3333-3333-3333-333333333333'
const REASON = 'cấp cho tài khoản của chủ dự án để thử gói Tappy'

const post = async (body: unknown, id = SUBJECT) => {
  const res = await POST(new Request(`http://localhost/api/admin/users/${id}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: { id } })
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

beforeEach(() => {
  h.granted = true; h.sameOrigin = true; h.rateOk = true
  h.target = { data: { user: { id: SUBJECT, is_anonymous: false } }, error: null }
  h.grantCalls = []; h.audit = []
  h.grantResult = { status: 'applied', changed: true, plan: 'promax1m', beforeEnd: null, afterEnd: '2026-12-26T00:00:00.000Z' }
})

describe('POST /api/admin/users/[id]/plan', () => {
  it('grants through THE grant function on the admin channel, with the actor and the reason, and the server-made reference', async () => {
    const r = await post({ plan: 'promax1m', days: 30, reason: REASON })
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ id: SUBJECT, plan: 'promax1m', days: 30, status: 'applied', expires_at: '2026-12-26T00:00:00.000Z' })
    expect(h.grantCalls).toHaveLength(1)
    const [uid, plan, channel, ref, expiresAt, opts] = h.grantCalls[0] as [string, string, string, string, Date, Record<string, unknown>]
    expect([uid, plan, channel]).toEqual([SUBJECT, 'promax1m', 'admin'])
    expect(ref).toMatch(/^admin:22222222-2222-2222-2222-222222222222:[0-9a-f-]{36}$/)
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29.99)
    expect(days).toBeLessThan(30.01)
    expect(opts).toMatchObject({ actorId: ACTOR, note: REASON })
  })

  it('records an audit entry naming actor, target, plan, days and reason', async () => {
    await post({ plan: 'coco', days: 90, reason: REASON })
    expect(h.audit).toHaveLength(1)
    expect(h.audit[0]).toMatchObject({ actorId: ACTOR, action: 'user.plan.grant', targetType: 'user', targetId: SUBJECT })
    expect(h.audit[0].metadata).toMatchObject({ plan: 'coco', days: 90, reason: REASON })
  })

  it('a caller without the permission is refused and nothing is granted', async () => {
    h.granted = false
    const r = await post({ plan: 'promax1m', days: 30, reason: REASON })
    expect(r.status).toBe(403)
    expect(h.grantCalls).toHaveLength(0)
    expect(h.audit).toHaveLength(0)
  })

  it('a cross-origin request and a rate-limited administrator are refused', async () => {
    h.sameOrigin = false
    expect((await post({ plan: 'promax1m', days: 30, reason: REASON })).status).toBe(403)
    h.sameOrigin = true; h.rateOk = false
    expect((await post({ plan: 'promax1m', days: 30, reason: REASON })).status).toBe(429)
    expect(h.grantCalls).toHaveLength(0)
  })

  it.each<[unknown, string]>([
    [{ plan: 'free', days: 30, reason: REASON }, 'a plan that is not sold'],
    [{ plan: 'milo', days: 30, reason: REASON }, 'a retired plan'],
    [{ plan: 'promax1m', days: 0, reason: REASON }, 'zero days'],
    [{ plan: 'promax1m', days: 366, reason: REASON }, 'more than a year'],
    [{ plan: 'promax1m', days: 30, reason: 'short' }, 'a reason under 10 characters'],
    [{ plan: 'promax1m', days: 30, reason: REASON, role: 'super_admin' }, 'a field that tries to carry authority'],
    [{ plan: 'promax1m', days: 30, reason: REASON, external_ref: 'x' }, 'a caller-chosen idempotency key'],
    [null, 'no body'],
  ])('refuses %j (%s) with 422 and grants nothing', async (body, _why) => {
    const r = await post(body)
    expect(r.status).toBe(422)
    expect(h.grantCalls).toHaveLength(0)
  })

  it('refuses a malformed user id, an unknown user and a guest session', async () => {
    expect((await post({ plan: 'promax1m', days: 30, reason: REASON }, 'not-a-uuid')).status).toBe(422)
    h.target = { data: null, error: { message: 'not found' } }
    expect((await post({ plan: 'promax1m', days: 30, reason: REASON })).status).toBe(404)
    h.target = { data: { user: { id: SUBJECT, is_anonymous: true } }, error: null }
    expect((await post({ plan: 'promax1m', days: 30, reason: REASON })).status).toBe(422)
    expect(h.grantCalls).toHaveLength(0)
  })
})

describe('the permission itself', () => {
  const entry = () => permissionRegistry.all.find((d) => d.id === 'users.plan.grant')!

  it('exists, is a write on users, critical, and is held by admin and super_admin only (never a moderator or analyst)', () => {
    expect(entry()).toBeTruthy()
    expect(entry().module).toBe('users')
    expect(entry().category).toBe('write')
    expect(entry().riskLevel).toBe('critical')
    expect([...entry().defaultRoles].sort()).toEqual(['admin', 'super_admin'])
  })

  it('the engine grants it to admin and super_admin and the Owner, and refuses moderator and analyst', () => {
    const actor = (roles: string[], isOwner = false) => ({ userId: ACTOR, isOwner, roles, capabilities: [] }) as never
    expect(permissionEngine.can(actor(['admin']), 'users.plan.grant' as never)).toBe(true)
    expect(permissionEngine.can(actor(['super_admin']), 'users.plan.grant' as never)).toBe(true)
    expect(permissionEngine.can(actor([], true), 'users.plan.grant' as never)).toBe(true)
    expect(permissionEngine.can(actor(['moderator']), 'users.plan.grant' as never)).toBe(false)
    expect(permissionEngine.can(actor(['analyst']), 'users.plan.grant' as never)).toBe(false)
  })
})
