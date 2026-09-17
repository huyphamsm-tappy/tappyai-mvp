package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * REGRESSION (confirmed on a Pixel_8, "Tai nghe chống ồn dưới 5 triệu"): the server appends a
 * `[TAPPY_SHOPPING]{…}` block to every shopping reply, the web strips it, and Android did not —
 * so the whole JSON (image URLs, Google Shopping offer links, prices) rendered as visible text in
 * the assistant bubble. These tests fail on any parser that lets the marker or its JSON reach the
 * user, including a stream that was cut off before the closing tag arrived.
 *
 * The payload decodes into [ShoppingDecisionView] — the canonical mirror of the server's
 * `SynthesisView`, whose match vocabulary is `khop` / `khac` / `chua_ro` ([ShoppingMatch]).
 * Complements `ShoppingDecisionParseTest`, which covers the view's own decoding rules; this file
 * covers the PARSE CHAIN around it (what reaches the text, what coexists with other markers) and
 * the product-identity fields.
 */
class ChatResponseParserShoppingTest {

    /** Shaped like the real payload observed on device (keys, `uncertain:N` entity keys and all). */
    private val payload = """
        {"v":1,"entities":[{"key":"uncertain:0","config":"chip ? · RAM ? · storage ?",
        "matchesRequest":"chua_ro","recommended":true,"priceLow":95000,"priceHigh":95000,
        "image":"https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9Gc",
        "offers":[{"seller":"Kết Nối Tiêu Dùng","url":"https://www.google.com/search?tbm=shop",
        "price":95000,"currency":"VND","condition":null}]}],
        "recommendation":{"entityKey":"uncertain:0","seller":"Kết Nối Tiêu Dùng",
        "reasons":[{"attribute":"noise","evidence":"chống ồn chủ động"}],
        "tradeOff":{"attribute":"pin","evidence":"pin ngắn hơn"},"conditional":false}}
    """.trimIndent()

    @Test
    fun `shopping marker is stripped from visible text and its payload retained`() {
        val reply = "Tôi sẽ tìm kiếm tai nghe chống ồn dưới 5 triệu cho bạn." +
            "[TAPPY_SHOPPING]$payload[/TAPPY_SHOPPING]"

        val parsed = ChatResponseParser.parse(reply)

        assertEquals("Tôi sẽ tìm kiếm tai nghe chống ồn dưới 5 triệu cho bạn.", parsed.text)
        assertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        assertFalse(parsed.text.contains("entities"))
        assertFalse(parsed.streamText.contains("TAPPY_SHOPPING"))

        val view = assertNotNull(parsed.shopping).let { parsed.shopping!! }
        assertEquals(1, view.entities.size)
        assertEquals("uncertain:0", view.entities[0].key)
        assertEquals(ShoppingMatch.UNKNOWN, view.entities[0].matchesRequest)
        assertEquals(95000.0, view.entities[0].priceLow!!, 0.0)
        assertEquals("Kết Nối Tiêu Dùng", view.entities[0].offers[0].seller)
        assertEquals("uncertain:0", view.recommendation?.entityKey)
        assertEquals("pin", view.recommendation?.tradeOff?.attribute)
    }

    @Test
    fun `an unterminated shopping block still never reaches the user`() {
        val reply = "Đang tìm giúp bạn.[TAPPY_SHOPPING]{\"v\":1,\"entities\":[{\"key\":\"uncert"

        val parsed = ChatResponseParser.parse(reply)

        assertEquals("Đang tìm giúp bạn.", parsed.text)
        assertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        assertFalse(parsed.streamText.contains("entities"))
        assertNull(parsed.shopping)
    }

    @Test
    fun `malformed shopping json is stripped rather than leaked`() {
        val reply = "Gợi ý cho bạn.[TAPPY_SHOPPING]{not json at all}[/TAPPY_SHOPPING]"

        val parsed = ChatResponseParser.parse(reply)

        assertEquals("Gợi ý cho bạn.", parsed.text)
        assertNull(parsed.shopping)
    }

