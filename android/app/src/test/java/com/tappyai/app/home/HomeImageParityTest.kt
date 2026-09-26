package com.tappyai.app.home

import com.tappyai.app.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Home image parity (2026-09-14): the two Home sections that carry visual assets on the web now
 * carry the SAME assets on Android.
 *
 *  · "Gợi ý cho bạn" — the web's `public/home/inspire/<category>.webp` photographs (HomeV3.tsx
 *    `ART_POOL` / `CATEGORY_PREFERRED_ART`), assigned per card by the web's `assignCardArt` rule.
 *  · "Ưu đãi hôm nay" — the web Deals card's `BrandLogo` (brand registry mark → the deal's own
 *    `logoImage` → monogram), through the `PartnerMark` the Deals screen already draws.
 *
 * The assignment rule runs for real (a port of the web's, with the web's own cases); the assets
 * are compared byte-for-byte with the web files; the cards are pinned by source.
 */
class HomeImageParityTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace(Regex("(?m)^\\s*//.*$"), "")
    private fun repo(rel: String): File = File(root().parentFile, rel)

    private val home get() = src("app/src/main/java/com/tappyai/app/home/HomeScreen.kt")

    // ── the art rule is the web's ──

    private val pool = HOME_INSPIRE_POOL

    @Test
    fun `a card gets its category's scene when free, a duplicate category gets a different free scene`() {
        // Home's real list: food, entertainment, food, travel, shopping, entertainment.
        val out = assignInspireArt(listOf("food", "entertainment", "food", "travel", "shopping", "entertainment"))
        assertEquals(R.drawable.home_inspire_food, out[0])
        assertEquals(R.drawable.home_inspire_entertainment, out[1])
        assertEquals("second food card: a free scene, never the same picture", R.drawable.home_inspire_spa, out[2])
        assertEquals(R.drawable.home_inspire_travel, out[3])
        assertEquals(R.drawable.home_inspire_shopping, out[4])
        assertEquals("sixth card: the pool is exhausted → by position, a repeat beats a blank", pool[5 % pool.size], out[5])
        assertEquals("five distinct scenes across the first five cards", 5, out.take(5).toSet().size)
    }

    @Test
    fun `an unknown category takes the next free scene from its position, and fewer cards than scenes are all unique`() {
        val out = assignInspireArt(listOf("travel", "mystery", "food"))
        assertEquals(R.drawable.home_inspire_travel, out[0])
        assertEquals("position 1 → pool[1] is taken (travel) → pool[2]", R.drawable.home_inspire_shopping, out[1])
        assertEquals(R.drawable.home_inspire_food, out[2])
        assertEquals(3, out.toSet().size)
        assertEquals(emptyList<Int>(), assignInspireArt(emptyList()))
    }

    // ── the assets are the web's ──

    @Test
    fun `the five inspire photographs are byte-identical copies of public home inspire`() {
        for (c in listOf("food", "travel", "shopping", "spa", "entertainment")) {
            val web = repo("public/home/inspire/$c.webp")
            val android = File(root(), "app/src/main/res/drawable-nodpi/home_inspire_$c.webp")
            assertTrue("$c exists on Android", android.isFile)
            assertTrue("home_inspire_$c.webp is the web file, byte for byte", web.readBytes().contentEquals(android.readBytes()))
        }
        assertEquals("the pool is the web's ART_POOL, in order", listOf(
            R.drawable.home_inspire_food, R.drawable.home_inspire_travel, R.drawable.home_inspire_shopping,
            R.drawable.home_inspire_spa, R.drawable.home_inspire_entertainment,
        ), pool)
    }

    @Test
    fun `the brand marks Android ships are the registry's seven, one per web brand asset`() {
        val web = repo("public/brands").listFiles()!!.filter { it.isFile }.map { it.nameWithoutExtension }.toSet()
        val android = File(root(), "app/src/main/assets/brands").listFiles()!!.map { it.nameWithoutExtension }.toSet()
        assertEquals(setOf("agoda", "be", "booking", "grab", "shopee", "shopeefood", "tiktok-shop"), web)
        assertEquals("every web brand mark has its Android counterpart (PNG renditions of the SVGs)", web, android)
    }

    // ── the cards ──

    @Test
    fun `the suggestion card is the web for-you tile - photograph, category badge, emoji badge, text - never an emoji in place of the picture`() {
        val card = home.substring(home.indexOf("private fun SuggestionCard("), home.indexOf("private fun suggestionCategoryLabel("))
        assertTrue("the art, cropped like object-cover, 94dp like the web", card.contains("painter = painterResource(art)") && card.contains("contentScale = ContentScale.Crop") && card.contains(".height(94.dp)"))
        assertTrue("the category badge on the art", card.contains("suggestionCategoryLabel(suggestion.category)?.let") && card.contains("stringResource(labelRes).uppercase()"))
        assertTrue("the emoji is a small badge, not the picture", card.contains(".size(32.dp)") && card.contains("Text(text = suggestion.emoji, fontSize = 15.sp)"))
        assertFalse("the old 64dp emoji header is gone", card.contains("fontSize = 30.sp"))
        assertTrue("the prompt and the tap are unchanged", card.contains(".clickable { onClick(text) }") && card.contains("maxLines = 2"))
        val section = home.substring(home.indexOf("private fun SuggestionsSection("), home.indexOf("private fun SuggestionCard("))
        assertTrue("art assigned per card by the web rule", section.contains("assignInspireArt(HOME_SUGGESTIONS.map { it.category })") && section.contains("art = art[rowIndex * 2 + column],"))
        assertEquals("the six prompts are unchanged", 6, Regex("""HomeSuggestion\(R\.string\.home_suggestion_\d""").findAll(home).count())
    }

    @Test
    fun `the Home deal card carries the partner mark the Deals screen draws - registry logo, then the deal's image, then a monogram`() {
        val card = home.substring(home.indexOf("private fun V3DealCard("), home.indexOf("private fun dealAccent("))
        assertTrue(card.contains("PartnerMark(deal = deal, size = 40.dp)"))
        assertFalse("no generic offer glyph where the mark belongs", card.substring(0, card.indexOf("deal.discountLabel")).contains("Icons.Filled.LocalOffer"))
        assertTrue("title and source line unchanged", card.contains("text = deal.title,") && card.contains("stringResource(R.string.deals_via_source, deal.partnerName)"))
        val deals = src("app/src/main/java/com/tappyai/app/deals/DealsScreen.kt")
        val mark = deals.substring(deals.indexOf("internal fun PartnerMark("), deals.indexOf("internal fun PartnerMark(") + 1600)
        assertTrue("1. registry mark", mark.contains("if (hasBrandLogo(deal.partnerName)) {") && mark.contains("BrandLogo(partnerName = deal.partnerName, size = size, decorative = true)"))
        assertTrue("2. the deal's own image, with the monogram on a load failure", mark.contains("url = logo,") && mark.contains("onError = monogram,"))
        assertTrue("3. the monogram", mark.contains("deal.partnerName.trim().take(1).uppercase()"))
        assertTrue("Home's Xem tất cả still opens the existing Deals surface (2026-09-14 redesign: the link gained a chevron, not a destination)", home.contains("V3SeeAll(text = stringResource(R.string.home_v3_deals_see_all), onClick = onOpenDeals)"))
    }
}
