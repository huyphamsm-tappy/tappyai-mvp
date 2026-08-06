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
import { buildRolePermissionMap, unionPermissions } from './roleMap'
import { makeResolvedSet, type PermissionCache } from './cache'

export interface Resolver {
  resolve(actor: Actor, now?: number): ResolvedPermissionSet
}

export function createResolver(registry: PermissionRegistry, cache: PermissionCache): Resolver {
  // Built once per resolver. The registry is immutable, so the map is too —
  // rebuilding per request would be pure waste.
  //
  // Deliberately NOT exposed on the Resolver interface (dead-code audit R-3):
  // it had no consumer, and publishing the map handed callers a reference to
  // the structure authorization is derived from. Callers that need to inspect
  // the mapping can call `buildRolePermissionMap` themselves and get their own
  // copy.
  const roleMap = buildRolePermissionMap(registry)

  return {
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
