import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationKind } from './kind'

/**
 * Free-form delivery data, plus the one field the clients agree on.
 *
 * `kind` classifies the notification (see ./kind). It lives here rather than as a column because
 * `data` is already forwarded verbatim to every provider — so the classification survives delivery
 * with no migration and no dispatch change. Omitting it means `normal`, which is what every
 * notification written before this existed will continue to be.
 */
export type NotificationData = Record<string, unknown> & {
  kind?: NotificationKind
}

export interface NotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  image?: string
  data?: NotificationData
}

type WebPushSubscriptionData = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

// ─── Internal dispatch ────────────────────────────────────────────────────────

async function dispatchWebPush(subData: WebPushSubscriptionData, payload: NotificationPayload) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL ?? 'admin@tappyai.com'}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  await webpush.sendNotification(
    { endpoint: subData.endpoint, keys: subData.keys },
    JSON.stringify({
      title: payload.title,
      body: payload.body,
      // The otter mascot, not the retired infinity-mark /logo.png. The server always sends these
      // two fields, so the service worker's own `data.icon || …` fallback never applies — both
      // places have to carry the current branding or the old logo still ships.
      icon: payload.icon ?? '/tappy/wave.png',
      badge: payload.badge ?? '/tappy/wave.png',
      ...(payload.image ? { image: payload.image } : {}),
      data: payload.data ?? {},
    })
  )
}

async function dispatch(
  provider: string,
  subscriptionData: Record<string, unknown>,
  payload: NotificationPayload
): Promise<void> {
  switch (provider) {
    case 'webpush':
      await dispatchWebPush(subscriptionData as unknown as WebPushSubscriptionData, payload)
      break

    // ── FCM (future) ──────────────────────────────────────────────────────────
    // case 'fcm': {
    //   const { token } = subscriptionData as { token: string }
    //   await sendFCMNotification(token, payload)  // TODO: implement when native app ships
    //   break
    // }
    // ─────────────────────────────────────────────────────────────────────────

    default:
      console.warn(`[notifications] Unknown provider: ${provider}`)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Outcome of a push dispatch, so the caller (emitNotification) can record
 * push_status/push_error on the persisted notifications row (ADR-014 #6).
 *  - attempted === 0  → the user has no enabled subscription → row is 'skipped'.
 *  - failed  >  0     → at least one live sub errored transiently → row is 'failed' (retry-worthy).
 *  - otherwise        → 'sent'. `gone` (404/410, pruned) is not counted as a retry-worthy failure.
 */
export interface PushResult {
  attempted: number
  sent: number
  failed: number
  gone: number
  firstError?: string
}

/**
 * Send a push notification to a single user across all their active subscriptions.
 * Provider-agnostic: adding FCM later only requires a new `case` in dispatch().
 * Returns a {@link PushResult} describing delivery for observability/retry.
 */
export async function sendNotificationToUser(
  userId: string,
  payload: NotificationPayload
): Promise<PushResult> {
  const supabase = createAdminClient()
  const { data: subs, error } = await supabase
    .from('notification_subscriptions')
    .select('id, provider, subscription_data')
    .eq('user_id', userId)
    .eq('enabled', true)

  if (error) {
    console.error('[notifications] Failed to fetch subscriptions:', error)
    return { attempted: 0, sent: 0, failed: 0, gone: 0, firstError: error.message }
  }
  if (!subs?.length) return { attempted: 0, sent: 0, failed: 0, gone: 0 }

  const results = await Promise.allSettled(
    subs.map(s => dispatch(s.provider, s.subscription_data as Record<string, unknown>, payload))
  )

  // Prune subscriptions the push service reports as permanently gone (Web Push
  // 404/410, APNs 410) — otherwise dead endpoints accumulate forever and every
  // future send/cron re-attempts them, inflating failures and wasting the budget.
  const goneIds: string[] = []
  let sent = 0
  let failed = 0
  let firstError: string | undefined
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sent++
      return
    }
    const status = (r.reason as { statusCode?: number })?.statusCode
    if (status === 404 || status === 410) {
      goneIds.push(subs[i].id as string)
    } else {
      failed++
      if (!firstError) firstError = String((r.reason as Error)?.message ?? r.reason)
      console.error(`[notifications] Dispatch failed for sub ${subs[i].id}:`, r.reason)
    }
  })

  if (goneIds.length > 0) {
    const { error: pruneErr } = await supabase
      .from('notification_subscriptions')
      .update({ enabled: false })
      .in('id', goneIds)
    if (pruneErr) console.error('[notifications] Failed to prune dead subscriptions:', pruneErr)
    else console.info(`[notifications] Pruned ${goneIds.length} dead subscription(s)`)
  }

  return { attempted: subs.length, sent, failed, gone: goneIds.length, firstError }
}

/**
 * Fetch all user IDs that have enabled subscriptions (for cron broadcast use).
 */
export async function getAllSubscribedUserIds(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('notification_subscriptions')
    .select('user_id')
    .eq('enabled', true)

  if (error) {
    console.error('[notifications] Failed to fetch subscribed users:', error)
    return []
  }
  // Deduplicate (one user may have multiple providers in the future)
  return Array.from(new Set((data ?? []).map(r => r.user_id as string)))
}
