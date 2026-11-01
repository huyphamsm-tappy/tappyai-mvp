package com.tappyai.app.membership.data

import kotlinx.serialization.Serializable

/**
 * GET /api/subscription response. Keys are camelCase on the wire (unlike the snake_case reviews
 * endpoints), so no @SerialName mapping is needed. Every field has a default so a partial/errored
 * shape still deserializes under the shared lenient Json.
 */
@Serializable
data class SubscriptionDto(
    val isPro: Boolean = false,
    val status: String? = null,
    val currentPeriodEnd: String? = null,
    val freeDailyLimit: Int = 0,
    val todayMessageCount: Int = 0,
    val remaining: Int = 0,
)

/** GET /api/payments/me: only what the app reads (the rest — quota, period end, channel — is ignored by the lenient Json). */
@Serializable
data class MyPlanDto(
    val signedIn: Boolean = false,
    val subscription: MySubscriptionDto? = null,
)

@Serializable
data class MySubscriptionDto(
    /** ACTIVE | CANCELLED | EXPIRED | PENDING | NONE */
    val state: String? = null,
    val plan: MyPlanIdDto? = null,
)

@Serializable
data class MyPlanIdDto(val id: String? = null)

/** What the composer needs to know about the account's plan: whether it has a live plan, and which. */
data class PlanAccess(val signedIn: Boolean, val state: String?, val planId: String?)
