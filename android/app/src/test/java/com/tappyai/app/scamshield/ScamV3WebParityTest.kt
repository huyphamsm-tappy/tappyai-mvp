package com.tappyai.app.scamshield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The Scam Shield screen wording (`v3.scam.*`) equals the web's, key by key, in Vietnamese and English.
 * Web source: `src/lib/i18n/v3/web.ts` at origin/rc/web-uat @ 56a26aeb72d3ae1dacb484885df04e6976d5d84e. This table was generated from that
 * file for every key that has an Android string (`scam_v3_<key>`). Placeholders ({n}, %1$s, %1$d ...) are compared as one token.
 * If the web changes a sentence, this test fails until the Android string follows.
 */
class ScamV3WebParityTest {

    private val expected = listOf(
        Triple("scam_v3_featBrand", "Thương hiệu chính thức", "Official brands"),
        Triple("scam_v3_featBrandDesc", "Đối chiếu danh bạ chính chủ", "Matched against the official directory"),
        Triple("scam_v3_featDetect", "Phát hiện lừa đảo", "Scam detection"),
        Triple("scam_v3_featDetectDesc", "Danh sách đen & Web Risk", "Blocklists & Web Risk"),
        Triple("scam_v3_featFast", "Kiểm tra nhanh", "Fast check"),
        Triple("scam_v3_featFastDesc", "Chỉ vài giây", "Just a few seconds"),
        Triple("scam_v3_featHttps", "HTTPS & chuyển hướng", "HTTPS & redirects"),
        Triple("scam_v3_featHttpsDesc", "Chứng chỉ, chuỗi redirect", "Certificate, redirect chain"),
        Triple("scam_v3_heroBody", "Tappy giúp bạn phát hiện liên kết và website đáng ngờ, lừa đảo — kiểm tra trước, mở sau.", "Tappy helps you spot suspicious and fraudulent links and websites — check first, open later."),
        Triple("scam_v3_heroEyebrow", "Duyệt web cẩn thận hơn", "Browse more carefully"),
        Triple("scam_v3_heroTitle1", "Kiểm tra kỹ", "Check it first"),
        Triple("scam_v3_heroTitle2", "trước khi truy cập", "before you open it"),
        Triple("scam_v3_historyLink", "Lịch sử kiểm tra", "Check history"),
        Triple("scam_v3_kb_all", "Tất cả", "All"),
        Triple("scam_v3_kb_cat_ai_deepfake", "AI – Deepfake", "AI – Deepfake"),
        Triple("scam_v3_kb_cat_data_theft", "Đánh cắp dữ liệu", "Data theft"),
        Triple("scam_v3_kb_cat_impersonation", "Cơ quan nhà nước", "Government & institutions"),
        Triple("scam_v3_kb_cat_investment_jobs", "Đầu tư, việc làm", "Investment & jobs"),
        Triple("scam_v3_kb_cat_online_trading", "Mua bán trực tuyến", "Online trading"),
        Triple("scam_v3_kb_close", "Đóng", "Close"),
        Triple("scam_v3_kb_contentLanguage", "", "Scenario content is shown in Vietnamese, as published by the source."),
        Triple("scam_v3_kb_count", "{n} tình huống", "{n} scenarios"),
        Triple("scam_v3_kb_doNot", "KHÔNG làm", "Do NOT"),
        Triple("scam_v3_kb_doNow", "Nên làm", "Do this"),
        Triple("scam_v3_kb_goal", "Mục đích của kẻ gian", ""),
        Triple("scam_v3_kb_guidance", "Hướng dẫn của TappyAI", "TappyAI guidance"),
        Triple("scam_v3_kb_guidanceNote", "Do TappyAI biên soạn dựa trên nội dung nguồn chính thức — không phải trích dẫn nguyên văn.", "Written by TappyAI from the official material — not a verbatim quotation."),
        Triple("scam_v3_kb_official", "Thông tin từ nguồn chính thức", "Information from an official source"),
        Triple("scam_v3_kb_officialNumber", "Kịch bản số {n} trong danh sách chính thức", "Scenario #{n} in the official list"),
        Triple("scam_v3_kb_openSource", "Xem nguồn gốc", "Open the original source"),
        Triple("scam_v3_kb_prevention", "Biện pháp phòng tránh (theo nguồn chính thức)", "Prevention measures (from the official source)"),
        Triple("scam_v3_kb_published", "Đăng ngày", "Published"),
        Triple("scam_v3_kb_report", "Khi phát hiện dấu hiệu lừa đảo", "If you spot a scam"),
        Triple("scam_v3_kb_requests", "Kẻ gian thường yêu cầu", "What the scammer usually asks for"),
        Triple("scam_v3_kb_showLess", "Thu gọn", "Show less"),
        Triple("scam_v3_kb_showMore", "Xem thêm tình huống", "Show more scenarios"),
        Triple("scam_v3_kb_signs", "Dấu hiệu nhận biết", "Warning signs"),
        Triple("scam_v3_kb_source", "Nguồn", "Source"),
        Triple("scam_v3_kb_subtitle", "Các tình huống lừa đảo phổ biến được tổng hợp từ nguồn chính thức.", "Common scam scenarios compiled from official sources."),
        Triple("scam_v3_kb_title", "Kiến thức chống lừa đảo", "Anti-fraud knowledge"),
        Triple("scam_v3_kb_verifiedAt", "TappyAI đối chiếu ngày", "Checked by TappyAI on"),
        Triple("scam_v3_msg_analyzing", "Đang phân tích…", "Analyzing…"),
        Triple("scam_v3_msg_cta", "Phân tích ngay", "Analyze now"),
        Triple("scam_v3_msg_doNot", "KHÔNG làm", "Do NOT"),
        Triple("scam_v3_msg_doNow", "Nên làm ngay", "Do this now"),
        Triple("scam_v3_msg_errFailed", "Chưa phân tích được tin nhắn này. Vui lòng thử lại.", ""),
        Triple("scam_v3_msg_errImage", "Ảnh không hợp lệ hoặc quá lớn (tối đa 5 MB, JPEG/PNG/WebP).", "The image is not valid or too large (max 5 MB, JPEG/PNG/WebP)."),
        Triple("scam_v3_msg_extracted", "Nội dung đọc từ ảnh", "Text read from the screenshot"),
        Triple("scam_v3_msg_goal", "Kẻ gian muốn lấy gì", "What the attacker is after"),
        Triple("scam_v3_msg_goal_account_takeover", "Chiếm đoạt tài khoản của bạn", "Take over your account"),
        Triple("scam_v3_msg_goal_credential_theft", "Đánh cắp thông tin đăng nhập", "Steal your login details"),
        Triple("scam_v3_msg_goal_identity_theft", "Đánh cắp thông tin cá nhân", "Steal your personal information"),
        Triple("scam_v3_msg_goal_impersonation", "Mạo danh để tạo lòng tin", "Borrow a trusted name to gain your trust"),
        Triple("scam_v3_msg_goal_investment_scam", "Dụ bạn nạp tiền đầu tư", "Get you to deposit into a fake investment"),
        Triple("scam_v3_msg_goal_malware_installation", "Cài phần mềm độc hại lên thiết bị", "Install malware on your device"),
        Triple("scam_v3_msg_goal_other", "Mục đích khác", "Other goal"),
        Triple("scam_v3_msg_goal_otp_interception", "Lấy mã OTP của bạn", "Capture your OTP code"),
        Triple("scam_v3_msg_goal_payment_fraud", "Lừa bạn chuyển tiền", "Get you to send money"),
        Triple("scam_v3_msg_goal_phishing", "Dụ bạn vào trang giả mạo", "Lure you to a fake page"),
        Triple("scam_v3_msg_goal_remote_access_compromise", "Điều khiển thiết bị của bạn từ xa", "Take remote control of your device"),
        Triple("scam_v3_msg_goal_romance_scam", "Lợi dụng tình cảm để lấy tiền", "Exploit a relationship for money"),
        Triple("scam_v3_msg_goal_social_engineering", "Thao túng để bạn làm theo yêu cầu", "Manipulate you into complying"),
        Triple("scam_v3_msg_linkUnchecked", "Chưa kiểm tra được", "Could not check"),
        Triple("scam_v3_msg_links", "Liên kết trong tin nhắn", "Links in the message"),
        Triple("scam_v3_msg_placeholder", "Ví dụ: Một người tự xưng là nhân viên ngân hàng gọi cho tôi và yêu cầu chuyển tiền để xác minh tài khoản…", "Example: Someone claiming to be a bank employee called me and asked me to transfer money to verify my account…"),
        Triple("scam_v3_msg_removeScreenshot", "Bỏ ảnh", "Remove screenshot"),
        Triple("scam_v3_msg_title", "Phân tích tin nhắn", "Analyze a message"),
        Triple("scam_v3_msg_type_bank_phishing", "Giả mạo ngân hàng", "Bank impersonation phishing"),
        Triple("scam_v3_msg_type_charity_scam", "Lừa đảo từ thiện", "Charity scam"),
        Triple("scam_v3_msg_type_customer_support_impersonation", "Giả mạo chăm sóc khách hàng", "Customer-support impersonation"),
        Triple("scam_v3_msg_type_delivery_scam", "Lừa đảo giao hàng", "Delivery scam"),
        Triple("scam_v3_msg_type_ecommerce_refund_scam", "Lừa hoàn tiền mua sắm", "E-commerce refund scam"),
        Triple("scam_v3_msg_type_government_impersonation", "Giả danh cơ quan nhà nước / công an", "Government / police impersonation"),
        Triple("scam_v3_msg_type_investment_scam", "Lừa đảo đầu tư", "Investment scam"),
        Triple("scam_v3_msg_type_job_scam", "Lừa đảo việc làm", "Job scam"),
        Triple("scam_v3_msg_type_loan_scam", "Lừa đảo vay tiền", "Loan scam"),
        Triple("scam_v3_msg_type_malware_distribution", "Phát tán ứng dụng độc hại", "Malicious app distribution"),
        Triple("scam_v3_msg_type_other", "Dấu hiệu lừa đảo khác", "Other scam pattern"),
        Triple("scam_v3_msg_type_otp_phishing", "Lừa lấy mã OTP", "OTP phishing"),
        Triple("scam_v3_msg_type_prize_scam", "Lừa trúng thưởng", "Prize / reward scam"),
        Triple("scam_v3_msg_type_remote_access_scam", "Lừa điều khiển thiết bị từ xa", "Remote-access scam"),
        Triple("scam_v3_msg_type_romance_scam", "Lừa đảo tình cảm", "Romance scam"),
        Triple("scam_v3_msg_type_tech_support_scam", "Giả mạo hỗ trợ kỹ thuật", "Tech-support scam"),
        Triple("scam_v3_msg_type_telegram_account_phishing", "Lừa chiếm tài khoản Telegram", "Telegram account takeover phishing"),
        Triple("scam_v3_msg_upload", "Tải ảnh chụp màn hình", "Upload a screenshot"),
        Triple("scam_v3_msg_urlPlaceholder", "Liên kết kèm theo (không bắt buộc)", "Link included in the message (optional)"),
        Triple("scam_v3_msg_wants", "Tin nhắn yêu cầu bạn", "The message asks you to"),
        Triple("scam_v3_msg_why", "Vì sao đáng ngờ", "Why it is suspicious"),
        Triple("scam_v3_tabMessage", "Phân tích tin nhắn", "Analyze a message"),
        Triple("scam_v3_tabUrl", "Kiểm tra URL", "Check a URL"),
    )

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }

    private fun strings(dir: String): Map<String, String> {
        val out = HashMap<String, String>()
        for (f in listOf("strings_scam_v3.xml", "strings_scam_shield.xml")) {
            val file = File(root(), "app/src/main/res/$dir/$f")
            if (!file.exists()) continue
            for (m in Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL).findAll(file.readText())) {
                out[m.groupValues[1]] = m.groupValues[2].replace("\\'", "'").replace("\\n", "\n").replace("\\\"", "\"").replace("&amp;", "&").trim()
            }
        }
        return out
    }

    private val placeholder = Regex("""\{[a-zA-Z]+\}|%\d?\$?[sd]""")
    private fun norm(s: String) = s.replace(placeholder, "§").trim()

    @Test fun `every screen sentence equals the web's, in Vietnamese and in English`() {
        val vi = strings("values-vi")
        val en = strings("values")
        assertTrue(expected.size >= 90)
        expected.forEach { (name, wantVi, wantEn) ->
            assertEquals("vi $name", norm(wantVi), norm(vi[name] ?: "<missing>"))
            if (wantEn.isNotEmpty()) assertEquals("en $name", norm(wantEn), norm(en[name] ?: "<missing>"))
        }
    }
}
