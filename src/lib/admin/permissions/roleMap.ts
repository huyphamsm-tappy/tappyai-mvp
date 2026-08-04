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

export type RolePermissionMap = ReadonlyMap<AdminRole, ReadonlySet<PermissionId>>

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
  // Genuinely immutable, not just `ReadonlySet`-typed.
  //
  // The audit caught this claiming protection it did not provide: `ReadonlySet`
  // is erased at compile time, and `Object.freeze` does NOT stop `Set.add` —
  // so every role's permission set was writable at runtime through a shared
  // reference. On the authorization hot path that is a privilege-escalation
  // surface, however in-process. `sealSet` closes it for real.
  const frozen = new Map<AdminRole, ReadonlySet<PermissionId>>()
  for (const [role, set] of map) frozen.set(role, sealSet(set))
  return frozen
}

/** A Set that throws on mutation, so the map cannot be widened after build. */
function sealSet(set: ReadonlySet<PermissionId>): ReadonlySet<PermissionId> {
  const deny = (): never => {
    throw new TypeError('[permissions] the role→permission map is immutable')
  }
  const sealed = new Set(set)
  return Object.freeze(
    Object.assign(sealed, { add: deny, delete: deny, clear: deny })
  ) as ReadonlySet<PermissionId>
}

/** Permissions a single role holds. Empty set for a role with no declared permissions. */
export function permissionsForRole(map: RolePermissionMap, role: AdminRole): ReadonlySet<PermissionId> {
  return map.get(role) ?? new Set<PermissionId>()
}

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
