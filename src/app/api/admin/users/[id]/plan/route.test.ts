/**
 * /api/admin/users/[id]/plan — give, and see, a paid plan (owner 26/11/2026).
 *
 * What this proves: who reaches the grant, what it writes (through THE one grant function, channel "admin"), the length rules (1 to 12 months, or no
 * expiry), that nothing about authority can ride on it, what the audit record says, and what the read shows. The SQL function behind it
 * (`p8_apply_entitlement`) has its own database suite.
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
  sub: { data: null as unknown, error: null as unknown },
  grants: { data: [] as unknown[], error: null as unknown },
  revokes: { data: [] as unknown[], error: null as unknown },
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
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async () => h.target } },
    from: (table: string) => {
      const chain: Record<string, any> = {
        select: () => chain, eq: (col: string, val: unknown) => { if (col === 'mode') chain._mode = val; return chain }, order: () => chain, limit: () => chain,
        maybeSingle: () => Promise.resolve(h.sub),
        then: (resolve: (v: unknown) => unknown) => resolve(table === 'entitlement_ledger' ? (chain._mode === 'revoke_manual' ? h.revokes : h.grants) : h.sub),
      }
      return chain
    },
  }),
}))
vi.mock('@/lib/payments/grantPlan', () => ({
  grantPlan: async (...args: unknown[]) => { h.grantCalls.push(args); return h.grantResult },
}))

import { GET, POST } from './route'
import { permissionRegistry } from '@/lib/admin/permissions/registry'
import { permissionEngine } from '@/lib/admin/permissions/engine'

const ACTOR = '22222222-2222-2222-2222-222222222222'
const SUBJECT = '33333333-3333-3333-3333-333333333333'
const REASON = 'cấp cho tài khoản của chủ dự án để thử gói Tappy'

const post = async (body: unknown, id = SUBJECT) => {
  const res = await POST(new Request(`http://localhost/api/admin/users/${id}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: { id } })
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}
const get = async (id = SUBJECT) => {
  const res = await GET(new Request(`http://localhost/api/admin/users/${id}/plan`), { params: { id } })
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

beforeEach(() => {
  h.granted = true; h.sameOrigin = true; h.rateOk = true
  h.target = { data: { user: { id: SUBJECT, is_anonymous: false } }, error: null }
  h.grantCalls = []; h.audit = []
  h.grantResult = { status: 'applied', changed: true, plan: 'promax1m', beforeEnd: null, afterEnd: '2026-12-26T00:00:00.000Z' }
  h.sub = { data: null, error: null }
  h.grants = { data: [], error: null }
  h.revokes = { data: [], error: null }
})

describe('POST /api/admin/users/[id]/plan', () => {
  it('grants N MONTHS through THE grant function on the admin channel, with the actor, the reason and the server-made reference', async () => {
    const r = await post({ plan: 'promax1m', months: 3, reason: REASON })
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ id: SUBJECT, plan: 'promax1m', months: 3, lifetime: false, status: 'applied', ends_at: '2026-12-26T00:00:00.000Z' })
    expect(r.body.data.grant_ref).toMatch(/^admin:22222222-2222-2222-2222-222222222222:[0-9a-f-]{36}$/)
    expect(h.grantCalls).toHaveLength(1)
    const [uid, plan, channel, ref, expiresAt, opts] = h.grantCalls[0] as [string, string, string, string, Date, Record<string, any>]
    expect([uid, plan, channel]).toEqual([SUBJECT, 'promax1m', 'admin'])
    expect(ref).toBe(r.body.data.grant_ref)
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(88)
    expect(days).toBeLessThan(93)
    expect(opts).toMatchObject({ actorId: ACTOR, note: REASON })
  })

  it('NO EXPIRY is stored as a date about 100 years away (every "paid until" rule keeps working)', async () => {
    const r = await post({ plan: 'promax3m', lifetime: true, reason: REASON })
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ lifetime: true, months: null })
    const expiresAt = (h.grantCalls[0] as unknown[])[4] as Date
    const years = (expiresAt.getTime() - Date.now()) / (365.25 * 86_400_000)
    expect(years).toBeGreaterThan(99.9)
    expect(years).toBeLessThan(100.1)
  })

  it('records an audit entry naming actor, target, plan, length and reason', async () => {
    await post({ plan: 'coco', months: 12, reason: REASON })
    expect(h.audit).toHaveLength(1)
    expect(h.audit[0]).toMatchObject({ actorId: ACTOR, action: 'user.plan.grant', targetType: 'user', targetId: SUBJECT })
    expect(h.audit[0].metadata).toMatchObject({ plan: 'coco', months: 12, lifetime: false, reason: REASON })
  })

  it('a caller without the permission is refused and nothing is granted', async () => {
    h.granted = false
    const r = await post({ plan: 'promax1m', months: 1, reason: REASON })
    expect(r.status).toBe(403)
    expect(h.grantCalls).toHaveLength(0)
    expect(h.audit).toHaveLength(0)
  })

  it('a cross-origin request and a rate-limited administrator are refused', async () => {
    h.sameOrigin = false
    expect((await post({ plan: 'promax1m', months: 1, reason: REASON })).status).toBe(403)
    h.sameOrigin = true; h.rateOk = false
    expect((await post({ plan: 'promax1m', months: 1, reason: REASON })).status).toBe(429)
    expect(h.grantCalls).toHaveLength(0)
  })

  it.each<[unknown, string]>([
    [{ plan: 'free', months: 1, reason: REASON }, 'a plan that is not sold'],
    [{ plan: 'milo', months: 1, reason: REASON }, 'a retired plan'],
    [{ plan: 'promax1m', months: 0, reason: REASON }, 'zero months'],
    [{ plan: 'promax1m', months: 13, reason: REASON }, 'more than twelve months'],
    [{ plan: 'promax1m', reason: REASON }, 'neither months nor lifetime'],
    [{ plan: 'promax1m', months: 3, lifetime: true, reason: REASON }, 'both months and lifetime'],
    [{ plan: 'promax1m', lifetime: false, reason: REASON }, 'lifetime=false is not a length'],
    [{ plan: 'promax1m', days: 30, reason: REASON }, 'the old days field'],
    [{ plan: 'promax1m', months: 1, reason: 'short' }, 'a reason under 10 characters'],
    [{ plan: 'promax1m', months: 1, reason: REASON, role: 'super_admin' }, 'a field that tries to carry authority'],
    [{ plan: 'promax1m', months: 1, reason: REASON, external_ref: 'x' }, 'a caller-chosen idempotency key'],
    [null, 'no body'],
  ])('refuses %j (%s) with 422 and grants nothing', async (body, _why) => {
    const r = await post(body)
    expect(r.status).toBe(422)
    expect(h.grantCalls).toHaveLength(0)
  })

  it('refuses a malformed user id, an unknown user and a guest session', async () => {
    expect((await post({ plan: 'promax1m', months: 1, reason: REASON }, 'not-a-uuid')).status).toBe(422)
    h.target = { data: null, error: { message: 'not found' } }
    expect((await post({ plan: 'promax1m', months: 1, reason: REASON })).status).toBe(404)
    h.target = { data: { user: { id: SUBJECT, is_anonymous: true } }, error: null }
    expect((await post({ plan: 'promax1m', months: 1, reason: REASON })).status).toBe(422)
    expect(h.grantCalls).toHaveLength(0)
  })
})

describe('GET /api/admin/users/[id]/plan', () => {
  it('shows the current plan and the grants made from the screen, marking the ones already taken back', async () => {
    h.sub = { data: { plan: 'promax1m', status: 'active', current_period_end: '2026-12-26T00:00:00Z', source: 'manual' }, error: null }
    h.grants = {
      data: [
        { external_ref: 'admin:a:b', plan: 'promax1m', seconds: 2592000, after_end: '2026-12-26T00:00:00Z', note: 'one', created_at: '2026-11-26T00:00:00Z', actor_id: ACTOR },
        { external_ref: 'admin:c:d', plan: 'coco', seconds: 100, after_end: '2026-11-27T00:00:00Z', note: 'two', created_at: '2026-11-25T00:00:00Z', actor_id: ACTOR },
      ],
      error: null,
    }
    h.revokes = { data: [{ external_ref: 'revoke:admin:c:d' }], error: null }
    const r = await get()
    expect(r.status).toBe(200)
    expect(r.body.data.current).toMatchObject({ plan: 'promax1m', status: 'active' })
    expect(r.body.data.grants).toHaveLength(2)
    expect(r.body.data.grants[0]).toMatchObject({ grant_ref: 'admin:a:b', label: 'Tappy', revoked: false, reason: 'one' })
    expect(r.body.data.grants[1]).toMatchObject({ grant_ref: 'admin:c:d', revoked: true })
  })

  it('a caller without the permission cannot read, a bad id is 422', async () => {
    h.granted = false
    expect((await get()).status).toBe(403)
    h.granted = true
    expect((await get('nope')).status).toBe(422)
  })
})

describe('the permissions themselves', () => {
  const entry = (id: string) => permissionRegistry.all.find((d) => d.id === id)!

  it.each([['users.plan.grant', 'critical'], ['users.plan.revoke', 'high']])('%s exists, is a write on users (%s), held by admin and super_admin only', (id, risk) => {
    expect(entry(id)).toBeTruthy()
    expect(entry(id).module).toBe('users')
    expect(entry(id).category).toBe('write')
    expect(entry(id).riskLevel).toBe(risk)
    expect([...entry(id).defaultRoles].sort()).toEqual(['admin', 'super_admin'])
  })

  it('the engine grants both to admin, super_admin and the Owner, and refuses moderator and analyst', () => {
    const actor = (roles: string[], isOwner = false) => ({ userId: ACTOR, isOwner, roles, capabilities: [] }) as never
    for (const id of ['users.plan.grant', 'users.plan.revoke']) {
      expect(permissionEngine.can(actor(['admin']), id as never)).toBe(true)
      expect(permissionEngine.can(actor(['super_admin']), id as never)).toBe(true)
      expect(permissionEngine.can(actor([], true), id as never)).toBe(true)
      expect(permissionEngine.can(actor(['moderator']), id as never)).toBe(false)
      expect(permissionEngine.can(actor(['analyst']), id as never)).toBe(false)
    }
  })
})
