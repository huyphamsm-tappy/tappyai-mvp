package com.tappyai.app.chat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** UAT3: the same cases as web `stepRepeatGuard.test.ts`, on the stored turn-7 reply. */
class ReplyRepeatTest {
    private fun repo(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "docs/uat/evidence").isDirectory }

    private val stored: String by lazy {
        val json = File(repo(), "docs/uat/evidence/uat3-location-prompt-2026-09-27/finding-duplicated-reply-turn7.json").readText()
        Json.parseToJsonElement(json).jsonObject["assistant"]!!.jsonPrimitive.content
    }

    @Test
    fun `the stored duplicated reply collapses to its last version`() {
        val split = stored.indexOf("Mình cần biết", 10)
        assertTrue(ReplyRepeat.similarity(stored.substring(0, split), stored.substring(split)) >= ReplyRepeat.REPEAT_SIMILARITY)
        assertEquals(stored.substring(split), ReplyRepeat.dropRepeatedReply(stored))
    }

    @Test
    fun `a normal reply, and one that only repeats its first words, are untouched`() {
        val normal = "Mình chọn **Phở Hòa Pasteur** cho bạn — 4.6⭐, cách 1,2 km, mở tới 22h. Muốn ăn khuya thì Phở Thìn Lò Đúc."
        assertEquals(normal, ReplyRepeat.dropRepeatedReply(normal))
        val echo = "Mình cần biết bạn đang ở khu vực nào để tìm quán ăn ngon gần đó nhé! Quận 1 có Phở Hòa, Quận 3 có Bún bò Gia Hội. Mình cần biết bạn đang ở khu vực nào để lọc thêm theo giá nữa nhé."
        assertEquals(echo, ReplyRepeat.dropRepeatedReply(echo))
    }

    @Test
    fun `the view model keeps and saves the collapsed reply`() {
        val vm = File(repo(), "android/app/src/main/java/com/tappyai/app/chat/ChatViewModel.kt").readText()
        assertTrue(vm.contains("val finalReply = ReplyRepeat.dropRepeatedReply(reply.toString())"))
        assertTrue(vm.contains("raw = finalReply,"))
    }
}
