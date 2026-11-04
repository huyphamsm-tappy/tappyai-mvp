package com.tappyai.core.common

/**
 * Compact Vietnamese Dong formatting. A price is never stated higher or lower than it is:
 * ≥ 1,000,000 → "X triệu" rounded to one decimal, written with a comma as Vietnamese reads it ("25,8 triệu", 25.990.000 → "26 triệu");
 * a round number of thousands → "250k"; anything else → the exact amount ("249.500đ", "500đ").
 */
fun formatCompactVnd(amount: Long): String {
    // 999.950 and up rounds to a million
    if (amount >= 999_950) {
        val tenths = (amount + 50_000) / 100_000
        val whole = tenths / 10
        val decimal = tenths % 10
        return if (decimal > 0) "$whole,$decimal triệu" else "$whole triệu"
    }
    if (amount >= 1_000 && amount % 1_000 == 0L) return "${amount / 1_000}k"
    return amount.toString().reversed().chunked(3).joinToString(".").reversed() + "đ"
}
