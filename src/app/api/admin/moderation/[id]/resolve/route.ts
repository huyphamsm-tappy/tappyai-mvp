// POST /api/admin/moderation/[id]/resolve — act on one queue item (Module 09).
//
// Contract: 04 §4.4/§4.5 · 12_RBAC §3 · ADR-026.
//
// 🔑 THE PERMISSION DEPENDS ON THE ACTION, AND THAT IS §3, NOT A CONVENIENCE.
//
// `12_RBAC` §3 gives moderator Dismiss, Hide and Suspend, and WITHHOLDS Delete
// and Ban. So this route resolves the required permission from the requested
// `kind` and asks the PDP once, for that one id. It is not a compound gate and
// not a role check — it is one decision, for the operation actually requested.
//
// Suspend and ban are NOT here. §3 grants them the same roles Module 08's
// `users.account.suspend` / `users.account.ban` already carry, and those routes
// already exist with their own guards, audit and — since 2026-08-21 — session
// revocation. A second path to ban somebody would be a second authorization
// path for one authority.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import type { PermissionId } from '@/lib/admin/permissions/types'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import {
  statusFor,
  actionFor,
  publicationStateFor,
  type Resolution,
} from '@/lib/admin/moderation/moderationService'
import { ResolveSchema, isUuid } from '../../schema'

export const dynamic = 'force-dynamic'

/**
 * `12_RBAC` §3, transcribed. Delete is the one content action §3 withholds
 * from the role that does the reviewing.
 */
const PERMISSION_FOR: Record<Resolution['kind'], PermissionId> = {
  dismiss: PERMISSIONS.MODERATION_REPORT_DISMISS,
  hide: PERMISSIONS.MODERATION_CONTENT_HIDE,
  restore: PERMISSIONS.MODERATION_CONTENT_HIDE,
  delete: PERMISSIONS.MODERATION_CONTENT_DELETE,
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    if (!isUuid(params.id)) {
      // Before authorization on purpose: a malformed id is not a permission
      // question, and answering it as one would leak which ids exist.
      return adminError('VALIDATION_ERROR', 'Invalid queue item id', 422)
    }

    // The body decides WHICH permission, so it is read before the PDP call.
    // Nothing has been mutated at this point and nothing is audited yet.
    const parsed = ResolveSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { kind, reason, notes } = parsed.data

    const ctx = await requirePermission(req, PERMISSION_FOR[kind])
    const { user } = ctx
    const actorRole = auditActorRole(ctx.actor)

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(`admin:moderation:resolve:${user.id}`, 30, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const admin = createAdminClient()

    // Read the item first: the target type decides what a content action is
    // allowed to touch, and an unknown item must 404 rather than write a
    // moderation_action about nothing.
    const { data: itemRow, error: readError } = await admin
      .from('moderation_queue')
      .select('id, status, target_type, target_id')
      .eq('id', params.id)
      .maybeSingle()

    if (readError) {
      console.error('[admin][moderation] item read failed:', readError.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    const item = itemRow as { id: string; status: string; target_type: string; target_id: string } | null
    if (!item) return adminError('NOT_FOUND', 'Queue item not found', 404)

    // Already-resolved items are refused rather than re-resolved. Two decisions
    // on one report is two audit entries claiming to be the outcome.
    if (item.status === 'resolved' || item.status === 'dismissed') {
      return adminError('CONFLICT', 'This item has already been resolved', 409)
    }

    // A content action only makes sense against content. §4.4's `target_type`
    // is the discriminator, and the Content Safety Gate owns only reviews.
    if (kind !== 'dismiss' && item.target_type !== 'review') {
      return adminError(
        'VALIDATION_ERROR',
        'Only a reported review can be hidden, restored or deleted from here',
        422
      )
    }

    // The content effect, through the GATE's own mechanism. `publication_state`
    // is server-controlled (`20260817_content_safety_gate.sql`); Module 09 sets
    // it rather than inventing a second way to hide a review.
    if (kind === 'hide' || kind === 'restore') {
      const { error } = await admin
        .from('reviews')
        .update({ publication_state: publicationStateFor(kind) })
        .eq('id', item.target_id)
      if (error) {
        console.error('[admin][moderation] publication_state update failed:', error.message)
        return adminError('INTERNAL_ERROR', 'Operation failed', 500)
      }
    }

    if (kind === 'delete') {
      const { error } = await admin.from('reviews').delete().eq('id', item.target_id)
      if (error) {
        console.error('[admin][moderation] content delete failed:', error.message)
        return adminError('INTERNAL_ERROR', 'Operation failed', 500)
      }
    }

    // The decision history. Written BEFORE the queue is closed so a failure
    // leaves an open item with a recorded decision — visible and re-runnable —
    // rather than a closed item nobody can account for.
    const { error: actionError } = await admin.from('moderation_actions').insert({
      queue_id: item.id,
      action: actionFor(kind),
      actor_id: user.id,
      target_content_id: item.target_id,
      reason,
      notes: notes ?? null,
    })
    if (actionError) {
      console.error('[admin][moderation] action insert failed:', actionError.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    const { error: closeError } = await admin
      .from('moderation_queue')
      .update({
        status: statusFor(kind),
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        resolution: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
    if (closeError) {
      console.error('[admin][moderation] queue close failed:', closeError.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      action: `moderation.${actionFor(kind)}`,
      targetType: item.target_type,
      targetId: item.target_id,
      // The decision and its reason. NOT the reported content, and — ADR-026
      // I-5 — nothing from `metadata`.
      metadata: { queue_id: item.id, kind, reason, notes: notes ?? null },
      req,
    })

    return Response.json({ data: { id: item.id, status: statusFor(kind) } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