    // ── Product identity ─────────────────────────────────────────────────────────────────────
    // `name` is the ONLY field that may title a product card. `config` is a spec label
    // ("chip ? · RAM ? · storage ?") and `key` a grouping id ("uncertain:0"); neither is a name.
    // The server projects `name` from the listing title (`SynthesisEntity.name?`); nothing else
    // about the entity is an identity.

    @Test
    fun `an old payload without name still parses and offers no product identity`() {
        val reply = "Gợi ý.[TAPPY_SHOPPING]$payload[/TAPPY_SHOPPING]"

        val entity = ChatResponseParser.parse(reply).shopping!!.entities[0]

        assertNull(entity.name)
        assertNull(entity.displayName)
        // Everything the old payload did carry is untouched.
        assertEquals("chip ? · RAM ? · storage ?", entity.config)
        assertEquals("uncertain:0", entity.key)
        assertEquals(ShoppingMatch.UNKNOWN, entity.matchesRequest)
    }

    @Test
    fun `a payload with the product name parses it`() {
        val reply = "Gợi ý.[TAPPY_SHOPPING]" +
            """{"v":1,"entities":[{"key":"m1:16:512","config":"M1 · 16GB · 512GB",
            "name":"MacBook Air M1 2020 16GB 512GB","matchesRequest":"khop",
            "recommended":true,"priceLow":25800000,"priceHigh":27500000,
            "offers":[{"seller":"Zin100","url":"https://shop.example/zin","price":25800000,"currency":"VND"}]}],
            "recommendation":null}""".trimIndent() +
            "[/TAPPY_SHOPPING]"

        val entity = ChatResponseParser.parse(reply).shopping!!.entities[0]

        assertEquals("MacBook Air M1 2020 16GB 512GB", entity.displayName)
        assertEquals(ShoppingMatch.EXACT, entity.matchesRequest)
        // The spec label stays a spec label; it is never the identity.
        assertEquals("M1 · 16GB · 512GB", entity.config)
    }

    @Test
    fun `a blank name counts as no product identity`() {
        val reply = "Gợi ý.[TAPPY_SHOPPING]" +
            """{"v":1,"entities":[{"key":"k","config":"c","name":"   ","offers":[]}]}""" +
            "[/TAPPY_SHOPPING]"

        val entity = ChatResponseParser.parse(reply).shopping!!.entities[0]

        assertEquals("   ", entity.name)
        assertNull(entity.displayName)
    }

    @Test
    fun `unknown future fields are ignored`() {
        val reply = "Gợi ý.[TAPPY_SHOPPING]" +
            """{"v":1,"someFutureKey":42,"entities":[{"key":"k","config":"c","name":"Sony WH-1000XM5",
            "brandLaterOn":"Sony","offers":[]}]}""".trimIndent() +
            "[/TAPPY_SHOPPING]"

        val entity = ChatResponseParser.parse(reply).shopping!!.entities[0]

        assertEquals("Sony WH-1000XM5", entity.displayName)
    }

    @Test
    fun `plan cta and followups still parse alongside a shopping block`() {
        val reply = """
            Đây là gợi ý của mình.
            [TAPPY_SHOPPING]$payload[/TAPPY_SHOPPING]
            [TAPPY_PLAN]{"title":"Tối nay","days":[{"label":"Ngày 1","items":[{"time":"19:00","name":"Ăn tối"}]}]}[/TAPPY_PLAN]
            [CTA_BUTTONS]{"buttons":[{"label":"Xem trên Maps","type":"maps","url":"https://maps.google.com","primary":true}]}[/CTA_BUTTONS]
            [FOLLOWUPS]Quán nào rẻ hơn?|Có giao hàng không?[/FOLLOWUPS]
        """.trimIndent()

        val parsed = ChatResponseParser.parse(reply)

        assertEquals("Đây là gợi ý của mình.", parsed.text)
        assertNotNull(parsed.shopping)
        assertEquals("Tối nay", parsed.plan?.title)
        assertEquals(1, parsed.ctaButtons.size)
        assertEquals(CtaType.Maps, parsed.ctaButtons[0].ctaType)
        assertEquals(listOf("Quán nào rẻ hơn?", "Có giao hàng không?"), parsed.followups)
        assertTrue(parsed.text.none { it == '[' })
    }
}
