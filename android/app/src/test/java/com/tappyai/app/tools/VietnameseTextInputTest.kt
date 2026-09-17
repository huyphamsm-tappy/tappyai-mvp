package com.tappyai.app.tools

import com.tappyai.app.scamshield.data.MessageAnalysisRequestDto
import com.tappyai.app.vietwriter.VietWriterViewModel
import com.tappyai.app.vietwriter.data.VietWriterErrorMessages
import com.tappyai.app.vietwriter.data.VietWriterRepository
import com.tappyai.app.vietwriter.data.VietWriterResult
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * Vietnamese input through the V3 tool fields (2026-09-17, UAT report "mô tả cannot be typed").
 *
 * WHAT WAS FOUND. Real Gboard Telex key taps on the Pixel_8 emulator produce `mô tả`, `Mô tả`,
 * `đà nẵng`, `nguyễn văn` in both suspected fields (Scam Shield "Phân tích tin nhắn" and Viết
 * caption "Chủ đề / Mô tả"). The reported symptom — `mo ta` arrives, `mô tả` does not — reproduces
 * ONLY through the emulator's HOST-keyboard path (`hw.keyboard=yes`, typing on the PC keyboard /
 * `adb emu event text`), where the non-ASCII characters are dropped before they reach ANY app: the
 * stock Android Settings search box receives the same `mo ta m t`. That path does not exist on a
 * phone. So the app's input chain is pinned here, so it cannot regress into the bug it was accused
 * of, and the UAT harness is documented in the report.
 *
 * LIMITATION. IME composition (the composing region Telex needs across `m-o-o`) cannot be exercised
 * in a JVM unit test; it was verified with real key taps (see the report). What CAN be pinned is
 * every stage the text passes through after the IME commits it: the field wrapper (no
 * transformation, no key interception), the state holder (no character filtering, only the length
 * cap), and the request DTO (UTF-8 JSON, accents intact).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class VietnameseTextInputTest {

    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val samples = listOf(
        "mô tả",
        "Mô tả",
        "Đà Nẵng",
        "Nguyễn Văn A",
        "Quán bún bò ở Huế ngon tuyệt, giá hợp lý, chủ quán thân thiện — đáng thử!",
    )

    private class CapturingRepo : VietWriterRepository {
        var lastTopic: String? = null
        override suspend fun generate(topic: String, platform: String, tone: String, length: String): NetworkResult<VietWriterResult> {
            lastTopic = topic
            return NetworkResult.Success(VietWriterResult(caption = "ok", hashtags = "#ok"))
        }
    }
    private object NoLog : LoggerProvider {
        override fun d(tag: String, message: String) {}
        override fun i(tag: String, message: String) {}
        override fun w(tag: String, message: String, throwable: Throwable?) {}
        override fun e(tag: String, message: String, throwable: Throwable?) {}
    }
    private object Strings : StringProvider {
        override fun get(resId: Int): String = "s$resId"
        override fun get(resId: Int, vararg args: Any): String = "s$resId"
    }

    private fun vm(repo: VietWriterRepository = CapturingRepo()) = VietWriterViewModel(repo, NoLog, VietWriterErrorMessages(Strings))

    // ── Viết caption · "Chủ đề / Mô tả" ──

    @Test
    fun `the topic state keeps every Vietnamese sample byte-for-byte`() {
        val v = vm()
        samples.forEach { s ->
            v.onTopicChange(s)
            assertEquals(s, v.topic)
        }
    }

    @Test
    fun `keystroke-by-keystroke growth is kept - each prefix of a Vietnamese sentence lands unchanged`() {
        val v = vm()
        val text = "Mô tả Đà Nẵng"
        for (i in 1..text.length) {
            v.onTopicChange(text.substring(0, i))
            assertEquals(text.substring(0, i), v.topic)
        }
    }

    @Test
    fun `the 500-character cap still holds and counts characters, not bytes`() {
        val v = vm()
        val vietnamese500 = "ă".repeat(500)
        v.onTopicChange(vietnamese500)
        assertEquals("500 Vietnamese characters (1000+ bytes) are accepted", vietnamese500, v.topic)
        v.onTopicChange(vietnamese500 + "ô")
        assertEquals("the 501st is refused, the field keeps its last accepted value", vietnamese500, v.topic)
    }

    @Test
    fun `empty input behaves as before - blank topic cannot generate`() {
        val v = vm()
        v.onTopicChange("")
        assertEquals("", v.topic)
        v.onTopicChange("   ")
        v.generate()
        assertFalse(v.isGenerating)
    }

    @Test
    fun `the request carries the accented topic, trimmed only at the edges`() = runTest(dispatcher) {
        val repo = CapturingRepo()
        val v = vm(repo)
        v.onTopicChange("  Mô tả Đà Nẵng — Nguyễn Văn A  ")
        v.generate()
        advanceUntilIdle()
        assertEquals("Mô tả Đà Nẵng — Nguyễn Văn A", repo.lastTopic)
    }

    // ── Scam Shield · "Phân tích tin nhắn" ──

    @Test
    fun `the analyze request DTO encodes Vietnamese as UTF-8 JSON with accents intact`() {
        val json = Json { encodeDefaults = false }
        samples.forEach { s ->
            val wire = json.encodeToString(MessageAnalysisRequestDto.serializer(), MessageAnalysisRequestDto(text = s))
            assertTrue("$s survives encoding: $wire", wire.contains(s))
            assertFalse("never \\u-escaped or stripped", wire.contains("\\u"))
            assertEquals(s, json.decodeFromString(MessageAnalysisRequestDto.serializer(), wire).text)
        }
    }

    @Test
    fun `the message state applies only the length cap - no character filtering anywhere on the path`() {
        val vm = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldViewModel.kt")
        assertTrue(vm.contains("fun onMessageChange(value: String) { message = value.take(MESSAGE_MAX_CHARS) }"))
        val analyze = vm.substringAfter("fun analyzeMessage()").substringBefore("\n    }")
        assertTrue("sent trimmed at the edges, nothing else", analyze.contains("repository.analyzeMessage(message.trim(), messageUrl.trim()"))
        assertEquals("mô tả", "mô tả".take(4000))
    }

    // ── The field wrapper and the whole main tree ──

    @Test
    fun `ToolTextField is a plain OutlinedTextField - no transformation, no key interception, no filtering`() {
        val kit = src("app/src/main/java/com/tappyai/app/tools/ToolV3.kt")
        val field = kit.substringAfter("fun ToolTextField(").substringBefore("\n}")
        assertTrue(field.contains("OutlinedTextField("))
        assertTrue("the value round-trips synchronously, untouched", field.contains("value = value,") && field.contains("onValueChange = onValueChange,"))
        listOf("visualTransformation", "InputTransformation", "onKeyEvent", "onPreviewKeyEvent", "filter", "Regex", "replace(").forEach {
            assertFalse("ToolTextField must not use $it", field.contains(it))
        }
    }

    @Test
    fun `no onValueChange in the app filters letters by ASCII class or strips combining marks`() {
        val offenders = File(root(), "app/src/main/java").walkTopDown().filter { it.extension == "kt" }.flatMap { f ->
            val s = f.readText().replace("\r\n", "\n").replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")
            Regex("""onValueChange\s*=\s*\{[^}]*\}""").findAll(s).map { it.value }
                .filter { block -> Regex("""\[A-Za-z|\[a-zA-Z|isLetter\(\)|\\p\{M|Normalizer""").containsMatchIn(block) }
                .map { "${f.name}: ${it.take(80)}" }
        }.toList()
        assertEquals(emptyList<String>(), offenders)
    }

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")
}
