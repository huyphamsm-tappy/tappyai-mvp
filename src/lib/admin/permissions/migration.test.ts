import { describe, it, expect } from 'vitest'
import { ROLE_RANK, hasRole, type AdminRole } from '@/lib/admin/roles'
import { permissionRegistry, PERMISSIONS } from './registry'
import { buildRolePermissionMap, permissionsForRole } from './roleMap'
import type { PermissionId } from './types'

// Controller V2 — Component 3: BACKWARD COMPATIBILITY LOCK.
//
// Component 3 replaced role-rank gates (`requireAdminRole(req, 'admin')`) with
// permission gates (`requirePermission(req, PERMISSIONS.X)`) at every
// authorization decision point. That is a mechanism change, and a mechanism
// change must not quietly become a POLICY change — nobody should gain or lose
// access because the plumbing moved.
//
// This table is the machine-checked proof. Each row records the role that the
// call site required BEFORE the migration; the test expands it through the old
// ROLE_RANK ladder and asserts the permission grants exactly that set.
//
// If a future change intends to widen or narrow access, the row must be edited
// deliberately — which is the point. A silent drift fails here.

const ALL_ROLES: AdminRole[] = Object.keys(ROLE_RANK) as AdminRole[]

/** The set of roles the old ladder admitted for a given minimum. */
function rolesAtOrAbove(minRole: AdminRole): AdminRole[] {
  return ALL_ROLES.filter((r) => hasRole(r, minRole)).sort()
}

/** The set of roles the registry grants a permission to. */
function rolesGranted(permission: PermissionId): AdminRole[] {
  const map = buildRolePermissionMap(permissionRegistry)
  return ALL_ROLES.filter((r) => permissionsForRole(map, r).has(permission)).sort()
}

// The pre-migration gate at every migrated call site. Verified against
// git 35233a4 (the original branch point) and re-checked after the rebase onto
// 0654f45, which touches no admin file — see RBAC_MANIFEST.md for the file list.
const MIGRATED: Array<{ site: string; legacyMinRole: AdminRole; permission: PermissionId }> = [
  // Pages
  { site: 'admin/analytics/activation/page.tsx', legacyMinRole: 'analyst', permission: PERMISSIONS.ANALYTICS_ACTIVATION_READ },
  { site: 'admin/analytics/auth/page.tsx', legacyMinRole: 'analyst', permission: PERMISSIONS.ANALYTICS_AUTH_READ },
  { site: 'admin/audit/page.tsx', legacyMinRole: 'admin', permission: PERMISSIONS.AUDIT_LOG_READ },
  { site: 'admin/deals/page.tsx', legacyMinRole: 'admin', permission: PERMISSIONS.COMMERCE_DEALS_READ },
  { site: 'admin/rbac/page.tsx', legacyMinRole: 'super_admin', permission: PERMISSIONS.SECURITY_ROLES_READ },
  { site: 'admin/settings/page.tsx', legacyMinRole: 'admin', permission: PERMISSIONS.SETTINGS_CONFIG_READ },
  // API handlers
  { site: 'api/admin/analytics/activation GET', legacyMinRole: 'analyst', permission: PERMISSIONS.ANALYTICS_ACTIVATION_READ },
  { site: 'api/admin/analytics/auth GET', legacyMinRole: 'analyst', permission: PERMISSIONS.ANALYTICS_AUTH_READ },
  { site: 'api/admin/audit GET', legacyMinRole: 'admin', permission: PERMISSIONS.AUDIT_LOG_READ },
  { site: 'api/admin/deals GET', legacyMinRole: 'admin', permission: PERMISSIONS.COMMERCE_DEALS_READ },
  { site: 'api/admin/deals POST', legacyMinRole: 'admin', permission: PERMISSIONS.COMMERCE_DEALS_CREATE },
  { site: 'api/admin/deals/[id] PATCH', legacyMinRole: 'admin', permission: PERMISSIONS.COMMERCE_DEALS_UPDATE },
  { site: 'api/admin/deals/[id] DELETE', legacyMinRole: 'admin', permission: PERMISSIONS.COMMERCE_DEALS_DELETE },
  { site: 'api/admin/deals/upload POST', legacyMinRole: 'admin', permission: PERMISSIONS.COMMERCE_DEALS_UPLOAD_MEDIA },
  { site: 'api/admin/rbac/roles GET', legacyMinRole: 'super_admin', permission: PERMISSIONS.SECURITY_ROLES_READ },
  { site: 'api/admin/rbac/roles POST', legacyMinRole: 'super_admin', permission: PERMISSIONS.SECURITY_ROLES_GRANT },
  { site: 'api/admin/rbac/roles/[id] DELETE', legacyMinRole: 'super_admin', permission: PERMISSIONS.SECURITY_ROLES_REVOKE },
  { site: 'api/admin/settings GET', legacyMinRole: 'admin', permission: PERMISSIONS.SETTINGS_CONFIG_READ },
]

