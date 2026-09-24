package com.tappyai.app.chat

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.tappyai.app.R
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import java.util.Locale

/**
 * The place card's COPY — the ranker's reason and the provider's price band, said in the reader's
 * language. A mirror of web `src/lib/recommendation/reasonText.ts` and
 * `src/lib/recommendation/priceBand.ts#formatPriceBandText` (F-050, 2026-09-22): the card used
 * to print the reason's `evidence` ("rated 4.9 · 1103 reviews", the ranker's own English) and the
 * raw Serper band ("1-100.000 ₫", which reads as "from one đồng"). Both surfaces now word the
 * same data the same way; `shared/place-card/copy-fixtures.json` pins the cases for both.
 *
 * The reason travels as DATA (`attribute` + `params`) beside its `evidence`; a reason with no
 * params, an attribute no template covers, or a persisted marker from before params existed all
 * fall back to `evidence` — nothing can render empty because of this.
 */
data class PlaceCardCopy(
    /** "vi" or "en" — the app language, which is what the templates below are in. */
    val lang: String,
    /** `%1$s` templates, from string resources in production (see [fromContext]). */
    val reasonRating: String,
    val reasonReviewCount: String,
    val reasonPrice: String,
    val reasonDistance: String,
    val reasonStars: String,
    val reasonEta: String,
    val reasonDirectPage: String,
    val bandUnder: String,
    val bandOver: String,
    /** `%1$s–%2$s ₫` */
    val bandRange: String,
    /** True = evidence and band verbatim (what the card showed before F-050); the test default. */
    val verbatim: Boolean = false,
) {
    private val vi get() = lang == "vi"

    /** One reason, localised — `reasonText.ts` line for line. */
    fun reasonText(attribute: String, evidence: String, params: JsonObject?): String {
        if (verbatim) return evidence
        val p = params ?: JsonObject(emptyMap())
        fun num(key: String): Double? = (p[key] as? JsonPrimitive)?.doubleOrNull
        return when (attribute) {
            "rating" -> num("value")?.let { reasonRating.format(numberAsWritten(it)) }
            "reviewCount" -> num("count")?.let { reasonReviewCount.format(count(it)) }
            "price" -> num("priceVnd")?.let { vndShort(it)?.let { price -> reasonPrice.format(price) } }
            "distance" -> num("km")?.let { reasonDistance.format(numberAsWritten(it)) }
            "stars" -> num("stars")?.let { reasonStars.format(numberAsWritten(it)) }
            "eta" -> num("minutes")?.let { reasonEta.format(numberAsWritten(it)) }
            "directPage" -> reasonDirectPage.takeIf { it.isNotBlank() }
            // Amenity booleans ("has wifi" / "no wifi") have no dictionary on web either: evidence.
            else -> null
        } ?: evidence
    }

    /** Several reasons, joined the way the card shows them. */
    fun reasonList(reasons: List<LivePlaceReason>): List<String> =
        reasons.map { reasonText(it.attribute, it.evidence, it.params) }.filter { it.isNotBlank() }

    /**
     * The provider band as a reader understands it. Google's "1-100.000 ₫" is an OPEN lower bound
     * ("up to 100.000"), shown as "dưới 100.000 ₫"; "Trên 1 Tr ₫" → "trên 1 triệu ₫"; a closed band
     * → "100.000–200.000 ₫". A shape the parser does not know is shown verbatim — never hidden.
     */
    fun formatPriceBand(text: String?): String? {
        if (text.isNullOrBlank()) return null
        if (verbatim) return text
        val band = PriceBand.parse(text) ?: return text
        return when {
            band.openBelow -> bandUnder.format(vnd(band.hi))
            band.openAbove -> bandOver.format(vnd(band.lo))
            else -> bandRange.format(vnd(band.lo), vnd(band.hi))
        }
    }

    /** "100.000" / "1,5 triệu" (vi) — "100,000" / "1.5M" (en); web `priceBand.ts#vnd`. */
    fun vnd(n: Double): String {
        if (n >= 1_000_000) {
            val m = n / 1_000_000
            val s = if (m == Math.floor(m)) m.toLong().toString() else String.format(Locale.US, "%.1f", m).removeSuffix(".0")
            return if (vi) "${s.replace('.', ',')} triệu" else "${s}M"
        }
        return count(n)
    }

    /** "1.103" (vi) / "1,103" (en) — web `toLocaleString`. */
    fun count(n: Double): String {
        val whole = n.toLong()
        val grouped = String.format(Locale.US, "%,d", whole)
        return if (vi) grouped.replace(',', '.') else grouped
    }

    /** web `formatVndShort`: ≥ 1M → "1,5 triệu" / "1.5M", else "150.000₫" / "150,000₫". */
    fun vndShort(n: Double): String? {
        if (n.isNaN()) return null
        if (n >= 1_000_000) {
            val m = Math.round(n / 1_000_000 * 10) / 10.0
            val s = if (m == Math.floor(m)) m.toLong().toString() else m.toString()
            return if (vi) "${s.replace('.', ',')} triệu" else "${s}M"
        }
        return count(n) + "₫"
    }

    /** `String(value)` on web: 4.9 stays "4.9", 5 stays "5", in both locales. */
    private fun numberAsWritten(d: Double): String = if (d == Math.floor(d) && !d.isInfinite()) d.toLong().toString() else d.toString()

    companion object {
        /** Evidence verbatim, band verbatim — what the card showed before F-050; the test default. */
        val PASSTHROUGH = PlaceCardCopy(
            lang = "vi", reasonRating = "", reasonReviewCount = "", reasonPrice = "", reasonDistance = "", reasonStars = "", reasonEta = "",
            reasonDirectPage = "", bandUnder = "", bandOver = "", bandRange = "", verbatim = true,
        )

        fun fromContext(context: Context): PlaceCardCopy = PlaceCardCopy(
            // The locale tag comes from the SAME resource lookup as the templates below, so the copy can
            // never be worded in one language and grouped in another; nothing is read from a second authority.
            lang = context.getString(R.string.place_card_lang),
            reasonRating = context.getString(R.string.place_reason_rating),
            reasonReviewCount = context.getString(R.string.place_reason_review_count),
            reasonPrice = context.getString(R.string.place_reason_price),
            reasonDistance = context.getString(R.string.place_reason_distance),
            reasonStars = context.getString(R.string.place_reason_stars),
            reasonEta = context.getString(R.string.place_reason_eta),
            reasonDirectPage = context.getString(R.string.place_reason_direct_page),
            bandUnder = context.getString(R.string.place_band_under),
            bandOver = context.getString(R.string.place_band_over),
            bandRange = context.getString(R.string.place_band_range),
        )
    }
}

