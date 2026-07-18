package com.tappyai.app.membership.data

import com.tappyai.core.network.NetworkResult

/** The subset of subscription data the membership screen displays — Pro/Free state plus the daily
 *  message quota shown in the Free banner. Purchase/upgrade is intentionally absent: IAP (no
 *  /api/iap/google) and Stripe checkout are backend-blocked on Android, so this stays read-only. */
data class MembershipStatus(
    val isPro: Boolean,
    val remaining: Int,
    val freeDailyLimit: Int,
)

interface MembershipRepository {
    /** Reads GET /api/subscription. Errors (incl. 401 when signed out) surface as a typed error so
     *  the screen can fall back to the static Free presentation. */
    suspend fun getStatus(): NetworkResult<MembershipStatus>
}
