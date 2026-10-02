package com.tappyai.app.scamshield

import com.tappyai.app.scamshield.data.ScenarioConfidence
import com.tappyai.app.scamshield.data.ScenarioMatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The on-device scenario match (`ScenarioMatcher`, a port of the web's Phase 8 `matchScenario`): sure matches are answered from the
 * bundled dataset without any request; ordinary messages are NEVER reported as a known scam.
 */
class ScenarioMatcherTest {

    private fun high(text: String) = ScenarioMatcher.match(text)?.takeIf { it.confidence == ScenarioConfidence.High }

    // ── known scams ──

    @Test fun `a police impersonation message is a high match for scenario 03`() {
        val m = high("Tôi là cán bộ công an, tài khoản của anh liên quan vụ án. Anh cần chuyển tiền để xác minh và giữ bí mật với mọi người.")
        assertNotNull(m)
        assertEquals("bca-2026-03", m!!.scenarioId)
    }

    @Test fun `a traffic-fine message is a high match for scenario 22 - and typing without accents works`() {
        assertEquals("bca-2026-22", high("Thông báo phạt nguội: xe của bạn vi phạm giao thông, vui lòng nộp phạt trong 24 giờ")?.scenarioId)
        assertEquals("bca-2026-22", high("thong bao phat nguoi: xe cua ban vi pham giao thong, vui long nop phat")?.scenarioId)
    }

    @Test fun `a prize message is a high match for scenario 23`() {
        assertEquals("bca-2026-23", high("Chúc mừng bạn trúng thưởng! Nhận giải bằng cách nộp phí nhận thưởng 500.000đ")?.scenarioId)
    }

    @Test fun `a phone-sim lock message is a high match for scenario 12`() {
        assertEquals("bca-2026-12", high("Nhà mạng thông báo: thuê bao của bạn sẽ bị khóa sim nếu không chuẩn hóa thông tin thuê bao trong hôm nay")?.scenarioId)
    }

    // ── a possible match keeps the normal path ──

    @Test fun `a moon-festival parcel with a QR code is only a possible match - it is not answered on its own`() {
        val m = ScenarioMatcher.match("Bưu phẩm Trung thu của bạn đã đến, quét mã QR đính kèm để nhận")
        assertNotNull(m)
        assertEquals(ScenarioConfidence.Possible, m!!.confidence)
    }

    // ── ordinary messages are not scams ──

    @Test fun `ordinary messages never reach a high match`() {
        val ordinary = listOf(
            "Đơn hàng #4821 đang được giao, shipper sẽ gọi bạn trước khi tới nhé.",
            "Số dư TK ...1234 +2.000.000đ lúc 10:15. Cảm ơn quý khách.",
            "Chiều nay đi ăn phở nha, 6h gặp ở quán cũ.",
            "Mẹ ơi con đang ở trường, chiều con về.",
            "Cuộc họp lúc 3h, nhớ mang laptop.",
            "Cảm ơn bạn đã chuyển khoản tiền cà phê hôm qua.",
            "Vietcombank: giao dịch thành công -50.000 VND tại cửa hàng tiện lợi.",
            "Hẹn mai 8h họp nhóm, mình đặt phòng rồi.",
            "Anh ơi tối nay mấy giờ về, em nấu cơm.",
            "Ship hàng giúp mình lên quận 3, mình trả tiền khi nhận hàng nha.",
        )
        ordinary.forEach { assertNull("'$it' must not be a high match", high(it)) }
    }

    @Test fun `an empty or blank message matches nothing`() {
        assertNull(ScenarioMatcher.match(""))
        assertNull(ScenarioMatcher.match("   \n "))
    }

    @Test fun `matching is on whole phrases, never inside a word`() {
        // "phat" inside "phathanh" is not the cue «phat»; "sim" inside "simple" is not «sim».
        assertNull(ScenarioMatcher.match("phathanh simple"))
    }

    // ── the link guard ──

    @Test fun `a message that carries a link is not answered from the cue table alone`() {
        assertTrue(ScenarioMatcher.containsLink("nộp phạt tại https://nop-phat.top/abc"))
        assertTrue(ScenarioMatcher.containsLink("vào www.vietcombank-xacthuc.com để xác minh"))
        assertTrue(ScenarioMatcher.containsLink("truy cập nop-phat.vn ngay"))
        assertFalse(ScenarioMatcher.containsLink("Tôi là cán bộ công an, hãy chuyển tiền để xác minh"))
    }

    // ── the cue table and the bundled dataset agree ──

    @Test fun `every cue-table id is a real scenario of the bundled dataset, and every scenario has cues`() {
        val json = File(root(), "app/src/main/assets/scam_knowledge/bocongan2026.json").readText()
        val ids = Regex(""""id"\s*:\s*"(bca-2026-\d\d)"""").findAll(json).map { it.groupValues[1] }.toSet()
        assertEquals(25, ids.size)
        assertEquals("the cue table covers exactly the 25 scenarios", ids, ScenarioMatcher.cueScenarioIds)
    }

    @Test fun `the matcher is pure - no network, no storage`() {
        val src = File(root(), "app/src/main/java/com/tappyai/app/scamshield/data/ScenarioMatcher.kt").readText()
        listOf("retrofit", "okhttp", "SharedPreferences", "DataStore", "Log.", "analytics", "java.io.File").forEach {
            assertFalse("ScenarioMatcher must not touch $it", src.contains(it, ignoreCase = true))
        }
    }

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
}
