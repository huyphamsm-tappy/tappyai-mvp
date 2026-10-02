package com.tappyai.app.scamshield

import com.tappyai.app.scamshield.data.ScenarioConfidence
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The three-platform rules for Scam Shield, pinned on the Android source (decisions A7/A8, 02/10):
 *  - a QR picture and a message never leave the phone; nothing about them is stored, logged or sent to analytics;
 *  - the message check has NO AI: the on-device scenario match, then (only if there is a link) the link check;
 *  - the UI says one of exactly three things — never "safe", never a score, never a confidence figure.
 */
class ScamLocalParityTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String) = File(root(), rel).readText().replace("\r\n", "\n")
    private val vm get() = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldViewModel.kt")
    private val result get() = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldResult.kt")
    private val local get() = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldLocalResults.kt")
    private val screen get() = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldScreen.kt")

    // ── QR: on the device ──

    @Test fun `the QR picture is decoded on the device and never uploaded`() {
        assertTrue(vm.contains("QrCodes.decodeImage(bytes)"))
        assertFalse("no QR upload", vm.contains("checkQrImage(bytes") || vm.contains("createFormData"))
        val qrBlock = vm.substringAfter("fun checkQrImage(uri: Uri)").substringBefore("/** The Message tab's screenshot")
        // Only a LINK reaches the repository, and only through the link check.
        assertEquals(1, Regex("""repository\.""").findAll(qrBlock).count())
        assertTrue(qrBlock.contains("is QrPayload.Link -> when (val o = repository.check(payload.url"))
        // A code that is not a link is named, never acted on, never sent.
        assertTrue(qrBlock.contains("is QrPayload.Other -> ScamShieldUiState.QrNotice(payload)"))
    }

    // ── Message: no AI ──

    @Test fun `the AI message analysis is OFF by flag and nothing in the visible flow reaches it`() {
        assertTrue(vm.contains("internal object ScamShieldFlags") && vm.contains("const val MESSAGE_AI: Boolean = false"))
        val entry = vm.substringAfter("fun analyzeMessage()").substringBefore("// (AI path")
        assertTrue("the entry point branches on the flag first", entry.contains("if (!ScamShieldFlags.MESSAGE_AI) { analyzeMessageOnDevice(); return }"))
        // The legacy server analysis exists once, after the flag guard.
        assertEquals(1, Regex("""repository\.analyzeMessage\(""").findAll(vm).count())
        // No consent question and no screenshot picker unless the flag is on.
        assertTrue(screen.contains("if (ScamShieldFlags.MESSAGE_AI && viewModel.askAiConsent)"))
        assertTrue(screen.contains("if (ScamShieldFlags.MESSAGE_AI) {") && screen.substringAfter("if (ScamShieldFlags.MESSAGE_AI) {").contains("pickScreenshot.launch"))
        assertTrue(vm.contains("(ScamShieldFlags.MESSAGE_AI && screenshot != null)"))
    }

    @Test fun `the on-device message check matches first, then checks only a link, then says nothing was recognised`() {
        val fn = vm.substringAfter("private fun analyzeMessageOnDevice()").substringBefore("scam_check (RUNBOOK")
        assertTrue(fn.contains("ScenarioMatcher.match(text)"))
        assertTrue(fn.contains("state = ScamShieldUiState.KnownScenario(scenario, match)"))
        assertTrue(fn.contains("ScenarioMatcher.firstLink(text)"))
        assertTrue(fn.contains("state = ScamShieldUiState.NoMatch"))
        // The ONLY request it can make is the link check, with the link — never the text.
        assertEquals(1, Regex("""repository\.""").findAll(fn).count())
        assertTrue(fn.contains("repository.check(link, preferVietnameseLabels = vietnamese())"))
        assertFalse("the text never reaches the repository", fn.contains("repository.check(text") || fn.contains("analyzeMessage("))
        // Nothing stored, nothing counted.
        assertFalse(fn.contains("history.record") || fn.contains("trackScamCheck("))
        // The order: scenario → link → no match.
        assertTrue(fn.indexOf("ScenarioMatcher.match(text)") < fn.indexOf("ScenarioMatcher.firstLink(text)") && fn.indexOf("ScenarioMatcher.firstLink(text)") < fn.indexOf("ScamShieldUiState.NoMatch"))
    }

    @Test fun `the local results record nothing - no history row, no analytics event`() {
        val qr = vm.substringAfter("is QrPayload.Other -> ScamShieldUiState.QrNotice(payload)").substringBefore("is QrPayload.Link")
        assertFalse(qr.contains("history.record") || qr.contains("trackScamCheck"))
    }

    @Test fun `shared results are plain text with no message or code in them`() {
        assertTrue(local.contains("R.string.scam_known_share, scenario.official.title"))
        assertTrue(local.contains("R.string.scam_qr_share, stringResource(kindRes)"))
        assertTrue(local.contains("R.string.scam_verdict_share_unrecognized, TappyShare.CANONICAL_ORIGIN"))
        assertFalse(local.contains("payload.preview, TappyShare") || local.contains("viewModel.message"))
        assertTrue(local.contains("Intent.ACTION_SEND") && local.contains("\"text/plain\""))
    }

    // ── three states, never "safe" ──

    @Test fun `risk levels map to exactly three kinds and SAFE is never a safe state`() {
        assertEquals(VerdictKind.Familiar, VerdictKind.fromRisk(RiskLevel.HIGH))
        assertEquals(VerdictKind.Familiar, VerdictKind.fromRisk(RiskLevel.CRITICAL))
        assertEquals(VerdictKind.Suspicious, VerdictKind.fromRisk(RiskLevel.MEDIUM))
        listOf(RiskLevel.SAFE, RiskLevel.LOW, RiskLevel.INCONCLUSIVE, RiskLevel.UNKNOWN).forEach {
            assertEquals("$it must not read as safe", VerdictKind.Unrecognized, VerdictKind.fromRisk(it))
        }
        assertEquals(VerdictKind.Familiar, VerdictKind.fromScenario(ScenarioConfidence.High))
        assertEquals(VerdictKind.Suspicious, VerdictKind.fromScenario(ScenarioConfidence.Possible))
        assertEquals(3, VerdictKind.entries.size)
    }

    @Test fun `every level's label is one of the three verdict strings - none of the old six`() {
        val block = result.substringAfter("internal fun toneFor").substringBefore("\n}")
        val labels = Regex("""R\.string\.(\w+)\)""").findAll(block).map { it.groupValues[1] }.toList()
        assertTrue(labels.isNotEmpty())
        labels.forEach { assertTrue("$it must be a scam_verdict_* string", it.startsWith("scam_verdict_")) }
        listOf("scam_shield_level_safe", "scam_shield_level_low", "scam_shield_level_critical", "scam_shield_v3_confidence", "scam_shield_v3_score").forEach {
            assertFalse("UI must not use $it", result.contains(it) || local.contains(it) || screen.contains(it))
        }
        assertFalse("no green / shield-check anywhere in the level tones", block.contains("Emerald") || block.contains("GppGood"))
    }

    @Test fun `no score and no confidence figure is drawn on any card`() {
        assertFalse(result.contains("result.score") || result.contains("result.confidence"))
        assertFalse(local.contains(".score") || local.contains(".confidence."))
        assertFalse(result.contains("fun ConfidenceBadge"))
    }

    @Test fun `the three sentences and the fixed notes are exactly the decided wording, vi and en`() {
        val vi = src("app/src/main/res/values-vi/strings_scam_local.xml")
        assertTrue(vi.contains(">Có dấu hiệu lừa đảo quen thuộc<"))
        assertTrue(vi.contains(">Có một số dấu hiệu đáng ngờ<"))
        assertTrue(vi.contains(">Chưa nhận ra dấu hiệu quen thuộc<"))
        assertTrue(vi.contains("Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức."))
        assertTrue(vi.contains("TappyAI không thay thế cơ quan chức năng"))
        assertTrue(vi.contains("Đường link có đặc điểm thường gặp ở link giả mạo."))
        assertTrue(vi.contains("113"))
        val en = src("app/src/main/res/values/strings_scam_local.xml")
        assertTrue(en.contains("does NOT mean it is safe") && en.contains("does not replace the authorities") && en.contains("113"))
        // The verdict labels never promise safety.
        listOf(vi, en).forEach { xml ->
            val labels = Regex("""<string name="scam_verdict_(?:familiar|suspicious|unrecognized)">([^<]*)<""").findAll(xml).map { it.groupValues[1] }.toList()
            assertEquals(3, labels.size)
            labels.forEach { assertFalse("verdict label $it must not say safe", it.contains("An toàn", ignoreCase = true) || it.contains("safe", ignoreCase = true)) }
        }
    }

    @Test fun `the fixed emergency line and the disclaimer are on every local card and on the link card`() {
        assertEquals(3, Regex("""EmergencyAndDisclaimer\(modifier = Modifier\.padding""").findAll(local).count())
        assertTrue(result.substringAfter("internal fun VerdictCard").substringBefore("internal fun ReasonsSection").contains("EmergencyAndDisclaimer()"))
    }

    @Test fun `the message tab has no AI wording left in the visible strings`() {
        val vi = src("app/src/main/res/values-vi/strings_scam_local.xml")
        val shown = vi.substringAfter("scam_msg_subtitle_local").substringBefore("</string>") + vi.substringAfter("scam_msg_local_hint").substringBefore("</string>")
        assertFalse("no AI quota wording", shown.contains("lượt") || Regex("""\bAI\b""").containsMatchIn(shown))
        assertTrue(screen.contains("if (ScamShieldFlags.MESSAGE_AI) R.string.scam_v3_msg_subtitle else R.string.scam_msg_subtitle_local"))
    }

    @Test fun `vi and en carry the same scam-local keys`() {
        fun keys(f: String) = Regex("""name="([a-z_0-9]+)"""").findAll(src(f)).map { it.groupValues[1] }.toSet()
        assertEquals(keys("app/src/main/res/values/strings_scam_local.xml"), keys("app/src/main/res/values-vi/strings_scam_local.xml"))
    }

    @Test fun `no camera permission was added - the picture comes from the system photo picker`() {
        assertFalse(src("app/src/main/AndroidManifest.xml").contains("android.permission.CAMERA"))
    }
}
