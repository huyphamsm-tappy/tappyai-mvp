package com.tappyai.app.share

import com.tappyai.app.chat.ChatResponseParser
import com.tappyai.core.network.NetworkError
import com.tappyai.core.security.TokenProvider
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * Sharing a plan from Android = publishing it through `POST /api/plans/share` and delivering
 * the ONE canonical `/plan/<shareId>` the server answers with. The server owns the identity;
 * this client never mints, hashes or guesses one. Every target then carries that URL.
 */
class PlanShareTest {

    private val id = "lSSFn0yDMF6w"
    private val canonical = "https://www.tappyai.com/plan/lSSFn0yDMF6w"

    /** A real reply, the way it arrives after enrichment: the block carries `photo_url`. */
    private val reply = """
        Đây là kế hoạch Quy Nhơn cho hai bạn.

        [TAPPY_PLAN]{"type":"trip","title":"Quy Nhơn 3 ngày 2 đêm","people":2,"budget_total":"5.000.000đ","share_text":"Biển xanh, ẩm thực ngon.","days":[{"label":"Ngày 1","items":[{"time":"09:00","emoji":"🏖️","category":"entertainment","name":"Bãi Kỳ Co","address":"Xã Nhơn Lý, Quy Nhơn","photo_url":"https://lh3.googleusercontent.com/p/A","place_id":"ChIJx"},{"time":"12:30","emoji":"🦐","category":"food","name":"Hải sản Nhơn Lý"}]}]}[/TAPPY_PLAN]
    """.trimIndent()

    private class FakeTokens(var token: String?) : TokenProvider {
        override fun getAccessToken() = token
        override fun getRefreshToken(): String? = null
        override fun saveTokens(accessToken: String, refreshToken: String?) { token = accessToken }
        override fun clearTokens() { token = null }
        override fun savePendingAnonymousClaim(accessToken: String) {}
        override fun getPendingAnonymousClaim(): String? = null
        override fun clearPendingAnonymousClaim() {}
        override fun isAccessTokenExpired() = false
    }

    private class FakeApi(val answer: suspend (PlanSharePublishRequest) -> PlanSharePublishResponse) : PlanShareApi {
        val requests = ArrayList<PlanSharePublishRequest>()
        override suspend fun publish(body: PlanSharePublishRequest): PlanSharePublishResponse {
            requests += body
            return answer(body)
        }
    }

    private fun http(code: Int): HttpException =
        HttpException(Response.error<Any>(code, """{"error":"x"}""".toResponseBody("application/json".toMediaType())))

    private fun repo(api: PlanShareApi, token: String? = "member-token", anonymous: Boolean = false) =
        RealPlanShareRepository(api, FakeTokens(token)) { anonymous }

    // ── The block that is published ─────────────────────────────────────────────────────

    @Test
    fun `the parser keeps the plan block verbatim, and only when the plan decoded`() {
        val parsed = ChatResponseParser.parse(reply)
        assertNotNull(parsed.plan)
        val block = parsed.planJson!!
        // Verbatim: fields the Android model does not carry survive for the server to whitelist.
        assertTrue(block.contains("\"photo_url\":\"https://lh3.googleusercontent.com/p/A\""))
        assertTrue(block.startsWith("{") && block.endsWith("}"))
        assertNull(ChatResponseParser.parse("no plan here").planJson)
        assertNull(ChatResponseParser.parse("[TAPPY_PLAN]{not json[/TAPPY_PLAN]").planJson)
    }

    @Test
    fun `publishes the block as {plan} under the session and turns the server id into the canonical url`() = runTest {
        val api = FakeApi { PlanSharePublishResponse(id = id, path = "/plan/$id", url = "http://localhost:3107/plan/$id", reused = false) }
        val parsed = ChatResponseParser.parse(reply)
        val outcome = repo(api).publish(parsed.planJson!!)

        assertEquals(PlanShareOutcome.Link(id, canonical), outcome)
        assertEquals(1, api.requests.size)
        val sent = api.requests[0].plan
        assertEquals("Quy Nhơn 3 ngày 2 đêm", sent["title"]!!.jsonPrimitive.content)
        // The real block, not a re-encoded model: photo_url survives to the request.
        val firstStop = sent["days"]!!.jsonArray[0].jsonObject["items"]!!.jsonArray[0].jsonObject
        assertEquals("https://lh3.googleusercontent.com/p/A", firstStop["photo_url"]!!.jsonPrimitive.content)
        assertEquals("Bãi Kỳ Co", firstStop["name"]!!.jsonPrimitive.content)
        // Whatever the server put in `url` (a dev host here), the link is the CANONICAL one built from the id.
        assertEquals(canonical, (outcome as PlanShareOutcome.Link).url)
    }

