/**
 * POST /api/admin/users/[id]/delete — delete one consumer account for good (owner 26/11/2026).
 * The deletion itself (`deleteOwnAccount` -> `auth.admin.deleteUser`) and the clean-up trigger have their own suites; this proves who reaches it, what is
 * refused (staff, oneself, a database without the clean-up, a missing confirmation) and what is audited.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminError } from '@/lib/admin/rbac'

const h = vi.hoisted(() => ({
  granted: true,
  sameOrigin: true,
  rateOk: true,
  ready: true,
  target: { data: { user: { id: '33333333-3333-3333-3333-333333333333', is_anonymous: false } } as { user: unknown } | null, error: null as unknown },
  staff: 'not_staff' as 'staff' | 'not_staff' | 'error',
  identity: { ok: true, apple: false } as { ok: boolean; apple?: boolean },
  deleteResult: { ok: true } as { ok: boolean; reason?: string },
  deleteCalls: [] as string[],
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
      if (id !== 'users.account.delete') throw new Error(`wrong permission asked: ${id}`)
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
vi.mock('@/lib/account/deletionReady', () => ({ accountDeletionSchemaReady: async () => h.ready }))
vi.mock('@/lib/account/selfDelete', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual, // CONFIRM_WORDS stays the real shared list
    staffStatus: async () => h.staff,
    lookupAppleIdentity: async () => h.identity,
    deleteOwnAccount: async (_c: unknown, id: string) => { h.deleteCalls.push(id); return h.deleteResult },
  }
})

import { POST } from './route'
import { permissionRegistry } from '@/lib/admin/permissions/registry'
import { permissionEngine } from '@/lib/admin/permissions/engine'

const ACTOR = '22222222-2222-2222-2222-222222222222'
const SUBJECT = '33333333-3333-3333-3333-333333333333'
const REASON = 'tài khoản thử nghiệm, chủ dự án yêu cầu xóa hẳn'

const post = async (body: unknown, id = SUBJECT) => {
  const res = await POST(new Request(`http://localhost/api/admin/users/${id}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: { id } })
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

beforeEach(() => {
  h.granted = true; h.sameOrigin = true; h.rateOk = true; h.ready = true
  h.target = { data: { user: { id: SUBJECT, is_anonymous: false } }, error: null }
  h.staff = 'not_staff'; h.identity = { ok: true, apple: false }; h.deleteResult = { ok: true }
  h.deleteCalls = []; h.audit = []
})

describe('POST /api/admin/users/[id]/delete', () => {
  it('deletes through the same deletion the person can ask for, and audits the request and the result', async () => {
    const r = await post({ reason: REASON, confirm: 'XÓA' })
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ id: SUBJECT, deleted: true, apple_identity: false })
    expect(h.deleteCalls).toEqual([SUBJECT])
    expect(h.audit.map((a) => a.action)).toEqual(['user.delete.requested', 'user.delete'])
    expect(h.audit[0]).toMatchObject({ actorId: ACTOR, targetId: SUBJECT })
    expect(h.audit[0].metadata).toMatchObject({ reason: REASON })
    // the TARGET's email and name are nowhere in the record (the actor's own address is the actor field, not the target)
    expect(JSON.stringify(h.audit.map((a) => ({ t: a.targetId, m: a.metadata })))).not.toMatch(/@|full_name/)
  })

  it.each(['XÓA', 'XOÁ', 'DELETE'])('accepts the confirmation word %s', async (word) => {
    expect((await post({ reason: REASON, confirm: word })).status).toBe(200)
  })

  it('an Apple-linked account is deleted and the audit says it was NOT revoked at Apple', async () => {
    h.identity = { ok: true, apple: true }
    const r = await post({ reason: REASON, confirm: 'DELETE' })
    expect(r.status).toBe(200)
    expect(r.body.data.apple_identity).toBe(true)
    expect(h.audit[1].metadata).toMatchObject({ apple_identity: true, apple_revoked: false })
  })

  it('refuses staff (an administrator or the Platform Owner): nothing is deleted', async () => {
    h.staff = 'staff'
    expect((await post({ reason: REASON, confirm: 'XÓA' })).status).toBe(403)
    h.staff = 'error'
    expect((await post({ reason: REASON, confirm: 'XÓA' })).status).toBe(500)
    expect(h.deleteCalls).toHaveLength(0)
  })

  it('refuses to delete oneself', async () => {
    expect((await post({ reason: REASON, confirm: 'XÓA' }, ACTOR)).status).toBe(403)
    expect(h.deleteCalls).toHaveLength(0)
  })

  it('refuses (503) where the database does not have the clean-up installed, and deletes nothing', async () => {
    h.ready = false
    expect((await post({ reason: REASON, confirm: 'XÓA' })).status).toBe(503)
    expect(h.deleteCalls).toHaveLength(0)
  })

  it('a failed deletion is audited as failed and answered as an error', async () => {
    h.deleteResult = { ok: false, reason: 'failed' }
    expect((await post({ reason: REASON, confirm: 'XÓA' })).status).toBe(500)
    expect(h.audit.map((a) => a.action)).toEqual(['user.delete.requested', 'user.delete.failed'])
  })

  it('refuses without the permission, cross-origin, and when rate limited; nothing happens', async () => {
    h.granted = false
    expect((await post({ reason: REASON, confirm: 'XÓA' })).status).toBe(403)
    h.granted = true; h.sameOrigin = false
    expect((await post({ reason: REASON, confirm: 'XÓA' })).status).toBe(403)
    h.sameOrigin = true; h.rateOk = false
    expect((await post({ reason: REASON, confirm: 'XÓA' })).status).toBe(429)
    expect(h.deleteCalls).toHaveLength(0)
    expect(h.audit).toHaveLength(0)
  })

  it.each<[unknown, string]>([
    [{ reason: REASON }, 'no confirmation word'],
    [{ reason: REASON, confirm: 'yes' }, 'a wrong confirmation word'],
    [{ reason: 'short', confirm: 'XÓA' }, 'a reason under 20 characters'],
    [{ reason: REASON, confirm: 'XÓA', force: true }, 'an extra field'],
    [null, 'no body'],
  ])('refuses %j (%s) with 422', async (body, _why) => {
    expect((await post(body)).status).toBe(422)
    expect(h.deleteCalls).toHaveLength(0)
  })

  it('refuses a malformed id (422) and an unknown user (404)', async () => {
    expect((await post({ reason: REASON, confirm: 'XÓA' }, 'nope')).status).toBe(422)
    h.target = { data: null, error: { message: 'not found' } }
    expect((await post({ reason: REASON, confirm: 'XÓA' })).status).toBe(404)
    expect(h.deleteCalls).toHaveLength(0)
  })
})

describe('the permission itself', () => {
  const entry = () => permissionRegistry.all.find((d) => d.id === 'users.account.delete')!
  it('is destructive and critical, on users, and held by super_admin ALONE', () => {
    expect(entry()).toBeTruthy()
    expect(entry().module).toBe('users')
    expect(entry().category).toBe('destructive')
    expect(entry().riskLevel).toBe('critical')
    expect([...entry().defaultRoles]).toEqual(['super_admin'])
  })
  it('the engine grants it to super_admin and the Owner, refuses admin, moderator and analyst', () => {
    const actor = (roles: string[], isOwner = false) => ({ userId: ACTOR, isOwner, roles, capabilities: [] }) as never
    expect(permissionEngine.can(actor(['super_admin']), 'users.account.delete' as never)).toBe(true)
    expect(permissionEngine.can(actor([], true), 'users.account.delete' as never)).toBe(true)
    for (const role of ['admin', 'moderator', 'analyst']) expect(permissionEngine.can(actor([role]), 'users.account.delete' as never)).toBe(false)
  })
})
