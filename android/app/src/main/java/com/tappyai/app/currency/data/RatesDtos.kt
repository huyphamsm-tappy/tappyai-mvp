package com.tappyai.app.currency.data

import kotlinx.serialization.Serializable

/**
 * Wire shape for `GET /api/rates` — matches the backend's `{rates, date, fallback}` exactly.
 * [rates] is USD-based (`rates["USD"] == 1`, every other code is "units per 1 USD"); the backend
 * fetches it from a live FX source server-side and itself falls back to a hardcoded table on
 * failure ([fallback] `true`) — this DTO only transports whichever the backend returned.
 */
@Serializable
data class RatesResponseDto(
    val rates: Map<String, Double> = emptyMap(),
    val date: String? = null,
    val fallback: Boolean = false,
)
