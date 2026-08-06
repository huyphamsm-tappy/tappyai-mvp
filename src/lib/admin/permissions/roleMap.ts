// Controller V2 — Component 3 (RBAC): Role → Permission mapping.
//
// The mapping is DERIVED from the registry's `defaultRoles`, never written out
// separately. A second hand-maintained table would be free to disagree with the
// registry, and the disagreement would be silent.
//
// Note what this replaces: the four-rung `ROLE_RANK` ladder, where a role
// inherited everything below it. A ladder is totally ordered and the real
// permission matrix is not — it cannot express "high in Commerce, zero in
// Security". Here each role gets exactly the permissions declared for it, so a
// role can be broad in one module and absent from another.

import type { AdminRole } from '@/lib/admin/roles'
import type { PermissionId } from './types'
import type { PermissionRegistry } from './registry'

/**
 * A read-only view of one role's permissions.
 *
 * Deliberately NOT `ReadonlySet`: that type is satisfied only by a real `Set`,
 * and a real `Set` can always be mutated through `Set.prototype` regardless of
 * how it is typed or frozen. Declaring the two operations actually needed lets
 * the map hand out something with no mutable interior at all.
 */
export interface PermissionSetView extends Iterable<PermissionId> {
  has(permission: PermissionId): boolean
  readonly size: number
}

export type RolePermissionMap = ReadonlyMap<AdminRole, PermissionSetView>

/**
 * Build the role → permission map from a registry.
 *
 * Deterministic: derived from a single pass over the definitions, so the same
 * registry always produces the same map.
 */
export function buildRolePermissionMap(registry: PermissionRegistry): RolePermissionMap {
  const map = new Map<AdminRole, Set<PermissionId>>()
  for (const definition of registry.all) {
    for (const role of definition.defaultRoles) {
      let set = map.get(role)
      if (!set) {
        set = new Set<PermissionId>()
        map.set(role, set)
      }
      set.add(definition.id)
    }
  }
  const frozen = new Map<AdminRole, PermissionSetView>()
  for (const [role, set] of map) frozen.set(role, immutableSet(set))
  return frozen
}

/**
 * A genuinely immutable permission-set view.
 *
 * This took two attempts, and the failures are the interesting part:
 *
 *  1. Returning the `Set` typed as `ReadonlySet` protects nothing — the type is
 *     erased at compile time, so `map.get('analyst').add(...)` widened a role at
 *     runtime, process-wide, on the authorization hot path.
 *  2. Overriding `add`/`delete`/`clear` on the Set and freezing it protects
 *     nothing either: `Set.prototype.add.call(theSet, x)` reaches the internal
 *     [[SetData]] directly, straight past the overrides. The PR review proved
 *     this — `analyst` gained `security.roles.grant`.
 *
 * The fix is to not hand out a `Set` at all. This object has no [[SetData]] of
 * its own, so every `Set.prototype` method throws "incompatible receiver"
 * instead of mutating it. The real set stays captured in this closure,
 * unreachable from any caller.
 */
function immutableSet(source: ReadonlySet<PermissionId>): PermissionSetView {
  const inner = new Set(source)
  return Object.freeze({
    has: (value: PermissionId) => inner.has(value),
    size: inner.size,
    [Symbol.iterator]: () => inner[Symbol.iterator](),
  })
}

/** Permissions a single role holds. Empty set for a role with no declared permissions. */
export function permissionsForRole(map: RolePermissionMap, role: AdminRole): PermissionSetView {
  return map.get(role) ?? EMPTY_PERMISSION_SET
}

const EMPTY_PERMISSION_SET: PermissionSetView = Object.freeze({
  has: () => false,
  size: 0,
  [Symbol.iterator]: function* () {},
})

/**
 * Union of the permissions held by every supplied role.
 *
 * Union, not maximum: an actor holding several roles gets the combination, and
 * a role's absence never subtracts. This is why `Actor.roles` had to become a
 * list in Component 2 — collapsing to the highest rank discarded exactly the
 * information this function needs.
 *
 * Returned sorted so the resolved set is byte-stable across calls.
 */
export function unionPermissions(
  map: RolePermissionMap,
  roles: readonly AdminRole[]
): PermissionId[] {
  const out = new Set<PermissionId>()
  for (const role of roles) {
    for (const id of permissionsForRole(map, role)) out.add(id)
  }
  return [...out].sort()
}
