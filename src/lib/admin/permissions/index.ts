// Controller V2 — Component 3 (RBAC): public surface of the Permission Engine.
//
// IMPORT BOUNDARY — this barrel re-exports the SERVER guards, so importing it
// from a client component pulls in `next/headers`. Client components must
// import `@/lib/admin/permissions/client` directly.
//
// MIGRATION STATUS — COMPLETE
// All 20 authorization decision points (12 API handlers, 8 page guards)
// consume this engine, and Component 4 removed every alternative:
// `requireAdminRole`, `resolveAdminRole` and `page-guard.ts` are all DELETED.
// `ROLE_RANK`/`hasRole` survive only to compute a display label, to gate
// disabled nav placeholders, and to power the backward-compatibility lock in
// `migration.test.ts` — never to make an authorization decision. That is
// asserted by `singleDecisionPath.test.ts`.

export type {
  PermissionId,
  PermissionDefinition,
  PermissionCategory,
  RiskLevel,
  Decision,
  AllowReason,
  DenyReason,
  ResolvedPermissionSet,
} from './types'

export {
  PERMISSIONS,
  permissionRegistry,
  createRegistry,
  REGISTRY_VERSION,
  type PermissionRegistry,
  type KnownPermissionId,
} from './registry'

export {
  buildRolePermissionMap,
  permissionsForRole,
  unionPermissions,
  type RolePermissionMap,
} from './roleMap'

export {
  createPermissionCache,
  permissionCache,
  makeResolvedSet,
  rolesCacheKey,
  PERMISSION_CACHE_TTL_MS,
  type PermissionCache,
} from './cache'

export { createResolver, type Resolver } from './resolver'

export {
  createPermissionEngine,
  permissionEngine,
  CAPABILITY_GATE_ENABLED,
  type PermissionEngine,
} from './engine'

// Server-only.
export {
  requirePermission,
  requirePagePermission,
  type PermissionContext,
} from './guards'
