package com.tappyai.core.common

/**
 * Compact Vietnamese Dong formatting matching the web's `fmtVND`:
 * ≥ 1,000,000 → "X triệu" (one decimal if non-zero), else → "Xk".
 */
fun formatCompactVnd(amount: Long): String {
    if (amount >= 1_000_000) {
        val millions = amount / 1_000_000
        val remainder = (amount % 1_000_000) / 100_000
        return if (remainder > 0) "$millions.${remainder} triệu" else "$millions triệu"
    }
    val thousands = amount / 1_000
    return "${thousands}k"
}
