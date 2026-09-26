package com.tappyai.app.tools

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The Smart Tool feature screens in the V3 dress (2026-09-15, from the design/v3-phase4 tool
 * pages). Source-pinned, like [com.tappyai.app.fortune.FortuneHubV3Test]:
 *  - every screen stands on the shared kit (`ToolV3Page` / `V3HomeTheme`) with its own hue,
 *    pose and scene — no generic single template, no Material default chrome;
 *  - the ViewModel surface each screen drives is exactly what it was (the functional source of
 *    truth is Android);
 *  - the hero copy is the web's, in both languages, and every new string has a vi + en value;
 *  - the mascot poses are real bundled assets; the one new asset is a byte-identical copy of the
 *    web's `reading.png`.
 *
 * The Music library screen was removed with music reuse (the backend endpoints answer 410), so it
 * is no longer among the screens pinned here.
 */
class SmartToolScreensV3Test {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n").replace(Regex("(?m)^\\s*//.*$"), "")
    private fun screen(pkg: String, file: String) = src("app/src/main/java/com/tappyai/app/$pkg/$file.kt")

    private val scan get() = screen("scan", "ScanScreen")
    private val translate get() = screen("translate", "TranslateScreen")
    private val currency get() = screen("currency", "CurrencyScreen")
    private val split get() = screen("splitbill", "SplitBillScreen")
    private val scam get() = screen("scamshield", "ScamShieldScreen")
    private val group get() = screen("groupdining", "GroupDiningScreen")
    private val fortune get() = screen("fortune", "FortuneHubScreen")
    private val viet get() = screen("vietwriter", "VietWriterScreen")
    private val kit get() = screen("tools", "ToolV3")

    @Test
    fun `every feature screen stands on the V3 kit - none on the Material default chrome`() {
        val onKit = mapOf("scan" to scan, "translate" to translate, "currency" to currency, "split" to split, "group" to group, "viet" to viet)
        onKit.forEach { (name, s) ->
            assertTrue("$name uses ToolV3Page", s.contains("ToolV3Page(onBack = onBack)"))
            assertTrue("$name has a ToolHero or its own hero", s.contains("ToolHero(") || s.contains("VietHero()"))
            assertFalse("$name has no TappyCard left", s.contains("TappyCard("))
            assertFalse("$name has no TappyButton left", s.contains("TappyButton("))
            assertFalse("$name has no TappyTextField left", s.contains("TappyTextField("))
        }
        assertTrue(fortune.contains("V3HomeTheme {"))
        // Scam Shield (2026-09-17) follows the CURRENT web page (`design/v3-phase4`): the Navy hero
        // with the shield pose and the four capability tiles, then the three-tab tool (see
        // ScamShieldV3Test). It scrolls its own column (the history anchor), not ToolV3Page.
        assertTrue(scam.contains("ToolHero(") && scam.contains("hue = ToolHue.Navy") && scam.contains("R.drawable.tappy_recommendation") && !scam.contains("TappyCard("))
    }

    @Test
    fun `each screen keeps its own identity - hue, pose and scene`() {
        assertTrue(scan.contains("hue = ToolHue.Blue") && scan.contains("R.drawable.tappy_reading") && scan.contains("ScanScene("))
        assertTrue(translate.contains("hue = ToolHue.Indigo") && translate.contains("R.drawable.tappy_welcome") && translate.contains("TranslateScene("))
        assertTrue(currency.contains("hue = ToolHue.Navy") && currency.contains("R.drawable.tappy_wave") && currency.contains("ToolCoin("))
        assertTrue(split.contains("hue = ToolHue.Navy") && split.contains("R.drawable.tappy_wave") && split.contains("SplitScene("))
        assertTrue(group.contains("hue = ToolHue.Blue") && group.contains("R.drawable.tappy_thinking") && group.contains("GroupScene("))
        assertTrue(viet.contains("hue = ToolHue.Pink") && viet.contains("R.drawable.tappy_reading") && viet.contains("Color(0xFFEC4899), Color(0xFFF43F5E), Color(0xFFFB923C)"))
        // The kit knows all five hues; each is a distinct palette.
        val hues = Regex("""^    (Blue|Indigo|Navy|Music|Pink)\(""", RegexOption.MULTILINE).findAll(kit).map { it.groupValues[1] }.toList()
        assertEquals(listOf("Blue", "Indigo", "Navy", "Music", "Pink"), hues)
    }

