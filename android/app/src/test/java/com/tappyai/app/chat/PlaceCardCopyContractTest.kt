package com.tappyai.app.chat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/**
 * F-050 (2026-09-22) — the place card's copy is ONE contract for web and Android.
 *
 * `shared/place-card/copy-fixtures.json` lists every reason / price-band case with the expected
 * wording per locale. Web asserts it against `reasonText.ts` + `formatPriceBandText` (the
 * reference, `src/lib/recommendation/placeCardCopy.test.ts`); this test asserts the same file
 * against [PlaceCardCopy] built from the REAL string resources (`strings_chat.xml`, parsed from
 * the repo so a template edited in XML is what gets tested, not a copy). A case that passes on
 * one side and fails on the other is exactly the drift the finding was: "rated 4.9 · 1103
 * reviews" and "1-100.000 ₫" on Android under a Vietnamese card.
 */
class PlaceCardCopyContractTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun repoFile(relative: String): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        fail("$relative not found above ${File(".").absolutePath}")
        error("unreachable")
    }

    private val root: JsonObject by lazy { json.parseToJsonElement(repoFile("shared/place-card/copy-fixtures.json").readText()).jsonObject }

    /** `<string name="x">…</string>` from a resources file, with Android's `%1$s` kept as-is. */
    private fun strings(file: String): Map<String, String> =
        Regex("<string name=\"([^\"]+)\">([^<]*)</string>").findAll(repoFile(file).readText())
            .associate { it.groupValues[1] to it.groupValues[2].replace("\\'", "'").replace("&amp;", "&") }

    private fun copyFor(lang: String): PlaceCardCopy {
        val r = strings(if (lang == "vi") "android/app/src/main/res/values-vi/strings_chat.xml" else "android/app/src/main/res/values/strings_chat.xml")
        fun s(name: String) = r[name] ?: fail("missing string resource $name for $lang").let { error("unreachable") }
        // `place_card_lang` is the locale tag the resources themselves carry — the value production reads.
        assertEquals("the resources declare their own locale tag", lang, s("place_card_lang"))
        return PlaceCardCopy(
            lang = lang,
            reasonRating = s("place_reason_rating"), reasonReviewCount = s("place_reason_review_count"),
            reasonPrice = s("place_reason_price"), reasonDistance = s("place_reason_distance"),
            reasonStars = s("place_reason_stars"), reasonEta = s("place_reason_eta"), reasonDirectPage = s("place_reason_direct_page"),
            bandUnder = s("place_band_under"), bandOver = s("place_band_over"), bandRange = s("place_band_range"),
        )
    }

    private val vi by lazy { copyFor("vi") }
    private val en by lazy { copyFor("en") }

    @Test
    fun `every reason case reads exactly as web, in both languages`() {
        for (c in root["reasons"]!!.jsonArray.map { it.jsonObject }) {
            val name = c["name"]!!.jsonPrimitive.content
            val reason = c["reason"]!!.jsonObject
            val attribute = reason["attribute"]!!.jsonPrimitive.content
            val evidence = reason["evidence"]!!.jsonPrimitive.content
            val params = reason["params"]?.jsonObject
            assertEquals("vi · $name", c["vi"]!!.jsonPrimitive.content, vi.reasonText(attribute, evidence, params))
            assertEquals("en · $name", c["en"]!!.jsonPrimitive.content, en.reasonText(attribute, evidence, params))
        }
    }

    @Test
    fun `every price band case reads exactly as web, in both languages`() {
        for (c in root["bands"]!!.jsonArray.map { it.jsonObject }) {
            val name = c["name"]!!.jsonPrimitive.content
            val text = c["text"]!!.jsonPrimitive.content
            assertEquals("vi · $name", c["vi"]!!.jsonPrimitive.content, vi.formatPriceBand(text))
            assertEquals("en · $name", c["en"]!!.jsonPrimitive.content, en.formatPriceBand(text))
        }
    }

    @Test
    fun `the wire reason decodes its params and the card facts use them`() {
        val frameItem = json.decodeFromString<LivePlaceReason>("""{"attribute":"reviewCount","evidence":"1103 reviews","params":{"count":1103}}""")
        assertEquals("1.103 lượt đánh giá", vi.reasonText(frameItem.attribute, frameItem.evidence, frameItem.params))
        val place = PlaceCardView(name = "Phở Nhất Vị", rank = 0, priceRangeText = "1-100.000 ₫", reasons = listOf(frameItem))
        val facts = placeCardFacts(place, position = 0, ranked = true, copy = vi)
        assertEquals(listOf("1.103 lượt đánh giá"), facts.reasons)
        assertEquals("dưới 100.000 ₫", facts.priceRangeText)
        // The default copy is pass-through — exactly what the card showed before F-050.
        val before = placeCardFacts(place, position = 0, ranked = true)
        assertEquals(listOf("1103 reviews"), before.reasons)
        assertEquals("1-100.000 ₫", before.priceRangeText)
    }
}