@Composable
internal fun rememberPlaceCardCopy(): PlaceCardCopy {
    val context = LocalContext.current
    return remember(context.resources.configuration) { PlaceCardCopy.fromContext(context) }
}

/** A provider price band as data — web `priceBand.ts#parsePriceBand`, same rules, same results. */
internal data class PriceBand(val lo: Double, val hi: Double, val openBelow: Boolean, val openAbove: Boolean) {
    companion object {
        private val SCALE = mapOf("n" to 1e3, "k" to 1e3, "nghìn" to 1e3, "ngàn" to 1e3, "tr" to 1e6, "m" to 1e6, "triệu" to 1e6)
        private const val UNIT = "(N|K|Tr|M|nghìn|ngàn|triệu)?"
        private const val NUM = "(\\d+(?:[.,]\\d+)*)"
        private val RANGE = Regex("^\\s*$NUM\\s*[-–]\\s*$NUM\\s*$UNIT\\s*₫\\s*$", RegexOption.IGNORE_CASE)
        private val ABOVE = Regex("^\\s*(?:Trên|Tren|Over|Above|>)\\s*$NUM\\s*$UNIT\\s*₫\\s*$", RegexOption.IGNORE_CASE)
        private val BELOW = Regex("^\\s*(?:Dưới|Duoi|Under|Below|<)\\s*$NUM\\s*$UNIT\\s*₫\\s*$", RegexOption.IGNORE_CASE)

        /** "100" → 100, "100.000" → 100000, "1,5" → 1.5 (a scale unit follows). */
        private fun amount(raw: String, scaled: Boolean): Double? {
            val seps = raw.count { it == '.' || it == ',' }
            val s = when {
                seps >= 2 -> raw.replace(".", "").replace(",", "")
                seps == 1 -> {
                    val frac = raw.split('.', ',')[1]
                    if (frac.length == 3 && !scaled) raw.replace(".", "").replace(",", "") else raw.replace(',', '.')
                }
                else -> raw
            }
            return s.toDoubleOrNull()
        }

        fun parse(text: String?): PriceBand? {
            val source = text?.trim().orEmpty()
            if (source.isEmpty()) return null
            RANGE.find(source)?.let { m ->
                val scale = SCALE[m.groupValues[3].lowercase()] ?: 1.0
                val lo = (amount(m.groupValues[1], scale > 1) ?: return null) * scale
                val hi = (amount(m.groupValues[2], scale > 1) ?: return null) * scale
                if (hi <= 0 || lo > hi) return null
                return if (lo <= 1) PriceBand(0.0, hi, openBelow = true, openAbove = false) else PriceBand(lo, hi, openBelow = false, openAbove = false)
            }
            ABOVE.find(source)?.let { m ->
                val scale = SCALE[m.groupValues[2].lowercase()] ?: 1.0
                val lo = (amount(m.groupValues[1], scale > 1) ?: return null) * scale
                if (lo <= 0) return null
                return PriceBand(lo, Double.POSITIVE_INFINITY, openBelow = false, openAbove = true)
            }
            BELOW.find(source)?.let { m ->
                val scale = SCALE[m.groupValues[2].lowercase()] ?: 1.0
                val hi = (amount(m.groupValues[1], scale > 1) ?: return null) * scale
                if (hi <= 0) return null
                return PriceBand(0.0, hi, openBelow = true, openAbove = false)
            }
            return null
        }
    }
}
