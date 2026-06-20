import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

export interface NotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  data?: Record<string, unknown>
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
      icon: payload.icon ?? '/logo.png',
      badge: payload.badge ?? '/logo.png',
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
 * Send a push notification to a single user across all their active subscriptions.
 * Provider-agnostic: adding FCM later only requires a new `case` in dispatch().
 */
export async function sendNotificationToUser(
  userId: string,
  payload: NotificationPayload
): Promise<void> {
  const supabase = createAdminClient()
  const { data: subs, error } = await supabase
    .from('notification_subscriptions')
    .select('provider, subscription_data')
    .eq('user_id', userId)
    .eq('enabled', true)

  if (error) {
    console.error('[notifications] Failed to fetch subscriptions:', error)
    return
  }
  if (!subs?.length) return

  const results = await Promise.allSettled(
    subs.map(s => dispatch(s.provider, s.subscription_data as Record<string, unknown>, payload))
  )

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[notifications] Dispatch failed for sub ${i}:`, r.reason)
    }
  })
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
