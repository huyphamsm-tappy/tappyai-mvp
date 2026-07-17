package com.tappyai.app.deals

/**
 * One curated deal card — mirrors the web's `Deal` type (`src/lib/shopee-deals.ts`) exactly.
 * [badge] is an optional "HOT"/"MỚI" callout; there is no image/expiry field on the web model,
 * so none exists here either (no fabricated urgency/media per the web's own MFS 3.10 note).
 */
data class Deal(
    val title: String,
    val category: String,
    val discount: String,
    val url: String,
    val source: String,
    val emoji: String,
    val badge: String?,
)
