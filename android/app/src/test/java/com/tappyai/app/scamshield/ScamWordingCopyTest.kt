package com.tappyai.app.scamshield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The Scam Shield wording is COPIED from the web, word for word: `src/lib/i18n/scamVerdict.ts`, `scamQr.ts`, `share.ts` and the
 * `scamShield.error.*` lines of `dictionaries.ts` at origin/rc/web-uat @ 56a26aeb72d3ae1dacb484885df04e6976d5d84e (docs/uat/SCAM-SHIELD-PARITY.md
 * section 8). This table was generated from those files; each row is (Android string name, Vietnamese, English). If the web changes a
 * sentence, this test fails until the Android string follows.
 */
class ScamWordingCopyTest {

    private val expected = listOf(
        Triple("scam_verdict_familiar", "Có dấu hiệu lừa đảo quen thuộc", "Familiar scam signs found"),
        Triple("scam_verdict_suspicious", "Có một số dấu hiệu đáng ngờ", "Some suspicious signs found"),
        Triple("scam_verdict_unrecognized", "Chưa nhận ra dấu hiệu quen thuộc", "No familiar signs recognised"),
        Triple("scam_verdict_unrecognized_body", "Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức.", "This does NOT mean it is safe: do not send money, do not read out any OTP code, do not tap unknown links; verify through an official channel."),
        Triple("scam_verdict_familiar_body", "Nội dung này giống một thủ đoạn lừa đảo đã được cơ quan chức năng cảnh báo. Đừng làm theo yêu cầu trong đó.", "This looks like a scam tactic the authorities have warned about. Do not do what it asks."),
        Triple("scam_verdict_suspicious_body", "Chưa đủ để kết luận, nhưng bạn nên dừng lại và xác minh qua kênh chính thức trước khi làm bất cứ điều gì.", "Not enough to be certain, but stop and verify through an official channel before doing anything."),
        Triple("scam_verdict_link_familiar_title", "Đường link có đặc điểm thường gặp ở link giả mạo", "This link has traits that are common in fake links"),
        Triple("scam_verdict_link_suspicious_title", "Đường link có một số điểm đáng ngờ", "This link has some suspicious traits"),
        Triple("scam_verdict_link_unrecognized_title", "Chưa nhận ra dấu hiệu quen thuộc ở đường link này", "No familiar signs recognised in this link"),
        Triple("scam_verdict_link_familiar_body", "Đây là nhận định về đặc điểm của đường link, không phải kết luận về một tổ chức hay tên miền cụ thể. Đừng đăng nhập, đừng nhập OTP hay thông tin thẻ trên trang này.", "This describes the traits of the link, not a conclusion about any particular organisation or domain. Do not sign in or enter an OTP or card details on this page."),
        Triple("scam_verdict_link_suspicious_body", "Chưa đủ để kết luận. Đừng nhập thông tin cá nhân hay mã OTP; hãy tự mở website hoặc ứng dụng chính thức.", "Not enough to be certain. Do not enter personal details or an OTP; open the official website or app yourself."),
        Triple("scam_verdict_reasons", "Lý do cụ thể", "Specific reasons"),
        Triple("scam_verdict_link_short_familiar", "Đặc điểm link giả mạo", "Fake-link traits"),
        Triple("scam_verdict_link_short_suspicious", "Có điểm đáng ngờ", "Some suspicious traits"),
        Triple("scam_verdict_link_short_unrecognized", "Chưa nhận ra dấu hiệu", "No signs recognised"),
        Triple("scam_verdict_disclaimer", "TappyAI không thay thế cơ quan chức năng.", "TappyAI does not replace the authorities."),
        Triple("scam_verdict_scenario_heading", "Tình huống tương ứng", "Matching scenario"),
        Triple("scam_verdict_scenario_number", "Kịch bản số %1\$d trong danh sách của Bộ Công an", "Scenario #%1\$d in the Ministry of Public Security list"),
        Triple("scam_verdict_scenario_report", "Báo ngay cho Công an nơi gần nhất hoặc gọi 113 nếu nghi ngờ bị lừa.", "Report to the nearest police station or call 113 if you suspect a scam."),
        Triple("scam_verdict_scenario_signs", "Dấu hiệu nhận biết (theo bài viết)", "Warning signs (from the article)"),
        Triple("scam_verdict_scenario_source", "Thông tin từ nguồn chính thức", "Information from an official source"),
        Triple("scam_verdict_scenario_source_open", "Xem bài viết gốc", "Open the original article"),
        Triple("scam_verdict_scenario_guidance_note", "Phần dấu hiệu và lời khuyên do TappyAI biên soạn từ nguồn chính thức, không phải trích dẫn nguyên văn.", "The signs and advice were written by TappyAI from the official material, not quoted verbatim."),
        Triple("scam_verdict_msg_subtitle", "Dán tin nhắn hoặc mô tả ngắn tình huống đáng ngờ. TappyAI đối chiếu với các tình huống lừa đảo đã được Bộ Công an cảnh báo.", "Paste a message or briefly describe a suspicious situation. TappyAI compares it with the scam scenarios the Ministry of Public Security has warned about."),
        Triple("scam_verdict_msg_privacy", "Đối chiếu bằng danh sách tình huống và quy tắc có sẵn: không dùng AI, không lưu nội dung tin nhắn.", "Matched against a built-in list of scenarios and rules: no AI is used and the message text is not stored."),
        Triple("scam_qr_no_verdict", "TappyAI chưa kiểm tra nội dung này. Đừng làm theo hướng dẫn trong đó nếu bạn không chắc; hãy xác minh qua kênh chính thức.", "TappyAI has not checked this content. Do not follow instructions in it if you are unsure; verify through an official channel."),
        Triple("scam_qr_kind_payment", "Loại mã: thanh toán", "Type: payment"),
        Triple("scam_qr_warn_payment", "TappyAI không tự thanh toán. Chỉ trả tiền khi chính bạn biết rõ người nhận và số tiền; đừng quét mã thanh toán do người lạ gửi.", "TappyAI never pays for you. Only pay when you personally know the recipient and the amount; do not scan payment codes sent by strangers."),
        Triple("scam_qr_kind_wifi", "Loại mã: Wi-Fi", "Type: Wi-Fi"),
        Triple("scam_qr_warn_wifi", "TappyAI không tự kết nối Wi-Fi. Mã lạ có thể dẫn vào mạng giả mạo.", "TappyAI never joins a Wi-Fi network for you. An unknown code can lead you onto a fake network."),
        Triple("scam_qr_kind_contact", "Loại mã: danh bạ (thẻ liên hệ)", "Type: contact card"),
        Triple("scam_qr_warn_contact", "TappyAI không tự lưu vào danh bạ của bạn.", "TappyAI never saves anything to your contacts."),
        Triple("scam_qr_kind_phone", "Loại mã: số điện thoại", "Type: phone number"),
        Triple("scam_qr_warn_phone", "TappyAI không tự gọi. Kẻ lừa đảo hay dùng số lạ — đừng gọi lại nếu bạn không chắc.", "TappyAI never places a call. Scammers often use unknown numbers — do not call back if you are not sure."),
        Triple("scam_qr_kind_sms", "Loại mã: tin nhắn SMS", "Type: SMS message"),
        Triple("scam_qr_warn_sms", "TappyAI không tự nhắn tin.", "TappyAI never sends a message."),
        Triple("scam_qr_kind_email", "Loại mã: email", "Type: email"),
        Triple("scam_qr_warn_email", "TappyAI không tự gửi email.", "TappyAI never sends an email."),
        Triple("scam_qr_kind_geo", "Loại mã: vị trí", "Type: location"),
        Triple("scam_qr_warn_geo", "TappyAI không tự mở bản đồ.", "TappyAI never opens a map."),
        Triple("scam_qr_kind_app_link", "Loại mã: liên kết mở ứng dụng", "Type: app link"),
        Triple("scam_qr_warn_app_link", "Đây là liên kết mở một ứng dụng khác. TappyAI không tự mở nó; chỉ mở nếu bạn tin người gửi.", "This link opens another app. TappyAI will not open it; open it only if you trust whoever sent it."),
        Triple("scam_qr_kind_text", "Loại mã: văn bản", "Type: text"),
        Triple("scam_qr_warn_text", "Nội dung này chưa được kiểm tra. Đừng làm theo hướng dẫn trong đó nếu bạn không chắc.", "This content has not been checked. Do not follow instructions in it if you are not sure."),
        Triple("scam_qr_title", "Mã QR này không chứa đường link web", "This QR code does not contain a web link"),
        Triple("scam_qr_content", "Nội dung đọc được", "What was read"),
        Triple("scam_qr_privacy", "Ảnh QR được đọc ngay trên thiết bị của bạn và không được tải lên máy chủ.", "The QR image is read on your device and is not uploaded to a server."),
        Triple("scam_share_button", "Cảnh báo cho mọi người", "Warn your group"),
        Triple("scam_share_hint", "Tạo trang công khai với kết quả kiểm tra để gửi vào nhóm Zalo, Messenger…", "Creates a public page with this verdict to send into Zalo, Messenger…"),
        Triple("scam_share_title", "Kiểm tra lừa đảo: %1\$s — TappyAI", "Scam check: %1\$s — TappyAI"),
        Triple("scam_share_failed", "Không thể tạo liên kết lúc này", "Could not create the link right now"),
        Triple("scam_shield_error_invalid_url", "URL không hợp lệ", "Invalid URL"),
        Triple("scam_shield_error_private_url", "Không thể kiểm tra địa chỉ mạng nội bộ", "Cannot check internal network addresses"),
        Triple("scam_shield_error_rate_limit", "Bạn đã kiểm tra quá nhiều lần. Thử lại sau.", "Too many checks. Try again later."),
        Triple("scam_shield_error_daily_limit", "Đã hết lượt kiểm tra hôm nay. Quay lại ngày mai.", "Daily check limit reached. Come back tomorrow."),
        Triple("scam_shield_error_generic", "Không thể kiểm tra URL", "Could not check this URL"),
        Triple("scam_shield_error_qr_decode", "Không thể đọc mã QR", "Could not read QR code"),
        Triple("scam_shield_error_qr_no_url", "Mã QR không chứa liên kết", "QR code does not contain a link"),
        Triple("scam_shield_error_qr_failed", "Không thể kiểm tra mã QR", "Could not check QR code"),
    )

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }

    private fun strings(dir: String): Map<String, String> {
        val out = HashMap<String, String>()
        for (f in listOf("strings_scam_local.xml", "strings_scam_shield.xml")) {
            val xml = File(root(), "app/src/main/res/$dir/$f").readText()
            for (m in Regex("""<string name="([a-z_0-9]+)"[^>]*>([^<]*)</string>""").findAll(xml)) {
                out[m.groupValues[1]] = m.groupValues[2].replace("\\'", "'").replace("&amp;", "&")
            }
        }
        return out
    }

    @Test fun `every sentence equals the web's, in Vietnamese and in English`() {
        val vi = strings("values-vi")
        val en = strings("values")
        assertTrue(expected.size >= 55)
        expected.forEach { (name, wantVi, wantEn) ->
            assertEquals("vi $name", wantVi, vi[name])
            assertEquals("en $name", wantEn, en[name])
        }
    }
}
