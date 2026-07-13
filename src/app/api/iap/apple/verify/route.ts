/**
 * POST /api/iap/apple/verify
 *
 * Called by the iOS client after every successful StoreKit 2 purchase or restore.
 * Validates the transaction via the App Store Server API (independent of the client),
 * then upserts the subscriptions table.
 *
 * If APPLE_IAP_* env vars are not set (e.g. development), falls back to the
 * iOS-provided expiresDate with a logged warning.
 */

import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { isAppleIAPConfigured, isSubscriptionActive, getSubscriptionStatuses } from '@/lib/apple-iap/api'
import { verifyTransactionInfo, JWSVerificationError } from '@/lib/apple-iap/jws'

export async function POST(req: Request) {
  try {
    const { user } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const {
      originalTransactionId,
      transactionId,
      expiresDate,   // Unix seconds — fallback only
      productId,
      signedTransactionInfo, // Optional: iOS may send the JWS for server-side verification
    } = body

    if (!originalTransactionId || !productId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── Determine authoritative expiry ────────────────────────────────────
    // Entitlement may ONLY be derived from a trusted source: the App Store
    // Server API, or a cryptographically-verified transaction JWS. An unsigned
    // client-provided `expiresDate` is trusted ONLY in development (no Apple
    // creds); in production it is never trusted — otherwise any authenticated
    // client could POST a far-future expiresDate and self-grant Pro.

    const isProd = process.env.NODE_ENV === 'production'
    let isPro = false
    let expiresAt: Date | null = null
    let authoritative = false // true only when the result came from a trusted source

    if (isAppleIAPConfigured()) {
      // Path A: App Store Server API — Apple is the source of truth
      try {
        const statusResponse = await getSubscriptionStatuses(originalTransactionId)
        const allTx = statusResponse.data.flatMap(g => g.lastTransactions)
        const activeTx = allTx.find(tx => tx.status === 1 || tx.status === 4)
        isPro = !!activeTx
        authoritative = true

        if (activeTx && activeTx.signedTransactionInfo) {
          // Verify and decode the transaction JWS for the exact expiry date
          try {
            const decoded = await verifyTransactionInfo(activeTx.signedTransactionInfo)
            expiresAt = decoded.expiresDate ? new Date(decoded.expiresDate) : null
          } catch (err) {
            if (err instanceof JWSVerificationError) {
              console.error('[iap/apple/verify] signedTransactionInfo JWS invalid:', err.message)
            }
            // Fall through — use active status without pinned expiry
          }
        }

        console.info(
          `[iap/apple/verify] API verified: userId=${user.id} isPro=${isPro} ` +
          `expires=${expiresAt?.toISOString() ?? 'unknown'}`
        )
      } catch (err) {
        // App Store Server API call failed. Do NOT fall back to unsigned client
        // data. We try a client-sent JWS below; if that is also absent we return
        // 503 WITHOUT touching the stored row (avoids wrongly downgrading a
        // paying user on a transient Apple outage, and blocks the self-grant bypass).
        console.error('[iap/apple/verify] App Store API failed:', err)
      }
    } else if (!isProd) {
      // DEV ONLY: no Apple credentials — trust the client-provided expiresDate so
      // local/staging testing works. This branch is never reached in production.
      console.warn('[iap/apple/verify] APPLE_IAP_* not configured — DEV fallback to client data')
      if (typeof expiresDate === 'number') {
        expiresAt = new Date(expiresDate * 1000)
        isPro = expiresAt > new Date()
        authoritative = true
      }
    } else {
      // Production with no Apple credentials — cannot verify anything. Fail closed.
      console.error('[iap/apple/verify] APPLE_IAP_* not configured in production — cannot verify')
      return NextResponse.json({ error: 'IAP verification unavailable' }, { status: 503 })
    }

    // Cryptographically-verified client JWS is trustworthy in every environment.
    if (!authoritative && signedTransactionInfo) {
      try {
        const decoded = await verifyTransactionInfo(signedTransactionInfo)
        if (decoded.expiresDate) {
          expiresAt = new Date(decoded.expiresDate)
          isPro = expiresAt > new Date()
          authoritative = true
        }
      } catch (err) {
        if (err instanceof JWSVerificationError) {
          console.error('[iap/apple/verify] Client-sent JWS invalid:', err.message)
          return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
        }
      }
    }

    // No trusted result (e.g. transient App Store API outage and no signed JWS):
    // return a retryable error without modifying the stored subscription.
    if (!authoritative) {
      return NextResponse.json({ error: 'Verification unavailable, please retry' }, { status: 503 })
    }

    // ── Upsert subscriptions table ────────────────────────────────────────
    // Writes to `subscriptions` require the service-role client: the table has
    // no user-level RLS write policy (the Stripe webhook likewise writes via the
    // admin client). Using the request-scoped RLS client here would be silently
    // denied and the entitlement would never persist.

    const { error } = await createAdminClient()
      .from('subscriptions')
      .upsert(
        {
          user_id: user.id,
          stripe_sub_id: `apple_${originalTransactionId}`,
          plan: 'pro',
          status: isPro ? 'active' : 'expired',
          current_period_end: expiresAt?.toISOString() ?? null,
          cancel_at_period_end: false,
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('[iap/apple/verify] Upsert error:', error)
      return NextResponse.json({ error: 'Failed to sync subscription' }, { status: 500 })
    }

    return NextResponse.json({
      isPro,
      currentPeriodEnd: expiresAt?.toISOString() ?? null,
    })
  } catch (e) {
    console.error('[iap/apple/verify] Unexpected error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