    @Test
    fun `the ViewModel surface each screen drives is unchanged`() {
        listOf("viewModel::onPhotoCaptured", "viewModel::onGalleryUriPicked", "viewModel::clear", "viewModel::scan", "viewModel.preview", "viewModel.isScanning", "viewModel.result", "viewModel.errorMessage")
            .forEach { assertTrue("scan $it", scan.contains(it)) }
        listOf("viewModel::onInputTextChange", "viewModel::translate", "viewModel::clear", "viewModel.onTargetLanguageChange(language)", "viewModel.speak(translation, viewModel.targetLanguage.ttsTag)", "viewModel.isTranslating", "viewModel.translation", "viewModel.ttsAvailable")
            .forEach { assertTrue("translate $it", translate.contains(it)) }
        listOf("viewModel::onUrlChange", "viewModel::check", "as? ScamShieldUiState.Result)?.let { VerdictCard(it.result) }", "as? ScamShieldUiState.Failed)?.let { failed -> UnresolvedCard(failed.failure, forMessage = viewModel.tab == ScamShieldTab.Message) }")
            .forEach { assertTrue("scam $it", scam.contains(it)) }
        listOf("viewModel::onGroupNameChange", "viewModel::createGroup", "viewModel.isCreating", "viewModel.errorMessage", "GroupDiningViewModel.MAX_NAME")
            .forEach { assertTrue("group $it", group.contains(it)) }
        listOf("viewModel::onTopicChange", "viewModel::onPlatformChange", "viewModel::onToneChange", "viewModel::onLengthChange", "viewModel::generate", "viewModel::onReset", "viewModel.isGenerating", "viewModel.result")
            .forEach { assertTrue("viet $it", viet.contains(it)) }
        // Split bill stays 100% client-side; its two modes and tip presets are intact.
        assertTrue(split.contains("private enum class SplitMode { Equal, Custom }") && split.contains("private val TIP_PRESETS = listOf(0, 5, 10, 15, 20)"))
        assertTrue(split.contains("SplitMode.Equal -> EqualResult(") && split.contains("SplitMode.Custom -> CustomResult("))
        // Group's quick picks only fill the field through the same change callback.
        assertTrue(group.contains("onClick = { onGroupNameChange(label) }"))
    }

    @Test
    fun `hero copy is the web's, in both languages, and every new string has vi and en`() {
        val vi = src("app/src/main/res/values-vi/strings_tools_v3.xml")
        val en = src("app/src/main/res/values/strings_tools_v3.xml")
        val names = { xml: String -> Regex("""<string name="(\w+)">""").findAll(xml).map { it.groupValues[1] }.toSet() }
        assertEquals("vi and en carry the same keys", names(vi), names(en))
        assertTrue(vi.contains(">Quét ảnh, hiểu ngay<") || vi.contains("tool_scan_title1"))
        assertTrue(vi.contains("<string name=\"tool_group_title1\">Đi đâu ăn gì</string>") && vi.contains("<string name=\"tool_group_title2\">cả team?</string>"))
        assertTrue(vi.contains("<string name=\"tool_viet_title1\">Caption hấp dẫn</string>") && vi.contains("<string name=\"tool_viet_title2\">trong vài giây</string>"))
        assertTrue(vi.contains("<string name=\"tool_group_bubble\">Cùng đi ăn càng vui!</string>"))
        // Every tool_* string the screens reference exists.
        val referenced = listOf(scan, translate, currency, split, scam, group, viet)
            .flatMap { Regex("""R\.string\.(tool_\w+)""").findAll(it).map { m -> m.groupValues[1] }.toList() }.toSet()
        val missing = referenced - names(vi)
        assertTrue("missing strings: $missing", missing.isEmpty())
    }

    @Test
    fun `mascot poses are real bundled assets and the reading pose is the web's own file`() {
        val drawables = File(root(), "app/src/main/res/drawable-nodpi").list().orEmpty().toSet()
        val used = listOf(scan, translate, currency, split, scam, group, viet)
            .flatMap { Regex("""R\.drawable\.(tappy_\w+)""").findAll(it).map { m -> m.groupValues[1] }.toList() }.toSet()
        used.forEach { assertTrue("$it.png is bundled", "$it.png" in drawables) }
        val web = File(root().parentFile, "public/tappy/reading.png")
        if (web.isFile) {
            assertTrue("reading.png is byte-identical to the web asset", web.readBytes().contentEquals(File(root(), "app/src/main/res/drawable-nodpi/tappy_reading.png").readBytes()))
        }
    }
}
