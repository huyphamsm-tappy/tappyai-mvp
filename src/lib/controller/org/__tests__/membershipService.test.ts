import { describe, it, expect } from 'vitest'
import { assignMembership, setMembershipStatus, removeMembership, listMemberships } from '../membershipService'
import { inMemoryMembershipRepository } from '../membershipRepository'
import { NO_CAPABILITIES } from '@/lib/admin/capabilities'
import type { Actor, AdminRole } from '@/lib/admin/rbac'
import type { AuditParams } from '@/lib/admin/audit'
import type { DepartmentId, DepartmentMembership, OrgRole, OrgScope } from '../types'
import type { DelegationRequest } from '../delegation'

// FOUNDATION-07C — the membership management SERVICE, proven with the REAL
// permission engine (NO PDP mock). Composition = canonical PDP permission
// (security.roles.grant, super_admin/owner) AND department authority (canDelegate /
// Head of the target department). The scope layer can only RESTRICT; a PDP denial
// always wins. Sensitive successes and denials are audited via an injected sink.

function actor(roles: AdminRole[], opts: { isOwner?: boolean; id: string }): Actor {
  return {
    userId: opts.id,
    email: `${opts.id}@tappyai.com`,
    isOwner: opts.isOwner ?? false,
    roles,
    highestRole: roles.length ? roles[roles.length - 1] : null,
    capabilities: NO_CAPABILITIES,
    source: 'cookie',
    resolvedAt: 0,
  }
}
const member = (userId: string, departmentId: DepartmentId, orgRole: OrgRole, scope: OrgScope, status: 'active' | 'suspended' = 'active'): DepartmentMembership =>
  ({ userId, departmentId, orgRole, scope, status })
const assignReq = (over: Partial<DelegationRequest> = {}): DelegationRequest =>
  ({ targetUserId: 'newbie', targetDepartment: 'marketing', targetOrgRole: 'EMPLOYEE', targetScope: 'marketing', ...over })

function harness(seed: DepartmentMembership[] = []) {
  const audits: AuditParams[] = []
  const repo = inMemoryMembershipRepository(seed)
  const deps = { repo, audit: (p: AuditParams) => { audits.push(p) } }
  return { repo, deps, audits }
}

const OWNER = () => actor([], { isOwner: true, id: 'owner' })
const superHead = (id: string, dept: DepartmentId) => actor(['super_admin'], { id })

// ── A / M — Ultimate Owner ────────────────────────────────────────────────────
describe('A — Ultimate Owner', () => {
  it('assigns an Employee in any department', async () => {
    const { deps, repo } = harness()
    const r = await assignMembership(OWNER(), assignReq({ targetDepartment: 'finance', targetScope: 'finance' }), deps)
    expect(r.ok).toBe(true)
    expect(await repo.find('newbie', 'finance')).toMatchObject({ orgRole: 'EMPLOYEE', status: 'active' })
  })
  it('cannot mint another Ultimate Owner via membership', async () => {
    const { deps } = harness()
    const r = await assignMembership(OWNER(), assignReq({ targetOrgRole: 'ULTIMATE_OWNER' as OrgRole }), deps)
    expect(r).toEqual({ ok: false, reason: 'OWNER_IS_SINGULAR' })
  })
  it('cannot modify the Ultimate Owner', async () => {
    const { deps } = harness()
    const r = await assignMembership(OWNER(), assignReq({ targetIsOwner: true }), deps)
    expect(r).toEqual({ ok: false, reason: 'CANNOT_MODIFY_OWNER' })
  })
})

