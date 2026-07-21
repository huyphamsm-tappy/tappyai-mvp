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
