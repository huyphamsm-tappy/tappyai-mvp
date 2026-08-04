// TappyAI Back Office — RBAC (Architecture v1.1: 12_RBAC.md, ADR-003).
//
// Authoritative authorization for the back office. Roles live in the `admin_roles`
// table (NOT the deprecated ADMIN_IDS env gate). Enforcement happens here — invoked
// by the /admin server layout AND by every /api/admin/* handler (Security §4,
// defense-in-depth). Middleware only checks authentication, never DB roles
// (owner decision, Phase 0).

import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import type { User } from '@supabase/supabase-js'
import { ROLE_RANK, hasRole, type AdminRole } from '@/lib/admin/roles'
import { isPlatformOwner, checkOwnerGate } from '@/lib/admin/owner'
import { NO_CAPABILITIES, type CapabilityId } from '@/lib/admin/capabilities'
// Component 3 integration only. `permissions/cache` is pure (no server imports),
// so this creates no import cycle: the permission layer type-imports Actor from
// here, and a type-only import is erased at compile time.
import { permissionCache } from '@/lib/admin/permissions/cache'

// Re-export the client-safe primitives so existing server-side importers keep
// working via '@/lib/admin/rbac'. Client components import from '@/lib/admin/roles'.
export { hasRole }
export type { AdminRole }

// Typed error mapped to a uniform API envelope (05_API_Architecture.md §3).
export class AdminError extends Error {
  constructor(
    public code: 'UNAUTHORIZED' | 'FORBIDDEN',
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'AdminError'
  }
}

// Short-lived principal cache (ADR-003: cache ~60s per session to avoid a DB
// read on every request). Per serverless instance; revocation tolerates <=60s lag.
const CACHE_TTL_MS = 60_000

interface Principal {
  roles: AdminRole[]
  isOwner: boolean
}
const principalCache = new Map<string, Principal & { expires: number }>()

/** Highest-ranked role in a list, or null when the list is empty. */
function highestRole(roles: AdminRole[]): AdminRole | null {
  let top: AdminRole | null = null
  for (const r of roles) {
    if (top === null || ROLE_RANK[r] > ROLE_RANK[top]) top = r
  }
  return top
}

/**
 * Resolve a user's full security principal: every ACTIVE admin role plus
 * Platform Owner status.
 *
 * Component 2 change: this returns ALL active roles rather than collapsing to
 * the highest. `admin_roles` already permits multiple rows per user
 * (UNIQUE(user_id, role)), and the Permission Engine (component 4) must union
 * the permission bundles of every role — information the old
 * highest-rank-only resolution discarded.
 *
 * `isOwner` comes from `platform_owner`, NEVER from `admin_roles`. The Owner is
 * a distinct constitutional principal, not a rung on the role ladder.
 */
async function resolvePrincipal(userId: string): Promise<Principal> {
  const cached = principalCache.get(userId)
  if (cached && cached.expires > Date.now()) {
    return { roles: cached.roles, isOwner: cached.isOwner }
  }

  const supabase = createAdminClient()
  const [rolesResult, isOwner] = await Promise.all([
    supabase.from('admin_roles').select('role, expires_at').eq('user_id', userId),
    isPlatformOwner(userId),
  ])

  const roles: AdminRole[] = []
  if (!rolesResult.error && rolesResult.data) {
    const now = Date.now()
    for (const r of rolesResult.data) {
      if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue
      roles.push(r.role as AdminRole)
    }
  }

  principalCache.set(userId, { roles, isOwner, expires: Date.now() + CACHE_TTL_MS })
  return { roles, isOwner }
}

/**
 * Resolve the highest admin role for a user id, or null if not an admin.
 * Used by the /admin server-component layout gate. Cached ~60s.
 *
 * TRANSITION SHIM: retained so every existing call site keeps working unchanged
 * while components 3–4 land. It is deleted at the end of Block A once the
 * Policy Decision Point replaces the rank ladder — it is not permanent
 * old/new coexistence.
 */
export async function resolveAdminRole(userId: string): Promise<AdminRole | null> {
  const { roles } = await resolvePrincipal(userId)
  return highestRole(roles)
}

/**
 * Invalidate a user's cached principal immediately (call after grant/revoke).
 *
 * Component 3 integration: this now also drops their cached permission set.
 * Without it a revoked role could keep authorizing until the permission cache
 * expired — stale privilege escalation, the one failure mode that cache must
 * not have. The permission cache is additionally keyed on the role set, so it
 * would self-correct even if this call were ever missed; both defences are kept
 * because either alone is a single point of failure.
 */
export function invalidateRoleCache(userId: string): void {
  principalCache.delete(userId)
  permissionCache.invalidate(userId)
}

/**
 * The full security principal for a request. Supersedes the bare
 * `{ user, role }` pair; `user` and `role` remain on AdminContext so existing
 * handlers are untouched.
 *
 * `permissions` is intentionally ABSENT until component 4 (Permission Engine).
 *
 * `capabilities` IS present from now on (owner decision, 2026-08-03) so the
 * interface does not change shape when the Capability Registry lands in
 * component 5. It is always `NO_CAPABILITIES` today — see the contract on that
 * constant: empty means "registry not installed", NOT "denied everything".
 * Nothing may gate on it until component 5.
 */
