import { describe, it, expect } from 'vitest'
import { authorizeDepartmentResource, visibleDepartmentIds } from '../authorization'
import { DEPARTMENTS, DEPARTMENT_IDS } from '../departments'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { NO_CAPABILITIES } from '@/lib/admin/capabilities'
import type { Actor, AdminRole } from '@/lib/admin/rbac'
import type { DepartmentId, DepartmentMembership, OrgRole, OrgScope } from '../types'

// FOUNDATION Department Architecture — the authorization CHAIN is proven with
// the REAL permission engine (no PDP mock): permission is decided by the
// canonical PDP; the department SCOPE / OWNERSHIP / cross-department ACCESS gate
// only further restricts. dashboard.home.view (held by every role) is used where
// a test isolates the SCOPE dimension, so the PDP always passes and scope is
// what's under test — the engine is real, not mocked.

function actor(roles: AdminRole[], opts: { isOwner?: boolean; id?: string } = {}): Actor {
  return {
    userId: opts.id ?? `u-${roles.join('-') || 'none'}`,
    email: 'x@tappyai.com',
    isOwner: opts.isOwner ?? false,
    roles,
    highestRole: roles.length ? roles[roles.length - 1] : null,
    capabilities: NO_CAPABILITIES,
    source: 'cookie',
    resolvedAt: 0,
  }
}
const member = (userId: string, departmentId: DepartmentId, orgRole: OrgRole, scope: OrgScope): DepartmentMembership =>
  ({ userId, departmentId, orgRole, scope, status: 'active' })

const HOME = PERMISSIONS.DASHBOARD_HOME_VIEW

describe('Department registry (data, not logic)', () => {
  it('has all 15 owner-approved departments', () => {
    expect(DEPARTMENT_IDS).toHaveLength(15)
  })
  it('only commerce, marketing, ai_data are defined; the rest are placeholders with empty business scope', () => {
    const defined = DEPARTMENT_IDS.filter((d) => DEPARTMENTS[d].status === 'defined').sort()
    expect(defined).toEqual(['ai_data', 'commerce', 'marketing'])
    for (const d of DEPARTMENT_IDS) {
      if (DEPARTMENTS[d].status === 'placeholder') {
        expect(DEPARTMENTS[d].ownedPermissions, `${d} placeholder owns nothing`).toHaveLength(0)
        expect(DEPARTMENTS[d].modules, `${d} placeholder has no modules`).toHaveLength(0)
      }
    }
  })
  it('marketing is defined but honestly owns no established capability yet', () => {
    expect(DEPARTMENTS.marketing.status).toBe('defined')
    expect(DEPARTMENTS.marketing.ownedPermissions).toHaveLength(0)
  })
})

describe('authorization chain — scope isolation (real PDP, dashboard.home.view)', () => {
  it('Ultimate Owner reaches any department (GLOBAL)', () => {
    const r = authorizeDepartmentResource(actor([], { isOwner: true }), [], { ownerDepartment: 'engineering', permission: HOME })
    expect(r).toEqual({ allowed: true, reason: 'ULTIMATE_OWNER' })
  })
  it('Marketing member → Marketing resource: ALLOW (owned scope)', () => {
    const a = actor(['admin'], { id: 'mkt' })
    const r = authorizeDepartmentResource(a, [member('mkt', 'marketing', 'DEPARTMENT_HEAD', 'marketing')], { ownerDepartment: 'marketing', permission: HOME })
    expect(r).toEqual({ allowed: true, reason: 'OWNED_SCOPE' })
  })
  it('Marketing member → Engineering resource: DENY (isolation)', () => {
    const a = actor(['admin'], { id: 'mkt' })
    const r = authorizeDepartmentResource(a, [member('mkt', 'marketing', 'DEPARTMENT_HEAD', 'marketing')], { ownerDepartment: 'engineering', permission: HOME })
    expect(r.allowed).toBe(false)
    expect(r).toMatchObject({ reason: 'SCOPE_DENIED' })
  })
  it('Engineering member → Marketing resource: DENY (isolation)', () => {
    const a = actor(['admin'], { id: 'eng' })
    const r = authorizeDepartmentResource(a, [member('eng', 'engineering', 'EMPLOYEE', 'engineering')], { ownerDepartment: 'marketing', permission: HOME })
    expect(r).toMatchObject({ allowed: false, reason: 'SCOPE_DENIED' })
  })
  it('Department Head cannot escalate to another department (no cross scope)', () => {
    const head = actor(['super_admin'], { id: 'mktHead' }) // even a super_admin admin-role is scope-bound
    const r = authorizeDepartmentResource(head, [member('mktHead', 'marketing', 'DEPARTMENT_HEAD', 'marketing')], { ownerDepartment: 'finance', permission: HOME })
    expect(r).toMatchObject({ allowed: false, reason: 'SCOPE_DENIED' })
  })
})

