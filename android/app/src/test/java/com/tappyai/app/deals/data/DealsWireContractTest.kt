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
        assertEquals("Shopee", shopee.title)
        assertEquals("Mua sắm", shopee.category)
        assertEquals("Shopee", shopee.source)
        assertEquals("https://shopee.vn", shopee.url)
    }

    /** The crash precondition: a blank url is what collapses every key onto `""`. */
    @Test
    fun `no live deal decodes to a blank url`() {
        val urls = decode().map { it.toDomain().url }

        assertTrue("blank url decoded from a live row: $urls", urls.none { it.isBlank() })
    }

    /** The card is only tappable when the partner link survives decoding. */
    @Test
    fun `live deals produce distinct lazy keys`() {
        val keys = dealListKeys(decode().map { it.toDomain() })

        assertEquals(keys.size, keys.toSet().size)
        assertEquals(listOf("https://shopee.vn", "https://www.tiktok.com/shop"), keys)
    }

    /** discountLabel is genuinely absent on most deals — null, not "" — and must stay nullable. */
    @Test
    fun `discountLabel maps to discount and tolerates null`() {
        val deals = decode().map { it.toDomain() }

        assertNull("a deal with no promotion must not invent one", deals[0].discount)
        assertEquals("-30%", deals[1].discount)
    }

    /** Unknown/absent `deals` must degrade to empty rather than throw. */
    @Test
    fun `a response without a deals array decodes to an empty list`() {
        val decoded = json.decodeFromString<DealsResponseDto>("""{"success":true}""")

        assertTrue(decoded.deals.isEmpty())
    }
}
