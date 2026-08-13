// TappyAI Back Office — RBAC (Architecture v1.1: 12_RBAC.md, ADR-003).
//
// Authoritative authorization for the back office. Roles live in the `admin_roles`
// table (NOT the deprecated ADMIN_IDS env gate). Enforcement happens here — invoked
// by the /admin server layout AND by every /api/admin/* handler (Security §4,
// defense-in-depth). Middleware only checks authentication, never DB roles
// (owner decision, Phase 0).

import { createAdminClient } from '@/lib/supabase/admin'
import { serverEnv } from '@/lib/config/env'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import type { User } from '@supabase/supabase-js'
import { ROLE_RANK, hasRole, type AdminRole } from '@/lib/admin/roles'
import { isPlatformOwner, checkOwnerGate } from '@/lib/admin/owner'
import { NO_CAPABILITIES, type CapabilityId } from '@/lib/admin/capabilities'
// FOUNDATION-10C (owner decision: Option B). Pure policy module — no DB, no
// network, no PDP. It answers ONE question: is this verified Supabase identity
// a corporate identity? It is authentication, never authorization.
import {
  checkCorporateIdentity,
  CORPORATE_IDENTITY_DENIAL_MESSAGE,
  type VerifiedIdentity,
} from '@/lib/controller/auth/corporateIdentity'
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
 * (UNIQUE(user_id, role)), and the Permission Engine unions the permission
 * bundles of every role — information the old highest-rank-only resolution
 * discarded.
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

// REMOVED in Component 4: `resolveAdminRole(userId)`. It collapsed an actor to
// their highest role, which under union semantics silently drops permissions —
// the defect the Component 3 review found in the page guard. Superseded by
// `resolveActorForUser`, and by then it had zero callers.

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
 * `{ user, role }` pair that `AdminContext` used to carry; Component 4 deleted
 * that interface along with the rank-ladder gate it served.
 *
 * `permissions` is deliberately NOT a field here. They are derived on demand by
 * the PDP from `roles`, so there is exactly one place that decides what an
 * Actor may do — see permissions/engine.ts.
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
 * Build an Actor from a VERIFIED Supabase user, for contexts that have no
 * `Request` — server components in particular.
 *
 * THE SINGLE Actor construction site. `resolveActor` delegates here rather than
 * building its own, so the field mappings can never drift. Component 2's review
 * found exactly that defect (two inline copies of a security principal's
 * construction) and Component 3 briefly reintroduced it by adding this function
 * alongside a second literal.
 *
 * FOUNDATION-10C — THE TRUSTED CORPORATE IDENTITY BOUNDARY LIVES HERE.
 *
 * The parameter is the whole `User` object returned by `supabase.auth.getUser()`
 * and NOT `(userId, email)` as it was before. That signature change is the
 * security property, not a refactor: a caller can no longer supply an email of
 * its own choosing, because it has nothing to supply — the only thing it can
 * pass is an object it obtained from Supabase Auth, which (MEASURED) is fetched
 * over the network from the Auth server on every call. A forged request body,
 * header or client-side field therefore has no path into this decision.
 *
 * Because the check sits at the single construction site, a non-corporate
 * identity never becomes an Actor at all. Every downstream surface — API guard,
 * page guard, the `/admin` layout, and any route added later — inherits the
 * boundary for free and cannot opt out of it.
 *
 * ORDERING (owner-specified): authentication → verified corporate identity →
 * Actor → canonical PDP → membership → department scope → role → permission.
 * The corporate check runs BEFORE the Actor exists, so it is strictly upstream
 * of the Owner Gate and the PDP. It is not a second authorization authority: it
 * reads no role, no membership and no permission, and holding an `@tappyai.com`
 * address grants nothing on its own.
 *
 * Denial is a thrown `AdminError` (403), which `/api/admin/*` handlers already
 * map to the uniform envelope via `adminErrorResponse`. Page surfaces catch it
 * and redirect — see `resolveActorForPage`.
 *
 * NOT AUDITED, deliberately: `auditAuthorizationDecision` records PDP decisions
 * and needs an Actor, which by construction does not exist here. Writing this
 * denial through a second path would create the second audit writer the
 * architecture forbids. It is logged, like every other pre-Actor rejection.
 *
 * Page guards need the FULL role list. Collapsing to the highest-ranked role
 * silently drops the permissions of any additional role the user holds, because
 * permissions union across roles rather than inherit down a ladder. That is why
 * Component 4 deleted `resolveAdminRole` outright rather than leaving it around.
 */
export async function resolveActorForUser(
  user: VerifiedIdentity & { id: string },
  source: Actor['source'] = 'cookie'
): Promise<Actor> {
  const identity = checkCorporateIdentity(user)
  if (!identity.ok) {
    console.warn(`[controller][auth] deny ${identity.reason} user=${user.id}`)
    throw new AdminError('FORBIDDEN', CORPORATE_IDENTITY_DENIAL_MESSAGE, 403)
  }

  const userId = user.id
  const { roles, isOwner } = await resolvePrincipal(userId)
  return {
    userId,
    // Not `?? '—'` any more: the boundary above guarantees a verified corporate
    // address, so the placeholder branch is unreachable and would only hide a
    // regression if it were kept.
    email: identity.email,
    isOwner,
    roles,
    highestRole: highestRole(roles),
    capabilities: NO_CAPABILITIES,
    // `source` is retained so component 11 (Session Security) can reason about
    // web vs native without re-deriving it from headers.
    source,
    resolvedAt: Date.now(),
  }
}

/**
 * Resolve the Actor for a request, or null when unauthenticated.
 *
 * Delegates construction to `resolveActorForUser`; its only added job is
 * deriving `source` from the request. The Supabase `User` is returned alongside
 * because handlers still receive it in `PermissionContext`.
 */
export async function resolveActor(
  req: Request
): Promise<{ user: User; actor: Actor } | null> {
  const { user } = await getRequestUser(req)
  if (!user) return null

  const source: Actor['source'] = req.headers.get('authorization')?.startsWith('Bearer ')
    ? 'bearer'
    : 'cookie'
  // `user` here came from `getRequestUser`, which resolves BOTH the cookie
  // session and the native `Authorization: Bearer` token through
  // `auth.getUser()` — a real round-trip to the Auth server in both cases. So
  // the corporate boundary inside `resolveActorForUser` is enforced identically
  // for web and native clients; a self-minted JWT never reaches it.
  const actor = await resolveActorForUser(user, source)
  return { user, actor }
}

// REMOVED in Component 4: `AdminContext` and `requireAdminRole(req, minRole)`.
//
// The rank-ladder gate had zero production callers after the Component 3
// migration, and its continued existence was an invitation: a future route
// could gate on ROLE RANK and silently bypass the permission registry. The
// Block-A exit condition in 03_PHASE1_FOUNDATION_DESIGN.md is exactly this —
// the shim is deleted "once the PDP has replaced every hasRole call".
//
// Its security coverage did not vanish with it: the Owner-Gate-before-RBAC
// ordering it used to pin is now asserted directly against `requirePermission`
// in permissions/apiGuard.test.ts.

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

/** Helper to build a uniform error Response from a code/message/status.
 *  `headers` exists so a 429 can carry `Retry-After` (Component 10); the
 *  response envelope itself is unchanged. */
export function adminError(
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>
): Response {
  return Response.json({ error: { code, message } }, headers ? { status, headers } : { status })
}

/**
 * Same-origin guard for admin mutations (Security §9). Returns true when the
 * request has no Origin header (same-origin server calls) or the Origin matches
 * the configured site URL.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  return origin === serverEnv.siteUrl()
}