describe('Component 3 migration — no access changed', () => {
  it.each(MIGRATED)('$site: permission grants exactly the roles the ladder did', ({ legacyMinRole, permission }) => {
    expect(rolesGranted(permission)).toEqual(rolesAtOrAbove(legacyMinRole))
  })

  it('covers every migrated authorization decision point', () => {
    // 18 = 6 pages + 12 API handlers. A new gated handler must be added here.
    expect(MIGRATED).toHaveLength(18)
  })
})

// The two pages below had NO guard of their own before Component 3 — they
// relied on the /admin layout, which admits any admin. The permission audit
// added guards. These assertions prove the guards did not lock anyone out who
// could previously reach the page: "any admin" is every role in the ladder.
describe('Component 3 permission audit — newly guarded pages lock nobody out', () => {
  it.each([
    { site: 'admin/page.tsx', permission: PERMISSIONS.DASHBOARD_HOME_VIEW },
    { site: 'admin/analytics/page.tsx', permission: PERMISSIONS.ANALYTICS_CONTENT_READ },
  ])('$site grants every admin role, as the bare layout gate did', ({ permission }) => {
    expect(rolesGranted(permission)).toEqual([...ALL_ROLES].sort())
  })
})

// The role→permission map is what every authorization decision is derived from.
// The review found it was `ReadonlySet`-typed but writable at runtime, so a
// single stray `.add()` anywhere in the process could permanently widen a role.
describe('Component 3 — the role map cannot be widened at runtime', () => {
  it('rejects mutation of a role permission set', () => {
    const map = buildRolePermissionMap(permissionRegistry)
    const analyst = map.get('analyst') as unknown as Set<PermissionId>

    expect(() => analyst.add(PERMISSIONS.SECURITY_ROLES_GRANT)).toThrow(TypeError)
    expect(rolesGranted(PERMISSIONS.SECURITY_ROLES_GRANT)).toEqual(['super_admin'])
  })

  // The PR review defeated the FIRST fix with exactly this. Overriding `add` on
  // a Set and freezing it does nothing, because `Set.prototype.add.call` reaches
  // the internal slot directly — `analyst` really did gain `security.roles.grant`.
  it('rejects mutation through Set.prototype, not just the own methods', () => {
    const map = buildRolePermissionMap(permissionRegistry)
    const analyst = map.get('analyst') as unknown as Set<PermissionId>

    expect(() => Set.prototype.add.call(analyst, PERMISSIONS.SECURITY_ROLES_GRANT)).toThrow(TypeError)
    expect(() => Set.prototype.clear.call(analyst)).toThrow(TypeError)
    expect(() => Set.prototype.delete.call(analyst, PERMISSIONS.DASHBOARD_HOME_VIEW)).toThrow(TypeError)

    expect(analyst.has(PERMISSIONS.SECURITY_ROLES_GRANT)).toBe(false)
    expect(analyst.has(PERMISSIONS.DASHBOARD_HOME_VIEW)).toBe(true)
    expect(rolesGranted(PERMISSIONS.SECURITY_ROLES_GRANT)).toEqual(['super_admin'])
  })
})
