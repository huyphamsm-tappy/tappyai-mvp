package com.tappyai.app.chat

/**
 * Maps a free-text merchant / seller string (Serper `source`, e.g. "Shopee",
 * "TikTok Shop", "CellphoneS") to a SMALL FIXED enum for analytics — the Kotlin twin
 * of web's `src/lib/commerce/sellerPlatform.ts`.
 *
 * 🔒 The raw seller string is NEVER emitted to analytics — only this low-cardinality
 * bucket is (the `platform` param of `shopping_search_click`).
 */
fun sellerPlatform(seller: String?): String {
    val s = (seller ?: "").lowercase()
    return when {
        s.contains("shopee") -> "shopee"
        s.contains("lazada") -> "lazada"
        s.contains("tiktok") -> "tiktok" // before "tiki" so "TikTok" is not mis-bucketed
        s.contains("tiki") -> "tiki"
        else -> "other"
    }
}
