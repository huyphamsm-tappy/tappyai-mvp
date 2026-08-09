// Controller V2 — membership resolution.
//
// The foundation depends on WHERE a user belongs (department + scope). That
// mapping is ultimately DB-backed, but the org authorization MODEL and its tests
// depend only on this interface — so the model is complete and testable now,
// and the DB-backed resolver is a deferred adapter (schema does not exist yet;
// no production DB mutation is permitted in this phase).

import type { DepartmentMembership } from './types'

export interface MembershipResolver {
  /** Active memberships for a Controller user. Empty = not a Controller member of any department. */
  resolve(userId: string): Promise<readonly DepartmentMembership[]>
}

/** In-memory resolver for tests and local composition. NOT a production source. */
export function inMemoryMembershipResolver(
  table: Readonly<Record<string, readonly DepartmentMembership[]>>
): MembershipResolver {
  return {
    async resolve(userId) {
      return (table[userId] ?? []).filter((m) => m.status === 'active')
    },
  }
}

/**
 * DB-backed resolver — SUPERSEDED by `dbMembershipResolver` (./dbMembership) in
 * FOUNDATION-06, which reads through a MembershipStore port. This throwing stub
 * is retained only as the explicit "not provisioned" sentinel: unlike the real
 * resolver's fail-closed [] (deny), it fails LOUDLY, for call sites that must
 * treat an absent schema as a bug rather than a benign deny.
 */
export function deferredDbMembershipResolver(): MembershipResolver {
  return {
    async resolve() {
      throw new Error(
        'MembershipResolver (DB-backed) is not implemented: organization/department schema does not exist yet (FOUNDATION-06).'
      )
    },
  }
}
