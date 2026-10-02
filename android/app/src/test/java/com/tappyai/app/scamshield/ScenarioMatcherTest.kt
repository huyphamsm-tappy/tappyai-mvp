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
 * The on-device scenario match is a 1:1 port of the web's FINAL matcher (`knowledge/match.ts`, origin/rc/web-uat 65685a7).
 * The FIXTURES below are the web's own `match.test.ts` fixtures, copied verbatim: same text -> same scenario number -> same strength.
 */
class ScenarioMatcherTest {

    private class Fx(val text: String, val scenario: Int, val note: String)

    private val fixtures = listOf(
        Fx("Cuộc gọi video người thân hình mờ, giật rồi tắt đột ngột, nói cần tiền gấp", 1, "deepfake video"),
        Fx("Giọng giống người quen nhưng gọi từ số lạ, nhờ chuyển tiền vay tạm", 2, "DeepVoice"),
        Fx("Gọi điện im lặng, đầu dây không nói chuyện, chỉ hỏi \"A lô? Ai đấy?\"", 9, "silent call"),
        Fx("Người lạ xưng công an báo liên quan vụ án rửa tiền, đòi chuyển vào tài khoản tạm giữ", 3, "judicial"),
        Fx("Nhân viên ngân hàng báo giao dịch lạ và yêu cầu đọc mã OTP", 4, "bank staff"),
        Fx("Tin nhắn Brandname giả báo đăng nhập bất thường kèm link", 5, "brandname"),
        Fx("Báo SIM sắp bị khóa trong vài giờ nếu không chuẩn hóa thuê bao", 12, "SIM"),
        Fx("Thông báo nợ cước điện, dọa cắt điện trong vài giờ nếu không nộp cước", 17, "utilities"),
        Fx("Phạt nguội kèm link tra cứu, thúc nộp phạt ngay", 22, "phạt nguội"),
        Fx("Việc nhẹ lương cao, làm nhiệm vụ đặt đơn ảo nhận hoa hồng", 14, "collaborator"),
        Fx("Nhóm đầu tư có thầy đọc lệnh VIP, rút được lãi nhỏ rồi bị chặn rút tiền", 16, "investment group"),
        Fx("Trúng thưởng chương trình bạn không tham gia, phải đóng phí vận chuyển", 23, "prize"),
        Fx("Bưu phẩm Trung thu kèm mã QR", 19, "owner example"),
        Fx("Quà Tết gửi kèm mã QR lạ", 19, "owner shape 2"),
        Fx("Kiện hàng bạn chưa đặt kèm mã QR bắt quét", 19, "owner shape 3"),
    )

    @Test fun `the 15 web fixtures each give the same scenario and a strong match`() {
        assertEquals(15, fixtures.size)
        fixtures.forEach { f ->
            val m = ScenarioMatcher.match(f.text)
            assertNotNull("${f.note}: \"${f.text}\"", m)
            assertEquals("${f.note} scenario", f.scenario, m!!.officialNumber)
            assertEquals("${f.note} strength", ScenarioConfidence.High, m.confidence)
            assertTrue("${f.note} score ${m.score}", m.score >= ScenarioMatcher.STRONG_AT)
        }
    }

    @Test fun `works without diacritics and in any case`() {
        assertEquals(19, ScenarioMatcher.match("BUU PHAM trung thu kem ma QR")?.officialNumber)
        assertEquals(22, ScenarioMatcher.match("phat nguoi kem link")?.officialNumber)
    }

    @Test fun `a bare 'kem ma QR' invoice is only a WEAK match - some suspicious signs, not familiar`() {
        val m = ScenarioMatcher.match("Hóa đơn tiền điện tháng 9 kèm mã QR thanh toán")
        assertNotNull(m)
        assertEquals(ScenarioConfidence.Possible, m!!.confidence)
        assertTrue(m.score >= ScenarioMatcher.WEAK_AT)
        assertTrue(m.score < ScenarioMatcher.STRONG_AT)
    }

    @Test fun `a message with a link is matched on its text too - 'phat nguoi kem link' is familiar`() {
        val m = ScenarioMatcher.match("Phạt nguội kèm link https://nop-phat-nguoi.example/tra-cuu")
        assertEquals(22, m?.officialNumber)
        assertEquals(ScenarioConfidence.High, m?.confidence)
    }