// ── B — Department Head ─────────────────────────────────────────────────────────
describe('B — Department Head (super_admin + Head of marketing)', () => {
  const seedHead = () => [member('headA', 'marketing', 'DEPARTMENT_HEAD', 'marketing')]
  it('assigns an Employee within their own department', async () => {
    const { deps, repo } = harness(seedHead())
    const r = await assignMembership(superHead('headA', 'marketing'), assignReq({ targetOrgRole: 'EMPLOYEE' }), deps)
    expect(r.ok).toBe(true)
    expect(await repo.find('newbie', 'marketing')).toMatchObject({ orgRole: 'EMPLOYEE' })
  })
  it('assigns a Manager within their own department (explicit policy: HEAD_ASSIGNABLE = Manager|Employee)', async () => {
    const { deps, repo } = harness(seedHead())
    const r = await assignMembership(superHead('headA', 'marketing'), assignReq({ targetOrgRole: 'DEPARTMENT_MANAGER' }), deps)
    expect(r.ok).toBe(true)
    expect(await repo.find('newbie', 'marketing')).toMatchObject({ orgRole: 'DEPARTMENT_MANAGER' })
  })
  it('cannot assign into another department', async () => {
    const { deps } = harness(seedHead())
    const r = await assignMembership(superHead('headA', 'marketing'), assignReq({ targetDepartment: 'engineering', targetScope: 'engineering' }), deps)
    expect(r).toEqual({ ok: false, reason: 'NOT_DEPARTMENT_ADMIN' })
  })
  it('cannot create a peer Head', async () => {
    const { deps } = harness(seedHead())
    const r = await assignMembership(superHead('headA', 'marketing'), assignReq({ targetOrgRole: 'DEPARTMENT_HEAD' }), deps)
    expect(r).toEqual({ ok: false, reason: 'CANNOT_CREATE_PEER_OR_HIGHER' })
  })
  it('cannot grant GLOBAL scope (escalation)', async () => {
    const { deps } = harness(seedHead())
    const r = await assignMembership(superHead('headA', 'marketing'), assignReq({ targetScope: 'GLOBAL' }), deps)
    expect(r).toEqual({ ok: false, reason: 'SCOPE_ESCALATION' })
  })
  it('cannot grant authority to themselves', async () => {
    const { deps } = harness(seedHead())
    const r = await assignMembership(superHead('headA', 'marketing'), assignReq({ targetUserId: 'headA' }), deps)
    expect(r).toEqual({ ok: false, reason: 'CANNOT_SELF_GRANT' })
  })
})

// ── C — Manager cannot manage membership (only Head/Owner) ──────────────────────
describe('C — Manager has no membership-management authority', () => {
  it('a super_admin Manager (not Head) cannot assign', async () => {
    const { deps } = harness([member('mgr', 'marketing', 'DEPARTMENT_MANAGER', 'marketing')])
    const r = await assignMembership(actor(['super_admin'], { id: 'mgr' }), assignReq(), deps)
    expect(r).toEqual({ ok: false, reason: 'NOT_DEPARTMENT_ADMIN' })
  })
})

// ── E — authentication ≠ authorization ──────────────────────────────────────────
describe('E — no membership', () => {
  it('a super_admin with no department membership cannot manage a department', async () => {
    const { deps } = harness()
    const r = await assignMembership(actor(['super_admin'], { id: 'nomem' }), assignReq(), deps)
    expect(r).toEqual({ ok: false, reason: 'NOT_DEPARTMENT_ADMIN' })
  })
})

// ── F — suspended authority ─────────────────────────────────────────────────────
describe('F — suspended Head has no authority', () => {
  it('a suspended Head cannot manage their department', async () => {
    const { deps } = harness([member('susHead', 'marketing', 'DEPARTMENT_HEAD', 'marketing', 'suspended')])
    const r = await assignMembership(actor(['super_admin'], { id: 'susHead' }), assignReq(), deps)
    expect(r).toEqual({ ok: false, reason: 'NOT_DEPARTMENT_ADMIN' })
  })
})

// ── G — unauthenticated ─────────────────────────────────────────────────────────
describe('G — unauthenticated', () => {
  it('null actor is denied', async () => {
    const { deps } = harness()
    const r = await assignMembership(null, assignReq(), deps)
    expect(r).toEqual({ ok: false, reason: 'UNAUTHENTICATED' })
  })
})

// ── PDP composition — a PDP denial always wins ─────────────────────────────────
describe('PDP composition (real engine)', () => {
  it('PDP deny wins: an admin-role Head (lacks security.roles.grant) is denied before scope', async () => {
    // admin does NOT hold security.roles.grant (super_admin only) — even though
    // this actor IS a Head of marketing, the PDP gate denies first.
    const { deps } = harness([member('adminHead', 'marketing', 'DEPARTMENT_HEAD', 'marketing')])
    const r = await assignMembership(actor(['admin'], { id: 'adminHead' }), assignReq(), deps)
    expect(r).toEqual({ ok: false, reason: 'PERMISSION_DENIED' })
  })
  it('scope deny wins: PDP allows (super_admin) but the department authority denies', async () => {
    const { deps } = harness([member('headA', 'marketing', 'DEPARTMENT_HEAD', 'marketing')])
    const r = await assignMembership(superHead('headA', 'marketing'), assignReq({ targetDepartment: 'finance', targetScope: 'finance' }), deps)
    expect(r).toEqual({ ok: false, reason: 'NOT_DEPARTMENT_ADMIN' })
  })
})

