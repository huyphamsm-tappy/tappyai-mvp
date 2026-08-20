// Module 08 — the guards every account-status mutation shares.
//
// Suspend, unsuspend, ban and unban differ only in which columns they write.
// Everything BEFORE the write is identical, and identical code copied into four
// handlers is where the fourth one quietly loses a check. It lives here once.
//
// The order below is the security property, not a style:
//
//   1. shape        — a non-UUID never reaches Postgres as a cast error
//   2. self         — an admin cannot sanction themselves
//   3. Platform Owner — never a target, and the refusal is audited
//   4. existence    — a 404 for a real absence, not an FK violation
//
// The Owner check comes BEFORE the existence check on purpose. Ordering them
// the other way would let a caller distinguish "the Owner" from "no such user"
// by which error they got back.

import type { SupabaseClient } from '@supabase/supabase-js'
import { adminError } from '@/lib/admin/rbac'
import { writeAuditLog, type AuditActorRole } from '@/lib/admin/audit'

/** Audit action for a user-management operation refused by a handler guard. */
export const ACTION_USER_ACTION_DENIED = 'user.action_denied'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export interface MutationTargetContext {
  /** The consumer account being acted on. */
  targetId: string
  actorId: string
  actorEmail: string
  actorRole: AuditActorRole
  /** The intended action (`user.suspend`, `user.ban`, …) — recorded on a denial. */
  intent: string
  req: Request
}

/**
 * `null` when the mutation may proceed; otherwise the Response to return.
 *
 * Returning the Response rather than throwing keeps the refusal reason at the
 * call site, where the handler's own `catch` cannot flatten a deliberate 403
 * into a generic 500.
 */
export async function guardMutationTarget(
  admin: SupabaseClient,
  ctx: MutationTargetContext
): Promise<Response | null> {
  if (!isUuid(ctx.targetId)) {
    return adminError('VALIDATION_ERROR', 'id must be a UUID', 422)
  }

  // Self-sanction. Not an escalation — it is the reverse — but an admin who
  // suspends themselves locks themselves out of the surface that would undo it,
  // and `security.roles.grant` already refuses the mirror-image self-action.
  if (ctx.targetId === ctx.actorId) {
    return adminError('FORBIDDEN', 'You cannot change your own account standing', 403)
  }

  // The Platform Owner is a constitutional principal, not a rung on the role
  // ladder, and is never a target. Read through the SQL function so this and
  // `fn_session_revoke_all` share one definition of who the Owner is.
  //
  // FAILS CLOSED. `isPlatformOwner()` in `lib/admin/owner.ts` degrades to
  // `false` when `platform_owner` is unreadable — correct for a login gate,
  // wrong here, because it would turn a database blip into permission to ban
  // the Owner.
  const { data: ownerFlag, error: ownerError } = await admin.rpc('fn_is_platform_owner', {
    p_user_id: ctx.targetId,
  })
  if (ownerError) {
    console.error('[admin][users] owner check failed:', ownerError.message)
    return adminError('INTERNAL_ERROR', 'Operation failed', 500)
  }
  if (ownerFlag === true) {
    writeAuditLog({
      actorId: ctx.actorId,
      actorEmail: ctx.actorEmail,
      actorRole: ctx.actorRole,
      action: ACTION_USER_ACTION_DENIED,
      targetType: 'user',
      targetId: ctx.targetId,
      metadata: { intent: ctx.intent, reason: 'owner_protected' },
      req: ctx.req,
    })
    return adminError('FORBIDDEN', 'The Platform Owner’s account standing cannot be changed', 403)
  }

  // `account_status.user_id` is a FK to `profiles.id`, so a missing profile
  // would surface as a 23503 from the upsert. Checked explicitly so the caller
  // gets a 404 that means what it says.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('id', ctx.targetId)
    .maybeSingle()

  if (profileError) {
    console.error('[admin][users] target lookup failed:', profileError.message)
    return adminError('INTERNAL_ERROR', 'Operation failed', 500)
  }
  if (!profile) return adminError('NOT_FOUND', 'User not found', 404)

  return null
}