    @Test fun `a normal message claims nothing`() {
        listOf(
            "Mẹ ơi cuối tuần con về nhà ăn cơm",
            "Họp lớp tối thứ sáu nhé, mọi người nhớ đến",
            "Thông báo số dư tài khoản: +500,000 VND lúc 09:15",
            "Shipper GHN đã giao hàng, bạn nhận được chưa?",
            "Mã OTP của bạn là 482913, không chia sẻ cho ai",
            "Chiều nay đi cà phê không?",
            "",
        ).forEach { assertNull("'$it' must claim nothing", ScenarioMatcher.match(it)) }
    }

    @Test fun `other everyday messages (ours) claim nothing either`() {
        listOf(
            "Đơn hàng #4821 đang được giao, shipper sẽ gọi bạn trước khi tới nhé.",
            "Chiều nay đi ăn phở nha, 6h gặp ở quán cũ.",
            "Cuộc họp lúc 3h, nhớ mang laptop.",
            "Cảm ơn bạn đã chuyển khoản tiền cà phê hôm qua.",
            "Anh ơi tối nay mấy giờ về, em nấu cơm.",
        ).forEach { assertNull("'$it' must claim nothing", ScenarioMatcher.match(it)) }
    }

    @Test fun `blank input matches nothing`() {
        assertNull(ScenarioMatcher.match("   \n "))
    }

    @Test fun `matching is on whole phrases, never inside a word`() {
        assertNull(ScenarioMatcher.match("phathanh simple"))
    }

    // ── the link that goes to the link check (and nothing else) ──

    @Test fun `containsLink spots links and bare domains`() {
        assertTrue(ScenarioMatcher.containsLink("nộp phạt tại https://nop-phat.top/abc"))
        assertTrue(ScenarioMatcher.containsLink("vào www.vietcombank-xacthuc.com để xác minh"))
        assertTrue(ScenarioMatcher.containsLink("truy cập nop-phat.vn ngay"))
        assertFalse(ScenarioMatcher.containsLink("Tôi là cán bộ công an, hãy chuyển tiền để xác minh"))
    }

    @Test fun `firstLink returns the first link as an https URL, trimmed of punctuation`() {
        assertEquals("https://nop-phat.top/abc", ScenarioMatcher.firstLink("nộp phạt tại https://nop-phat.top/abc, nhanh lên"))
        assertEquals("https://www.vietcombank-xacthuc.com", ScenarioMatcher.firstLink("vào www.vietcombank-xacthuc.com để xác minh"))
        assertEquals("https://nop-phat.vn", ScenarioMatcher.firstLink("truy cập nop-phat.vn ngay!"))
        assertEquals("http://a.example/x", ScenarioMatcher.firstLink("xem (http://a.example/x)"))
        assertNull(ScenarioMatcher.firstLink("Chiều nay đi ăn phở nha, 6h gặp ở quán cũ."))
        assertNull(ScenarioMatcher.firstLink(""))
    }

    // ── the phrase table and the bundled dataset agree ──

    @Test fun `every scenario number in the bundled dataset has a phrase list, and no other`() {
        val json = File(root(), "app/src/main/assets/scam_knowledge/bocongan2026.json").readText()
        val numbers = Regex(""""officialNumber"\s*:\s*(\d+)""").findAll(json).map { it.groupValues[1].toInt() }.filter { it in 1..25 }.toSet()
        assertEquals(25, numbers.size)
        assertEquals(numbers, ScenarioMatcher.coveredScenarioNumbers)
    }

    @Test fun `the matcher is pure - no network, no storage`() {
        val src = File(root(), "app/src/main/java/com/tappyai/app/scamshield/data/ScenarioMatcher.kt").readText()
        listOf("retrofit", "okhttp", "SharedPreferences", "DataStore", "Log.", "analytics", "java.io.File").forEach {
            assertFalse("ScenarioMatcher must not touch $it", src.contains(it, ignoreCase = true))
        }
    }

    @Test fun `the thresholds are the web's`() {
        assertEquals(6.0, ScenarioMatcher.STRONG_AT, 0.0)
        assertEquals(4.0, ScenarioMatcher.WEAK_AT, 0.0)
    }

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
}
