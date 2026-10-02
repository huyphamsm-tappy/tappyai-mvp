package com.tappyai.app.scamshield

import com.tappyai.app.scamshield.data.MessageAnalysisResponseDto
import com.tappyai.app.scamshield.data.toDomain
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The message check contract of the web at origin/rc/web-uat @ 56a26aeb72d3ae1dacb484885df04e6976d5d84e (`ScamMessageResult.tsx`,
 * `verdict.ts`, `advice.ts`). Both JSON bodies below are REAL responses of `POST https://uat.tappyai.com/api/scam-shield/analyze`
 * (02/10, AI switch off: tier 0, `aiStatus: not_needed`, no quota): a sure scenario match and an ordinary message.
 */
class ScamMessageContractTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val fine = """{"inputType": "message", "risk": {"level": "HIGH", "score": 60, "confidence": 40}, "scamType": "government_impersonation", "attackGoal": "phishing", "signals": [{"type": "other", "severity": "high", "source": "rule", "explanation": "Nội dung giống tình huống “Giả thông báo phạt nguội” (kịch bản số 22 trong danh sách của Bộ Công an)."}, {"type": "urgency_pressure", "severity": "medium", "explanation": "Đặt ra hạn chót gấp gáp để bạn không kịp suy nghĩ hay kiểm chứng.", "source": "rule"}], "requestedActions": [], "urlChecks": [], "advice": {"doNot": [{"code": "NO_RUSH", "label_vi": "KHÔNG hành động vội vì hạn chót — đó là chiêu gây áp lực", "label_en": "Do NOT act on the deadline — it exists to pressure you"}, {"code": "SCENARIO_NOT_22_1", "label_vi": "Không tra cứu/nộp phạt qua link trong tin nhắn", "label_en": "Không tra cứu/nộp phạt qua link trong tin nhắn"}, {"code": "SCENARIO_NOT_22_2", "label_vi": "Không cung cấp mã OTP, mật khẩu hay thông tin cá nhân cho người gọi/nhắn, dù họ xưng là ai.", "label_en": "Không cung cấp mã OTP, mật khẩu hay thông tin cá nhân cho người gọi/nhắn, dù họ xưng là ai."}], "doNow": [{"code": "REPORT_SCAM", "label_vi": "Báo cáo và chặn người gửi", "label_en": "Report and block the sender"}, {"code": "SCENARIO_DO_22_1", "label_vi": "Tra cứu phạt nguội tại website chính thức của Cục CSGT hoặc Cổng dịch vụ công quốc gia", "label_en": "Tra cứu phạt nguội tại website chính thức của Cục CSGT hoặc Cổng dịch vụ công quốc gia"}, {"code": "SCENARIO_DO_22_2", "label_vi": "Nộp phạt qua kênh chính thức sau khi có quyết định xử phạt", "label_en": "Nộp phạt qua kênh chính thức sau khi có quyết định xử phạt"}]}, "reasoningSummary": "Nội dung này giống một thủ đoạn lừa đảo đã được cơ quan chức năng cảnh báo. Đừng làm theo yêu cầu trong đó.", "analysis": {"tier": 0, "aiStatus": "not_needed", "provider": null, "modelRole": null}, "analyzedAt": 1790947745282, "verdict": "familiar", "scenario": {"id": "bca-2026-22", "officialNumber": 22, "title": "Giả thông báo phạt nguội", "summary": "Gửi yêu cầu tra cứu vi phạm qua link giả, hướng dẫn nộp phạt trực tuyến.", "warningSigns": ["Tin nhắn/cuộc gọi báo bạn có \"phạt nguội\" kèm link tra cứu, thúc nộp phạt ngay", "Tên miền không phải của Cục CSGT / Cổng dịch vụ công"], "whatToDo": ["Tra cứu phạt nguội tại website chính thức của Cục CSGT hoặc Cổng dịch vụ công quốc gia", "Nộp phạt qua kênh chính thức sau khi có quyết định xử phạt"], "whatNotToDo": ["Không tra cứu/nộp phạt qua link trong tin nhắn", "Không cung cấp mã OTP, mật khẩu hay thông tin cá nhân cho người gọi/nhắn, dù họ xưng là ai."], "source": {"organization": "Bộ Công an", "title": "Nâng cao cảnh giác trước 25 kịch bản lừa đảo trên không gian mạng năm 2026", "url": "https://bocongan.gov.vn/bai-viet/nang-cao-canh-giac-truoc-25-kich-ban-lua-dao-tren-khong-gian-mang-nam-2026-1788865614", "publishedAt": "2026-09-08"}, "hotline": "113", "strength": "strong"}, "quota": null}"""

    private val normal = """{"inputType": "message", "risk": {"level": "INCONCLUSIVE", "score": 0, "confidence": 40}, "scamType": null, "attackGoal": null, "signals": [], "requestedActions": [], "urlChecks": [], "advice": {"doNot": [{"code": "NO_TRANSFER", "label_vi": "KHÔNG chuyển tiền hay nộp bất kỳ khoản \"phí\" nào", "label_en": "Do NOT transfer money or pay any \"fee\""}, {"code": "NO_OTP", "label_vi": "KHÔNG nhập hay đọc mã OTP / mã xác thực cho bất kỳ ai", "label_en": "Do NOT enter or read out any OTP / verification code to anyone"}, {"code": "NO_CLICK_LINK", "label_vi": "KHÔNG bấm vào liên kết trong tin nhắn", "label_en": "Do NOT open the link in the message"}], "doNow": [{"code": "COULD_NOT_CONCLUDE", "label_vi": "Chưa nhận ra dấu hiệu quen thuộc. Điều này KHÔNG có nghĩa là an toàn: hãy xác minh qua kênh chính thức trước khi làm theo", "label_en": "No familiar signs recognised. This does NOT mean it is safe: verify through an official channel before acting on it"}, {"code": "VERIFY_SENDER_INDEPENDENTLY", "label_vi": "Tự liên hệ tổ chức qua số điện thoại / website chính thức bạn tra cứu được", "label_en": "Contact the organisation yourself through a phone number / website you looked up"}]}, "reasoningSummary": "Chưa nhận ra dấu hiệu quen thuộc. Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức.", "analysis": {"tier": 0, "aiStatus": "not_needed", "provider": null, "modelRole": null}, "analyzedAt": 1790947745607, "verdict": "unrecognized", "scenario": null, "quota": null}"""

    @Test fun `a sure match is a familiar verdict with its scenario block and the server's advice`() {
        val r = json.decodeFromString(MessageAnalysisResponseDto.serializer(), fine).toDomain(preferVietnameseLabels = true)
        assertEquals("familiar", r.verdict)
        assertEquals(VerdictKind.Familiar, VerdictKind.fromWire(r.verdict))
        val sc = r.scenario
        assertNotNull(sc)
        assertEquals(22, sc!!.officialNumber)
        assertTrue(sc.title.isNotBlank() && sc.summary.isNotBlank() && sc.warningSigns.isNotEmpty())
        assertTrue("the official source is linked", sc.sourceUrl.startsWith("https://"))
        assertTrue("the server's scenario advice is shown", r.doNot.any { it.code.startsWith("SCENARIO_NOT_22") } && r.doNow.any { it.code.startsWith("SCENARIO_DO_22") })
        assertEquals("not_needed", r.aiStatus)
    }

    @Test fun `an ordinary message is unrecognized - never safe - with the web's three do-not lines`() {
        val r = json.decodeFromString(MessageAnalysisResponseDto.serializer(), normal).toDomain(preferVietnameseLabels = true)
        assertEquals("unrecognized", r.verdict)
        assertEquals(VerdictKind.Unrecognized, VerdictKind.fromWire(r.verdict))
        assertNull(r.scenario)
        assertEquals(listOf("NO_TRANSFER", "NO_OTP", "NO_CLICK_LINK"), r.doNot.map { it.code })
        assertTrue(r.doNow.map { it.code }.containsAll(listOf("COULD_NOT_CONCLUDE", "VERIFY_SENDER_INDEPENDENTLY")))
        assertTrue("the server reports SAFE/LOW as INCONCLUSIVE, so the level never reads as safe", r.level == RiskLevel.INCONCLUSIVE)
    }

    @Test fun `the advice is read in the user's language`() {
        val vi = json.decodeFromString(MessageAnalysisResponseDto.serializer(), normal).toDomain(preferVietnameseLabels = true)
        val en = json.decodeFromString(MessageAnalysisResponseDto.serializer(), normal).toDomain(preferVietnameseLabels = false)
        assertEquals("KHÔNG chuyển tiền hay nộp bất kỳ khoản \"phí\" nào", vi.doNot.first { it.code == "NO_TRANSFER" }.label)
        assertEquals("Do NOT transfer money or pay any \"fee\"", en.doNot.first { it.code == "NO_TRANSFER" }.label)
        assertFalse(vi.doNot.any { it.label.isBlank() })
    }

    @Test fun `an older server without a verdict falls back to the level, and a body without the three required parts is not a verdict`() {
        val old = """{"risk":{"level":"HIGH","score":71,"confidence":60},"analysis":{"tier":1,"aiStatus":"used"},"advice":{"doNot":[],"doNow":[]}}"""
        val r = json.decodeFromString(MessageAnalysisResponseDto.serializer(), old).toDomain(true)
        assertNull(r.verdict)
        assertEquals(VerdictKind.Familiar, VerdictKind.fromWire(r.verdict) ?: VerdictKind.fromRisk(r.level))
        val broken = """{"risk":{"level":""}}"""
        val thrown = runCatching { json.decodeFromString(MessageAnalysisResponseDto.serializer(), broken).toDomain(true) }.exceptionOrNull()
        assertNotNull("a 200 without a verdict is not a verdict", thrown)
    }
}
