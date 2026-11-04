package com.tappyai.app.scamshield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The Scam Shield rules pinned on the Android source, against the web at origin/rc/web-uat @ 56a26aeb72d3ae1dacb484885df04e6976d5d84e:
 *  - a QR picture never leaves the phone; only a decoded http(s) link goes on to the link check (web `ScamShieldView.tsx`, `payload.ts`);
 *  - the message check is the web's: `POST /api/scam-shield/analyze` with the text / link, the server's verdict + scenario + advice;
 *  - the UI says one of exactly three things — never "safe", never a score, never a confidence figure, never a quota line;
 *  - the QR-other card has the web's elements in the web's order, and no share button (the web card has none).
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
        assertEquals("only the link check is called", 1, Regex("""repository\.""").findAll(qrBlock).count())
        assertTrue(qrBlock.contains("is QrPayload.Link -> when (val o = repository.check(payload.url"))
        assertTrue(qrBlock.contains("is QrPayload.Other -> ScamShieldUiState.QrNotice(payload)"))
        assertFalse("a non-link code records nothing", qrBlock.substringAfter("is QrPayload.Other").substringBefore("is QrPayload.Link").contains("history.record"))
    }

    // ── Message: the web's server-side check ──

    @Test fun `the message check posts text and link to analyze and nothing is matched or scored on the phone`() {
        val fn = vm.substringAfter("fun analyzeMessage()").substringBefore("// ── Share a LINK verdict")
        assertTrue(fn.contains("repository.analyzeMessage(message.trim(), messageUrl.trim(), shot?.bytes, shot?.mimeType"))
        assertTrue(fn.contains("ScamShieldUiState.MessageResult(o.result)"))
        assertFalse("no local matching", vm.contains("ScenarioMatcher") || vm.contains("matchScenario"))
        assertFalse("no consent dialog / AI switch in the app", vm.contains("askAiConsent") || vm.contains("aiConsented"))
        assertFalse("a message verdict is not a link: no history row", fn.contains("history.record"))
    }

    @Test fun `no screenshot is analysed and no image is ever sent while the flag is off`() {
        assertTrue(vm.contains("const val MESSAGE_SCREENSHOT: Boolean = false"))
        assertTrue(vm.contains("val shot = if (ScamShieldFlags.MESSAGE_SCREENSHOT) screenshot else null"))
        assertTrue(screen.contains("if (ScamShieldFlags.MESSAGE_SCREENSHOT) {") && screen.substringAfter("if (ScamShieldFlags.MESSAGE_SCREENSHOT) {").contains("pickScreenshot.launch"))
        assertTrue(vm.contains("(ScamShieldFlags.MESSAGE_SCREENSHOT && screenshot != null)"))
    }

    // ── three states, never "safe" ──

    @Test fun `risk levels map to exactly three kinds and SAFE is never a safe state`() {
        assertEquals(VerdictKind.Familiar, VerdictKind.fromRisk(RiskLevel.HIGH))
        assertEquals(VerdictKind.Familiar, VerdictKind.fromRisk(RiskLevel.CRITICAL))
        assertEquals(VerdictKind.Suspicious, VerdictKind.fromRisk(RiskLevel.MEDIUM))
        listOf(RiskLevel.SAFE, RiskLevel.LOW, RiskLevel.INCONCLUSIVE, RiskLevel.UNKNOWN).forEach {
            assertEquals("$it must not read as safe", VerdictKind.Unrecognized, VerdictKind.fromRisk(it))
        }
        assertEquals(3, VerdictKind.entries.size)
        assertEquals(VerdictKind.Suspicious, VerdictKind.fromWire(" Suspicious "))
        assertEquals(null, VerdictKind.fromWire("safe"))
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

    @Test fun `no score, no confidence figure and no AI-quota line is drawn on any card`() {
        assertFalse(result.contains("result.score") || result.contains("result.confidence"))
        assertFalse(local.contains(".score") || local.contains(".confidence."))
        assertFalse(result.contains("fun ConfidenceBadge") || result.contains("fun AnalysisNote"))
        assertFalse(result.contains("scam_v3_msg_aiQuota") || result.contains("scam_v3_msg_aiToday"))
    }

    // ── the cards follow the web's components ──

    @Test fun `the message card has the web's sections in the web's order`() {
        val card = result.substringAfter("internal fun MessageResultCard")
        val order = listOf(
            "bodyRes", "result.reasoningSummary", "result.scenario?.let { ScenarioCard(it) }", "scam_v3_msg_goal", "scam_verdict_reasons",
            "scam_v3_msg_wants", "scam_v3_msg_doNot", "scam_v3_msg_doNow", "scam_v3_msg_links", "scam_v3_msg_extracted", "DisclaimerLine(",
        ).map { it to card.indexOf(it) }
        order.forEach { (k, at) -> assertTrue("$k on the message card", at >= 0) }
        assertEquals("the web's order (ScamMessageResult.tsx)", order.map { it.first }, order.sortedBy { it.second }.map { it.first })
        assertTrue("the model's summary only when the server says it used one", card.contains("""result.aiStatus == "used" && result.reasoningSummary.isNotBlank()"""))
        assertTrue("the generic rule signal is hidden when a scenario matched", card.contains("""it.type == "other" && it.source == "rule""""))
    }

    @Test fun `the scenario card has the web's elements and ends with the 113 line`() {
        val card = result.substringAfter("private fun ScenarioCard").substringBefore("internal fun MessageResultCard")
        val order = listOf(
            "scam_verdict_scenario_heading", "scenario.title", "scam_verdict_scenario_number", "scenario.summary", "scam_verdict_scenario_signs",
            "scam_verdict_scenario_source)", "scam_verdict_scenario_source_open", "scam_verdict_scenario_guidance_note", "scam_verdict_scenario_report",
        ).map { it to card.indexOf(it) }
        order.forEach { (k, at) -> assertTrue("$k on the scenario card", at >= 0) }
        assertEquals(order.map { it.first }, order.sortedBy { it.second }.map { it.first })
    }

    @Test fun `the link card has the web's sections in the web's order`() {
        val card = result.substringAfter("internal fun VerdictCard").substringBefore("internal fun ReasonsSection")
        val order = listOf("bodyRes", "ReasonsSection(", "OfficialSection(", "ActionsSection(", "ShareLinkButton(", "EvidenceSection(", "DisclaimerLine()").map { it to card.indexOf(it) }
        order.forEach { (k, at) -> assertTrue("$k on the link card", at >= 0) }
        assertEquals("the web's order (ScamShieldResult.tsx)", order.map { it.first }, order.sortedBy { it.second }.map { it.first })
        assertTrue("up to 6 reasons, like the web", card.contains(".take(6)"))
        assertTrue("reassuring (safe) evidence rows are not shown", card.contains("it.severity != SignalSeverity.SAFE"))
        assertTrue("the INCONCLUSIVE action is not repeated under 'unrecognized'", card.contains("""it.code != "INCONCLUSIVE""""))
    }

    @Test fun `the QR-other card has the web's elements in the web's order, shows the text as read, and has no share button`() {
        val card = local.substringAfter("internal fun QrNoticeCard").substringBefore("internal fun DisclaimerLine")
        val order = listOf("scam_qr_title", "stringResource(kindRes)", "qrWarningRes", "scam_qr_content", "payload.preview", "scam_qr_no_verdict", "scam_qr_privacy", "DisclaimerLine(").map { it to card.indexOf(it) }
        order.forEach { (k, at) -> assertTrue("$k on the QR card", at >= 0) }
        assertEquals("the web's order (ScamShieldView.tsx data-qr-other)", order.map { it.first }, order.sortedBy { it.second }.map { it.first })
        assertFalse("the web card has no share button", card.contains("Share") || card.contains("share"))
        val qr = src("app/src/main/java/com/tappyai/app/scamshield/data/QrCodes.kt")
        assertTrue("a Wi-Fi code is shown as read, like the web", qr.contains("QrPayload.Other(QrKind.Wifi, preview(text))"))
        assertFalse(qr.contains("previewWifi"))
    }

    @Test fun `the link verdict is shared the web's way - the server publishes a page and only its URL is shared`() {
        val api = src("app/src/main/java/com/tappyai/app/scamshield/data/ScamShieldApi.kt")
        assertTrue(api.contains("""@POST("api/scam-shield/share")"""))
        assertTrue(vm.contains("repository.shareLink(result.url, locale = if (vietnamese()) \"vi\" else \"en\")"))
        assertTrue(screen.contains("scam_share_title") && screen.contains("EXTRA_TEXT, title + "))
        val dto = src("app/src/main/java/com/tappyai/app/scamshield/data/ScamShieldDtos.kt")
        assertTrue("the body is exactly {url, locale}", dto.contains("data class ScamShareRequestDto(val url: String, val locale: String? = null)"))
    }

    @Test fun `errors follow the web - the code picks the dictionary line, the server message is not shown, a network failure is checkFailed`() {
        val card = result.substringAfter("internal fun UnresolvedCard").substringBefore("val shape")
        assertFalse(card.contains("serverMessage"))
        assertTrue(card.contains("ScamCheckFailure.Offline, ScamCheckFailure.Timeout, ScamCheckFailure.Unknown"))
    }

    @Test fun `the fixed notes - disclaimer on every card, 113 only with a matching scenario`() {
        assertTrue(result.substringAfter("internal fun VerdictCard").substringBefore("internal fun ReasonsSection").contains("DisclaimerLine()"))
        assertTrue(result.substringAfter("internal fun MessageResultCard").contains("DisclaimerLine(modifier"))
        assertTrue(local.substringAfter("internal fun QrNoticeCard").contains("DisclaimerLine(modifier"))
        // The 113 sentence lives in the scenario card only.
        assertEquals(1, Regex("""scam_verdict_scenario_report""").findAll(result).count())
        assertFalse(local.contains("scam_verdict_scenario_report"))
    }

    @Test fun `the message tab says what the web says and nothing about AI quota`() {
        val vi = src("app/src/main/res/values-vi/strings_scam_local.xml")
        val subtitle = vi.substringAfter("scam_verdict_msg_subtitle").substringBefore("</string>")
        val privacy = vi.substringAfter("scam_verdict_msg_privacy").substringBefore("</string>")
        assertFalse((subtitle + privacy).contains("lượt"))
        assertFalse(Regex("""\bAI\b""").containsMatchIn(subtitle))
        assertTrue("the web's own privacy line", privacy.contains("không dùng AI, không lưu nội dung tin nhắn"))
        assertTrue(screen.contains("if (ScamShieldFlags.MESSAGE_SCREENSHOT) R.string.scam_v3_msg_subtitle else R.string.scam_verdict_msg_subtitle"))
    }

    @Test fun `vi and en carry the same scam-local keys`() {
        fun keys(f: String) = Regex("""name="([a-z_0-9]+)"""").findAll(src(f)).map { it.groupValues[1] }.toSet()
        assertEquals(keys("app/src/main/res/values/strings_scam_local.xml"), keys("app/src/main/res/values-vi/strings_scam_local.xml"))
    }

    @Test fun `no camera permission was added - the picture comes from the system photo picker`() {
        assertFalse(src("app/src/main/AndroidManifest.xml").contains("android.permission.CAMERA"))
    }
}