    @Test
    fun `the same plan published twice asks the server twice and gets the same link — no client cache, no client id`() = runTest {
        var calls = 0
        val api = FakeApi { calls++; PlanSharePublishResponse(id = id, reused = calls > 1) }
        val r = repo(api)
        val block = ChatResponseParser.parse(reply).planJson!!
        assertEquals(PlanShareOutcome.Link(id, canonical), r.publish(block))
        assertEquals(PlanShareOutcome.Link(id, canonical), r.publish(block))
        assertEquals(2, calls)
    }

    // ── What is refused, and why ────────────────────────────────────────────────────────

    @Test
    fun `signed out or a guest session never sends the plan`() = runTest {
        val api = FakeApi { PlanSharePublishResponse(id = id) }
        val block = ChatResponseParser.parse(reply).planJson!!
        assertEquals(PlanShareOutcome.SignInRequired, repo(api, token = null).publish(block))
        assertEquals(PlanShareOutcome.SignInRequired, repo(api, token = "guest-token", anonymous = true).publish(block))
        assertEquals(0, api.requests.size)
    }

    @Test
    fun `a missing or non-JSON block is not shareable from here, and is not sent`() = runTest {
        val api = FakeApi { PlanSharePublishResponse(id = id) }
        assertEquals(PlanShareOutcome.NoPlanPayload, repo(api).publish(""))
        assertEquals(PlanShareOutcome.NoPlanPayload, repo(api).publish("not json"))
        assertEquals(PlanShareOutcome.NoPlanPayload, repo(api).publish("[1,2,3]"))
        assertEquals(0, api.requests.size)
    }

    @Test
    fun `server statuses map to truthful outcomes`() = runTest {
        val block = ChatResponseParser.parse(reply).planJson!!
        assertEquals(PlanShareOutcome.SignInRequired, repo(FakeApi { throw http(401) }).publish(block))
        assertEquals(PlanShareOutcome.SignInRequired, repo(FakeApi { throw http(403) }).publish(block))
        assertEquals(PlanShareOutcome.NotShareable, repo(FakeApi { throw http(400) }).publish(block))
        assertEquals(PlanShareOutcome.NotShareable, repo(FakeApi { throw http(413) }).publish(block))
        assertEquals(PlanShareOutcome.Failed, repo(FakeApi { throw http(500) }).publish(block))
        assertEquals(PlanShareOutcome.Offline, repo(FakeApi { throw IOException("offline") }).publish(block))
        assertEquals(PlanShareOutcome.Offline, repo(FakeApi { throw SocketTimeoutException("timeout") }).publish(block))
    }

    @Test
    fun `a 200 without a usable id is a failure — never a guessed link`() = runTest {
        val block = ChatResponseParser.parse(reply).planJson!!
        assertEquals(PlanShareOutcome.Failed, repo(FakeApi { PlanSharePublishResponse() }).publish(block))
        assertEquals(PlanShareOutcome.Failed, repo(FakeApi { PlanSharePublishResponse(id = "short") }).publish(block))
        assertEquals(PlanShareOutcome.Failed, repo(FakeApi { PlanSharePublishResponse(id = "AbCdEfGhIjK!") }).publish(block))
        // A url with no id is not trusted either: the id is the contract.
        assertEquals(PlanShareOutcome.Failed, repo(FakeApi { PlanSharePublishResponse(url = "https://www.tappyai.com/plan/$id") }).publish(block))
    }

    @Test
    fun `the error mapping is total`() {
        assertEquals(PlanShareOutcome.Failed, RealPlanShareRepository.outcomeOf(NetworkError.Serialization(RuntimeException())))
        assertEquals(PlanShareOutcome.Failed, RealPlanShareRepository.outcomeOf(NetworkError.Unknown(RuntimeException())))
        assertEquals(PlanShareOutcome.Offline, RealPlanShareRepository.outcomeOf(NetworkError.NoConnectivity))
        assertEquals(PlanShareOutcome.Offline, RealPlanShareRepository.outcomeOf(NetworkError.Timeout))
    }

    // ── The canonical url ───────────────────────────────────────────────────────────────

    @Test
    fun `planShareUrl is the web's url for a server id and null for anything else`() {
        assertEquals(canonical, TappyShare.planShareUrl(id))
        assertTrue(TappyShare.isShareableUrl(canonical))
        for (bad in listOf(null, "", "short", "AbCdEfGhIjK!", "AbCdEfGhIjK12", "../../etc")) assertNull(bad, TappyShare.planShareUrl(bad))
    }

