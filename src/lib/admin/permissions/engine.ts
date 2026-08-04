// Controller V2 — Component 3 (RBAC): the Permission Engine.
//
// The Policy Decision Point. Every authorization decision in the Controller
// resolves to exactly one call to `authorize()`.
//
// DECISION ORDER — the order is the security property:
//
//   1. Owner bypass        → ALLOW (OWNER_BYPASS), audited by the caller
//   2. Permission declared? → DENY (UNKNOWN_PERMISSION) if not — fail closed
//   3. Capability available? → DENY (CAPABILITY_UNAVAILABLE) — INERT until C5
//   4. Grant present?       → ALLOW (ROLE_GRANT) / DENY (NO_GRANT)
//
// Step 1 comes first so the Owner never depends on the registry being correct,
// on a role being granted, or on the cache being warm. Ownership is enforced by
// the Owner Guard and by the database; RBAC neither grants nor withholds it.
//
// Step 2 comes before step 4 so a typo'd or retired permission is a loud denial
// rather than a silent allow.

import type { Actor } from '@/lib/admin/rbac'
import type { Decision, PermissionDefinition, PermissionId, ResolvedPermissionSet } from './types'
import { permissionRegistry, type PermissionRegistry } from './registry'
import { permissionCache, type PermissionCache } from './cache'
import { createResolver, type Resolver } from './resolver'

/**
 * Capability gating is DISABLED until the Capability Registry ships
 * (Component 5).
 *
 * `Actor.capabilities` is `NO_CAPABILITIES` today, and its documented contract
 * is "the registry is not installed" — NOT "this actor has no capabilities".
 * Gating on it now would deny every actor, including the Platform Owner. The
 * hook exists and is tested so Component 5 flips one flag instead of
 * redesigning the decision path.
 */
export const CAPABILITY_GATE_ENABLED = false

export interface PermissionEngine {
  readonly registry: PermissionRegistry
  readonly resolver: Resolver
  resolve(actor: Actor, now?: number): ResolvedPermissionSet
  authorize(actor: Actor | null, permission: PermissionId, now?: number): Decision
  /** True/false convenience over `authorize`. Never use for security-critical branching where the reason matters. */
  can(actor: Actor | null, permission: PermissionId, now?: number): boolean
  /** Permissions the actor holds. The Owner reports the full catalogue. */
  listPermissions(actor: Actor, now?: number): readonly PermissionId[]
  /** Deprecated permissions the actor currently holds — migration signal, not a denial. */
  deprecatedHeldBy(actor: Actor, now?: number): readonly PermissionDefinition[]
  invalidate(userId: string): void
  clearCache(): void
}

export function createPermissionEngine(
  registry: PermissionRegistry = permissionRegistry,
  cache: PermissionCache = permissionCache,
  options: { capabilityGateEnabled?: boolean } = {}
): PermissionEngine {
  const resolver = createResolver(registry, cache)
  const capabilityGate = options.capabilityGateEnabled ?? CAPABILITY_GATE_ENABLED

  function authorize(actor: Actor | null, permission: PermissionId, now?: number): Decision {
    if (!actor) {
      return { allowed: false, reason: 'UNAUTHENTICATED', permission }
    }

    // 1. Owner bypass — before the registry, before the resolver, before the
    //    cache. The Owner is outside RBAC entirely.
    if (actor.isOwner) {
      return { allowed: true, reason: 'OWNER_BYPASS', permission }
    }

    // 2. Fail closed on anything the registry does not declare.
    const definition = registry.get(permission)
    if (!definition) {
      return {
        allowed: false,
        reason: 'UNKNOWN_PERMISSION',
        permission,
        detail: 'not declared in the permission registry',
      }
    }

    // 3. Capability gate — inert until Component 5. See CAPABILITY_GATE_ENABLED.
    if (capabilityGate && !actor.capabilities.includes(definition.capability)) {
      return {
        allowed: false,
        reason: 'CAPABILITY_UNAVAILABLE',
        permission,
        detail: `capability ${definition.capability} is not available to this actor`,
      }
    }

    // 4. Grant.
    //    Deprecated permissions still authorize — silently dropping them would
    //    revoke access as a side effect of a documentation change.
    const set = resolver.resolve(actor, now)
    if (!set.has(permission)) {
      return {
        allowed: false,
        reason: 'NO_GRANT',
        permission,
        detail: `held by roles: ${definition.defaultRoles.join(', ') || 'none'}`,
      }
    }

    return { allowed: true, reason: 'ROLE_GRANT', permission }
  }

  return {
    registry,
    resolver,
    resolve: (actor, now) => resolver.resolve(actor, now),
    authorize,
    can: (actor, permission, now) => authorize(actor, permission, now).allowed,

    listPermissions(actor, now) {
      // The Owner holds everything by bypass; reporting only role-derived
      // permissions would misrepresent what they can actually do in the UI.
      if (actor.isOwner) return registry.all.map((d) => d.id).sort()
      return resolver.resolve(actor, now).permissions
    },

    deprecatedHeldBy(actor, now) {
      const held = new Set(this.listPermissions(actor, now))
      return registry.deprecated().filter((d) => held.has(d.id))
    },

    invalidate: (userId) => cache.invalidate(userId),
    clearCache: () => cache.clear(),
  }
}

/** The engine used by route guards, page guards and UI helpers. */
export const permissionEngine = createPermissionEngine()
