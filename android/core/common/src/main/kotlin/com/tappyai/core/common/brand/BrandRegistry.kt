package com.tappyai.core.common.brand

import java.text.Normalizer

/**
 * Brand Registry — the Android mirror of the web's `src/config/brandRegistry.ts`, schema v1.
 *
 * Governance and the schema live in `docs/architecture/BRAND_ASSETS.md`; §13 of that document is
 * this file's specification, down to the field list and the rendering contract. Per
 * `docs/ios/13_PARITY_GOVERNANCE.md` §1 the web implementation is the spec and native clients
 * mirror it rather than reinventing it, so nothing here is invented: every value is copied from the
 * web registry and `brandRegistryParity.test.ts` fails if the two ever drift.
 *
 * WHY THIS EXISTS AT ALL: Android's Deals cards were rendering a partner INITIAL — "S", "T", "G" —
 * where the web shows the official Shopee, TikTok Shop and Grab marks. The API is not at fault and
 * needs no change: `logoImage` is null on every current row by design, and the registry is
 * deliberately the FIRST link in the fallback chain (§8), outranking per-content images for known
 * partners. Android simply implemented only the last link.
 *
 * ┌─ §8 fallback priority, identical on every platform ─────────────────────────┐
 * │ 1. registry entry        → the official curated logo; always wins           │
 * │ 2. the content's own image (`deal.logoImage`)                               │
 * │ 3. partner-initial tile  → last resort, and the deprecation path            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Pure Kotlin on purpose — no Android framework, no Compose, no feature imports — so that Deals,
 * Explore, AI recommendations and anything later can share it exactly as the web consumers share
 * the TypeScript module. §13 suggests a dedicated `core:brand` module; it lives in `core:common`
 * instead, which is already the pure-Kotlin/JVM module, because adding a Gradle module buys nothing
 * the placement rule ("shared, no UI dependencies") does not already get here.
 *
 * Rendering lives in `core:designsystem`'s `BrandLogo`, mirroring the web's split between data and
 * renderer.
 */
enum class BrandBackground { LIGHT, DARK }

enum class BrandCategory { SHOPPING, FOOD_DELIVERY, TRANSPORT, TRAVEL }

data class BrandDefinition(
    /** Stable kebab-case identifier — equals its key in [BRAND_REGISTRY]. */
    val id: String,
    /** Exact display/alt name ("Booking.com", "TikTok Shop"). */
    val displayName: String,
    /** Extra admin spellings resolved to this brand; id and displayName always resolve too. */
    val aliases: List<String>,
    /**
     * Bundled asset path relative to `assets/`, or a full `https://` URL — the renderer treats both
     * identically, exactly as the web treats a `/brands/…` path and a CDN URL identically.
     */
    val logo: String,
    /**
     * The tile background the official mark is DESIGNED for. `DARK` means the brand's lockup is
     * light/white by its own brand standard (TikTok Shop): the tile supplies the dark background so
     * the mark stays legible. A mark is never recoloured to suit a tile.
     */
    val background: BrandBackground,
    /**
     * Optical size correction, 0.8..1.15. Solid square marks read heavier than wordmarks at equal
     * pixel size, so they get < 1; airy wordmarks get slightly > 1. Judged by eye on screenshots.
     */
    val scale: Double,
    val category: BrandCategory,
    val officialWebsite: String,
    /** "svg" or "png" — the WEB asset's type. Android bundles PNG for both; see [logo]. */
    val assetType: String,
    val source: String,
    /** ISO date the owner approved this partner for Deals. */
    val approvedSince: String,
)

/**
 * Every partner brand TappyAI surfaces, keyed by [BrandDefinition.id].
 *
 * 🚨 Do not add an entry here alone. The web registry is the source of truth: add the partner there
 * first (its "HOW TO ADD A PARTNER" comment is the procedure), bundle the same artwork under
 * `assets/brands/<id>.png`, then mirror the entry here. The parity test compares the two field by
 * field, so a one-sided change fails rather than silently diverging.
 */
