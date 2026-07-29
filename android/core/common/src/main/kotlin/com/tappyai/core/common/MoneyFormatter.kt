package com.tappyai.core.common

/**
 * Compact Vietnamese Dong formatting matching the web's `fmtVND`:
 * ≥ 1,000,000 → "X triệu" (one decimal if non-zero), else → "Xk".
 *
 * Web-parity-sync fix: the one-decimal branch used integer division (`(amount % 1_000_000) /
 * 100_000`), which truncates instead of rounding like the web's `(n / 1_000_000).toFixed(1)` —
 * e.g. ₫1,250,000 showed "1.2 triệu" on Android vs the web's "1.3 triệu" for the exact same
 * price-watch target. Rounds to the nearest tenth-of-a-triệu first, matching `toFixed`'s
 * round-half-up behavior exactly.
 */
fun formatCompactVnd(amount: Long): String {
    if (amount >= 1_000_000) {
        if (amount % 1_000_000 == 0L) return "${amount / 1_000_000} triệu"
        // Web `(n/1_000_000).toFixed(1)` rounds half-UP to a tenth. kotlin.math.round is
        // round-half-to-EVEN (12.5 → 12), which diverges on every X,250,000 value; floor(x + 0.5)
        // is the half-up equivalent for these positive amounts (12.5 → 13), matching the web.
        val tenths = kotlin.math.floor(amount / 100_000.0 + 0.5).toLong()
        return "${tenths / 10}.${tenths % 10} triệu"
    }
    // Web `(n/1000).toFixed(0)` rounds half-up; integer division truncated (249,500 → "249k" vs the
    // web's "250k"). Math.round(double) = floor(x + 0.5) = half-up.
    val thousands = Math.round(amount / 1_000.0)
    return "${thousands}k"
}
