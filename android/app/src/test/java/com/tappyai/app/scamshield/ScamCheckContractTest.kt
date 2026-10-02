package com.tappyai.app.scamshield

import com.tappyai.app.scamshield.data.ScamCheckResponseDto
import com.tappyai.app.scamshield.data.toDomain
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The link / QR-link check contract of the web at origin/rc/web-uat @ 56a26ae (docs/uat/SCAM-SHIELD-PARITY.md §8, `verdict.ts`,
 * `reasons.ts`): the body carries `verdict` and each `evidence.items[]` carries `reasonCode` / `reason_vi` / `reason_en`.
 * The JSON below is a trimmed copy of a REAL response from `POST https://uat.tappyai.com/api/scam-shield/check` (02/10, SHA 56a26ae).
 */
class ScamCheckContractTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val realUatResponse = """
    {
      "inputType": "url",
      "url": "http://vietcombank-xacthuc-taikhoan.top/login",
      "risk": { "score": 79, "confidence": 60, "level": "HIGH" },
      "verdict": "familiar",
      "evidence": {
        "items": [
          { "source": "whois", "severity": "info", "summary": "No registration date available", "detail": "x", "reasonCode": "whois.NO_DATE", "reason_vi": "Công cụ kiểm tra ghi nhận một điểm đáng chú ý ở đường link này.", "reason_en": "The check noted something worth a look about this link." },
          { "source": "dns", "severity": "warning", "summary": "Domain has no A record (no IP address)", "detail": "x", "reasonCode": "dns.NO_A_RECORD", "reason_vi": "Tên miền chưa trỏ tới máy chủ nào (không có bản ghi địa chỉ). Hay gặp ở tên miền bỏ không hoặc mới đăng ký.", "reason_en": "The domain does not point to any server yet (no address record). Common with parked or newly registered domains." },
          { "source": "ssl", "severity": "warning", "summary": "Could not verify SSL certificate", "detail": "x", "reasonCode": "ssl.NO_SSL", "reason_vi": "Không xác minh được chứng chỉ bảo mật (SSL) của trang.", "reason_en": "The page’s security certificate (SSL) could not be verified." },
          { "source": "blocklist", "severity": "safe", "summary": "Not on blocklist", "detail": "x", "reasonCode": "blocklist.NOT_LISTED", "reason_vi": "Tên miền không nằm trong danh sách trang web xấu mà TappyAI đối chiếu.", "reason_en": "The domain is not on the bad-site list TappyAI checks against." },
          { "source": "impersonation", "severity": "critical", "summary": "This domain uses the name \"Vietcombank\" but is not one of its official domains (vietcombank.com.vn).", "detail": "x", "reasonCode": "impersonation.BRAND_IMPERSONATION", "reason_vi": "Tên miền có chứa tên «Vietcombank» nhưng không nằm trong các tên miền chính thức mà TappyAI có của tổ chức này.", "reason_en": "The domain contains the name “Vietcombank” but is not one of the official domains TappyAI has for that organisation." }
        ],
        "summary": "x"
      },
      "officialMatch": { "brand": "Vietcombank", "website": "https://vietcombank.com.vn", "hotline": "1900 545413" },
      "actions": [],
      "cached": false
    }
    """.trimIndent()

    @Test fun `the server's verdict and Vietnamese reasons are read`() {
        val r = json.decodeFromString(ScamCheckResponseDto.serializer(), realUatResponse).toDomain(preferVietnameseLabels = true)
        assertEquals("familiar", r.verdict)
        assertEquals(VerdictKind.Familiar, VerdictKind.forLink(r))
        val dns = r.evidence.first { it.reasonCode == "dns.NO_A_RECORD" }
        assertEquals("Tên miền chưa trỏ tới máy chủ nào (không có bản ghi địa chỉ). Hay gặp ở tên miền bỏ không hoặc mới đăng ký.", dns.summary)
        assertTrue("the shown sentence is Vietnamese, not the old English technical line", r.evidence.none { it.summary.startsWith("Domain has no") })
    }

    @Test fun `an English user gets reason_en, and an older server falls back to the old summary`() {
        val en = json.decodeFromString(ScamCheckResponseDto.serializer(), realUatResponse).toDomain(preferVietnameseLabels = false)
        assertEquals("The page’s security certificate (SSL) could not be verified.", en.evidence.first { it.reasonCode == "ssl.NO_SSL" }.summary)
        val old = """{"url":"x","risk":{"score":10,"confidence":50,"level":"MEDIUM"},"evidence":{"items":[{"source":"dns","severity":"warning","summary":"Domain has no A record","detail":"d"}]}}"""
        val r = json.decodeFromString(ScamCheckResponseDto.serializer(), old).toDomain(preferVietnameseLabels = true)
        assertEquals("Domain has no A record", r.evidence.single().summary)
        assertEquals("no verdict field -> the level decides, exactly as the web does", VerdictKind.Suspicious, VerdictKind.forLink(r))
    }

    @Test fun `the level mapping equals the web's linkVerdict`() {
        fun kind(level: String) = VerdictKind.forLink(
            json.decodeFromString(ScamCheckResponseDto.serializer(), """{"url":"x","risk":{"level":"$level"}}""").toDomain(true),
        )
        assertEquals(VerdictKind.Unrecognized, kind("SAFE"))
        assertEquals(VerdictKind.Unrecognized, kind("LOW"))
        assertEquals(VerdictKind.Unrecognized, kind("INCONCLUSIVE"))
        assertEquals(VerdictKind.Suspicious, kind("MEDIUM"))
        assertEquals(VerdictKind.Familiar, kind("HIGH"))
        assertEquals(VerdictKind.Familiar, kind("CRITICAL"))
        assertEquals("an unknown level is never reassuring", VerdictKind.Unrecognized, kind("SOMETHING_NEW"))
    }

    @Test fun `a server verdict wins over the level when both are sent`() {
        val r = json.decodeFromString(ScamCheckResponseDto.serializer(), """{"url":"x","risk":{"level":"INCONCLUSIVE"},"verdict":"suspicious"}""").toDomain(true)
        assertEquals(VerdictKind.Suspicious, VerdictKind.forLink(r))
        val junk = json.decodeFromString(ScamCheckResponseDto.serializer(), """{"url":"x","risk":{"level":"HIGH"},"verdict":"safe"}""").toDomain(true)
        assertEquals("an unknown verdict string is ignored, never read as safe", VerdictKind.Familiar, VerdictKind.forLink(junk))
        assertFalse(VerdictKind.entries.any { it.name.equals("safe", ignoreCase = true) })
    }
}
