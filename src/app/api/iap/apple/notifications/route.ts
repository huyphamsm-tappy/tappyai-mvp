/**
 * POST /api/iap/apple/notifications
 *
 * Apple App Store Server Notifications V2 webhook.
 * Configure this URL in App Store Connect → App Information → App Store Server Notifications.
 *
 * Flow:
 *   1. Verify the top-level signedPayload JWS (full cert chain + ES256 signature).
 *   2. Verify the embedded signedTransactionInfo JWS.
 *   3. Look up the user by originalTransactionId in the subscriptions table.
 *   4. Update the row to reflect the new subscription state.
 *
 * Uses the Supabase service-role key because there is no user session — Apple calls this
 * endpoint directly, not through the client app.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyNotificationPayload, verifyTransactionInfo, JWSVerificationError } from '@/lib/apple-iap/jws'
import type { NotificationType, JWSTransaction } from '@/lib/apple-iap/types'

// Admin client — never exposed to client-side code.
function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: Request) {
  let body: { signedPayload?: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.signedPayload) {
    return NextResponse.json({ error: 'Missing signedPayload' }, { status: 400 })
  }

  // ── 1. Verify the outer notification JWS ──────────────────────────────
  let notification
  try {
    notification = await verifyNotificationPayload(body.signedPayload)
  } catch (err) {
    if (err instanceof JWSVerificationError) {
      console.error('[apple/notifications] JWS verification failed:', err.message)
      // Return 200 to prevent Apple from retrying with a payload we know is invalid.
      return NextResponse.json({ ok: false, reason: 'jws_invalid' })
    }
    console.error('[apple/notifications] Unexpected error during notification parse:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  // TEST notifications from App Store Connect — acknowledge and return.
  if (notification.notificationType === 'TEST') {
    console.info('[apple/notifications] TEST notification received')
    return NextResponse.json({ ok: true })
  }

  // ── 2. Verify the embedded transaction JWS ────────────────────────────
  let tx: JWSTransaction
  try {
    tx = await verifyTransactionInfo(notification.data.signedTransactionInfo)
  } catch (err) {
    console.error('[apple/notifications] signedTransactionInfo verification failed:', err)
    return NextResponse.json({ ok: false, reason: 'transaction_jws_invalid' })
  }

  // Only process subscription product events
  if (tx.type !== 'Auto-Renewable Subscription') {
    return NextResponse.json({ ok: true })
  }

  // ── 3. Dispatch to state handler ─────────────────────────────────────
  try {
    await handleNotification(notification.notificationType, notification.subtype, tx)
  } catch (err) {
    console.error('[apple/notifications] Handler error:', err)
    // Return 500 so Apple retries — the DB write failed, try again later.
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// ── Notification handler ────────────────────────────────────────────────────

async function handleNotification(
  type: NotificationType,
  subtype: string | undefined,
  tx: JWSTransaction
): Promise<void> {
  const db = adminSupabase()
  const subId = `apple_${tx.originalTransactionId}`

  // Find which user owns this Apple subscription
  const { data: row } = await db
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_sub_id', subId)
    .maybeSingle()

  if (!row) {
    // Unknown transaction — Apple may have notified before the first purchase sync.
    // Log and skip; the verify endpoint will create the row on the user's next purchase/restore.
    console.warn(`[apple/notifications] No subscription row for ${subId} (type=${type})`)
    return
  }

  const userId = row.user_id

  switch (type) {
    case 'SUBSCRIBED':
    case 'DID_RENEW': {
      // New subscription or successful renewal — set active with updated expiry.
      const expiresAt = tx.expiresDate ? new Date(tx.expiresDate) : null
      await upsertSubscription(db, userId, subId, 'active', expiresAt, false)
      console.info(`[apple/notifications] ${type}: userId=${userId} expires=${expiresAt?.toISOString()}`)
      break
    }

    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED': {
      // Subscription has fully lapsed — downgrade to free.
      const expiresAt = tx.expiresDate ? new Date(tx.expiresDate) : new Date()
      await upsertSubscription(db, userId, subId, 'canceled', expiresAt, false)
      console.info(`[apple/notifications] ${type}: userId=${userId} downgraded to free`)
      break
    }

    case 'DID_FAIL_TO_RENEW': {
      // Entered billing retry period — keep status as past_due (not yet expired).
      const expiresAt = tx.expiresDate ? new Date(tx.expiresDate) : null
      await upsertSubscription(db, userId, subId, 'past_due', expiresAt, false)
      console.info(`[apple/notifications] DID_FAIL_TO_RENEW: userId=${userId} billing retry`)
      break
    }

    case 'REVOKE': {
      // Family sharing revoked or subscription revoked by Apple.
      await upsertSubscription(db, userId, subId, 'canceled', new Date(), false)
      console.info(`[apple/notifications] REVOKE: userId=${userId}`)
      break
    }

    case 'REFUND': {
      // Purchase refunded — remove entitlement immediately.
      await upsertSubscription(db, userId, subId, 'canceled', new Date(), false)
      console.info(`[apple/notifications] REFUND: userId=${userId}`)
      break
    }

    case 'DID_CHANGE_RENEWAL_STATUS': {
      if (subtype === 'AUTO_RENEW_DISABLED') {
        // User turned off auto-renew — mark to cancel at period end, but stay active now.
        await db
          .from('subscriptions')
          .update({ cancel_at_period_end: true })
          .eq('stripe_sub_id', subId)
        console.info(`[apple/notifications] AUTO_RENEW_DISABLED: userId=${userId}`)
      } else if (subtype === 'AUTO_RENEW_ENABLED') {
        await db
          .from('subscriptions')
          .update({ cancel_at_period_end: false })
          .eq('stripe_sub_id', subId)
        console.info(`[apple/notifications] AUTO_RENEW_ENABLED: userId=${userId}`)
      }
      break
    }

    default:
      console.info(`[apple/notifications] Unhandled type=${type} subtype=${subtype} — ignored`)
  }
}

async function upsertSubscription(
  db: ReturnType<typeof adminSupabase>,
  userId: string,
  subId: string,
  status: string,
  expiresAt: Date | null,
  cancelAtPeriodEnd: boolean
): Promise<void> {
  const { error } = await db
    .from('subscriptions')
    .update({
      status,
      current_period_end: expiresAt?.toISOString() ?? null,
      cancel_at_period_end: cancelAtPeriodEnd,
    })
    .eq('stripe_sub_id', subId)

  if (error) throw new Error(`Supabase update failed: ${error.message}`)
}
