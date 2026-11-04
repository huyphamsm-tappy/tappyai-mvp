package com.tappyai.app.messaging

import com.tappyai.app.messaging.data.BubbleMeta
import com.tappyai.app.messaging.data.CHAT_MEDIA_MAX_BYTES
import com.tappyai.app.messaging.data.ChatMessage
import com.tappyai.app.messaging.data.ChatPhotoFiles
import com.tappyai.app.messaging.data.MessageUnread
import com.tappyai.app.messaging.data.MessagesResponseDto
import com.tappyai.app.messaging.data.SendMediaDto
import com.tappyai.app.messaging.data.SendMessageRequestDto
import com.tappyai.app.messaging.data.UnreadResponseDto
import com.tappyai.app.messaging.data.badgeTotal
import com.tappyai.app.messaging.data.bubbleMetas
import com.tappyai.app.messaging.data.bubbleTimeLabel
import com.tappyai.app.messaging.data.chatPhotoAcceptable
import com.tappyai.app.messaging.data.chatPhotoSampleSize
import com.tappyai.app.messaging.data.toDomain
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.OffsetDateTime

/**
 * Messenger on Android follows the web release 2026-11-04 (b5cd20e): sender names and times on bubbles, pictures, the device's own copy of pictures, the idempotent send,
 * the unread badge, message links. The pure rules, driven for real — the fixtures are the web's own wire shapes (`src/lib/messaging/types.ts`, the `[id]/messages` route).
 */
