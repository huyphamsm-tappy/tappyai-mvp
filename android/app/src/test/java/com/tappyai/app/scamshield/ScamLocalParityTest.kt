package com.tappyai.app.scamshield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The three-platform privacy rules for Scam Shield, pinned on the Android source: a QR picture and a message that is answered from the
 * official scenarios never leave the phone; nothing about them is stored, logged or sent to analytics.
 */
class ScamLocalParityTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String) = File(root(), rel).readText().replace("\r\n", "\n")
    private val vm get() = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldViewModel.kt")

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

    @Test fun `a text-only message that is a sure match is answered on the device - no link, no screenshot, no request`() {
        val block = vm.substringAfter("fun analyzeMessage()").substringBefore("run {")
        assertTrue(block.contains("shot == null && messageUrl.isBlank() && !ScenarioMatcher.containsLink(message)"))
        assertTrue(block.contains("known.confidence == ScenarioConfidence.High"))
        assertTrue(block.contains("state = ScamShieldUiState.KnownScenario(scenario, known)"))
        assertTrue("answered before any repository call", !block.contains("repository."))
        assertTrue("it returns before the server path", block.contains("return"))
    }

    @Test fun `the local results record nothing - no history row, no analytics event`() {
        val known = vm.substringAfter("state = ScamShieldUiState.KnownScenario(scenario, known)").substringBefore("run {")
        assertFalse(known.contains("history.record") || known.contains("trackScamCheck"))
        val qr = vm.substringAfter("is QrPayload.Other -> ScamShieldUiState.QrNotice(payload)").substringBefore("is QrPayload.Link")
        assertFalse(qr.contains("history.record") || qr.contains("trackScamCheck"))
    }

    @Test fun `shared results are plain text with no message or code in them`() {
        val ui = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldLocalResults.kt")
        // The share text is built only from the scenario title / the code KIND and a fixed link.
        assertTrue(ui.contains("R.string.scam_known_share, scenario.official.title"))
        assertTrue(ui.contains("R.string.scam_qr_share, stringResource(kindRes)"))
        assertFalse(ui.contains("payload.preview, TappyShare") || ui.contains("viewModel.message"))
        assertTrue(ui.contains("Intent.ACTION_SEND") && ui.contains("\"text/plain\""))
    }

    @Test fun `the fixed emergency line and the not-a-state-agency note are on both local cards`() {
        val ui = src("app/src/main/java/com/tappyai/app/scamshield/ScamShieldLocalResults.kt")
        assertEquals(2, Regex("""EmergencyAndDisclaimer\(modifier = Modifier\.padding""").findAll(ui).count())
        val vi = src("app/src/main/res/values-vi/strings_scam_local.xml")
        assertTrue(vi.contains("113") && vi.contains("TappyAI không phải cơ quan nhà nước"))
        val en = src("app/src/main/res/values/strings_scam_local.xml")
        assertTrue(en.contains("113") && en.contains("TappyAI is not a state agency"))
    }

    @Test fun `vi and en carry the same scam-local keys`() {
        fun keys(f: String) = Regex("""name="([a-z_0-9]+)"""").findAll(src(f)).map { it.groupValues[1] }.toSet()
        assertEquals(keys("app/src/main/res/values/strings_scam_local.xml"), keys("app/src/main/res/values-vi/strings_scam_local.xml"))
    }

    @Test fun `no camera permission was added - the picture comes from the system photo picker`() {
        assertFalse(src("app/src/main/AndroidManifest.xml").contains("android.permission.CAMERA"))
    }

    @Test fun `the server message analysis (which may reach the AI) is asked about first, once, and the answer is not stored`() {
        val block = vm.substringAfter("fun analyzeMessage()").substringBefore("run {")
        assertTrue(block.contains("if (!aiConsented && !linkOnly && !linkFieldOnly) { askAiConsent = true; return }"))
        assertTrue(vm.contains("private var aiConsented = false"))
        assertFalse("consent is in memory only", vm.substringAfter("private var aiConsented").substringBefore("fun dismissAiConsent").contains("DataStore"))
    }
}
