// Controller V2 — Component 3 (RBAC): public surface of the Permission Engine.
//
// IMPORT BOUNDARY — this barrel re-exports the SERVER guards, so importing it
// from a client component pulls in `next/headers`. Client components must
// import `@/lib/admin/permissions/client` directly.
//
// MIGRATION STATUS — COMPLETE
// All 18 authorization decision points (12 API handlers, 6 page guards) consume
// this engine. `requireAdminRole` and the rank ladder are superseded:
// `requireAdminRole` is @deprecated with zero production callers, and
// `page-guard.ts` was deleted outright. `ROLE_RANK`/`hasRole` survive only to
// compute a display label and to power the backward-compatibility lock in
// `migration.test.ts` — never to make an authorization decision.

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
