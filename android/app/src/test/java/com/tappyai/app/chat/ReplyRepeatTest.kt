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
        assertTrue(vm.contains("val finalReply = ReplyRepeat.cleanRepeats(reply.toString())"))
        assertTrue(vm.contains("raw = finalReply,"))
    }

    // ── UAT4 P1-a: the web cases, on the same fixture (finding-repeat-samples.json) ──
    private fun uat4(field: String): String {
        val json = File(repo(), "docs/uat/evidence/uat4-2026-09-27/finding-repeat-samples.json").readText()
        return Json.parseToJsonElement(json).jsonObject[field]!!.jsonPrimitive.content
    }
    private fun count(s: String, needle: String) = s.split(needle).size - 1

    @Test
    fun `UAT4 web - a shorter repeat of the clarify questions loses its repeated sentences, keeps the answer`() {
        val out = ReplyRepeat.cleanRepeats(uat4("web_ent4"))
        assertEquals(1, count(out, "Mình hiểu bạn muốn tìm thủy cung ở Sài Gòn"))
        assertEquals(1, count(out, "Bạn muốn đi khi nào?"))
        assertEquals(1, count(out, "Mình sẽ tìm thủy cung phù hợp nhất cho bạn ngay"))
        assertTrue(out.contains("Mình tìm được 3 thủy cung ở Sài Gòn!"))
        assertTrue(out.contains("Ưu tiên gì?"))
    }

    @Test
    fun `UAT4 Android turn 7 - a phrase repeated back to back collapses`() {
        val out = ReplyRepeat.collapseAdjacentRepeats(uat4("android_t7"))
        assertEquals(1, count(out, "(1 giờ sáng) nhé!"))
        assertTrue(out.contains("Nếu bạn muốn ăn thật khuya hơn!"))
    }

    @Test
    fun `UAT4 - similar venues, short list rows, blocks and ha ha are untouched`() {
        val venues = "Quán Phở Hòa mở cửa đến 22:00 nên bạn có thể ghé ăn tối muộn. Quán Phở Thìn mở cửa đến 23:00 nên bạn có thể ghé ăn tối muộn."
        assertEquals(venues, ReplyRepeat.dedupeSentences(venues))
        val rows = "- Giá: chưa có giá\n- Giá: chưa có giá\nNhé! Nhé!"
        assertEquals(rows, ReplyRepeat.dedupeSentences(rows))
        val s = "Mình chọn Phở Hòa cho bạn vì có rating cao nhất khu vực."
        val withBlock = "$s\n[TAPPY_PLAN]{\"title\":\"$s\"}[/TAPPY_PLAN]"
        assertEquals(withBlock, ReplyRepeat.dedupeSentences(withBlock))
        assertEquals("ha ha ha ha vui quá", ReplyRepeat.collapseAdjacentRepeats("ha ha ha ha vui quá"))
    }
}
