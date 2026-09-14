package com.tappyai.app.chat

import com.tappyai.app.R
import com.tappyai.app.chat.data.ChatStreamEvent
import com.tappyai.app.chat.data.ChatStreamFrames
import com.tappyai.app.chat.data.CommerceHandoffBodyDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import java.net.URI

/**
 * CROSS-PLATFORM CCP CONTRACT (14 Sep 2026) — the Android consumer of
 * `shared/ccp/commerce-action-fixtures.json`.
 *
 * The Commerce Capability Platform resolves a Commerce Link ONCE on the server and projects it as
 * an Action with its facts and an already-RESOLVED label key. This client decodes it, renders the
 * key from its own dictionary and opens the URL verbatim. These cases prove, per provider, that
 * nothing is lost or re-derived on the way: provider, capability, label key, depth, loginRequired,
 * commerce facts, the opaque ids, the handoff target — and that "TikTok Shop" can never render as
 * Shopee, nor a retired grammar ever open.
 */
class CommerceActionContractTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun fixtureFile(): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "shared/ccp/commerce-action-fixtures.json")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        fail("shared/ccp/commerce-action-fixtures.json not found above ${File(".").absolutePath}")
        error("unreachable")
    }

    private val root: JsonObject by lazy { json.parseToJsonElement(fixtureFile().readText()).jsonObject }
    private val cases get() = root["cases"]!!.jsonArray.map { it.jsonObject }
    private fun strings(obj: JsonObject, key: String): List<String> = obj[key]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
    private fun host(url: String) = URI(url).host.lowercase()

    /** `v3.action.purchaseLoginOn` → `R.string.place_action_purchase_login_on`, by the contract's naming rule. */
    private fun resourceFor(labelKey: String): Int {
        val leaf = labelKey.substringAfterLast('.')
        val snake = leaf.replace(Regex("[A-Z]")) { "_" + it.value.lowercase() }
        return R.string::class.java.getField("place_action_$snake").getInt(null)
    }

    /** The annotation frame the server sends, wrapping one place whose actions are the fixture's. */
    private fun liveFrame(action: JsonObject): String =
        "8:" + json.encodeToString(
            kotlinx.serialization.json.JsonArray.serializer(),
            kotlinx.serialization.json.JsonArray(
                listOf(
                    kotlinx.serialization.json.buildJsonObject {
                        put("kind", kotlinx.serialization.json.JsonPrimitive(PLACES_ANNOTATION_KIND))
                        put("v", kotlinx.serialization.json.JsonPrimitive(1))
                        put("domain", kotlinx.serialization.json.JsonPrimitive("shopping"))
                        put(
                            "items",
                            kotlinx.serialization.json.JsonArray(
                                listOf(
                                    kotlinx.serialization.json.buildJsonObject {
                                        put("id", kotlinx.serialization.json.JsonPrimitive("p1"))
                                        put("domain", kotlinx.serialization.json.JsonPrimitive("shopping"))
                                        put("kind", kotlinx.serialization.json.JsonPrimitive("place"))
                                        put("name", kotlinx.serialization.json.JsonPrimitive("Subject"))
                                        put("rank", kotlinx.serialization.json.JsonPrimitive(0))
                                        put("actions", kotlinx.serialization.json.JsonArray(listOf(action)))
                                    },
                                ),
                            ),
                        )
                    },
                ),
            ),
        )

    @Test
    fun `every provider case survives the live annotation unchanged and renders the server's label key`() {
        val failures = mutableListOf<String>()
        val retired = strings(root, "retiredGrammars")
        for (c in cases) {
            val id = c["id"]!!.jsonPrimitive.content
            val expect = c["expect"]!!.jsonObject
            val event = ChatStreamFrames.parse(liveFrame(c["action"]!!.jsonObject))
            val view = (event as? ChatStreamEvent.Places)?.view
            if (view == null) { failures += "[$id] the annotation did not decode"; continue }
            val action = view.items.single().actions.single()
            val card = view.items.single().toCardView().actions.single()
            val commerce = card.commerce
            if (commerce == null) { failures += "[$id] commerce facts were dropped by the projection"; continue }

            // Provider · capability · depth · login boundary · facts · ids — the server's, verbatim.
            fun check(what: String, expected: Any?, actual: Any?) {
                if (expected != actual) failures += "[$id] $what: expected $expected but was $actual"
            }
            check("providerId", expect["providerId"]!!.jsonPrimitive.content, commerce.providerId)
            check("capability", expect["capability"]!!.jsonPrimitive.content, commerce.capability)
            check("depth", expect["depth"]!!.jsonPrimitive.int, commerce.depth)
            check("loginRequired", expect["loginRequired"]!!.jsonPrimitive.boolean, commerce.loginRequired)
            check("handoff", c["action"]!!.jsonObject["commerce"]!!.jsonObject["handoff"]?.jsonPrimitive?.contentOrNull, commerce.handoff)
            expect["schedule"]?.jsonObject?.let { s ->
                check("facts.schedule.date", s["date"]!!.jsonPrimitive.content, commerce.facts?.schedule?.date)
                check("facts.schedule.time", s["time"]?.jsonPrimitive?.contentOrNull, commerce.facts?.schedule?.time)
            }
            val body = expect["handoffBody"]!!.jsonObject
            check("handoff linkId", body["linkId"]!!.jsonPrimitive.content, commerce.linkId)
            check("handoff requestId", body["requestId"]!!.jsonPrimitive.content, commerce.requestId)
            val dto = CommerceHandoffBodyDto(linkId = commerce.linkId, requestId = commerce.requestId)
            check("beacon platform", "android", dto.platform)
            val wire = json.encodeToString(CommerceHandoffBodyDto.serializer(), dto)
            if (wire.contains("http")) failures += "[$id] the beacon carries a URL: $wire"

            // The URL is opened VERBATIM: right host, never a sibling merchant, never a retired grammar.
            check("url", c["action"]!!.jsonObject["url"]!!.jsonPrimitive.content, card.url)
            check("host", expect["host"]!!.jsonPrimitive.content, host(card.url))
            if (host(card.url) in strings(expect, "forbiddenHosts")) failures += "[$id] opens a forbidden merchant ${host(card.url)}"
            retired.firstOrNull { card.url.startsWith(it) }?.let { failures += "[$id] opens a retired grammar $it" }

            // The label: the wire key, rendered from this client's dictionary — never re-derived.
            val expectedKey = expect["labelKey"]!!.jsonPrimitive.content
            check("labelKey on the wire", expectedKey, action.labelKey)
            val label = placeActionLabel(card.labelKey, card.urlKind, card.platform)
            check("label resource", resourceFor(expectedKey), label.resId)
            check("label platform", card.platform, label.platform)
        }
        if (failures.isNotEmpty()) fail("Commerce action contract drift on Android:\n" + failures.joinToString("\n"))
    }

    @Test
    fun `the Shopping card decodes the same commerce view from the marker and shows the same handoff`() {
        val failures = mutableListOf<String>()
        for (v in root["shoppingCommerceViews"]!!.jsonArray.map { it.jsonObject }) {
            val id = v["id"]!!.jsonPrimitive.content
            val expect = v["expect"]!!.jsonObject
            val view = json.encodeToString(JsonObject.serializer(), v["view"]!!.jsonObject)
            val marker = "[TAPPY_SHOPPING]{\"v\":1,\"entities\":[{\"key\":\"e1\",\"name\":\"iPhone 16 Pro\",\"config\":\"128GB\",\"matchesRequest\":\"khop\",\"recommended\":true,\"offers\":[],\"commerceLinks\":[$view]}],\"recommendation\":null}[/TAPPY_SHOPPING]\n\nMình nghiêng về iPhone 16 Pro."
            val parsed = ChatResponseParser.parse(marker)
            val entity = parsed.shopping?.entities?.singleOrNull()
            if (entity == null) { failures += "[$id] the shopping marker did not decode"; continue }
            val handoffs = entity.commerceHandoffs
            val link = (handoffs.detail + handoffs.search).singleOrNull()
            if (link == null) { failures += "[$id] commerceLinks were dropped"; continue }
            if (link.isSearch != expect["isSearch"]!!.jsonPrimitive.boolean) failures += "[$id] search/detail split differs"
            if (host(link.url) != expect["host"]!!.jsonPrimitive.content) failures += "[$id] host ${host(link.url)}"
            val action = link.asPlaceCardAction()
            // A native client never re-derives: a legacy view without labelKey renders the honest fallback.
            val expectedKey = (expect["nativeLabelKey"] ?: expect["labelKey"])!!.jsonPrimitive.content
            if (action.labelKey != expectedKey) failures += "[$id] labelKey: expected $expectedKey but was ${action.labelKey}"
            val label = placeActionLabel(action.labelKey, action.urlKind, action.platform)
            if (label.resId != resourceFor(expectedKey)) failures += "[$id] label resource differs"
            if (label.platform != link.merchantName) failures += "[$id] label platform ${label.platform}"
            if (action.commerce?.linkId != link.linkId || action.commerce?.requestId != link.requestId) failures += "[$id] opaque ids lost"
            if (parsed.text.contains("TAPPY_SHOPPING")) failures += "[$id] marker leaked"
        }
        if (failures.isNotEmpty()) fail("Shopping commerce view drift on Android:\n" + failures.joinToString("\n"))
    }

    @Test
    fun `a legacy marker without labelKey never renders a stronger verb than search or view`() {
        val detail = ShoppingCommerceView(url = "https://www.dienmayxanh.com/dien-thoai/iphone-16-pro", merchantName = "Điện Máy Xanh", kind = "DETAIL_HANDOFF")
        val search = ShoppingCommerceView(url = "https://shopee.vn/search?keyword=x", merchantName = "Shopee", kind = "SEARCH_HANDOFF")
        assertEquals(R.string.place_action_view_on, placeActionLabel(detail.asPlaceCardAction().labelKey, "direct", "Điện Máy Xanh").resId)
        assertEquals(R.string.place_action_search_on, placeActionLabel(search.asPlaceCardAction().labelKey, "search", "Shopee").resId)
    }

    @Test
    fun `the server-validated CTA block renders only the requested merchant's buttons`() {
        // The server validates the model's [CTA_BUTTONS] once; this client parses what it ships.
        // The fixture's EXPECTED output is what reaches the phone.
        for (b in root["modelCtaBlocks"]!!.jsonArray.map { it.jsonObject }) {
            val id = b["id"]!!.jsonPrimitive.content
            val labels = strings(b, "expectCtaLabels")
            val hosts = strings(b, "expectCtaHosts")
            val buttons = labels.indices.joinToString(",") { i -> "{\"label\":${json.encodeToString(kotlinx.serialization.serializer<String>(), labels[i])},\"type\":\"website\",\"url\":\"https://${hosts[i]}/x\"}" }
            val shipped = strings(b, "expectVisibleContains").first() + "\n\n[CTA_BUTTONS]{\"buttons\":[$buttons]}[/CTA_BUTTONS]" +
                (strings(b, "expectFollowups").takeIf { it.isNotEmpty() }?.let { "\n[FOLLOWUPS]" + it.joinToString("|") } ?: "")
            val parsed = ChatResponseParser.parse(shipped)
            assertEquals("[$id] labels", labels, parsed.ctaButtons.map { it.label })
            assertEquals("[$id] hosts", hosts, parsed.ctaButtons.map { host(it.url) })
            for (h in strings(b, "expectForbiddenHosts")) assertFalse("[$id] forbidden host $h", parsed.ctaButtons.any { host(it.url) == h })
            assertEquals("[$id] followups", strings(b, "expectFollowups"), parsed.followups)
            assertFalse("[$id] marker leaked", parsed.text.contains("CTA_BUTTONS"))
        }
    }

    @Test
    fun `every listed commerce key has a resource and an unknown key falls back to Open, never to a promise`() {
        for (key in strings(root, "commerceLabelKeys")) {
            val res = resourceFor(key)
            val label = placeActionLabel(key, "direct", "Merchant")
            assertEquals("$key resolves to its own resource", res, label.resId)
        }
        assertEquals(R.string.place_action_open, placeActionLabel("v3.action.checkoutNow", "direct", "Merchant").resId)
        assertEquals(R.string.place_action_search_on, placeActionLabel("v3.action.unknownSearch", "search", "Merchant").resId)
        assertNotNull(placeActionLabel("v3.action.purchaseOn", "direct", null))
        assertTrue("a platform key without a platform drops to the plain label", placeActionLabel("v3.action.purchaseOn", "direct", null).platform == null)
    }
}
