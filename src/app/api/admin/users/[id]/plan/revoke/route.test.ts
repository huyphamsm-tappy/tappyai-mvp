/**
 * POST /api/admin/users/[id]/plan/revoke — take back ONE granted plan (owner 26/11/2026).
 * The SQL function (`p8_revoke_manual_grant`) has its own database suite; this proves who reaches it, what it is called with, and what is recorded.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminError } from '@/lib/admin/rbac'

const h = vi.hoisted(() => ({
  granted: true,
  sameOrigin: true,
  rateOk: true,
  rpcCalls: [] as Array<[string, Record<string, unknown>]>,
  rpcResult: { data: { status: 'applied', removed_seconds: 100, after_end: '2026-11-27T00:00:00Z', state: 'canceled' } as unknown, error: null as unknown },
  audit: [] as Array<Record<string, any>>,
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
      if (id !== 'users.plan.revoke') throw new Error(`wrong permission asked: ${id}`)
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
  createAdminClient: () => ({ rpc: (name: string, args: Record<string, unknown>) => { h.rpcCalls.push([name, args]); return Promise.resolve(h.rpcResult) } }),
}))

import { POST } from './route'

const ACTOR = '22222222-2222-2222-2222-222222222222'
const SUBJECT = '33333333-3333-3333-3333-333333333333'
const REF = `admin:${ACTOR}:44444444-4444-4444-4444-444444444444`
const REASON = 'cấp nhầm gói, thu hồi theo yêu cầu của chủ dự án'

const post = async (body: unknown, id = SUBJECT) => {
  const res = await POST(new Request(`http://localhost/api/admin/users/${id}/plan/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: { id } })
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

beforeEach(() => {
  h.granted = true; h.sameOrigin = true; h.rateOk = true
  h.rpcCalls = []; h.audit = []
  h.rpcResult = { data: { status: 'applied', removed_seconds: 100, after_end: '2026-11-27T00:00:00Z', state: 'canceled' }, error: null }
})

describe('POST /api/admin/users/[id]/plan/revoke', () => {
  it('calls THE database function with the user, the grant reference, the actor and the reason, and audits it', async () => {
    const r = await post({ grant_ref: REF, reason: REASON })
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ id: SUBJECT, status: 'revoked', state: 'canceled' })
    expect(h.rpcCalls).toEqual([['p8_revoke_manual_grant', { p_user: SUBJECT, p_grant_ref: REF, p_actor: ACTOR, p_note: REASON }]])
    expect(h.audit[0]).toMatchObject({ actorId: ACTOR, action: 'user.plan.revoke', targetType: 'user', targetId: SUBJECT })
    expect(h.audit[0].metadata).toMatchObject({ grant_ref: REF, reason: REASON, removed_seconds: 100 })
  })

  it('a grant that does not exist for this user is 404; a repeat is answered as already revoked and audits nothing new', async () => {
    h.rpcResult = { data: { status: 'not_found' }, error: null }
    expect((await post({ grant_ref: REF, reason: REASON })).status).toBe(404)
    h.rpcResult = { data: { status: 'duplicate' }, error: null }
    const r = await post({ grant_ref: REF, reason: REASON })
    expect(r.status).toBe(200)
    expect(r.body.data.status).toBe('already_revoked')
    expect(h.audit).toHaveLength(0)
  })

  it('a database error is a 500 and nothing is audited', async () => {
    h.rpcResult = { data: null, error: { code: 'XX000' } }
    expect((await post({ grant_ref: REF, reason: REASON })).status).toBe(500)
    expect(h.audit).toHaveLength(0)
  })

  it('refuses without the permission, cross-origin, and when rate limited; nothing is called', async () => {
    h.granted = false
    expect((await post({ grant_ref: REF, reason: REASON })).status).toBe(403)
    h.granted = true; h.sameOrigin = false
    expect((await post({ grant_ref: REF, reason: REASON })).status).toBe(403)
    h.sameOrigin = true; h.rateOk = false
    expect((await post({ grant_ref: REF, reason: REASON })).status).toBe(429)
    expect(h.rpcCalls).toHaveLength(0)
  })

  it.each<[unknown, string]>([
    [{ grant_ref: 'sepay:12345', reason: REASON }, 'a purchase reference (only grants made from this screen can be taken back)'],
    [{ grant_ref: 'revoke:' + REF, reason: REASON }, 'a revoke reference'],
    [{ grant_ref: REF, reason: 'short' }, 'a reason under 10 characters'],
    [{ grant_ref: REF, reason: REASON, p_actor: 'x' }, 'an extra field'],
    [null, 'no body'],
  ])('refuses %j (%s) with 422', async (body, _why) => {
    expect((await post(body)).status).toBe(422)
    expect(h.rpcCalls).toHaveLength(0)
  })

  it('refuses a malformed user id', async () => {
    expect((await post({ grant_ref: REF, reason: REASON }, 'nope')).status).toBe(422)
  })
})
