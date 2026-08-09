// Controller V2 — DB-backed membership resolution (FOUNDATION-06).
//
// Replaces the deferred stub with a real resolver, WITHOUT coupling Controller
// Core to SQL. The seam is a narrow `MembershipStore` port that returns raw rows;
// the resolver validates + maps them against the department registry. Two stores
// implement the port:
//   • supabaseMembershipStore  — production (service-role admin client)
//   • a raw-pg store in the DB integration test (proves the real schema + SQL)
//
// FAIL-CLOSED everywhere: a row for an unknown department, an unknown org role,
// or an out-of-department scope is DROPPED (never widened to access). If the
// org schema is not provisioned yet (production, pre-apply), the store returns
// [] — which the authorization layer reads as NO_MEMBERSHIP (deny), the safe
// default — rather than throwing on every render.

import { getDepartment } from './departments'
import { scopeCovers } from './scope'
import type { MembershipResolver } from './membership'
import type { DepartmentId, DepartmentMembership, OrgRole, OrgScope } from './types'

/** Raw membership row as stored (snake_case), before validation/mapping. */
export interface MembershipRow {
  department_id: string
  org_role: string
  scope: string
  status: string
}

/** The narrow port the resolver depends on. Never SQL, never a specific client. */
export interface MembershipStore {
  /** All membership rows (any status) for one user. Empty = no memberships / schema absent. */
  fetchMemberships(userId: string): Promise<readonly MembershipRow[]>
}

// Organizational positions a MEMBERSHIP may carry. ULTIMATE_OWNER is deliberately
// absent: owner authority is GLOBAL and comes from platform_owner (Actor.isOwner),
// never from a membership row — a row claiming it is rejected.
const MEMBER_ORG_ROLES: readonly OrgRole[] = ['DEPARTMENT_HEAD', 'DEPARTMENT_MANAGER', 'EMPLOYEE']

/** Validate + map one raw row to a DepartmentMembership, or null to drop it (fail-closed). */
function toMembership(row: MembershipRow): DepartmentMembership | null {
  if (!getDepartment(row.department_id)) return null // unknown department
  const departmentId = row.department_id as DepartmentId

  if (!MEMBER_ORG_ROLES.includes(row.org_role as OrgRole)) return null // unknown / owner role
  const orgRole = row.org_role as OrgRole

  const scope = row.scope as OrgScope
  // Defense in depth (mirrors the DB CHECK): a membership scope covers GLOBAL or
  // its OWN department only. Anything else is a corrupt/foreign scope — drop it.
  if (scope !== 'GLOBAL' && !scopeCovers(scope, departmentId)) return null

  if (row.status !== 'active' && row.status !== 'suspended') return null
  const status = row.status

  return { userId: '', departmentId, orgRole, scope, status }
}

/**
 * The production resolver: reads through a MembershipStore, validates against the
 * registry, and (per the MembershipResolver contract) returns ACTIVE memberships
 * only. `userId` is stamped onto each mapped row from the argument.
 */
export function dbMembershipResolver(store: MembershipStore): MembershipResolver {
  return {
    async resolve(userId) {
      const rows = await store.fetchMemberships(userId)
      const mapped: DepartmentMembership[] = []
      for (const row of rows) {
        const m = toMembership(row)
        if (m && m.status === 'active') mapped.push({ ...m, userId })
      }
      return mapped
    },
  }
}

// Minimal shape of the supabase-js query builder this store uses. Keeping it
// structural avoids a hard dependency and keeps this module free of any
// service-role client construction (that stays in @/lib/supabase/admin).
interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: unknown[] | null; error: { code?: string } | null }>
    }
  }
}

// PostgREST/Postgres signals that the org tables have not been created yet.
// 42P01 = undefined_table (Postgres); PGRST205 = table not found (PostgREST cache).
const SCHEMA_ABSENT_CODES = new Set(['42P01', 'PGRST205'])

/**
 * Production store over the service-role admin client. Inject the client from
 * `createAdminClient()` at the call site — this module never builds one
 * (architecture rule: no-adhoc-service-role-client).
 *
 * Fail-closed on a missing schema (pre-apply): return [] so the app degrades to
 * "no memberships" (deny) instead of throwing. Any OTHER error is re-thrown —
 * an unexpected failure must be loud, not silently read as "no access".
 */
export function supabaseMembershipStore(client: SupabaseLike): MembershipStore {
  return {
    async fetchMemberships(userId) {
      const { data, error } = await client
        .from('department_membership')
        .select('department_id, org_role, scope, status')
        .eq('user_id', userId)
      if (error) {
        if (error.code && SCHEMA_ABSENT_CODES.has(error.code)) return []
        throw new Error(`department_membership query failed: ${error.code ?? 'unknown'}`)
      }
      return (data ?? []) as MembershipRow[]
    },
  }
}
