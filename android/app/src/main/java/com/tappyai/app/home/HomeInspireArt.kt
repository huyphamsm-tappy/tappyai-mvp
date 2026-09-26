package com.tappyai.app.home

import androidx.annotation.DrawableRes
import com.tappyai.app.R

// ── "Gợi ý cho bạn" card art — the web's `public/home/inspire/*.webp`, assigned the web's way ──
//
// The web Home (`HomeV3.tsx`, section `for-you`) paints each suggestion card with one of five
// owner-approved photographs, one per real category (`CATEGORY_PREFERRED_ART` over `ART_POOL`).
// The five files are copied byte-for-byte into `drawable-nodpi/home_inspire_<category>.webp`
// (VP8 WebP, 1000×563 — decoded natively since API 14); nothing is redrawn or generated.
//
// 🚨 A HINT, NOT A MAPPING (the web's own rule, `assignCardArt`). The prompt list is free to carry
// the same category twice — Home's six really do (food ×2, entertainment ×2) — and a per-category
// lookup would hand two neighbouring cards the SAME picture, the most visible defect a row can
// have. So art is assigned PER CARD: a card takes its category's scene if that scene is still
// free, otherwise the next free scene from the pool, and only when every scene is taken (more
// cards than scenes) does a repeat happen — by position, never by leaving a card empty. These are
// presentation artwork, not factual illustrations: a spa scene above a travel prompt is a picture,
// not a claim. The card's category label stays the real metadata and is never derived from the art.

/** The pool, in the web's `ART_POOL` order. */
internal val HOME_INSPIRE_POOL: List<Int> = listOf(
    R.drawable.home_inspire_food,
    R.drawable.home_inspire_travel,
    R.drawable.home_inspire_shopping,
    R.drawable.home_inspire_spa,
    R.drawable.home_inspire_entertainment,
)

/** The web's `CATEGORY_PREFERRED_ART`: which scene a category would like, if it is free. */
@DrawableRes
internal fun preferredInspireArt(category: String): Int? = when (category) {
    "food" -> R.drawable.home_inspire_food
    "travel" -> R.drawable.home_inspire_travel
    "shopping" -> R.drawable.home_inspire_shopping
    "spa" -> R.drawable.home_inspire_spa
    "entertainment" -> R.drawable.home_inspire_entertainment
    else -> null
}

/**
 * One drawable per card, in card order — the web's `assignCardArt` with the same three passes:
 * the category's preferred scene when free; else the next free pool scene from the card's
 * position; else (more cards than scenes) the pool by position, so a repeat beats a blank.
 */
internal fun assignInspireArt(categories: List<String>, pool: List<Int> = HOME_INSPIRE_POOL): List<Int> {
    val out = arrayOfNulls<Int>(categories.size)
    val used = mutableSetOf<Int>()
    categories.forEachIndexed { i, category ->
        val preferred = preferredInspireArt(category)
        if (preferred != null && preferred in pool && preferred !in used) {
            out[i] = preferred
            used += preferred
        }
    }
    categories.indices.forEach { i ->
        if (out[i] != null) return@forEach
        for (step in pool.indices) {
            val candidate = pool[(i + step) % pool.size]
            if (candidate !in used) {
                out[i] = candidate
                used += candidate
                return@forEach
            }
        }
        out[i] = pool[i % pool.size]
    }
    return out.map { it!! }
}
