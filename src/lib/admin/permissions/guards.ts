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
import { auditAuthorizationDecision } from './decisionAudit'
import type { Decision, PermissionId } from './types'
import { loginPathFor } from '@/lib/auth/returnTo'

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
 * Where to send someone when the Controller itself is unavailable.
 *
 * MUST be outside `/admin`. Every `/admin` page carries a permission guard, so
 * an in-Controller destination would re-run this same failing check and bounce
 * forever — see the redirect-loop note on `requirePagePermission`.
 */
const CONTROLLER_UNAVAILABLE_REDIRECT = '/reviews'

/**
 * Resolve the Actor for a PAGE surface, translating a corporate-identity denial
 * into a redirect.
 *
 * `resolveActorForUser` enforces the FOUNDATION-10C corporate boundary by
 * throwing (the right shape for `/api/admin/*`, whose handlers already map
 * `AdminError` to a 403 envelope). A server component cannot render an error
 * envelope, so the two page entry points — this module's `requirePagePermission`
 * and the `/admin` layout — funnel through here instead of each writing their
 * own catch. One denial path, not two.
 *
 * The destination is OUTSIDE `/admin` for the same reason the Owner-Gate
 * failure redirects out: every `/admin` surface runs this boundary, so bouncing
 * within the Controller would loop forever.
 *
 * Only a corporate-identity FORBIDDEN is converted. Anything else rethrows —
 * swallowing an unexpected failure here would turn a bug into a silent redirect,
 * and Next's own `redirect()` control-flow throw must never be caught.
 */
export async function resolveActorForPage(
  user: User,
  source: Actor['source'] = 'cookie'
): Promise<Actor> {
  try {
    return await resolveActorForUser(user, source)
  } catch (err) {
    if (err instanceof AdminError && err.status === 403) redirect(CONTROLLER_UNAVAILABLE_REDIRECT)
    throw err
  }
}

/**
 * Gate an `/api/admin/*` handler on a single permission.
 *
 * The ONLY route-level authorization helper. It replaced
 * `requireAdminRole(req, minRole)` at all 12 API decision points, and
 * Component 4 deleted that function outright — there is no second way to gate
 * an API route.
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
    // Component 4: a refusal now leaves a durable trace, not just a log line a
    // serverless instance forgets. `console.warn` is kept for live tailing.
    console.warn(
      `[controller][rbac] deny ${decision.reason} user=${actor.userId} permission=${permission}`
    )
    auditAuthorizationDecision({ actor, decision, surface: 'api', req })
    throw new AdminError('FORBIDDEN', denialMessage(decision), 403)
  }

  // Component 4: an ALLOW is audited only when it is the Owner exercising
  // bypass on something that is not a read — see decisionAudit.shouldAudit.
  auditAuthorizationDecision({ actor, decision, surface: 'api', req })

  return { user, actor, decision }
}

// NOTE (dead-code audit R-4): `requireAllPermissions` was written and removed.
// It had no caller. No handler in the Controller guards on two permissions at
// once, and inventing one to justify the helper would have been a policy change
// dressed up as an integration. Restore it when a real two-permission handler
// exists — the loop is six lines.

/**
 * Page-level guard for `/admin` server components. Redirects rather than
 * throwing, because a page cannot render an error envelope.
 *
 * ⚠️ REDIRECT-LOOP HAZARD. Every `/admin` page now carries a guard, including
 * `/admin` itself. A denial that redirects into the Controller therefore risks
 * bouncing forever, so:
 *
 *   - Controller-unavailable (Owner Gate failure) always exits the Controller.
 *     It is a whole-Controller outage; bouncing within it is meaningless.
 *   - A permission denial defaults to `/admin`, the one page every admin can
 *     reach. `/admin` itself MUST override `deniedRedirect`, because sending it
 *     to its own URL is the loop.
 *
 * This is not hypothetical: Component 3 introduced the loop the moment it gave
 * `/admin` a guard, and the regression tests in `guards.test.ts` exist to keep
 * it fixed.
 */
export async function requirePagePermission(
  permission: PermissionId,
  options: { deniedRedirect?: string } = {}
): Promise<{ userId: string; email: string; actor: Actor }> {
  const deniedRedirect = options.deniedRedirect ?? '/admin'

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(loginPathFor('/admin'))

  const gate = await checkOwnerGate()
  if (!gate.ok) {
    console.error('[controller][owner] gate failed:', gate.reason)
    redirect(CONTROLLER_UNAVAILABLE_REDIRECT)
  }

  // Server components have no `Request`, so the Actor is built from the verified
  // user object directly. resolveActorForUser returns ALL roles — using the
  // highest-ranked role alone would drop the permissions of any additional role,
  // since permissions union across roles rather than inherit down a ladder. It
  // also enforces the corporate-identity boundary; `resolveActorForPage` turns
  // that denial into a redirect rather than an unhandled throw.
  const actor = await resolveActorForPage(user)

  // `authorize` rather than `can`, because the audit row needs the REASON —
  // "denied" without "why" cannot be investigated.
  const decision = permissionEngine.authorize(actor, permission)
  auditAuthorizationDecision({ actor, decision, surface: 'page' })
  if (!decision.allowed) {
    console.warn(
      `[controller][rbac] deny ${decision.reason} user=${actor.userId} permission=${permission}`
    )
    redirect(deniedRedirect)
  }

  return { userId: user.id, email: actor.email, actor }
}
