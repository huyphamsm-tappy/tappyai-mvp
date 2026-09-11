package com.tappyai.app.chat

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `[TAPPY_PLACES]` on Android — the DURABLE place card.
 *
 * 🚨 THIS IS THE THIRD MARKER TO ARRIVE SERVER-SIDE, AND THE FIRST TWO BOTH LEAKED. `[CTA_BUTTONS]`
 * rendered its raw JSON as message body in production, then `[TAPPY_SHOPPING]` did the same on iOS.
 * Both had the same cause: the server added a block, one client learned it, and the others kept
 * reading the text as prose. So the parser is written before the flag that emits the block is
 * turned on, and these tests exist to be green BEFORE a single user can see the marker.
 *
 * The shared cases live in `shared/structured-content/marker-fixtures.json` and are executed by
 * `ChatResponseFixtureConformanceTest` on all three platforms. This file covers what is specific
 * to Android's own parse chain: that the block cannot break the markers already in it, and that
 * the model carries the rich fields the card renders.
 */
class PlacesMarkerParseTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val richItem = """
        {"id":"place:osm:10.77,106.70","domain":"food","kind":"place","rank":0,
         "actions":[{"kind":"maps","urlKind":"direct","url":"https://maps.example/a","labelKey":"v3.action.maps"},
                    {"kind":"order","urlKind":"search","url":"https://shopeefood.vn/x","labelKey":"v3.action.order","platform":"ShopeeFood"}],
         "name":"Bún Bò Huế Đông Ba","address":"110 Nguyễn Du, Quận 1","rating":4.6,"ratingCount":1284,
         "openingHours":"Mo-Su 06:00-22:00","phone":"+84 28 3822 1234","image":"https://cdn.example/a.jpg",
         "priceLevel":1,"distanceKm":1.4,"reasons":[{"attribute":"rating","evidence":"4.6 sao từ 1284 đánh giá"}]}
    """.trimIndent().replace("\n", "").replace("  ", "")

    private val sparseItem =
        """{"id":"place:osm:10.78,106.69","domain":"food","kind":"place","rank":1,"actions":[],"name":"Quán Vỉa Hè"}"""

    private fun block(vararg items: String) =
        "[TAPPY_PLACES]{\"v\":1,\"items\":[" + items.joinToString(",") + "]}[/TAPPY_PLACES]"

    private val prose = "Mình gợi ý mấy quán này nhé."

    // ── The payload ─────────────────────────────────────────────────────────

    @Test
    fun `a full place decodes every field the card renders`() {
        val p = ChatResponseParser.parse("$prose\n${block(richItem)}").places.single()
        assertEquals("Bún Bò Huế Đông Ba", p.name)
        assertEquals("110 Nguyễn Du, Quận 1", p.address)
        assertEquals(4.6, p.rating!!, 0.001)
        assertEquals(1284, p.ratingCount)
        assertEquals("Mo-Su 06:00-22:00", p.openingHours)
        assertEquals("+84 28 3822 1234", p.phone)
        assertEquals("https://cdn.example/a.jpg", p.image)
        assertEquals(1, p.priceLevel)
        assertEquals(1.4, p.distanceKm!!, 0.001)
        assertEquals("4.6 sao từ 1284 đánh giá", p.reasons.single().evidence)
        assertEquals(2, p.actions.size)
        assertEquals("ShopeeFood", p.actions[1].platform)
    }

    @Test
    fun `optional fields the server did not state are ABSENT, not blank or fabricated`() {
        val p = ChatResponseParser.parse("$prose\n${block(sparseItem)}").places.single()
        assertEquals("Quán Vỉa Hè", p.name)
        assertNull(p.address)
        assertNull(p.openingHours)
        assertNull(p.rating)
        assertNull(p.ratingCount)
        assertNull(p.priceLevel)
        assertNull(p.distanceKm)
        assertNull(p.image)
        // And the card draws nothing for them rather than an empty row.
        val card = p.toCardView()!!
        assertNull(card.address)
        assertNull(card.rating)
        assertTrue(card.actions.isEmpty())
    }

    @Test
    fun `multiple places keep the server's rank order`() {
        val places = ChatResponseParser.parse("$prose\n${block(richItem, sparseItem)}").places
        assertEquals(listOf("Bún Bò Huế Đông Ba", "Quán Vỉa Hè"), places.map { it.name })
        assertEquals(listOf(0, 1), places.map { it.rank })
    }

    @Test
    fun `unknown fields are tolerated on the envelope and on an item`() {
        val text = "$prose\n[TAPPY_PLACES]{\"v\":1,\"experiment\":\"b\"," +
            "\"items\":[{\"id\":\"x\",\"rank\":0,\"actions\":[],\"name\":\"Quán Mới\",\"futureField\":{\"a\":1}}]}[/TAPPY_PLACES]"
        val parsed = ChatResponseParser.parse(text)
        assertEquals("Quán Mới", parsed.places.single().name)
        assertFalse(parsed.text.contains("futureField"))
    }

    @Test
    fun `an unknown version still decodes — web does not gate on it either`() {
        val text = "$prose\n[TAPPY_PLACES]{\"v\":99,\"items\":[{\"id\":\"x\",\"rank\":0,\"actions\":[],\"name\":\"Quán Tương Lai\"}]}[/TAPPY_PLACES]"
        assertEquals("Quán Tương Lai", ChatResponseParser.parse(text).places.single().name)
    }

    @Test
    fun `an empty items array yields no places rather than an empty card`() {
        val parsed = ChatResponseParser.parse("$prose\n[TAPPY_PLACES]{\"v\":1,\"items\":[]}[/TAPPY_PLACES]")
        assertTrue(parsed.places.isEmpty())
        assertEquals(prose, parsed.text)
    }

    // ── Stripping. Decode may fail; the strip may not. ───────────────────────

    @Test
    fun `the block never reaches the visible text`() {
        val parsed = ChatResponseParser.parse("$prose\n${block(richItem)}")
        assertEquals(prose, parsed.text)
        for (fragment in listOf("[TAPPY_PLACES]", "[/TAPPY_PLACES]", "\"items\"", "place:osm", "labelKey")) {
            assertFalse("$fragment leaked", parsed.text.contains(fragment))
        }
    }

    @Test
    fun `a truncated block strips even though nothing decodes`() {
        val parsed = ChatResponseParser.parse("$prose\n[TAPPY_PLACES]{\"v\":1,\"items\":[{\"id\":\"pl")
        assertTrue(parsed.places.isEmpty())
        assertEquals(prose, parsed.text)
        assertFalse(parsed.text.contains("TAPPY_PLACES"))
    }

    @Test
    fun `malformed JSON strips and decodes to nothing`() {
        val parsed = ChatResponseParser.parse("$prose\n[TAPPY_PLACES]{not json at all}[/TAPPY_PLACES]")
        assertTrue(parsed.places.isEmpty())
        assertEquals(prose, parsed.text)
    }

    @Test
    fun `an orphan closing tag is removed`() {
        val parsed = ChatResponseParser.parse("$prose\n[/TAPPY_PLACES]")
        assertEquals(prose, parsed.text)
    }

    @Test
    fun `a second block is stripped without rendering a second set`() {
        val parsed = ChatResponseParser.parse("$prose\n${block(richItem)}\n${block(sparseItem)}")
        assertEquals(1, parsed.places.size)
        assertFalse(parsed.text.contains("TAPPY_PLACES"))
        assertFalse(parsed.text.contains("Quán Vỉa Hè"))
    }

    // ── Coexistence. The server composes prose + places + CTA. ───────────────

    @Test
    fun `a CTA block AFTER the place block survives, and both are stripped`() {
        val cta = """[CTA_BUTTONS]{"buttons":[{"label":"Xem bản đồ","type":"maps","url":"https://maps.example/a","primary":true}]}[/CTA_BUTTONS]"""
        val parsed = ChatResponseParser.parse("$prose\n${block(richItem)}\n$cta")
        assertEquals("the CTA behind the place block must still decode", 1, parsed.ctaButtons.size)
        assertEquals("Xem bản đồ", parsed.ctaButtons.single().label)
        assertEquals(1, parsed.places.size)
        assertEquals(prose, parsed.text)
    }

    @Test
    fun `the other markers are untouched by the new one`() {
        val text = buildString {
            append("[TAPPY_SHOPPING]{\"entities\":[{\"key\":\"k\",\"config\":\"Air M1\",\"matchesRequest\":\"khop\",\"offers\":[]}]}[/TAPPY_SHOPPING]\n")
            append(prose).append("\n")
            append("[TAPPY_PLAN]{\"days\":[{\"label\":\"Hôm nay\",\"items\":[{\"time\":\"10:00\",\"name\":\"Ghé quán\"}]}]}[/TAPPY_PLAN]\n")
            append(block(richItem)).append("\n")
            append("[FOLLOWUPS]Quán nào gần hơn?|Có chỗ đậu xe không?")
        }
        val parsed = ChatResponseParser.parse(text)
        assertNotNull(parsed.plan)
        assertNotNull(parsed.shopping)
        assertEquals(listOf("Quán nào gần hơn?", "Có chỗ đậu xe không?"), parsed.followups)
        assertEquals(1, parsed.places.size)
        assertEquals(prose, parsed.text)
    }

    // ── The card projection ─────────────────────────────────────────────────

    @Test
    fun `a place whose name could not be persisted draws no card`() {
        // What a Google-sourced row looks like after `mayPersist` has done its work: identifiers
        // and our own actions, and nothing a reader could identify the place by. A card with no
        // name is not a thinner card, it is an unreadable one — and re-fetching the name is what
        // the storage terms forbid.
        val googleShaped = PersistedPlace(
            id = "place:google:ChIJ_g", domain = "food", kind = "place", rank = 0,
            actions = listOf(PersistedPlaceAction("maps", "direct", "https://maps.example/g", "v3.action.maps")),
        )
        assertNull(googleShaped.toCardView())
    }

    @Test
    fun `the price band mirrors web, and an out-of-range level shows nothing`() {
        assertEquals("đ", priceBand(1))
        assertEquals("đđđđ", priceBand(4))
        assertNull(priceBand(0))
        assertNull(priceBand(5))
        assertNull(priceBand(null))
    }

    // ── The LIVE annotation (`8:`), which is a different payload ────────────

    @Test
    fun `the live annotation decodes into the same card shape`() {
        val frame = """[{"kind":"tappy.places.v1","v":1,"domain":"food","ranked":true,
            "items":[{"id":"p1","name":"Quán Live","address":"1 Lê Lợi","rating":4.8,"ratingCount":320,
            "openNow":true,"priceLevel":2,"distanceKm":0.9,"priceSignal":"~50k",
            "categories":["cafe","bakery"],"rank":0,
            "tradeOff":{"attribute":"distance","evidence":"Xa hơn 1km"},
            "actions":[{"kind":"maps","urlKind":"direct","url":"https://maps.example/l","labelKey":"v3.action.maps"}]}]}]"""
            .trimIndent().replace("\n", "")
        val view = json.decodeFromString<List<PlacesLiveView>>(frame).single()
        assertEquals(PLACES_ANNOTATION_KIND, view.kind)

        val card = view.items.single().toCardView()
        assertEquals("Quán Live", card.name)
        assertEquals(4.8, card.rating!!, 0.001)
        assertEquals(true, card.openNow)
        assertEquals("~50k", card.priceSignal)
        assertEquals(listOf("cafe", "bakery"), card.categories)
        assertEquals("Xa hơn 1km", card.tradeOff)
        assertEquals("đđ", priceBand(card.priceLevel))
    }

    @Test
    fun `an annotation of a different kind is not mistaken for a place decision`() {
        val frame = """[{"kind":"something.else.v1","items":[{"id":"p1","name":"Không phải quán"}]}]"""
        val view = json.decodeFromString<List<PlacesLiveView>>(frame)
            .firstOrNull { it.kind == PLACES_ANNOTATION_KIND && it.items.isNotEmpty() }
        assertNull(view)
    }

    /**
     * The wiring. Reading the frame correctly in a helper the stream never calls is still the old
     * bug — Android dropped every non-`0:` line, and that single condition is what lost the live
     * card. What the reader DOES is covered for real by `ChatStreamWireReplayTest`; what cannot be
     * run is the repository itself, which needs OkHttp, Hilt and a socket, so the one rule left
     * over — that the stream loop actually goes through the reader — is pinned against its source,
     * the way `ChatErrorMessageContractTest` pins the error classifier.
     */
    @Test
    fun `the repository actually routes every stream line through the frame reader`() {
        var dir: java.io.File? = java.io.File(".").absoluteFile
        var src: String? = null
        while (dir != null && src == null) {
            val f = java.io.File(dir, "android/app/src/main/java/com/tappyai/app/chat/data/RealChatRepository.kt")
            if (f.isFile) src = f.readText()
            dir = dir.parentFile
        }
        assertNotNull("RealChatRepository.kt not found", src)
        assertTrue(
            "every line the socket produces must go through ChatStreamFrames",
            src!!.contains("ChatStreamFrames.parse(line)"),
        )
        assertFalse(
            "and the repository must not keep a second, private copy of the frame rules",
            src.contains("startsWith(\"8:\")"),
        )
    }

    @Test
    fun `unknown fields on the live annotation are tolerated`() {
        val frame = """[{"kind":"tappy.places.v1","futureFlag":true,
            "items":[{"id":"p1","name":"Quán Mới","newThing":{"a":1},"rank":0,"actions":[]}]}]"""
            .trimIndent().replace("\n", "")
        val view = json.decodeFromString<List<PlacesLiveView>>(frame).single()
        assertEquals("Quán Mới", view.items.single().name)
    }
}
