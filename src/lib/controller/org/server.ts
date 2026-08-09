// Controller V2 — server-side membership seam (FOUNDATION-06). SERVER ONLY.
//
// This is the ONE place the DB-backed resolver is wired to the service-role
// admin client. It is deliberately NOT re-exported from ./index (which stays a
// pure, server-free module) so client bundles never pull in createAdminClient.
//
// PROD-SAFE / STAGED ROLLOUT: gated behind CONTROLLER_ORG_MEMBERSHIP_ENABLED,
// default OFF (mirrors the capability-gate convention). Until the org schema is
// applied to production (FOUNDATION-07, owner-authorized), this returns [] and
// runs no query — so the live Home/nav are unaffected:
//   • the single Ultimate Owner still has GLOBAL scope (from Actor.isOwner, not
//     memberships), and
//   • no department members exist yet, so [] is the correct, honest answer.
// When the flag is turned on post-apply, the real DB-backed path activates with
// no code change.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Actor } from '@/lib/admin/rbac'
import { dbMembershipResolver, supabaseMembershipStore } from './dbMembership'
import { buildDepartmentContext } from './context'
import type { MembershipRepository } from './membershipRepository'
import type { MembershipServiceDeps } from './membershipService'
import type { DepartmentContext, DepartmentId, DepartmentMembership, OrgRole, OrgScope } from './types'

/** True once the operator has enabled DB-backed department memberships (post-apply). */
export function orgMembershipEnabled(): boolean {
  return process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED === 'true'
}

/**
 * Active department memberships for an actor. [] when the feature is off (the
 * pre-apply default) or the actor is unauthenticated. The Ultimate Owner's
 * GLOBAL reach does NOT depend on this — it comes from Actor.isOwner.
 */
export async function resolveActorMemberships(actor: Actor | null): Promise<readonly DepartmentMembership[]> {
  if (!actor || !orgMembershipEnabled()) return []
  // The supabase-js query builder is awaitable and resolves to { data, error };
  // cast it to the store's minimal port so dbMembership.ts stays free of any
  // supabase-js types (and the deep-generic structural match tsc rejects).
  const client = createAdminClient() as unknown as Parameters<typeof supabaseMembershipStore>[0]
  const resolver = dbMembershipResolver(supabaseMembershipStore(client))
  return resolver.resolve(actor.userId)
}

/**
 * Resolve an actor's department CONTEXT for scope-aware UI (nav/Home). Flag-gated
 * like resolveActorMemberships: when OFF (production default) memberships are []
 * and only the Ultimate Owner has global reach — so the Controller behaves
 * exactly as before. Owner → global + all department-owned modules.
 */
export async function resolveDepartmentContext(actor: Actor | null): Promise<DepartmentContext> {
  const memberships = await resolveActorMemberships(actor)
  return buildDepartmentContext(actor?.isOwner ?? false, memberships)
}

// ── Production membership repository (service-role) ──────────────────────────
// Thin adapter over the service-role admin client for the membership management
// SERVICE. UNSEEDED + UNDEPLOYED in this phase (department_membership = 0 in
// prod); the service's enforcement is proven with the in-memory repo. Reads
// filter to active; writes fill organization_id from the single organization.
type Row = { department_id: string; org_role: string; scope: string; status: string }
const toMembership = (userId: string, r: Row): DepartmentMembership => ({
  userId,
  departmentId: r.department_id as DepartmentId,
  orgRole: r.org_role as OrgRole,
  scope: r.scope as OrgScope,
  status: r.status === 'suspended' ? 'suspended' : 'active',
})

export function supabaseMembershipRepository(): MembershipRepository {
  const client = createAdminClient()
  let orgIdCache: string | null = null
  const orgId = async (): Promise<string> => {
    if (orgIdCache) return orgIdCache
    const { data, error } = await client.from('organization').select('id').eq('slug', 'tappyai').maybeSingle()
    if (error || !data) throw new Error('organization not provisioned (apply FOUNDATION-06 migration first)')
    orgIdCache = (data as { id: string }).id
    return orgIdCache
  }
  return {
    async activeForUser(userId) {
      const { data, error } = await client
        .from('department_membership')
        .select('department_id, org_role, scope, status')
        .eq('user_id', userId)
        .eq('status', 'active')
      if (error) throw new Error(`membership read failed: ${error.code ?? 'unknown'}`)
      return ((data ?? []) as Row[]).map((r) => toMembership(userId, r))
    },
    async find(userId, departmentId) {
      const { data, error } = await client
        .from('department_membership')
        .select('department_id, org_role, scope, status')
        .eq('user_id', userId)
        .eq('department_id', departmentId)
        .maybeSingle()
      if (error) throw new Error(`membership find failed: ${error.code ?? 'unknown'}`)
      return data ? toMembership(userId, data as Row) : null
    },
    async put(m) {
      const organization_id = await orgId()
      const { error } = await client.from('department_membership').upsert(
        {
          organization_id,
          user_id: m.userId,
          department_id: m.departmentId,
          org_role: m.orgRole,
          scope: m.scope,
          status: m.status,
        },
        { onConflict: 'organization_id,user_id,department_id' }
      )
      if (error) throw new Error(`membership put failed: ${error.code ?? 'unknown'}`)
    },
    async setStatus(userId, departmentId, status) {
      const { error } = await client
        .from('department_membership')
        .update({ status })
        .eq('user_id', userId)
        .eq('department_id', departmentId)
      if (error) throw new Error(`membership setStatus failed: ${error.code ?? 'unknown'}`)
    },
    async remove(userId, departmentId) {
      const { error } = await client
        .from('department_membership')
        .delete()
        .eq('user_id', userId)
        .eq('department_id', departmentId)
      if (error) throw new Error(`membership remove failed: ${error.code ?? 'unknown'}`)
    },
  }
}

/** Build production service deps (service-role repo + canonical PDP + audit). */
export function productionMembershipDeps(req?: Request): MembershipServiceDeps {
  return { repo: supabaseMembershipRepository(), req }
}
