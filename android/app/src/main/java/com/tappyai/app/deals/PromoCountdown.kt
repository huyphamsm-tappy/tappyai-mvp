package com.tappyai.app.deals

import java.time.Instant
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Deal expiry countdown state — a Kotlin port of the web `promoCountdown` (`src/lib/deals/
 * countdown.ts`). Pure + testable. Thresholds match the web exactly: expired/absent → [None],
 * within 24h → [Soon] ("🔥 Ending Soon"), else [Days] with `max(1, round(hoursLeft/24))`.
 */
sealed interface PromoCountdown {
    data object None : PromoCountdown
    data object Soon : PromoCountdown
    data class Days(val days: Int) : PromoCountdown
}

fun promoCountdown(endAtIso: String?, nowMs: Long): PromoCountdown {
    if (endAtIso.isNullOrBlank()) return PromoCountdown.None
    val endMs = runCatching { Instant.parse(endAtIso).toEpochMilli() }.getOrNull() ?: return PromoCountdown.None
    val hoursLeft = (endMs - nowMs) / 3_600_000.0
    if (hoursLeft <= 0) return PromoCountdown.None
    if (hoursLeft <= 24) return PromoCountdown.Soon
    return PromoCountdown.Days(max(1, (hoursLeft / 24.0).roundToInt()))
}