    // ── What every target carries once the plan is published ───────────────────────────

    private val base = ShareArtifactBuilder.buildPlanArtifact(
        ChatResponseParser.parse(reply).plan!!, "vi", ChatResponseParser.parse(reply).planJson,
    )
    private val link = ShareArtifactBuilder.planLinkArtifact(base, canonical)

    @Test
    fun `the link artifact is the canonical url plus one line naming the plan — no second brochure`() {
        assertTrue(link.isPlanLink)
        assertEquals(canonical, link.url)
        assertEquals("Kế hoạch từ TappyAI: Quy Nhơn 3 ngày 2 đêm\n$canonical", link.text)
        assertFalse(link.text.contains("Bãi Kỳ Co"))
        assertEquals(base.planJson, link.planJson)
        // Before publishing, the artifact is the text brochure on the brand url — nothing pretends to be a page.
        assertFalse(base.isPlanLink)
        assertEquals(TappyShare.CANONICAL_ORIGIN, base.url)
    }

    @Test
    fun `Facebook and Messenger dialogs receive the canonical plan url, Zalo goes through its app package`() {
        val enc = java.net.URLEncoder.encode(canonical, "UTF-8")
        assertEquals("https://www.facebook.com/sharer/sharer.php?u=$enc", TappyShare.buildShareUrl(TappyShare.Target.FACEBOOK, link.url))
        assertEquals("fb-messenger://share?link=$enc", TappyShare.buildShareUrl(TappyShare.Target.MESSENGER, link.url))
        // No web URL for Zalo (the old sp.zalo.me one opened an empty page); ACTION_SEND to com.zing.zalo carries the link.
        assertNull(TappyShare.buildShareUrl(TappyShare.Target.ZALO, link.url))
        assertEquals("com.zing.zalo", TappyShare.packageFor(TappyShare.Target.ZALO))
        assertTrue(ShareArtifactBuilder.inboxBody(link, "vi").contains(canonical))
    }

    @Test
    fun `Messenger, WhatsApp, Telegram, Zalo, LINE, Viber, Email and the Inbox receive the link text (ACTION_SEND body)`() {
        // ShareDelivery.toApp / toEmail / toInbox all send inboxBody(artifact) as EXTRA_TEXT.
        val body = ShareArtifactBuilder.inboxBody(link, "vi")
        assertEquals(link.text, body)
        assertTrue(body.endsWith(canonical))
        for (t in listOf(TappyShare.Target.MESSENGER, TappyShare.Target.ZALO, TappyShare.Target.WHATSAPP, TappyShare.Target.TELEGRAM,
            TappyShare.Target.VIBER, TappyShare.Target.LINE)) {
            assertNotNull(t.id, TappyShare.packageFor(t))
        }
    }

    @Test
    fun `the text-uri fallbacks carry the canonical url too (WhatsApp, Telegram, Viber, LINE, Email)`() {
        val dec = { s: String -> java.net.URLDecoder.decode(s, "UTF-8") }
        assertTrue(dec(TappyShare.buildTextShareUrl(TappyShare.Target.WHATSAPP, link.subject, link.text)!!).contains(canonical))
        val tg = TappyShare.buildTextShareUrl(TappyShare.Target.TELEGRAM, link.subject, link.text, link.url)!!
        assertTrue(tg.startsWith("https://t.me/share/url?url=" + java.net.URLEncoder.encode(canonical, "UTF-8").replace("+", "%20")))
        assertTrue(dec(TappyShare.buildTextShareUrl(TappyShare.Target.VIBER, link.subject, link.text)!!).contains(canonical))
        assertTrue(dec(TappyShare.buildTextShareUrl(TappyShare.Target.LINE, link.subject, link.text)!!).contains(canonical))
        assertTrue(dec(TappyShare.buildTextShareUrl(TappyShare.Target.EMAIL, link.subject, link.text)!!).contains(canonical))
    }

    @Test
    fun `TikTok and Copy put the canonical url on the clipboard, Other apps sends the link text`() {
        // TikTok copies the artifact text; Copy (link) copies the url itself; the system sheet
        // sends artifact.text — all of which are, or end in, the canonical url.
        assertTrue(link.text.endsWith(canonical))
        assertEquals(canonical, link.url)
        assertFalse(link.url.contains("?"))
    }

    @Test
    fun `a recommendation share is untouched by any of this`() {
        val places = ShareArtifactBuilder.buildProseArtifact("Bún bò", "ngon")
        assertNull(places.planJson)
        assertFalse(places.isPlanLink)
        assertEquals(TappyShare.CANONICAL_ORIGIN, places.url)
    }
}
