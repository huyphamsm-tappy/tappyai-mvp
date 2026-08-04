// Controller V2 — Component 3 (RBAC): public surface of the Permission Engine.
//
// IMPORT BOUNDARY — this barrel re-exports the SERVER guards, so importing it
// from a client component pulls in `next/headers`. Client components must
// import `@/lib/admin/permissions/client` directly.
//
// MIGRATION STATUS
// `requireAdminRole(req, minRole)` from Component 2 still exists and still
// works. Component 3 adds `requirePermission(req, PERMISSIONS.X)` alongside it;
// call sites move over per module. The rank ladder (`hasRole` / `ROLE_RANK`) is
// removed only once every call site has migrated — deleting it now would break
// authorization on any route not yet converted, which is precisely the kind of
// half-migrated state the Foundation review exists to prevent.

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
  requireAllPermissions,
  requirePagePermission,
  type PermissionContext,
} from './guards'
