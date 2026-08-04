// Controller V2 — Component 3 (RBAC): the Permission Resolver.
//
//   Actor → Roles[] → Permission Registry → Resolved Permission Set
//
// Pure with respect to its inputs: given the same actor, registry and cache
// state it always produces the same set. It performs no I/O — `Actor.roles` was
// already fetched by Component 2's principal resolver.
//
// The Platform Owner never reaches this file. Owner bypass happens in
// `engine.ts` before resolution begins, so ownership is not modelled as a role,
// a permission, or a special case inside the pipeline.

import type { Actor } from '@/lib/admin/rbac'
import type { ResolvedPermissionSet } from './types'
import type { PermissionRegistry } from './registry'
import { buildRolePermissionMap, unionPermissions, type RolePermissionMap } from './roleMap'
import { makeResolvedSet, type PermissionCache } from './cache'

export interface Resolver {
  resolve(actor: Actor, now?: number): ResolvedPermissionSet
  /** Exposed for diagnostics and the RBAC admin UI, not for authorization. */
  readonly roleMap: RolePermissionMap
}

export function createResolver(registry: PermissionRegistry, cache: PermissionCache): Resolver {
  // Built once per resolver. The registry is immutable, so the map is too —
  // rebuilding per request would be pure waste.
  const roleMap = buildRolePermissionMap(registry)

  return {
    roleMap,

    resolve(actor: Actor, now: number = Date.now()): ResolvedPermissionSet {
      const cached = cache.get(actor.userId, actor.roles, registry.version, now)
      if (cached) return cached

      // Union across all roles, sorted — see roleMap.unionPermissions for why
      // union rather than maximum.
      const permissions = unionPermissions(roleMap, actor.roles)
      const set = makeResolvedSet(actor.userId, permissions, actor.roles, registry.version, now)

      cache.set(actor.userId, actor.roles, registry.version, set, now)
      return set
    },
  }
}
