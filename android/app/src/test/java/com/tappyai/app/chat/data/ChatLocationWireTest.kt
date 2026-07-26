package com.tappyai.app.chat.data

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the `userLocation` field of the `/api/chat` request body against the web shape
 * (`{lat,lng,address}`, `ChatInterface.tsx:580` / `route.ts:72`). [encodeJson] mirrors
 * core:network's encoder (encodeDefaults=false) — that is what keeps a null location off the wire,
 * matching the web omitting the field when it has no location.
 */
class ChatLocationWireTest {

    private val encodeJson = Json { encodeDefaults = false }

    private fun request(location: UserLocationDto?) =
        ChatRequest(messages = listOf(ChatMessageDto("user", textContent("hi"))), userLocation = location)

    @Test
    fun `userLocation is sent as lat lng address`() {
        val body = encodeJson.encodeToString(request(UserLocationDto(lat = 10.77, lng = 106.7, address = "Quận 1")))
        assertTrue(body.contains("\"userLocation\""))
        assertTrue(body.contains("\"lat\":10.77"))
        assertTrue(body.contains("\"lng\":106.7"))
        assertTrue(body.contains("\"address\":\"Quận 1\""))
    }

    @Test
    fun `null location is omitted from the wire`() {
        val body = encodeJson.encodeToString(request(null))
        assertFalse(body.contains("userLocation"))
    }

    @Test
    fun `null address is omitted but coords are sent`() {
        val body = encodeJson.encodeToString(request(UserLocationDto(lat = 21.0, lng = 105.8, address = null)))
        assertTrue(body.contains("\"lat\":21.0"))
        assertFalse(body.contains("address"))
    }
}
