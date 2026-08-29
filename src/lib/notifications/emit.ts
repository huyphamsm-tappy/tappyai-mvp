import { createAdminClient } from '@/lib/supabase/admin'
import { sendNotificationToUser, type PushResult } from './send'

// ─── Contract (ADR-014) ─────────────────────────────────────────────────────
// One notification `type` per generator; `category` is the coarse grouping used
// by the Inbox and (future) per-category push opt-in.
export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'milestone'
  | 'deal'
  | 'morning_brief'
  | 'weekly'
  | 'travel'
  | 'lunch'
  | 'price'
  | 'broadcast'
  | 'system'

export type NotificationCategory = 'social' | 'deal' | 'explore' | 'system'

export type PushStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface EmitNotificationInput {
  userId: string
  type: NotificationType
  category: NotificationCategory
  title: string
  body: string
  actorId?: string | null
  entityUrl?: string | null
  imageUrl?: string | null
  data?: Record<string, unknown>
  /**
   * Persist the row but do NOT dispatch a device push. Used by the one-time
   * backfill so historical events populate the Inbox without re-pinging phones.
   * A skipPush row is stored read (read_at set by the caller) and push_status='skipped'.
   */
  skipPush?: boolean
  /** Backfill only — preserve the original event time instead of now(). */
  createdAt?: string
  /** Backfill only — land the row already-read so it doesn't inflate the badge. */
  readAt?: string | null
}

export interface EmitResult {
  id: string | null
  /**
   * The value PERSISTED on the row. Unchanged, and deliberately so.
   *
   * ⚠️ It is lossy: `pushStatusFor` receives only `{attempted, failed}`, so a
   * send whose only subscription was dead (`gone: 1`) is stored as `'sent'`.
   * That is a known, Owner-DEFERRED persistence defect — not something to work
   * around here. Use `push` below for anything a human will read.
   */
  pushStatus: PushStatus
  /**
   * The COMPLETE transport result, added 2026-08-29 (Owner-approved, additive).
   *
   * `pushStatus` collapses four distinct outcomes into one word and destroys
   * `gone` entirely, which makes it unable to answer "did this actually reach a
   * device". Callers that report to a person must read this instead. No existing
   * caller reads `EmitResult` at all, so adding a field breaks nothing.
   */
  push: PushResult
}

/** Nothing was dispatched — used for the early returns below. */
const NO_PUSH: PushResult = { attempted: 0, sent: 0, failed: 0, gone: 0 }

// Derive the stored push_status from a PushResult (see send.ts for the rules).
export function pushStatusFor(r: { attempted: number; failed: number }): PushStatus {
  if (r.attempted === 0) return 'skipped'
  if (r.failed > 0) return 'failed'
  return 'sent'
}

/**
 * emitNotification — the ONE writer of the `notifications` table (ADR-014).
 *
 * Every producer (social event routes, crons, broadcast) calls this and nothing
 * else. It (1) INSERTs the persisted row so the Inbox + unread badge see it
 * immediately, then (2) dispatches a device push from the SAME payload, then
 * (3) records the push outcome on the row for observability/retry.
 *
 * Uses the service-role client: the table has no client INSERT policy, so only
 * the server can mint a notification. Never import this into a client component.
 *
 * Non-throwing by contract — a notification must never break the action that
 * triggered it (a like, a comment, a cron tick). Failures are logged and folded
 * into the returned result.
 */
export async function emitNotification(input: EmitNotificationInput): Promise<EmitResult> {
  const admin = createAdminClient()

  const backfilled = input.skipPush === true
  const insertRow = {
    user_id: input.userId,
    type: input.type,
    category: input.category,
    title: input.title,
    body: input.body,
    actor_id: input.actorId ?? null,
    entity_url: input.entityUrl ?? null,
    image_url: input.imageUrl ?? null,
    data: input.data ?? {},
    push_status: 'pending' as PushStatus,
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
    ...(input.readAt !== undefined ? { read_at: input.readAt } : {}),
  }

  const { data: row, error } = await admin
    .from('notifications')
    .insert(insertRow)
    .select('id')
    .single()

  if (error || !row) {
    console.error('[emitNotification] insert failed:', error)
    return { id: null, pushStatus: 'pending', push: NO_PUSH }
  }
  const id = row.id as string

  if (backfilled) {
    // Row already persisted for Inbox history; no push, mark skipped.
    await admin.from('notifications').update({ push_status: 'skipped' }).eq('id', id)
    return { id, pushStatus: 'skipped', push: NO_PUSH }
  }

  // Dispatch the device push from the same payload.
  let push: Awaited<ReturnType<typeof sendNotificationToUser>>
  try {
    push = await sendNotificationToUser(input.userId, {
      title: input.title,
      body: input.body,
      ...(input.imageUrl ? { image: input.imageUrl } : {}),
      // push-sw.js opens data.url on click — keep the deep link there.
      data: { url: input.entityUrl ?? undefined, notificationId: id, ...(input.data ?? {}) },
    })
  } catch (e) {
    console.error('[emitNotification] push dispatch threw:', e)
    push = { attempted: 1, sent: 0, failed: 1, gone: 0, firstError: String(e) }
  }

  const pushStatus = pushStatusFor(push)
  const { error: updErr } = await admin
    .from('notifications')
    .update({
      push_status: pushStatus,
      push_sent_at: pushStatus === 'sent' || pushStatus === 'failed' ? new Date().toISOString() : null,
      push_attempts: push.attempted === 0 ? 0 : 1,
      push_error: push.firstError ?? null,
    })
    .eq('id', id)
  if (updErr) console.error('[emitNotification] push_status update failed:', updErr)

  // `push` carries what actually happened; `pushStatus` carries what was stored.
  return { id, pushStatus, push }
}

/**
 * Fan-out helper for the crons/broadcast: emit one notification per user.
 * Returns a summary so callers can report sent/failed counts as before.
 */
export async function emitNotificationToUsers(
  inputs: EmitNotificationInput[]
): Promise<{ ok: number; failed: number }> {
  const results = await Promise.allSettled(inputs.map(emitNotification))
  let ok = 0
  let failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.id) ok++
    else failed++
  }
  return { ok, failed }
}
