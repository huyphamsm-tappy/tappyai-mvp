// Controller V2 — K-1: the actor↔capability binding.
//
// OWNER DECISION, 2026-08-22 (D-K1):
//
//   "For Controller V2, effective capabilities are initially derived from the
//    actor's effective role permissions. Capabilities are a read-only derived
//    abstraction, NOT an independently assigned authorization source.
//    requirePermission() remains the authoritative mechanism for action
//    authorization."
//
// WHAT THIS CLOSES. `FOUNDATION_01_CONTRACTS.md` §4 defines a capability as
// something a MODULE provides, with a provider and consumers. The PDP's third
// decision step tests `actor.capabilities`. Nothing authoritative said how an
// ACTOR acquires one — so the field existed, was documented as a reserved slot,
// and was permanently empty. That missing edge is what this file supplies, and
// it is the only thing it supplies.
//
// ⚠️ THIS GRANTS NOTHING. The projection runs in the opposite direction to
// authority: capabilities are read OFF the permissions an actor already holds.
// It is therefore impossible for this file to widen anyone's access — an actor
// with no permissions derives no capabilities, and an actor's permissions are
// decided entirely by `permissionEngine`, which never consults this output
// while the capability gate is off.
//
// 🔑 AND A CONSEQUENCE WORTH STATING, BECAUSE IT IS EASY TO MISREAD:
// role-derived capabilities make the PDP's capability gate VACUOUS. Since the
// derived set is `{ P.capability : P ∈ granted(actor) }`, any permission the
// actor holds necessarily contributes its own capability — so step 3 can never
// deny something step 4 would allow. Turning the gate on would add no
// protection. It stops being vacuous only once a source can supply or withhold
// a capability INDEPENDENTLY of the permission, which is exactly why the
// resolution boundary below is a list of sources rather than a single function.
//
// NOT DONE HERE, deliberately: no table, no column, no API, no CRUD, no UI, no
// direct assignment of any kind, and `CAPABILITY_GATE_ENABLED` is untouched.

import type { AdminRole } from '@/lib/admin/roles'
import { permissionRegistry } from './permissions/registry'
import { buildRolePermissionMap, permissionsForRole } from './permissions/roleMap'
import { NO_CAPABILITIES, type CapabilityId } from './capabilities'

/**
 * Everything a capability source is allowed to see.
 *
 * 🔑 THE NARROWNESS IS THE SECURITY PROPERTY, not a convenience. An input that
 * also carried a user id, an org affiliation or a policy handle would be a
 * place for a second authority to enter the system — and the decision above
 * forbids exactly that for V2. A source cannot consult what it is not given.
 */
export interface CapabilityResolutionInput {
  readonly roles: readonly AdminRole[]
}

/**
 * One contributor of capabilities.
 *
 * Additive by contract: a source returns what it grants and can never remove
 * what another contributed. That keeps composition order-independent, which is
 * what lets `resolveActorCapabilities` stay deterministic as sources are added.
 */
export type CapabilitySource = (input: CapabilityResolutionInput) => readonly CapabilityId[]

/**
 * Built once. The registry is immutable, so the map is too — rebuilding it per
 * request would be pure waste on an authorization-adjacent path.
 */
const roleMap = buildRolePermissionMap(permissionRegistry)

/**
 * The ONLY source authorized for Controller V2.
 *
 * It walks the same `roleMap` the permission resolver walks, then projects each
 * permission onto the capability its own definition declares. Deriving through
 * the canonical map — rather than re-reading `defaultRoles` here — is what
 * makes it impossible for the capability projection to disagree with the
 * permissions actually resolved: there is one mapping, consulted twice.
 *
 * Note there is no role ladder to honour. `roleMap` records exactly the
 * permissions declared for each role, so a role that is broad in one module and
 * absent from another projects correctly without special handling.
 */
export const roleDerivedCapabilitySource: CapabilitySource = ({ roles }) => {
  const out = new Set<CapabilityId>()
  // Fail closed on a malformed input rather than throwing on the request path.
  if (!Array.isArray(roles)) return []
  for (const role of roles) {
    // An unrecognised role resolves to the empty set, so it contributes
    // nothing and cannot break resolution for the valid roles beside it.
    for (const permissionId of permissionsForRole(roleMap, role)) {
      // The lookup cannot miss: `roleMap` is built from this same registry, so
      // every id it yields is declared. Mutation testing confirms the guard is
      // an EQUIVALENT mutant — no reachable input makes it fire — and it is
      // kept only because the optional chain is required by the type of `get`.
      // It is defence against a state the construction of `roleMap` prevents,
      // not against one any test could produce.
      const capability = permissionRegistry.get(permissionId)?.capability
      if (capability) out.add(capability)
    }
  }
  return [...out]
}

/**
 * The registered sources, in effect for Controller V2.
 *
 * Frozen: a source pushed in at runtime would be an unreviewed authority
 * appearing in a security-adjacent projection. Adding one is a source-code
 * change and an Owner decision, not a runtime capability.
 */
export const CAPABILITY_SOURCES: readonly CapabilitySource[] = Object.freeze([
  roleDerivedCapabilitySource,
])

/**
 * Resolve the capabilities in effect for an actor.
 *
 * THE BOUNDARY. Every consumer depends on `Actor.capabilities` and on nothing
 * else — not on roles, not on the registry, not on how any source works. That
 * is what allows a future authorized source to be added by appending to
 * `CAPABILITY_SOURCES`, without changing the Actor contract and without
 * touching a single consumer.
 *
 * `sources` is a parameter so the composition itself can be exercised, not so
 * callers can substitute one: production has exactly one call site and it
 * passes nothing. It is not a write path — a caller supplying its own list
 * changes what that call returns and nothing else, and cannot reach the
 * `Actor` the Controller builds.
 *
 * Returns sorted and frozen. Sorted so the value is byte-stable across calls
 * for the same input; frozen because actors share it and a `push` would leak
 * across every request on the instance.
 */
export function resolveActorCapabilities(
  input: CapabilityResolutionInput,
  sources: readonly CapabilitySource[] = CAPABILITY_SOURCES
): readonly CapabilityId[] {
  const out = new Set<CapabilityId>()
  for (const source of sources) {
    for (const capability of source(input)) out.add(capability)
  }
  // The documented "reserved slot" constant, reused verbatim when nothing is
  // derived, so an actor with no roles is byte-identical to an actor resolved
  // before this file existed.
  if (out.size === 0) return NO_CAPABILITIES
  return Object.freeze([...out].sort())
}