// ── suspend / reactivate / remove ───────────────────────────────────────────────
describe('status + remove', () => {
  it('Owner suspends then reactivates an existing membership', async () => {
    const { deps, repo } = harness([member('emp', 'finance', 'EMPLOYEE', 'finance')])
    expect((await setMembershipStatus(OWNER(), { targetUserId: 'emp', departmentId: 'finance', status: 'suspended' }, deps)).ok).toBe(true)
    expect(await repo.find('emp', 'finance')).toMatchObject({ status: 'suspended' })
    expect((await setMembershipStatus(OWNER(), { targetUserId: 'emp', departmentId: 'finance', status: 'active' }, deps)).ok).toBe(true)
    expect(await repo.find('emp', 'finance')).toMatchObject({ status: 'active' })
  })
  it('Head suspends a member of their own department; not another department', async () => {
    const { deps } = harness([
      member('headA', 'marketing', 'DEPARTMENT_HEAD', 'marketing'),
      member('empM', 'marketing', 'EMPLOYEE', 'marketing'),
      member('empE', 'engineering', 'EMPLOYEE', 'engineering'),
    ])
    expect((await setMembershipStatus(superHead('headA', 'marketing'), { targetUserId: 'empM', departmentId: 'marketing', status: 'suspended' }, deps)).ok).toBe(true)
    expect(await setMembershipStatus(superHead('headA', 'marketing'), { targetUserId: 'empE', departmentId: 'engineering', status: 'suspended' }, deps))
      .toEqual({ ok: false, reason: 'NOT_DEPARTMENT_ADMIN' })
  })
  it('cannot suspend the Ultimate Owner', async () => {
    const { deps } = harness([member('emp', 'finance', 'EMPLOYEE', 'finance')])
    const r = await setMembershipStatus(OWNER(), { targetUserId: 'emp', targetIsOwner: true, departmentId: 'finance', status: 'suspended' }, deps)
    expect(r).toEqual({ ok: false, reason: 'CANNOT_MODIFY_OWNER' })
  })
  it('remove requires an existing membership', async () => {
    const { deps } = harness()
    expect(await removeMembership(OWNER(), { targetUserId: 'ghost', departmentId: 'finance' }, deps)).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })
  it('an admin-role actor (no PDP grant) cannot suspend', async () => {
    const { deps } = harness([member('emp', 'finance', 'EMPLOYEE', 'finance')])
    expect(await setMembershipStatus(actor(['admin'], { id: 'x' }), { targetUserId: 'emp', departmentId: 'finance', status: 'suspended' }, deps))
      .toEqual({ ok: false, reason: 'PERMISSION_DENIED' })
  })
})

// ── list (read permission) ──────────────────────────────────────────────────────
describe('listMemberships (read gate)', () => {
  it('super_admin may read; an analyst may not', async () => {
    const { deps } = harness([member('emp', 'finance', 'EMPLOYEE', 'finance')])
    expect((await listMemberships(actor(['super_admin'], { id: 's' }), 'emp', deps)).ok).toBe(true)
    expect(await listMemberships(actor(['analyst'], { id: 'a' }), 'emp', deps)).toEqual({ ok: false, reason: 'PERMISSION_DENIED' })
  })
})

// ── Audit ───────────────────────────────────────────────────────────────────────
describe('audit', () => {
  it('a successful assignment is audited', async () => {
    const { deps, audits } = harness([member('headA', 'marketing', 'DEPARTMENT_HEAD', 'marketing')])
    await assignMembership(superHead('headA', 'marketing'), assignReq(), deps)
    expect(audits.map((a) => a.action)).toContain('org.membership_assigned')
  })
  it('a denied sensitive assignment is audited', async () => {
    const { deps, audits } = harness([member('headA', 'marketing', 'DEPARTMENT_HEAD', 'marketing')])
    await assignMembership(superHead('headA', 'marketing'), assignReq({ targetDepartment: 'engineering', targetScope: 'engineering' }), deps)
    expect(audits.map((a) => a.action)).toContain('org.membership.assign.denied')
  })
})