export interface Actor {
  userId: string
  email: string
  isOwner: boolean
  roles: AdminRole[]
  highestRole: AdminRole | null
  capabilities: readonly CapabilityId[]
  source: 'cookie' | 'bearer'
  resolvedAt: number
}

/**
 * Resolve the Actor for a request, or null when unauthenticated.
 *
 * THE SINGLE Actor construction site. `requireAdminRole` delegates here rather
 * than building its own, so the two can never drift. The Supabase `User` is
 * returned alongside because `AdminContext` still exposes it to handlers.
 */
export async function resolveActor(
  req: Request
): Promise<{ user: User; actor: Actor } | null> {
  const { user } = await getRequestUser(req)
  if (!user) return null

  const { roles, isOwner } = await resolvePrincipal(user.id)
  const actor: Actor = {
    userId: user.id,
    email: user.email ?? '—',
    isOwner,
    roles,
    highestRole: highestRole(roles),
    capabilities: NO_CAPABILITIES,
    // Retained so component 11 (Session Security) can reason about web vs
    // native without re-deriving it from headers.
    source: req.headers.get('authorization')?.startsWith('Bearer ') ? 'bearer' : 'cookie',
    resolvedAt: Date.now(),
  }
  return { user, actor }
}

/**
 * Build an Actor from a user id, for contexts that have no `Request` — server
 * components in particular.
 *
 * Component 3 integration: page guards need the FULL role list. Reaching for
 * `resolveAdminRole` there would collapse to the highest-ranked role and
 * silently drop the permissions of any additional role the user holds, because
 * permissions are a union across roles rather than a ladder.
 */
export async function resolveActorForUser(
  userId: string,
  email: string | null | undefined,
  source: Actor['source'] = 'cookie'
): Promise<Actor> {
  const { roles, isOwner } = await resolvePrincipal(userId)
  return {
    userId,
    email: email ?? '—',
    isOwner,
    roles,
    highestRole: highestRole(roles),
    capabilities: NO_CAPABILITIES,
    source,
    resolvedAt: Date.now(),
  }
}

export interface AdminContext {
  user: User
  role: AdminRole
  actor: Actor
}

/**
 * Gate for every /api/admin/* handler. Throws AdminError (401/403) if the caller
 * is not authenticated or lacks the minimum role. Returns the authenticated
 * admin context on success. (21_Coding_Standards.md §2.)
 */
/**
 * @deprecated Component 3 supersedes this. Use `requirePermission(req,
 * PERMISSIONS.X)` from `@/lib/admin/permissions` instead.
 *
 * Kept ONLY because its tests cover the Component 1 Owner boot assertion.
 * It has ZERO production callers as of the Component 3 migration. Do not add
 * new ones: it gates on ROLE RANK, which bypasses the permission registry and
 * would reintroduce the parallel authorization path Component 3 removed.
 */
export async function requireAdminRole(
  req: Request,
  minRole: AdminRole
): Promise<AdminContext> {
  // 1. Identity.
  const resolved = await resolveActor(req)
  if (!resolved) throw new AdminError('UNAUTHORIZED', 'Authentication required', 401)
  const { user, actor } = resolved

  // 2. Ownership assertion (component 1) — runs BEFORE any RBAC decision. Inert
  // until PLATFORM_OWNER_USER_ID is configured; once configured, a mismatch
  // denies the whole Controller.
  const gate = await checkOwnerGate()
  if (!gate.ok) {
    console.error('[controller][owner] gate failed:', gate.reason)
    throw new AdminError('FORBIDDEN', 'Controller unavailable: ownership assertion failed', 403)
  }

  // 3. RBAC.
  const role = actor.highestRole
  if (!role || !hasRole(role, minRole)) {
    throw new AdminError('FORBIDDEN', `Insufficient permissions. Required role: ${minRole}`, 403)
  }

  return { user, role, actor }
}

/**
 * Gate for operations only the Platform Owner may perform. Used for the
 * super_admin grant/revoke paths so the API can answer a clear 403 instead of
 * surfacing a raw Postgres 42501 from fn_grant_admin_role.
 *
 * This is a UX and defense-in-depth layer ONLY — the authoritative check lives
 * in the SECURITY DEFINER functions, which hold the privilege the application
 * does not.
 */
export function requireOwner(ctx: { actor: Actor }, operation: string): void {
  if (!ctx.actor.isOwner) {
    throw new AdminError('FORBIDDEN', `Only the Platform Owner may ${operation}`, 403)
  }
}

/** Map an unknown error thrown in an admin handler to a uniform error Response. */
export function adminErrorResponse(err: unknown): Response {
  if (err instanceof AdminError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status })
  }
  console.error('[admin] unhandled error:', err)
  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Operation failed' } },
    { status: 500 }
  )
}

/** Helper to build a uniform error Response from a code/message/status. */
export function adminError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status })
}

/**
 * Same-origin guard for admin mutations (Security §9). Returns true when the
 * request has no Origin header (same-origin server calls) or the Origin matches
 * the configured site URL.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  return origin === process.env.NEXT_PUBLIC_SITE_URL
}
