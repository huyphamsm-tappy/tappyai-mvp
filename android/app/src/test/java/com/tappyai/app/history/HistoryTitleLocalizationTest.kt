package com.tappyai.app.history

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.io.File

/**
 * Found on a real device: the Vietnamese History header panel read "HISTORY". Web final
 * (`src/lib/i18n/v3/web.ts` at a43948d) titles the same panel `v3.history.title`:
 * "Lịch sử hoạt động" (vi) / "Activity history" (en).
 */
class HistoryTitleLocalizationTest {

    private fun value(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            for (base in listOf("app/src/main/res", "src/main/res")) {
                val f = File(dir, "$base/$rel")
                if (f.exists()) {
                    val m = Regex("""name="history_v3_title">([^<]*)<""").find(f.readText())
                    return m!!.groupValues[1]
                }
            }
            dir = dir.parentFile
        }
        error("res/$rel not found")
    }

    @Test
    fun `history panel title follows the web final copy in both languages`() {
        assertEquals("Lịch sử hoạt động", value("values-vi/strings_personal_v3.xml"))
        assertEquals("Activity history", value("values/strings_personal_v3.xml"))
    }

    @Test
    fun `the Vietnamese title is not the English placeholder`() {
        assertFalse(value("values-vi/strings_personal_v3.xml").equals("HISTORY", ignoreCase = true))
    }
}