describe('authentication ≠ authorization', () => {
  it('authenticated identity with NO department membership cannot reach a department resource — even as super_admin', () => {
    const r = authorizeDepartmentResource(actor(['super_admin'], { id: 'nomem' }), [], { ownerDepartment: 'marketing', permission: HOME })
    expect(r).toMatchObject({ allowed: false, reason: 'NO_MEMBERSHIP' })
  })
  it('unauthenticated (null actor) is denied by the PDP', () => {
    const r = authorizeDepartmentResource(null, [], { ownerDepartment: 'marketing', permission: HOME })
    expect(r).toMatchObject({ allowed: false, reason: 'PERMISSION_DENIED' })
  })
})

describe('data ownership ≠ data access (cross-department)', () => {
  it('super_admin holds the commerce read permission (real PDP precondition)', () => {
    expect(permissionEngine.can(actor(['super_admin']), PERMISSIONS.COMMERCE_DEALS_READ)).toBe(true)
  })
  it('AI/Data → Commerce READ: ALLOW via governed cross-department access (not ownership)', () => {
    const data = actor(['super_admin'], { id: 'data' })
    const r = authorizeDepartmentResource(data, [member('data', 'ai_data', 'EMPLOYEE', 'ai_data')], { ownerDepartment: 'commerce', permission: PERMISSIONS.COMMERCE_DEALS_READ })
    expect(r).toEqual({ allowed: true, reason: 'CROSS_DEPARTMENT_ACCESS' })
  })
  it('AI/Data → Commerce WRITE: DENY (access is read/analyze only, never ownership)', () => {
    const data = actor(['super_admin'], { id: 'data' })
    const r = authorizeDepartmentResource(data, [member('data', 'ai_data', 'EMPLOYEE', 'ai_data')], { ownerDepartment: 'commerce', permission: 'commerce.deals.create' })
    expect(r).toMatchObject({ allowed: false, reason: 'SCOPE_DENIED' })
  })
})

describe('PDP integration + fail-closed', () => {
  it('permission the actor lacks → PERMISSION_DENIED (staff cannot grant roles)', () => {
    const staff = actor(['analyst'], { id: 'staff' })
    expect(permissionEngine.can(staff, 'security.roles.grant')).toBe(false) // precondition, real PDP
    const r = authorizeDepartmentResource(staff, [member('staff', 'marketing', 'EMPLOYEE', 'marketing')], { ownerDepartment: 'marketing', permission: 'security.roles.grant' })
    expect(r).toMatchObject({ allowed: false, reason: 'PERMISSION_DENIED' })
  })
  it('unknown permission fails closed', () => {
    const r = authorizeDepartmentResource(actor(['super_admin']), [member('u-super_admin', 'marketing', 'DEPARTMENT_HEAD', 'marketing')], { ownerDepartment: 'marketing', permission: 'totally.unknown.permission' })
    expect(r).toMatchObject({ allowed: false, reason: 'PERMISSION_DENIED' })
  })
  it('unknown department fails closed', () => {
    const r = authorizeDepartmentResource(actor([], { isOwner: true }), [], { ownerDepartment: 'nope' as DepartmentId, permission: HOME })
    expect(r).toMatchObject({ allowed: false, reason: 'UNKNOWN_DEPARTMENT' })
  })
})

describe('navigation foundation', () => {
  it('owner sees GLOBAL; a member sees only their departments', () => {
    expect(visibleDepartmentIds(actor([], { isOwner: true }), [])).toEqual(['GLOBAL'])
    expect(visibleDepartmentIds(actor(['admin'], { id: 'm' }), [member('m', 'marketing', 'EMPLOYEE', 'marketing')])).toEqual(['marketing'])
  })
})