val BRAND_REGISTRY: Map<String, BrandDefinition> = listOf(
    BrandDefinition(
        id = "shopee",
        displayName = "Shopee",
        aliases = emptyList(),
        logo = "brands/shopee.png",
        background = BrandBackground.LIGHT,
        scale = 1.0,
        category = BrandCategory.SHOPPING,
        officialWebsite = "https://shopee.vn",
        assetType = "svg",
        source = "Wikimedia Commons — File:Shopee logo.svg (official vertical lockup)",
        approvedSince = "2026-07-31",
    ),
    BrandDefinition(
        id = "shopeefood",
        displayName = "ShopeeFood",
        aliases = listOf("Shopee Food"),
        logo = "brands/shopeefood.png",
        background = BrandBackground.LIGHT,
        scale = 1.0,
        category = BrandCategory.FOOD_DELIVERY,
        officialWebsite = "https://shopeefood.vn",
        assetType = "png",
        source = "shopeefood.vn — site-served official logo (brand publishes no public SVG)",
        approvedSince = "2026-07-31",
    ),
    BrandDefinition(
        id = "tiktok-shop",
        displayName = "TikTok Shop",
        aliases = listOf("TikTokShop"),
        logo = "brands/tiktok-shop.png",
        background = BrandBackground.DARK,
        scale = 1.0,
        category = BrandCategory.SHOPPING,
        officialWebsite = "https://shop.tiktok.com",
        assetType = "png",
        source = "TikTok seller-center CDN (oecstatic.com) — official lockup; white text is TikTok's brand standard, hence background: 'dark'",
        approvedSince = "2026-07-31",
    ),
    BrandDefinition(
        id = "grab",
        displayName = "Grab",
        aliases = emptyList(),
        logo = "brands/grab.png",
        background = BrandBackground.LIGHT,
        scale = 1.05,
        category = BrandCategory.TRANSPORT,
        officialWebsite = "https://www.grab.com/vn/",
        assetType = "svg",
        source = "Wikimedia Commons — File:Grab Logo.svg",
        approvedSince = "2026-07-31",
    ),
    BrandDefinition(
        id = "be",
        displayName = "Be",
        aliases = listOf("beVN", "Be Group"),
        logo = "brands/be.png",
        background = BrandBackground.LIGHT,
        scale = 0.92,
        category = BrandCategory.TRANSPORT,
        officialWebsite = "https://be.com.vn",
        assetType = "svg",
        source = "be.com.vn — official site theme asset (logo.svg)",
        approvedSince = "2026-07-31",
    ),
    BrandDefinition(
        id = "agoda",
        displayName = "Agoda",
        aliases = emptyList(),
        logo = "brands/agoda.png",
        background = BrandBackground.LIGHT,
        scale = 1.1,
        category = BrandCategory.TRAVEL,
        officialWebsite = "https://www.agoda.com",
        assetType = "svg",
        source = "Wikimedia Commons — File:Agoda Logo 2022.svg",
        approvedSince = "2026-07-31",
    ),
    BrandDefinition(
        id = "booking",
        displayName = "Booking.com",
        aliases = listOf("Booking"),
        logo = "brands/booking.png",
        background = BrandBackground.LIGHT,
        scale = 0.92,
        category = BrandCategory.TRAVEL,
        officialWebsite = "https://www.booking.com",
        assetType = "svg",
        source = "Wikimedia Commons — File:Booking.com Icon 2022.svg (official \"B.\" app icon; the wordmark is illegible at 48px)",
        approvedSince = "2026-07-31",
    ),
).associateBy { it.id }

/**
 * Free text → lookup key: strip diacritics and punctuation, lowercase.
 *
 * "TikTok Shop", "tiktokshop" and "TIKTOK-SHOP" all collapse to `tiktokshop`, which is what lets a
 * partner name typed by an admin resolve without an exact-match alias for every spelling. Mirrors
 * the web's `normalizeBrandKey` — the two must agree or a name that resolves on one platform will
 * fall through to the initial tile on the other.
 *
 * ⚠️ The combining-mark strip is REDUNDANT and kept only to mirror the web chain step for step:
 * `[^a-z0-9]` already removes the marks that NFD leaves behind, so deleting the `\p{Mn}` line
 * changes no result (measured — a mutation removing it altered nothing). It stays because the
 * governance doc makes the web implementation the spec and a step-for-step mirror is easier to
 * verify than an optimised one; do not read it as load-bearing.
 */
fun normalizeBrandKey(name: String): String =
    Normalizer.normalize(name, Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .lowercase()
        .replace(Regex("[^a-z0-9]"), "")

/** Built once — resolution is a map lookup, not a scan over the registry. */
private val BRAND_INDEX: Map<String, String> = buildMap {
    for ((id, def) in BRAND_REGISTRY) {
        put(normalizeBrandKey(id), id)
        put(normalizeBrandKey(def.displayName), id)
        for (alias in def.aliases) put(normalizeBrandKey(alias), id)
    }
}

/**
 * Brand id for a free-text partner name, or null for an unknown brand.
 *
 * ⚠️ The blank half of the guard is REDUNDANT, like the mark strip above: a blank name normalizes
 * to `""`, no registry id does, so the lookup would return null anyway (measured). It mirrors the
 * web's falsy check and short-circuits before touching the index; it is not what makes blanks safe.
 */
fun resolveBrandId(partnerName: String?): String? {
    if (partnerName.isNullOrBlank()) return null
    return BRAND_INDEX[normalizeBrandKey(partnerName)]
}

/**
 * Full definition for a free-text partner name, or null when unknown.
 *
 * Unknown is a GRACEFUL state, never an error: the caller keeps its own fallback (§8), which is why
 * this returns null rather than a placeholder brand.
 */
fun resolveBrand(partnerName: String?): BrandDefinition? =
    resolveBrandId(partnerName)?.let { BRAND_REGISTRY[it] }
