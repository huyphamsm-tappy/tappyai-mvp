package com.tappyai.app.scamshield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Web final `a43948d` replaced "gọi 113" by ONE canonical scam-reporting hotline (`src/lib/scam-shield/hotline.ts`) and added the emergency card
 * "Nghi bị lừa?" (`ScamHelpCard.tsx`, placed after the hero and before the tools). These pins are the Web test `scamHelpCard.test.tsx` and its source
 * module, line for line, against the Android port.
 */
class ScamHelpCardTest {

    private fun res(rel: String): String {
        var dir: File? = File(System.getProperty("user.dir")!!).absoluteFile
        while (dir != null && !File(dir, "app/src/main").exists()) dir = dir.parentFile
        return File(dir!!, "app/src/main/$rel").readText()
    }

    private fun string(file: String, name: String): String =
        Regex("""<string name="$name">(.*?)</string>""").find(res(file))!!.groupValues[1]

    private val vi = "res/values-vi/strings_scam_v3.xml"
    private val en = "res/values/strings_scam_v3.xml"

    @Test
    fun `the canonical hotline module is the Web one - the number, the tel URI and the exact official URL`() {
        assertEquals("0692.345.860", ScamReportHotline.DISPLAY)
        assertEquals("tel:0692345860", ScamReportHotline.TEL)
        assertEquals("https://bocongan.gov.vn/hoi-dap/chi-tiet-cau-hoi/ab7d473e-21c9-4950-8ae2-947c1c7605af?page=/", ScamReportHotline.SOURCE_URL)
        assertFalse(ScamReportHotline.SOURCE_URL.contains("utm_") || ScamReportHotline.SOURCE_URL.contains("chatgpt"))
    }

    @Test
    fun `the card words are the Web ones in both languages`() {
        val viExpected = mapOf(
            "scam_v3_help_title" to "Nghi bị lừa?",
            "scam_v3_help_body" to "Nếu đã chuyển tiền hoặc lộ mã OTP, gọi Công an ngay.",
            "scam_v3_help_call" to "Gọi %1\$s",
            "scam_v3_help_hotlineTitle" to "Đường Dây Nóng",
            "scam_v3_help_agency" to "Cục Cảnh sát hình sự - Bộ Công an",
            "scam_v3_help_hotlineDesc" to "Đường dây nóng tiếp nhận tin báo, tố giác về lừa đảo.",
            "scam_v3_help_sourceLabel" to "Nguồn:",
            "scam_v3_help_sourceName" to "Bộ Công an",
        )
        val enExpected = mapOf(
            "scam_v3_help_title" to "Think you were scammed?",
            "scam_v3_help_body" to "If you already sent money or shared an OTP code, call the police now.",
            "scam_v3_help_call" to "Call %1\$s",
            "scam_v3_help_hotlineTitle" to "Hotline",
            "scam_v3_help_agency" to "Criminal Police Department - Ministry of Public Security",
            "scam_v3_help_hotlineDesc" to "The hotline that receives reports and denunciations of fraud.",
            "scam_v3_help_sourceLabel" to "Source:",
            "scam_v3_help_sourceName" to "Ministry of Public Security",
        )
        for ((k, v) in viExpected) assertEquals("vi $k", v, string(vi, k))
        for ((k, v) in enExpected) assertEquals("en $k", v, string(en, k))
    }

    @Test
    fun `no 113 and no URL as visible text in the card, and the scenario report line carries the new hotline`() {
        val all = listOf(vi, en).flatMap { f -> Regex("""<string name="(scam_v3_help_\w+)">(.*?)</string>""").findAll(res(f)).map { it.groupValues[2] }.toList() }
        assertTrue(all.none { Regex("""\b113\b""").containsMatchIn(it) })
        assertTrue("the long URL is never visible text; only the agency name is the link", all.none { it.contains("http") || it.contains("bocongan.gov.vn") })
        assertEquals("Báo ngay cho Công an nơi gần nhất hoặc gọi 0692.345.860 nếu nghi ngờ bị lừa.", string("res/values-vi/strings_scam_local.xml", "scam_verdict_scenario_report"))
        assertEquals("Report to the nearest police station or call 0692.345.860 if you suspect a scam.", string("res/values/strings_scam_local.xml", "scam_verdict_scenario_report"))
    }

    @Test
    fun `the card sits after the hero and before the tools, opens the dialer (not a call) and has ONE tel link`() {
        val screen = res("java/com/tappyai/app/scamshield/ScamShieldScreen.kt")
        val hero = screen.indexOf("ToolHero(")
        val card = screen.indexOf("ScamHelpCard()")
        val tool = screen.indexOf("ToolPanel {")
        assertTrue("hero < card < tool", hero in 0 until card && card < tool)
        val src = res("java/com/tappyai/app/scamshield/ScamHelpCard.kt")
        assertTrue(src.contains("Intent.ACTION_DIAL") && !src.contains("ACTION_CALL"))
        assertEquals("only one tel: target in the card", 1, Regex("""ScamReportHotline\.TEL""").findAll(src).count())
        assertTrue("the manifest asks for no CALL_PHONE", !res("AndroidManifest.xml").contains("CALL_PHONE"))
    }
}