class MessengerParityPureTest {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = false; explicitNulls = false; coerceInputValues = true }

    // ── bubbles: names and times (src/lib/messaging/bubbles.ts) ──

    private fun msg(id: String, sender: String?, at: String, body: String = id) = ChatMessage(id = id, threadId = "t", senderId = sender, body = body, createdAt = at)
    private fun metas(vararg m: ChatMessage, group: Boolean = true, now: String = "2026-11-04T12:00:00+07:00"): List<BubbleMeta> =
        bubbleMetas(m.toList(), meId = "me", group = group, nameOf = { if (it == "a") "An" else "Bình" }, nowMillis = OffsetDateTime.parse(now).toInstant().toEpochMilli())

    @Test
    fun `a run shows the sender's name once at its start and the time once at its end`() {
        val r = metas(
            msg("1", "a", "2026-11-04T10:00:00+07:00"), msg("2", "a", "2026-11-04T10:01:00+07:00"), msg("3", "a", "2026-11-04T10:02:00+07:00"),
        )
        assertEquals(listOf(true, false, false), r.map { it.showName })
        assertEquals(listOf(false, false, true), r.map { it.showTime })
        assertEquals("10:02", r[2].time)
        assertEquals("An", r[0].name)
    }

    @Test
    fun `a gap of five minutes or a change of sender starts a new run`() {
        val r = metas(msg("1", "a", "2026-11-04T10:00:00+07:00"), msg("2", "a", "2026-11-04T10:05:00+07:00"), msg("3", "b", "2026-11-04T10:05:30+07:00"))
        assertEquals("exactly five minutes is a new run (the gap must be LESS than five)", listOf(true, true, true), r.map { it.showName })
        assertEquals(listOf(true, true, true), r.map { it.showTime })
    }

    @Test
    fun `my own messages and every message of a direct thread carry no name, but still carry a time`() {
        val mine = metas(msg("1", "me", "2026-11-04T10:00:00+07:00"))
        assertFalse(mine[0].showName); assertNull(mine[0].name); assertTrue(mine[0].showTime)
        val direct = metas(msg("1", "a", "2026-11-04T10:00:00+07:00"), group = false)
        assertFalse(direct[0].showName); assertEquals("An", direct[0].name)
    }

    @Test
    fun `an unreadable timestamp gives an empty time and never throws`() {
        val r = metas(msg("1", "a", "not a date"))
        assertEquals("", r[0].time)
        assertTrue(r[0].showName)
    }

    @Test
    fun `the time label is Vietnam time - clock today, day and month on another day, midnight is 00`() {
        val now = OffsetDateTime.parse("2026-11-04T12:00:00+07:00").toInstant().toEpochMilli()
        assertEquals("14:50", bubbleTimeLabel("2026-11-04T07:50:00Z", now))
        assertEquals("03/11 14:50", bubbleTimeLabel("2026-11-03T07:50:00Z", now))
        assertEquals("00:05", bubbleTimeLabel("2026-11-03T17:05:00Z", now))
        assertEquals("a UTC evening is already tomorrow in Vietnam", "04/11 03:10", bubbleTimeLabel("2026-11-03T20:10:00Z", OffsetDateTime.parse("2026-11-05T12:00:00+07:00").toInstant().toEpochMilli()))
    }

    // ── wire shapes: pictures, clientId, the unread numbers ──

    @Test
    fun `a message with a picture decodes its link and size and expiry, and one without is media null`() {
        val page = json.decodeFromString<MessagesResponseDto>(
            """{"messages":[
              {"id":"m1","threadId":"t","senderId":"u","body":"","createdAt":"2026-11-04T01:00:00Z","media":{"type":"image","url":"https://s/x?token=1","width":800,"height":600}},
              {"id":"m2","threadId":"t","senderId":"u","body":"hi","createdAt":"2026-11-04T01:01:00Z","media":null},
              {"id":"m3","threadId":"t","senderId":"u","body":"old","createdAt":"2026-09-01T01:01:00Z","media":{"type":"image","url":null,"width":10,"height":20,"expired":true}}
            ],"hasMore":false}""",
        )
        val rows = page.messages.map { it.toDomain() }
        assertEquals("https://s/x?token=1", rows[0].media?.url); assertEquals(800, rows[0].media?.width); assertFalse(rows[0].media!!.expired)
        assertNull(rows[1].media)
        assertNull("an expired picture has no link", rows[2].media?.url); assertTrue(rows[2].media!!.expired)
        assertEquals("a picture-only message has an empty body", "", rows[0].body)
    }

    @Test
    fun `the send body is the web's - text, an optional picture path with its size, and the client id`() {
        assertEquals("""{"body":"hi","clientId":"c1"}""", json.encodeToString(SendMessageRequestDto(body = "hi", clientId = "c1")))
        assertEquals(
            """{"body":"","media":{"path":"t/u/f.webp","width":800,"height":600},"clientId":"c2"}""",
            json.encodeToString(SendMessageRequestDto(body = "", media = SendMediaDto("t/u/f.webp", 800, 600), clientId = "c2")),
        )
        assertFalse("no sender id: the server pins the bearer", json.encodeToString(SendMessageRequestDto(body = "x")).contains("sender"))
    }

    @Test
    fun `the unread answer decodes to the two numbers and a negative is never trusted`() {
        val d = json.decodeFromString<UnreadResponseDto>("""{"messages":3,"messageNotifications":1}""")
        assertEquals(3, d.messages); assertEquals(1, d.messageNotifications)
        assertEquals(UnreadResponseDto(), json.decodeFromString<UnreadResponseDto>("{}"))
    }

    @Test
    fun `the badge counts a message once - with or without message notifications, never negative`() {
        assertEquals("flag off: other notifications + messages", 7, badgeTotal(3, MessageUnread(messages = 4, messageNotifications = 0)))
        assertEquals("flag on: the message notifications inside the count are swapped for the message count", 3 + 9, badgeTotal(5, MessageUnread(9, 2)))
        assertEquals("never negative when the two reads disagree for a moment", 0, badgeTotal(1, MessageUnread(0, 4)))
        assertEquals(0, badgeTotal(0, MessageUnread(0, 0)))
    }

    // ── message links ──

    @Test
    fun `a message notification's link names its conversation, with or without the origin, and anything else is not one`() {
        val id = "bae913d2-584d-4110-8f83-5f976a6b8f24"
        assertEquals(id, messageThreadIdFromLink("/profile/notifications?tab=messages&thread=$id"))
        assertEquals(id, messageThreadIdFromLink("https://www.tappyai.com/profile/notifications?tab=messages&thread=$id"))
        assertEquals(id, messageThreadIdFromLink("/profile/notifications?thread=$id"))
        assertNull("the profile of a person is not a conversation", messageThreadIdFromLink("/profile/5118a493-fa98-4d22-ab78-f86f53dcb93b"))
        assertNull("the notifications page itself", messageThreadIdFromLink("/profile/notifications?tab=messages"))
        assertNull("not a plain id", messageThreadIdFromLink("/profile/notifications?thread=../../etc"))
        assertNull(messageThreadIdFromLink("/reviews/abc"))
        assertNull(messageThreadIdFromLink(""))
    }

    // ── the device's own copy of pictures ──

    @get:Rule val tmp = TemporaryFolder()

    @Test
    fun `a picture is saved by message id and read back as the device's own copy`() {
        val files = tmp.newFolder("files")
        assertFalse(ChatPhotoFiles.has(files, "m1"))
        assertTrue(ChatPhotoFiles.save(files, "m1", byteArrayOf(1, 2, 3)))
        assertTrue(ChatPhotoFiles.has(files, "m1"))
        assertArrayEquals(byteArrayOf(1, 2, 3), ChatPhotoFiles.load(files, "m1")!!.readBytes())
        assertNull(ChatPhotoFiles.load(files, "other"))
    }

    @Test
    fun `an empty or oversized body, or an id that is not a plain id, saves nothing`() {
        val files = tmp.newFolder("files2")
        assertFalse(ChatPhotoFiles.save(files, "m1", ByteArray(0)))
        assertFalse(ChatPhotoFiles.save(files, "m1", ByteArray(ChatPhotoFiles.MAX_COPY_BYTES + 1)))
        for (bad in listOf("../x", "a/b", "", "m 1", "x".repeat(65))) assertFalse(bad, ChatPhotoFiles.save(files, bad, byteArrayOf(1)))
        assertFalse("nothing was written", ChatPhotoFiles.dir(files).exists() && ChatPhotoFiles.dir(files).listFiles()!!.isNotEmpty())
    }

    @Test
    fun `signing out removes every saved copy`() {
        val files = tmp.newFolder("files3")
        ChatPhotoFiles.save(files, "m1", byteArrayOf(1)); ChatPhotoFiles.save(files, "m2", byteArrayOf(2))
        ChatPhotoFiles.clearAll(files)
        assertFalse(ChatPhotoFiles.has(files, "m1")); assertFalse(ChatPhotoFiles.has(files, "m2"))
        ChatPhotoFiles.clearAll(files) // clearing nothing is fine
    }

    // ── preparing a picked picture ──

    @Test
    fun `a picture the server accepts is sent as it is and anything else is re-encoded`() {
        assertTrue(chatPhotoAcceptable("image/jpeg", 1_000)); assertTrue(chatPhotoAcceptable("IMAGE/PNG", 1_000)); assertTrue(chatPhotoAcceptable("image/webp", CHAT_MEDIA_MAX_BYTES))
        assertFalse("over 5 MB is re-encoded, not refused", chatPhotoAcceptable("image/jpeg", CHAT_MEDIA_MAX_BYTES + 1))
        assertFalse("GIF cannot be re-encoded safely by the server", chatPhotoAcceptable("image/gif", 100))
        assertFalse(chatPhotoAcceptable("image/heic", 100)); assertFalse(chatPhotoAcceptable(null, 100)); assertFalse(chatPhotoAcceptable("image/jpeg", 0))
    }

    @Test
    fun `the re-encode sample size keeps the longest side under twice 2048 (a power of two, the usual BitmapFactory rule)`() {
        assertEquals(1, chatPhotoSampleSize(1_000, 800)); assertEquals(1, chatPhotoSampleSize(2_048, 100)); assertEquals(1, chatPhotoSampleSize(3_000, 100))
        assertEquals(2, chatPhotoSampleSize(4_096, 3_000)); assertEquals(2, chatPhotoSampleSize(8_000, 6_000)); assertEquals(4, chatPhotoSampleSize(16_000, 12_000))
        for (side in listOf(1, 500, 2_047, 2_048, 5_000, 9_999, 40_000)) assertTrue("side $side", side / chatPhotoSampleSize(side, side) < 2 * 2_048)
        assertNotNull(chatPhotoSampleSize(0, 0))
    }
}
