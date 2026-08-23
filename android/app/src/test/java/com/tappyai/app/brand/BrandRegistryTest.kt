package com.tappyai.app.brand

import com.tappyai.core.common.brand.BRAND_REGISTRY
import com.tappyai.core.common.brand.BrandBackground
import com.tappyai.core.common.brand.normalizeBrandKey
import com.tappyai.core.common.brand.resolveBrand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Deals cards rendered a partner INITIAL where the web renders the official mark.
 *
 * The API was never the problem: `logoImage` is null on every current row by design, because
 * `BRAND_ASSETS.md` §8 puts the curated registry FIRST in the fallback chain and lets it outrank
 * per-content images for partners it knows. Android had only the last step, so every card fell to
 * the initial tile.
 *
 * These pin the two things that decide whether a card gets its logo: that a partner name arriving
 * from the feed actually resolves, and that an unknown one degrades gracefully instead of throwing.
 */
class BrandRegistryTest {

    /** Exactly the partner names today's production `/api/deals` sends. */
    private val livePartnerNames = listOf(
        "Shopee", "ShopeeFood", "TikTok Shop", "Grab", "Be", "Agoda", "Booking.com",
    )

    @Test
    fun `every partner on the live feed resolves to a brand`() {
        val unresolved = livePartnerNames.filter { resolveBrand(it) == null }

        assertEquals("these would silently fall back to an initial tile", emptyList<String>(), unresolved)
    }

    @Test
    fun `every live partner renders a logo rather than an initial`() {
        val withoutLogo = livePartnerNames.filterNot { hasBrandLogo(it) }

        assertEquals(emptyList<String>(), withoutLogo)
    }

    @Test
    fun `a brand resolves by id, display name and alias alike`() {
        assertEquals("shopeefood", resolveBrand("shopeefood")?.id)
        assertEquals("shopeefood", resolveBrand("ShopeeFood")?.id)
        assertEquals("shopeefood", resolveBrand("Shopee Food")?.id)
        assertEquals("tiktok-shop", resolveBrand("TikTokShop")?.id)
        assertEquals("booking", resolveBrand("Booking")?.id)
        assertEquals("be", resolveBrand("Be Group")?.id)
    }

    @Test
    fun `resolution ignores case, spacing and punctuation`() {
        // An admin typing a partner name should not have to match its punctuation exactly.
        assertEquals("booking", resolveBrand("BOOKING.COM")?.id)
        assertEquals("booking", resolveBrand("booking com")?.id)
        assertEquals("tiktok-shop", resolveBrand("  tiktok-shop  ")?.id)
    }

    @Test
    fun `resolution strips diacritics`() {
        // Vietnamese input routinely carries them; the key must survive the difference. Asserted
        // through `resolveBrand`, the path the card actually calls — an earlier version of this
        // checked `normalizeBrandKey` against the key set, which proves the normalizer works but
        // not that resolution uses it.
        assertEquals("grab", resolveBrand("Gràb")?.id)
        assertEquals("agoda", resolveBrand("Ágodá")?.id)
        assertEquals("grab", normalizeBrandKey("Gràb"))
    }

    @Test
    fun `an unknown brand is null, not an error`() {
        // Graceful is the contract (§8): the caller keeps its own fallback.
        assertNull(resolveBrand("Lazada"))
        assertNull(resolveBrand("Some New Partner"))
        assertNull(resolveBrand(null))
        assertNull(resolveBrand(""))
        assertNull(resolveBrand("   "))
    }

    @Test
    fun `every registry entry resolves by its own display name`() {
        // Self-consistency: an entry unreachable through the name the feed sends is dead weight.
        for ((id, def) in BRAND_REGISTRY) {
            assertEquals("$id is unreachable by its displayName", id, resolveBrand(def.displayName)?.id)
        }
    }

    @Test
    fun `every registry entry is internally consistent`() {
        for ((key, def) in BRAND_REGISTRY) {
            assertEquals("map key must equal the entry id", key, def.id)
            assertTrue("$key: scale out of the documented 0.8..1.15 band", def.scale in 0.8..1.15)
            assertTrue("$key: logo must be a bundled asset or an https URL",
                def.logo.startsWith("brands/") || def.logo.startsWith("https://"))
            assertTrue("$key: officialWebsite must be https", def.officialWebsite.startsWith("https://"))
            assertTrue("$key: source must say where the artwork came from", def.source.isNotBlank())
            assertTrue("$key: approvedSince must be an ISO date",
                Regex("""\d{4}-\d{2}-\d{2}""").matches(def.approvedSince))
        }
    }

    @Test
    fun `TikTok Shop is the only brand needing a dark tile`() {
        // Its lockup is white by TikTok's own brand standard, so the tile supplies the contrast.
        // The mark is never recoloured — if this ever changes, the artwork changed, not the code.
        val dark = BRAND_REGISTRY.values.filter { it.background == BrandBackground.DARK }.map { it.id }

        assertEquals(listOf("tiktok-shop"), dark)
    }

    @Test
    fun `a bundled logo becomes an asset uri and an https logo is passed through`() {
        assertEquals("file:///android_asset/brands/shopee.png", assetUrl("brands/shopee.png"))
        // The admin-CMS path: a future CDN-hosted entry must render identically, not be mangled
        // into a nonexistent local asset.
        assertEquals("https://cdn.example.com/x.png", assetUrl("https://cdn.example.com/x.png"))
    }

    @Test
    fun `every registry logo is bundled with the app`() {
        // A registry entry whose artwork is missing renders an EMPTY tile — strictly worse than the
        // initial it replaced, and invisible until someone looks at that one card on a device.
        val missing = BRAND_REGISTRY.values
            .map { it.logo }
            .filter { it.startsWith("brands/") }
            .filterNot { java.io.File("src/main/assets/$it").exists() }

        assertEquals(emptyList<String>(), missing)
    }

    @Test
    fun `the registry covers every live partner and nothing is orphaned`() {
        val resolvedIds = livePartnerNames.mapNotNull { resolveBrand(it)?.id }.toSet()

        assertEquals("every registered brand should be reachable from the live feed",
            BRAND_REGISTRY.keys, resolvedIds)
        assertNotNull(resolveBrand("Shopee"))
    }
}
