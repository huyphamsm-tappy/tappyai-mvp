// Controller V2 — Component 3 (RBAC): server-side authorization guards.
//
// SERVER ONLY — imports the identity layer, which reaches `next/headers`.
// UI components must import from `./client` instead.
//
// These preserve the Component 1/2 decision order exactly:
//
//   identity → Owner Gate → authorization
//
// The Owner Gate still runs before any authorization decision, so a Controller
// whose ownership assertion fails is denied regardless of permissions.

import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { AdminError, resolveActor, resolveActorForUser, type Actor } from '@/lib/admin/rbac'
import { checkOwnerGate } from '@/lib/admin/owner'
import { permissionEngine } from './engine'
import type { Decision, PermissionId } from './types'

export interface PermissionContext {
  user: User
  actor: Actor
  /** The decision that admitted this request. Useful for audit metadata. */
  decision: Decision
}

/** Human-readable denial that names the permission, so a 403 is actionable. */
function denialMessage(decision: Decision): string {
  switch (decision.reason) {
    case 'UNKNOWN_PERMISSION':
      return `Unknown permission: ${decision.permission}`
    case 'CAPABILITY_UNAVAILABLE':
      return `Capability unavailable for ${decision.permission}`
    case 'NO_GRANT':
      return `Missing permission: ${decision.permission}`
    default:
      return 'Forbidden'
  }
}

/**
 * Gate an `/api/admin/*` handler on a single permission.
 *
 * Replaces `requireAdminRole(req, minRole)` for permission-based routes.
 * `requireAdminRole` remains for callers not yet migrated — see the migration
 * note in `index.ts`.
 */
export async function requirePermission(
  req: Request,
  permission: PermissionId
): Promise<PermissionContext> {
  // 1. Identity.
  const resolved = await resolveActor(req)
  if (!resolved) throw new AdminError('UNAUTHORIZED', 'Authentication required', 401)
  const { user, actor } = resolved

  // 2. Ownership assertion — unchanged from Component 1, still before RBAC.
  const gate = await checkOwnerGate()
  if (!gate.ok) {
    console.error('[controller][owner] gate failed:', gate.reason)
    throw new AdminError('FORBIDDEN', 'Controller unavailable: ownership assertion failed', 403)
  }

  // 3. Authorization.
  const decision = permissionEngine.authorize(actor, permission)
  if (!decision.allowed) {
    // Denials are logged with their reason: a permission system whose refusals
    // are invisible cannot be debugged or attack-detected.
    console.warn(
      `[controller][rbac] deny ${decision.reason} user=${actor.userId} permission=${permission}`
    )
    throw new AdminError('FORBIDDEN', denialMessage(decision), 403)
  }

  return { user, actor, decision }
}

/** Gate a handler on ALL of several permissions. Denies on the first failure. */
export async function requireAllPermissions(
  req: Request,
  permissions: readonly PermissionId[]
): Promise<PermissionContext> {
  if (permissions.length === 0) {
    throw new AdminError('FORBIDDEN', 'No permission specified', 403)
  }
  let ctx = await requirePermission(req, permissions[0])
  for (const p of permissions.slice(1)) {
    const decision = permissionEngine.authorize(ctx.actor, p)
    if (!decision.allowed) {
      console.warn(
        `[controller][rbac] deny ${decision.reason} user=${ctx.actor.userId} permission=${p}`
      )
      throw new AdminError('FORBIDDEN', denialMessage(decision), 403)
    }
    ctx = { ...ctx, decision }
  }
  return ctx
}

/**
 * Page-level guard for `/admin` server components. Mirrors `requirePageRole`,
 * redirecting rather than throwing, because a page cannot render an error
 * envelope.
 */
export async function requirePagePermission(
  permission: PermissionId
): Promise<{ userId: string; email: string; actor: Actor }> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/admin')

  const gate = await checkOwnerGate()
  if (!gate.ok) {
    console.error('[controller][owner] gate failed:', gate.reason)
    redirect('/admin')
  }

  // Server components have no `Request`, so the Actor is built by user id.
  // resolveActorForUser returns ALL roles — using the highest-ranked role alone
  // would drop the permissions of any additional role, since permissions union
  // across roles rather than inherit down a ladder.
  const actor = await resolveActorForUser(user.id, user.email)

  if (!permissionEngine.can(actor, permission)) {
    redirect('/admin')
  }

  return { userId: user.id, email: actor.email, actor }
}
