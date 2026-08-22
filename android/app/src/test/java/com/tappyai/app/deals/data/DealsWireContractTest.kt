package com.tappyai.app.deals.data

import com.tappyai.app.deals.dealListKeys
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the field names Android decodes from `GET /api/deals` against a real captured response.
 *
 * REGRESSION (permanent): `/api/deals` migrated from a hardcoded Shopee pool to the admin-managed
 * `partner_deals` table (web `src/lib/deals/partnerDeals.ts`), renaming url→officialUrl,
 * source→partnerName, discount→discountLabel and dropping emoji/badge entirely. The DTO was never
 * migrated. Because the shared Json runs `ignoreUnknownKeys = true`, that mismatch did NOT fail —
 * every field fell back to its declared default, so all seven production deals decoded with
 * `url = ""`. Two consequences, both observed on a real build:
 *   1. `DealsScreen` keyed its LazyColumn on the url, so seven identical `""` keys threw
 *      `IllegalArgumentException: Key "" was already used` from `LazyListMeasureKt.measureLazyList`
 *      and the tab died before drawing (production vc4).
 *   2. After keys were made collision-free, the tab rendered but every card was inert — no link to
 *      open, no partner name ("Mua sắm · via " with nothing after it).
 *
 * A name-only test is the right guard here precisely because a rename is invisible to the
 * compiler and silent at runtime. [json] mirrors core:network's `provideJson()`.
 */
class DealsWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /**
     * Captured verbatim from `https://www.tappyai.com/api/deals` — two of the seven live rows,
     * including the unrelated keys (`id`, `categoryKey`, `logoImage`, …) the DTO ignores, so this
     * also proves ignoring the rest stays safe.
     */
    private val liveResponse = """
        {"success":true,"deals":[
          {"id":"db25eb10-58b1-4f39-a602-d345174079bd","partnerSlug":"shopee","partnerName":"Shopee",
           "partnerType":"ecommerce","category":"Mua sắm","categoryKey":"Mua sắm","title":"Shopee",
           "description":"Sàn mua sắm online — mọi thứ bạn cần","officialUrl":"https://shopee.vn",
           "bannerImage":null,"logoImage":null,"isFeatured":true,"discountLabel":null,
           "voucherCode":null,"endAt":null},
          {"id":"1e3b33f5-ce33-4297-9f2c-913e47bab632","partnerSlug":"tiktok","partnerName":"TikTok Shop",
           "partnerType":"ecommerce","category":"Mua sắm","categoryKey":"Mua sắm","title":"TikTok Shop",
           "description":"Mua sắm giải trí ngay trên TikTok","officialUrl":"https://www.tiktok.com/shop",
           "bannerImage":null,"logoImage":null,"isFeatured":false,"discountLabel":"-30%",
           "voucherCode":null,"endAt":null}
        ]}
    """.trimIndent()

    private fun decode() = json.decodeFromString<DealsResponseDto>(liveResponse).deals

    /** The exact failure: a renamed field decodes to its default instead of throwing. */
    @Test
    fun `every rendered field decodes from the live response`() {
        val deals = decode().map { it.toDomain() }

        assertEquals(2, deals.size)
        val shopee = deals[0]
        assertEquals("db25eb10-58b1-4f39-a602-d345174079bd", shopee.id)
        assertEquals("Shopee", shopee.title)
        assertEquals("Mua sắm", shopee.category)
        assertEquals("Mua sắm", shopee.categoryKey)
        assertEquals("Shopee", shopee.partnerName)
        assertEquals("https://shopee.vn", shopee.officialUrl)
        assertEquals("Sàn mua sắm online — mọi thứ bạn cần", shopee.description)
    }

    /** The crash precondition: a blank officialUrl is what collapses every key onto `""`. */
    @Test
    fun `no live deal decodes to a blank officialUrl`() {
        val urls = decode().map { it.toDomain().officialUrl }

        assertTrue("blank officialUrl decoded from a live row: $urls", urls.none { it.isBlank() })
    }

    /** Identity now comes from `id` first, so that field has to survive decoding too. */
    @Test
    fun `no live deal decodes to a blank id`() {
        val ids = decode().map { it.toDomain().id }

        assertTrue("blank id decoded from a live row: $ids", ids.none { it.isBlank() })
    }

    /** The card is only tappable when the partner link survives decoding. */
    @Test
    fun `live deals produce distinct lazy keys`() {
        val keys = dealListKeys(decode().map { it.toDomain() })

        assertEquals(keys.size, keys.toSet().size)
        assertEquals(
            listOf("db25eb10-58b1-4f39-a602-d345174079bd", "1e3b33f5-ce33-4297-9f2c-913e47bab632"),
            keys,
        )
    }

    /** discountLabel is genuinely absent on most deals — null, not "" — and must stay nullable. */
    @Test
    fun `discountLabel decodes and tolerates null`() {
        val deals = decode().map { it.toDomain() }

        assertNull("a deal with no promotion must not invent one", deals[0].discountLabel)
        assertEquals("-30%", deals[1].discountLabel)
    }

    /**
     * The bug that outlived the crash: after the keys were fixed the tab still rendered as seven
     * grey rows, because the DTO declared none of the fields that carry the card's content. Every
     * one of them is pinned here by name against the live response.
     *
     * `description` is the field that matters most on today's data — it is the only one of these
     * that is actually populated, so dropping it is the difference between a real card and a bare
     * row. The rest are null on every current row and must decode as ABSENT, not as "".
     */
    @Test
    fun `the fields the card renders all decode from the live response`() {
        val deals = decode().map { it.toDomain() }

        assertEquals("Mua sắm giải trí ngay trên TikTok", deals[1].description)
        assertEquals("TikTok Shop", deals[1].partnerName)
        // Null on every live row today. Rendered as absent — never as an empty box or an empty pill.
        deals.forEach { deal ->
            assertNull("logoImage must stay absent, not blank", deal.logoImage)
            assertNull("voucherCode must stay absent, not blank", deal.voucherCode)
            assertNull("endAt must stay absent, not blank", deal.endAt)
        }
    }

    /**
     * `categoryKey` styles the chip and `category` labels it. They are equal on the Vietnamese
     * response, which is exactly why collapsing them is easy to miss: it looks correct until the
     * user switches to English, when the localized label stops matching the colour map and every
     * chip silently loses its colour.
     */
    @Test
    fun `a missing categoryKey falls back to the localized category`() {
        val enRow = """{"deals":[{"id":"x","category":"Shopping","officialUrl":"https://a.vn"}]}"""

        val deal = json.decodeFromString<DealsResponseDto>(enRow).deals.single().toDomain()

        assertEquals("Shopping", deal.categoryKey)
    }

    /** Blank is the feed's other way of saying absent; the card must treat the two alike. */
    @Test
    fun `blank optional strings normalize to null`() {
        val blanks = """
            {"deals":[{"id":"x","officialUrl":"https://a.vn","description":"",
             "logoImage":"  ","discountLabel":"","voucherCode":"","endAt":""}]}
        """.trimIndent()

        val deal = json.decodeFromString<DealsResponseDto>(blanks).deals.single().toDomain()

        assertNull(deal.description)
        assertNull(deal.logoImage)
        assertNull(deal.discountLabel)
        assertNull(deal.voucherCode)
        assertNull(deal.endAt)
    }

    /** Unknown/absent `deals` must degrade to empty rather than throw. */
    @Test
    fun `a response without a deals array decodes to an empty list`() {
        val decoded = json.decodeFromString<DealsResponseDto>("""{"success":true}""")

        assertTrue(decoded.deals.isEmpty())
    }
}
