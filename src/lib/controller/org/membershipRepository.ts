// Controller V2 — membership persistence port (FOUNDATION-07C).
//
// The membership management SERVICE depends only on this port, never on SQL or a
// specific client — so the service's enforcement logic is proven with a fake, and
// the production adapter (service-role) is a thin, separately-obvious wrapper.
// Reads and writes both live here; the service never touches storage directly.

import type { DepartmentId, DepartmentMembership } from './types'

export interface MembershipRepository {
  /** Active memberships for a user — used to establish the ACTOR's own authority. */
  activeForUser(userId: string): Promise<readonly DepartmentMembership[]>
  /**
   * Every ACTIVE membership, across all users and departments — the roster the
   * `/admin/org/memberships` surface renders (Owner Decision D6).
   *
   * Active only, matching `activeForUser`: a suspended membership grants
   * nothing, and a roster that listed it as a member would contradict the
   * navigation the same rows produce.
   */
  listAllActive(): Promise<readonly DepartmentMembership[]>
  /** Any membership (active or suspended) for user+department, or null. For before-state + status ops. */
  find(userId: string, departmentId: DepartmentId): Promise<DepartmentMembership | null>
  /** Create or replace a membership. */
  put(m: DepartmentMembership): Promise<void>
  /** Set an existing membership's status. */
  setStatus(userId: string, departmentId: DepartmentId, status: 'active' | 'suspended'): Promise<void>
  /** Remove a membership. */
  remove(userId: string, departmentId: DepartmentId): Promise<void>
}

const key = (userId: string, departmentId: DepartmentId) => `${userId}::${departmentId}`

/**
 * In-memory repository for unit tests and local composition. NOT a production
 * store. Seed with existing memberships; the service drives it exactly as it
 * would the DB-backed adapter.
 */
export function inMemoryMembershipRepository(seed: readonly DepartmentMembership[] = []): MembershipRepository {
  const table = new Map<string, DepartmentMembership>()
  for (const m of seed) table.set(key(m.userId, m.departmentId), { ...m })

  return {
    async activeForUser(userId) {
      return [...table.values()].filter((m) => m.userId === userId && m.status === 'active')
    },
    async listAllActive() {
      return [...table.values()].filter((m) => m.status === 'active')
    },
    async find(userId, departmentId) {
      return table.get(key(userId, departmentId)) ?? null
    },
    async put(m) {
      table.set(key(m.userId, m.departmentId), { ...m })
    },
    async setStatus(userId, departmentId, status) {
      const existing = table.get(key(userId, departmentId))
      if (existing) table.set(key(userId, departmentId), { ...existing, status })
    },
    async remove(userId, departmentId) {
      table.delete(key(userId, departmentId))
    },
  }
}
