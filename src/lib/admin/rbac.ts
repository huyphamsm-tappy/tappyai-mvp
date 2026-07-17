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

// Short-lived role cache (ADR-003: cache role ~60s per session to avoid a DB
// read on every request). Per serverless instance; revocation tolerates <=60s lag.
const CACHE_TTL_MS = 60_000
const roleCache = new Map<string, { role: AdminRole | null; expires: number }>()

/**
 * Resolve the highest admin role for a user id, or null if not an admin.
 * Used by the /admin server-component layout gate. Cached ~60s.
 */
export async function resolveAdminRole(userId: string): Promise<AdminRole | null> {
  const cached = roleCache.get(userId)
  if (cached && cached.expires > Date.now()) return cached.role

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('admin_roles')
    .select('role, expires_at')
    .eq('user_id', userId)

  let role: AdminRole | null = null
  if (!error && data) {
    const now = Date.now()
    const active = data.filter(
      (r) => !r.expires_at || new Date(r.expires_at).getTime() > now
    )
    for (const r of active) {
      const cand = r.role as AdminRole
      if (role === null || ROLE_RANK[cand] > ROLE_RANK[role]) role = cand
    }
  }

  roleCache.set(userId, { role, expires: Date.now() + CACHE_TTL_MS })
  return role
}

/** Invalidate a user's cached role immediately (call after grant/revoke). */
export function invalidateRoleCache(userId: string): void {
  roleCache.delete(userId)
}

export interface AdminContext {
  user: User
  role: AdminRole
}

/**
 * Gate for every /api/admin/* handler. Throws AdminError (401/403) if the caller
 * is not authenticated or lacks the minimum role. Returns the authenticated
 * admin context on success. (21_Coding_Standards.md §2.)
 */
export async function requireAdminRole(
  req: Request,
  minRole: AdminRole
): Promise<AdminContext> {
  const { user } = await getRequestUser(req)
  if (!user) throw new AdminError('UNAUTHORIZED', 'Authentication required', 401)

  const role = await resolveAdminRole(user.id)
  if (!role || !hasRole(role, minRole)) {
    throw new AdminError('FORBIDDEN', `Insufficient permissions. Required role: ${minRole}`, 403)
  }
  return { user, role }
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
