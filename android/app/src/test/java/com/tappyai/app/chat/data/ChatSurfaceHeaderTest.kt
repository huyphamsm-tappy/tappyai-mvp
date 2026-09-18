package com.tappyai.app.chat.data

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The `/api/chat` request declares this app as a decision-card surface.
 *
 * The server keys two things on `x-tappy-surface` (`src/lib/ai/decisionSurface.ts`): whether the
 * model is told the card shows the place facts, and whether the per-place photo + provider-link
 * block is injected into the prose. Web sends `web`; before this header Android sent nothing and
 * got the no-card reply — three inline images and three `ShopeeFood · GrabFood · BeFood` rows
 * ahead of the place section (Pixel_8, 2026-09-12). The value is pinned as a string because the
 * server compares it verbatim.
 */
class ChatSurfaceHeaderTest {

    private val body = """{"messages":[{"role":"user","content":"Quán bún bò ngon ở TP.HCM?"}]}"""
        .toRequestBody("application/json".toMediaType())

    @Test
    fun `the chat request carries x-tappy-surface android`() {
        val request = chatRequest("http://10.0.2.2:3200/", body)
        assertEquals("android", request.header("x-tappy-surface"))
        assertEquals(listOf("android"), request.headers("x-tappy-surface"))
    }

    @Test
    fun `the surface is the only header the request adds itself`() {
        // Authorization and Accept-Language come from the shared client's interceptors, never
        // from here — a second source for either would be a second thing to keep in sync.
        val request = chatRequest("http://10.0.2.2:3200/", body)
        assertEquals(setOf("x-tappy-surface"), request.headers.names())
        assertNull(request.header("Authorization"))
    }

    @Test
    fun `url, method and body are unchanged by the header`() {
        val request = chatRequest("http://10.0.2.2:3200/", body)
        assertEquals("http://10.0.2.2:3200/api/chat", request.url.toString())
        assertEquals("POST", request.method)
        val sent = Buffer().also { request.body!!.writeTo(it) }.readUtf8()
        assertEquals("""{"messages":[{"role":"user","content":"Quán bún bò ngon ở TP.HCM?"}]}""", sent)
    }
}
