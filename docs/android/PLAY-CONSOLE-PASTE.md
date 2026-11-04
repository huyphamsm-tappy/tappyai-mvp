# Play Console — nháp dán sẵn (soạn đêm 30/9→1/10; BẢN CHỐT 02/10 ở mục H — AAB cuối vc11 `101a359`, thay mọi [CẦN HUY…])

Nguyên tắc: mỗi dòng có căn cứ file:dòng. Chỗ chưa chắc ghi **[CẦN HUY XÁC NHẬN]**. Không có bước nào ở đây đã được làm trên Play Console
(cần đăng nhập — việc của Huy). Bản nháp Data safety gốc (29/09) nằm ở `docs/release/PLAY-LISTING.md` §1–§2; file này là bản
đã đối chiếu lại với code hôm nay và thêm 3 chỗ LỆCH mới (mục A0).

---

## A00. Trạng thái THẬT trên Play Console (đọc bằng giao diện, 01/10 ~16:00 — chỉ đọc, không bấm Lưu)

App `TappyAI` (`com.tappyai.app`), developer `8432653893384135278`. Tôi chỉ mở trang, đọc, chụp; không bấm Save/Lưu/Gửi/Bắt đầu phát hành; ở Google Cloud không bấm Save/Delete.
(Hai lần tôi lỡ tick ô chọn một dòng OAuth client trong danh sách Credentials làm nút Delete sáng lên — **đã bỏ tick ngay, không bấm Delete, không client nào bị đổi/xoá**; nói thẳng để anh biết.)

**Mã phiên bản theo kênh** (Kiểm thử và phát hành → Gói và bản phát hành mới nhất, và "Tất cả gói ứng dụng"):
| Kênh | versionName (versionCode) | Trạng thái |
|---|---|---|
| Sản xuất ("Phát hành công khai") | — | **Bản nháp**, 0/178 quốc gia, "Không hoạt động"; nút «Tạo bản phát hành mới» đang xám trên trang này |
| Thử nghiệm khép kín (alpha) | 0.1.3 (**8**) | Đã cung cấp cho người chơi thử, 178 quốc gia, cập nhật 25/08/2026 |
| Thử nghiệm nội bộ | 0.1.0 (**2**) | Đã phát hành cho người thử nội bộ, 09/08/2026 |
| Thử nghiệm công khai | — | chưa dùng ("Bắt đầu") |
| Tất cả gói (6 bản) | 8 (0.1.3) đang hoạt động · 6 (0.1.0) · 5 (0.1.1) · 4 (0.1.0) · 2 (0.1.0) đang hoạt động · 1 (0.1.0) | **versionCode cao nhất đã tải lên = 8** |
→ **versionCode 10 (AAB đã build) CAO HƠN 8 và chưa từng dùng ⇒ KHÔNG phải đổi versionCode.** versionName `1.0.0` > `0.1.3` cũng ổn.

**Trạng thái phát hành**: Trang tổng quan ghi nguyên văn «Xin chúc mừng! Ứng dụng của bạn đã được cấp quyền phát hành công khai trên Google Play» (đã có quyền truy cập sản xuất); tiến độ «Đã hoàn thành 1/5 đầu việc»: việc đã xong = «Tạo bản phát hành mới» (bản nháp); **còn chưa làm**: «Chọn quốc gia và khu vực», «Xem trước và xác nhận bản phát hành», «Gửi bản phát hành cho Google xem xét», «Phát hành ứng dụng của bạn trên Google Play». «Tổng quan về việc xuất bản»: chế độ xuất bản có quản lý ĐANG TẮT, không có thay đổi nào chưa xuất bản; ngày xuất bản gần nhất 25/08/2026. Kiểm thử kín alpha đã chạy từ 25/08 (> 14 ngày). Cảnh báo duy nhất liên quan (trang Kiểm thử và phát hành, bản 8 (0.1.3), mục «Trải nghiệm người dùng», chỉ khuyến nghị): «Có thể một số người dùng sẽ không thấy màn hình tràn viền … Một hoặc nhiều API bạn dùng hay tham số bạn thiết lập cho chế độ hiển thị tràn viền cũng như chế độ hiển thị cửa sổ không còn được dùng trên Android 15. Ứng dụng của bạn sử dụng các API hoặc tham số lỗi thời sau đây: android.view.Window.setStatusBarColor, android.view.Window.setNavigationBarColor, LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES. Các API hoặc tham số này bắt đầu ở những vị trí sau: kotlinx.serialization.internal.IntArraySerializer.<clinit>, androidx.lifecycle.ReportFragment.onPause, androidx.credentials.provider.a.r» (đến từ thư viện, không chặn phát hành). Một thông báo lỗi giao diện thoáng qua của chính Play Console: «Đã xảy ra lỗi bất ngờ. Vui lòng thử lại. (69A376A2)» (không phải cảnh báo của app).

**Nội dung ứng dụng — 10 khai báo đã xử lý, mục "Cần chú ý" TRỐNG** (không có khai báo nào bị treo). So với mã:
| Khai báo | Đang ghi trên Play (sửa lần cuối) | Thực tế mã | Kết luận |
|---|---|---|---|
| **An toàn dữ liệu** | «Ứng dụng không thu thập hay chia sẻ dữ liệu» và «Dữ liệu chưa được mã hoá» (6/08/2026) | thu thập vị trí, tên/email, ngày sinh, ảnh/video, tin nhắn, mã thiết bị, analytics (mục A bên dưới); mã hoá khi truyền = CÓ | 🚨 **SAI NGHIÊM TRỌNG — phải khai lại trước khi công khai** (Play đối chiếu với `/privacy` và với SDK trong app; khai "không thu thập" khi app có Firebase + đăng nhập là vi phạm) |
| Chính sách quyền riêng tư | `https://www.tappyai.com/privacy` (4/08) | đúng URL; nội dung web đã nêu OpenAI (R27) | ĐÚNG (chờ web lên production) |
| Nội dung và đối tượng mục tiêu | nhóm tuổi **16–17 và 18 trở lên** (4/08) | app chặn tính năng dưới 18 (`AgeCheck.kt`) và chính sách ghi 18+ | **LỆCH nhẹ** — nên chỉ để «18 tuổi trở lên» (Play: app có nhóm 16–17 bị coi là có thể có trẻ vị thành niên → yêu cầu thêm). **Huy tự bấm sửa** |
| Mức phân loại nội dung | PEGI 3 / ESRB E / USK 0 / IARC 3+ / ClassInd 14… (4/08) | app có nội dung do người dùng tạo (UGC) + tương tác người dùng, AI chat | **NÊN LÀM LẠI bảng câu hỏi IARC**: tick "người dùng có thể tương tác / chia sẻ nội dung do người dùng tạo"; mức 3+ có thể sai. Chưa kiểm câu trả lời chi tiết (không mở bảng câu hỏi) |
| Thông tin đăng nhập | «Tất cả hoặc một vài chức năng bị hạn chế» (4/08) | đăng nhập Zalo/Google/email; khách dùng được | cần **hướng dẫn cho người xem xét** (mục D) — tôi chưa đọc nội dung đã điền |
| Quảng cáo | «Ứng dụng không chứa quảng cáo» | đúng (có link đối tác affiliate, không SDK quảng cáo) | ĐÚNG |
| Mã nhận dạng quảng cáo | «Không sử dụng mã nhận dạng cho quảng cáo» | đúng (`AD_ID` đã gỡ) | ĐÚNG |
| Ứng dụng sức khoẻ / Tính năng tài chính / Ứng dụng của chính phủ | không | đúng (không Play Billing; xem mục B) | ĐÚNG |
| **Xoá tài khoản** | không có khai báo riêng trong danh sách — nằm trong wizard «An toàn dữ liệu» (chưa hiện vì khai "không thu thập") | xoá NGAY trong app + `/delete-account` | **phải khai khi làm lại Data safety** (mục B) |

---

## A01. Google đăng nhập — SHA khoá ký (đọc Play Console + Google Cloud, 01/10)
**Play (Được bảo vệ bằng Play → Dịch vụ bảo vệ của Cửa hàng Play → Quản lý tính năng ký ứng dụng của Play)**:
- **Khoá tải lên** (chứng chỉ khoá tải lên): SHA-1 `33:09:7D:22:37:01:D0:1F:08:C6:E2:AA:82:19:AA:FE:F1:BD:28:24`, SHA-256 `02:5B:35:4D:1C:37:7B:DC:F3:D6:49:4A:71:8E:6B:2D:A4:56:2F:73:2B:CE:0A:42:11:9C:9B:09:37:74:5C:C7` — **trùng chứng chỉ ký AAB vc10 (đã đối chiếu)**.
- **Khoá ký ứng dụng đang dùng** — có hai chứng chỉ ("Khoá cổ điển" và "Khoá mã hoá hậu lượng tử", trạng thái «Đang được sử dụng», «Sẵn sàng cho điện toán lượng tử (beta)»): **cổ điển** SHA-1 `C2:0A:A1:27:E8:4C:2A:17:35:82:67:77:DA:A1:08:65:EF:2B:A9:1D`, SHA-256 `F9:30:19:21:FC:D0:51:14:62:8B:13:E4:E3:99:69:B8:66:45:91:00:18:EB:87:AF:DC:99:F7:F2:6E:F7:24:2D`; **hậu lượng tử** SHA-1 `7F:2B:3A:E0:A8:7A:01:77:D0:35:7E:3F:31:00:6B:59:8E:11:E5:8A`, SHA-256 `0B:D1:D9:0C:9C:27:1B:45:A1:74:66:08:5B:50:DD:EB:17:40:F3:C6:D4:79:DE:75:3F:5E:1A:17:EE:D9:46:73`. Số liệu "lượt cài đặt" của khoá này: 0,0%.
- **Khoá ký ứng dụng TRƯỚC ĐÓ** (dùng lần đầu 04/08/2026 07:21, lượt cài 0%): SHA-1 `12:BD:98:F6:10:31:59:F6:65:06:E4:B1:DA:D2:72:F9:44:94:06:9F`.
- Cũng trên trang đó, JSON Digital Asset Links cho `com.tappyai.app` ghi SHA-256 `29:62:B4:76:E0:99:7F:C9:AC:FE:32:6E:5C:39:8C:ED:FE:95:EB:42:B7:D4:01:3D:65:1A:63:89:BB:35:6E:A1` — **không trùng với cả hai chứng chỉ "đang dùng" ở trên**; tôi không giải thích được (có thể là chứng chỉ thứ ba/khoá khác); **chưa kiểm**.
**Google Cloud, dự án `aerobic-lock-498409-u7` (đọc từng client, không Save/Delete):**
| OAuth client (Android) | package | SHA-1 | Lần dùng gần nhất |
|---|---|---|---|
| Android release (upload key, local builds) | `com.tappyai.app` | `33:09:7D:22:37:01:D0:1F:08:C6:E2:AA:82:19:AA:FE:F1:BD:28:24` (= khoá tải lên) | 30/08/2026 |
| Android release (Play deployment cert) | `com.tappyai.app` | `12:BD:98:F6:10:31:59:F6:65:06:E4:B1:DA:D2:72:F9:44:94:06:9F` (= khoá ký TRƯỚC ĐÓ) | 28/08/2026 |
| Android client 1 | **`com.tappyai.app.debug`** | `B1:90:A7:B0:F0:30:29:F7:AD:0E:7A:4C:F2:AE:FB:27:3F:02:54:2F` (khoá debug của máy build) | 22/08/2026 |
**Kết luận:** SHA-1 của khoá ký ĐANG DÙNG (`C2:0A:A1:…` cổ điển, `7F:2B:3A:…` hậu lượng tử) **CHƯA có trong client nào của dự án này**; chỉ khoá ký trước đó (`12:BD:98:…`) và khoá tải lên có. Hệ quả: bản cài từ Play **ký bằng khoá hiện tại** nhiều khả năng sẽ lỗi «không có thông tin đăng nhập» ở Google login cho tới khi thêm SHA-1 hiện tại. «Save failed: Requested entity already exists» mà anh gặp có nghĩa tổ hợp *package + SHA-1* đó **đã tồn tại ở một client khác trong dự án này HOẶC ở dự án khác** (Google chỉ cho một client duy nhất cho mỗi cặp (package, SHA-1) trên toàn hệ thống). Trong dự án này **không có** client nào mang `C2:0A:A1…` (đã đọc cả 3 client Android) ⇒ khả năng cao client đó nằm ở **một dự án khác**. Bộ chọn dự án của anh hiện 6 dự án: `TappyAI` (aerobic-lock-498409-u7), và 5 dự án tên "My Project": `imposing-league-499203-q8`, `speedy-method-500203-f2`, `pristine-skein-499103-g8`, `boreal-physics-499008-a1`, `sixth-impulse-499009-a2`. **Chưa kiểm** 5 dự án đó (không mở). Cách xử lý đã đề xuất: tạo client Android MỚI với tên khác (không sửa client cũ) hoặc tìm trong 5 dự án kia client mang `C2:0A:A1…`.
**Với APK UAT** (package `com.tappyai.app.staging`, ký bằng khoá debug `B1:90:A7:…`): **không có client nào cho `.staging`** ⇒ Google login trên APK UAT sẽ lỗi «không có thông tin đăng nhập» — **đó là thiếu khai báo SHA/package, không phải lỗi app**. Tôi không kiểm được Google login trên máy thật.
`google-services.json` (repo, chỉ tên/vân tay công khai): 3 app `com.tappyai.app`, `.debug`, `.staging`; mọi `oauth_client` chỉ là loại web (type 3); Firebase API trả **0 vân tay** cho cả 3 app (đọc 01/10).

---

## A02. UGC — Chính sách Google Play và mã Android (đọc 01/10)
Nguồn: support.google.com/googleplay/android-developer/answer/9876937 (Chính sách Nội dung do Người dùng Tạo). Yêu cầu (trích ngắn): (1) «Requires users accept the app's terms of use and/or user policy before users can create or upload UGC»; (2) định nghĩa nội dung/hành vi bị cấm trong điều khoản; (3) «Conducts UGC moderation, as is reasonable and consistent with the type of UGC hosted»; (4) «in-app system for reporting and blocking objectionable UGC and users» — «functionality to report users and content, and to block users» với app có UGC công khai/nhận diện người dùng; (5) nội dung tình dục ẩn mặc định sau bộ lọc; (6) trẻ vị thành niên bị cấm bằng sàng lọc tuổi.
| Yêu cầu | Trong mã Android (rc) | Kết luận |
|---|---|---|
| Đồng ý điều khoản trước khi đăng | Màn đăng nhập ghi «Bằng cách tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật»; **không có bước chấp nhận riêng trước khi đăng bài** (`reviews/ui/ReviewComposerScreen.kt`: không thấy) | **ĐỦ MỘT PHẦN** (đồng ý khi đăng nhập; chưa thấy ở composer) |
| Điều khoản định nghĩa nội dung cấm | Điều khoản dịch vụ web (`profile/TermsOfServiceScreen.kt` → web) | CÓ (chưa đọc kỹ nội dung) |
| Kiểm duyệt | Phía server: `publication_state`/trạng thái «bị hạn chế/ẩn» hiện cho tác giả (`myreviews/MyReviewsScreen.kt:229-330`); cổng an toàn nội dung `CONTENT_SAFETY_GATE_ENABLED` (RELEASE-PLAN: hiện TẮT trên production, bật sau release) | **CÓ một phần**, phụ thuộc cờ server |
| **Báo cáo nội dung/người dùng TRONG APP** | **KHÔNG CÓ cho bài/clip/bình luận/người dùng.** Chỉ có «Báo cáo» cho tin nhắn của AI (`chat/ChatScreen.kt:414` `onReportMessage`). Đường báo cáo duy nhất: hàng «Chính sách bản quyền — Báo cáo nội dung vi phạm» mở trang web `/copyright` (`profile/SettingsScreen.kt:237-250`) | **THIẾU (trong app)** |
| **Chặn người dùng** | **KHÔNG CÓ** (grep `block` = 0) | **THIẾU** |
| Liên hệ về vi phạm | `support@tappyai.com`, `/copyright` | CÓ |
| Sàng lọc tuổi | cổng 18+ trước chat AI/đăng bài (`age/AgeCheck.kt`) | CÓ |
**Hệ quả với phát hành công khai:** app cho đăng ảnh/clip/bình luận công khai mà thiếu «báo cáo nội dung/người dùng trong app» và «chặn người dùng» ⇒ **rủi ro cao bị Google từ chối/gỡ khi xem xét** theo chính sách UGC. Huy 29/09 hoãn phần báo cáo/chặn sang Phase 8 và hẹn công khai sau Phase 8; hôm nay Huy đổi sang công khai bản Phase 7 ⇒ **đây là điểm lệch quyết định cần Huy cân nhắc**. Tôi KHÔNG sửa mã (theo lệnh). Tuỳ chọn giảm rủi ro không cần mã: khai UGC trung thực trong bảng IARC; cân nhắc tắt/ẩn tạm tính năng đăng bài công khai trong bản công khai đầu (cần mã — quyết định riêng).

---

## A0. Ba điều đã đổi so với bản nháp 29/09 — đọc trước khi dán

1. **Bên xử lý AI đã đổi từ Anthropic sang OpenAI (GPT-6 Luna).** `src/lib/ai/llm/registry.ts:13,51` — mặc định `openai`, `claude` chỉ là rollback.
   Nội dung chat, ảnh gửi trong chat, văn bản dịch / Viết content / kiểm tra lừa đảo giờ đi tới OpenAI.
   - **Cập nhật 01/10:** phiên web đã sửa `/privacy` (commit `16e5256`, `legal.ts`) ghi OpenAI + wttr.in, Upstash, Brevo, Overpass, Google Maps Platform — **chờ Huy duyệt chữ**. Data safety phải khai OpenAI nhận nội dung chat (web đã trả lời "CÓ", R27).
   - Quyết định của Huy 29/09 ("bên xử lý, không tính chia sẻ") nêu đích danh Anthropic, chưa nêu OpenAI.
   → **[CẦN HUY XÁC NHẬN]** coi OpenAI cũng là bên xử lý thay mặt TappyAI (nếu không → khai "Có chia sẻ" cho Tin nhắn / Ảnh). Không gửi Data safety trước khi /privacy mới lên production (Play đối chiếu hai bên).
2. **Firebase Analytics CÓ trong bản release** (`android/core/analytics/build.gradle.kts:35`, `FirebaseAnalyticsProvider.kt:27`); comment sai ở
   `android/app/build.gradle.kts:446-449` ("no Analytics") **đã sửa 01/10** cho khớp. Manifest release có `AppMeasurementService/Receiver`.
   **Đo thực tế (emulator, bản UAT, 01/10, `adb shell setprop log.tag.FA VERBOSE`):** logcat in `App measurement collection enabled` rồi
   `App measurement initialized` ⇒ **thu thập BẬT mặc định, không có công tắc trong app** (không có `setAnalyticsCollectionEnabled`, không có meta-data
   `firebase_analytics_collection_*` trong manifest). Dòng từng sự kiện ở logcat tôi **chưa bắt được** (cả chế độ debug) — danh sách sự kiện dưới đây dựa trên code + tài liệu Google, không phải bắt gói tin.
   - **Sự kiện của app (đóng, `Ga4Taxonomy.kt:24-44`):** `sign_up`, `login` (+method, is_first_login), `login_failed`, `logout`, `chat_response`, `save_place`, `search` (chỉ `search_type`), `review_like`, `share`, `recommendation_click`, `report_submitted`, `scam_check`, `chat_opened`, `affiliate_click`, `shopping_search_click`… Tham số chỉ enum/boolean; **không** user id, tên địa điểm, truy vấn, nội dung tin nhắn, URL, token (`FirebaseAnalyticsProvider.kt:11-14`, sự kiện lạ bị bỏ). `screen_view` kèm tên màn hình đã che id (`:33-38`).
   - **Sự kiện TỰ ĐỘNG của Firebase** (tài liệu Google, support.google.com/analytics/answer/9234069, đọc 01/10): `first_open`, `session_start`, `user_engagement`, `screen_view`, `app_update`, `os_update`, `app_remove`, `notification_receive/open/…`, `app_exception`… cùng ID phiên và ID thể hiện ứng dụng (app-instance id). Tài liệu không liệt kê rõ model máy / hệ điều hành / quốc gia trong mục đó — **chưa kiểm** phần này.
   - Advertising ID **không** thu: `AndroidManifest.xml:26-27` gỡ `AD_ID`, `:74` `google_analytics_adid_collection_enabled=false` (manifest release đã gộp: không có `AD_ID` / `ACCESS_ADSERVICES_AD_ID`). Cờ đồng ý quảng cáo của GA (`ad_storage`, `ad_personalization`…) **không đặt** nên theo mặc định của Firebase (tôi chưa kiểm mặc định này trên tài liệu Android — chưa kiểm).
   - **TẮT được không:** theo tài liệu Firebase có thể (runtime `setAnalyticsCollectionEnabled(false)` — đã thấy trong tài liệu; công tắc trong manifest tôi chỉ nhớ tên `firebase_analytics_collection_enabled` / `firebase_analytics_collection_deactivated`, **chưa kiểm** được tên chính xác từ nguồn). Tắt đòi hỏi bản build mới.
   - **[CẦN HUY QUYẾT — tôi KHÔNG tự tắt]:** (A) giữ như hiện tại, khai "Có thu thập — Tương tác trong app, Mã thiết bị; mục đích Phân tích; không chia sẻ; bắt buộc"; (B) thêm công tắc đồng ý trong Cài đặt (mặc định tắt) — thay đổi sản phẩm, cần bản mới; (C) tắt hẳn Analytics bản này — GA4 mất số liệu Android, bỏ được dòng Analytics khỏi Data safety nhưng FCM token vẫn là "Mã thiết bị". Khuyến nghị của tôi: (A) cho lần phát hành đầu vì đã có trong `/privacy`, nhưng đó là quyết định của anh.
3. **Cờ xoá tài khoản**: xem mục B — web đã chốt hợp đồng (xoá NGAY khi cờ BẬT; cờ TẮT = email); thiết kế "24 giờ" không có trong code.

---

## A. Data safety — câu trả lời

**Câu chung**

| Câu hỏi Play | Trả lời | Căn cứ |
|---|---|---|
| Thu thập hoặc chia sẻ dữ liệu người dùng? | **Có thu thập. Không chia sẻ** (theo quyết định 29/09: bên xử lý ≠ chia sẻ; OpenAI **[CẦN HUY XÁC NHẬN]**) | bảng dưới |
| Mã hoá khi truyền? | **Có** | API release `https://www.tappyai.com/` (`android/app/build.gradle.kts:94`, kiểm giá trị bắt buộc `:178`). Manifest release đã gộp KHÔNG có `usesCleartextTraffic`, KHÔNG có `networkSecurityConfig` → cleartext bị chặn mặc định (targetSdk 36). Cấu hình cho phép cleartext chỉ ở `src/debug/res/xml/network_security_config.xml:8`, không vào release. Token đăng nhập lưu mã hoá trên máy: `core/security/.../EncryptedTokenStorage.kt:5`; file token và file state callback loại khỏi sao lưu: `res/xml/backup_rules.xml`, `data_extraction_rules.xml` |
| Người dùng yêu cầu xoá dữ liệu được không? | **Có** (mục B) | |
| Dành cho trẻ em? | **Không** (18+) | cổng tuổi `age/AgeCheck.kt:91-115` |

**Từng loại dữ liệu** (Thu = có gửi khỏi máy; Chia sẻ = Không cho mọi dòng, theo quy tắc bên xử lý)

| Loại trong Play | Thu | Mục đích | Bắt buộc? | Căn cứ trong code |
|---|---|---|---|---|
| Vị trí → **Chính xác** (và Gần đúng) | Có | Chức năng ứng dụng (gợi ý quanh bạn) | **Tuỳ chọn** (xin quyền, từ chối vẫn dùng được) | quyền `AndroidManifest.xml:17-18`; đọc vị trí `chat/data/ChatLocationSource.kt:35`; gửi mỗi lượt chat `chat/data/RealChatRepository.kt:70` (`userLocation`). Không có dịch vụ nền. Lưu trữ phía server: chưa thấy cột vị trí trong migration, nhưng log máy chủ có thể giữ **[CẦN HUY XÁC NHẬN]** thời hạn log. Nếu server chỉ xử lý trong bộ nhớ và không lưu, có thể xin miễn khai "ephemeral" — chưa kiểm, khai "có thu" cho an toàn |
| Thông tin cá nhân → **Tên**, **Email**, **Mã người dùng** | Có | Quản lý tài khoản; chức năng | Tuỳ chọn (khách vẫn dùng, có mã ẩn danh) | đăng nhập `features/auth/.../AuthRepository.kt`; Google `GoogleSignInClient.kt:40-70` (Credential Manager); Zalo `ZaloSignInClient.kt`; hồ sơ `PATCH/GET api/profile` |
| Thông tin cá nhân → **Thông tin khác** (ngày sinh, cổng 18+) | Có | Chức năng (xác nhận đủ 18 tuổi); an toàn | Bắt buộc để dùng chat AI / đăng bài | `age/AgeCheck.kt:104` (`DobRequestDto`), `:115` (`PATCH api/profile`) |
| Ảnh và video → **Ảnh**, **Video** | Có | Chức năng (đăng bài, ảnh đại diện/bìa, gửi ảnh cho AI) | Tuỳ chọn | bộ chọn hệ thống, không xin quyền camera/đọc thư viện; video 3 bước `reviews/data/VideoUploader.kt:31-34` (→ Google Cloud Storage) |
| Âm thanh → Ghi âm | **Không** | — | — | nhập giọng nói dùng `SpeechRecognizer` của hệ thống (`chat/ChatViewModel.kt:395`); app chỉ nhận chữ, không tải âm thanh lên (không có route `upload/audio` trong app: grep = 0). Quyền `RECORD_AUDIO` `AndroidManifest.xml:20` chỉ để gọi dịch vụ nhận giọng. **[CẦN HUY XÁC NHẬN]**: trình nhận giọng của hệ thống/Google có thể gửi âm thanh ra ngoài theo chính sách của Google, không do app kiểm soát |
| Tin nhắn → **Tin nhắn khác trong app** | Có | Chức năng (chat AI, nhắn tin giữa người dùng) | Tuỳ chọn | `chat/data/RealChatRepository.kt:70`; lưu hội thoại phía server (`/api/conversations`) |
| Nội dung người dùng tạo khác (review, bình luận, bio, chủ đề Viết content, văn bản dịch, tin nghi lừa đảo) | Có | Chức năng | Tuỳ chọn | `reviews/`, `vietwriter/`, `scam/` |
| Hoạt động trong app → **Tương tác trong app**, **Lịch sử tìm kiếm trong app** | Có | Phân tích; chức năng | Bắt buộc (không có nút tắt) | Firebase Analytics, taxonomy đóng, không id/nội dung/truy vấn/PII: `core/analytics/.../Ga4Taxonomy.kt:24-44`, `FirebaseAnalyticsProvider.kt:27` (sự kiện chưa có trong taxonomy bị bỏ); `screen_view` đã che id `:33-38`. Bảng nối bấm link đối tác (`commerce_click_attributions`, sub1 ngẫu nhiên) thuộc mục này: phía server, `docs/release/PLAY-LISTING.md` §1 |
| **Mã thiết bị hoặc mã khác** | Có | Chức năng (FCM token); phân tích (app-instance id của Firebase) | Bắt buộc | `notifications/data/NotificationSubscriptionRepository.kt:27` (`register(token)`), `notifications/TappyFirebaseMessagingService`; Analytics tự tạo app-instance id |
| Thông tin & hiệu năng app (crash, chẩn đoán) | **Không** | — | — | không có Crashlytics/Sentry (grep = 0; `core/logging` chỉ có seam, không gửi đi) |
| Tài chính / mua hàng | **Không** | — | — | không có Play Billing/RevenueCat trong `app/build.gradle.kts` |
| Danh bạ, lịch, tệp, SMS, cuộc gọi, sức khoẻ | **Không** | — | — | không khai quyền tương ứng (manifest release đã gộp: 11 quyền, xem báo cáo đêm) |
| Advertising ID | **Không** | — | — | `AndroidManifest.xml:26-27,74` |

**Còn phải hỏi Huy trước khi gửi** (tôi không tự đoán): (1) OpenAI là bên xử lý; (2) Serper, OSM Overpass/Nominatim, Google Web Risk,
Travelpayouts cũng coi là bên xử lý (Overpass là API công cộng không có hợp đồng xử lý — nếu muốn chặt thì khai "Vị trí: có chia sẻ");
(3) thời hạn giữ log máy chủ và sự kiện GA4; (4) SĐT: app Android không hỏi SĐT, nhưng SĐT người dùng nhập trên web (đặt chỗ) hiện lại trong app.

---

## B. Khai báo xoá tài khoản (cập nhật 01/10 theo hợp đồng CUỐI của web — `ANDROID-REQUESTS.md` R26, `ENV-RELEASE-CHECKLIST.md` §1)

**Quyết định của Huy 01/10: cờ `ACCOUNT_SELF_DELETE_ENABLED` BẬT khi release → khai trong Play: «xoá tài khoản NGAY trong app» + link web.** Bản Android: hàng chữ thường kín đáo ở Cài đặt → Khác; màn xác nhận dùng đúng chữ R29 (xem ảnh `overnight-2026-10-01/delete-confirm-*.png`); nhánh cờ TẮT (chỉ mở email) vẫn nằm trong mã nhưng KHÔNG chạy trong bản release nếu cờ bật (thứ tự release: áp D1/D2/D4 → bật cờ → xoá thử tài khoản test — `ENV-RELEASE-CHECKLIST.md` §1).

**URL trang xoá trên web:** `https://www.tappyai.com/delete-account` (nội dung trang đổi theo cờ — `src/app/delete-account/page.tsx`).

**Hợp đồng thật (web đã chốt, KHÔNG phải "ghi yêu cầu → 24 giờ"):** `POST /api/account/delete` `{"confirm":"XÓA"|"XOÁ"|"DELETE"}` xoá NGAY (`auth.admin.deleteUser`, DB cascade);
tệp ảnh/video/âm thanh do cron 01:45 giờ VN dọn trong 48 giờ. 404 `not_available` = cờ TẮT. Cờ `ACCOUNT_SELF_DELETE_ENABLED` (chỉ `true` mới BẬT, Production mặc định TẮT), app đọc `GET /api/config` → `flags.accountSelfDelete`.
Thiết kế "24 giờ" mà Huy nêu **không có trong code ở bất kỳ client nào**; web nói đổi sang đó là quyết định riêng đụng cả 3 client. Android làm theo web, không tự đoán.

**Trong app (Android, đọc code `profile/SettingsScreen.kt:268-275`, `DeleteAccountDialog.kt` + chụp emulator UAT 01/10):**
- Đường vào: **Tôi → Cài đặt → mục «KHÁC» → hàng cuối «Yêu cầu xóa tài khoản» / «Xóa tài khoản»**. Từ 01/10 là hàng **kín đáo** (ô nền xám, chữ thường, không đỏ) — vẫn là hàng cuối của mục Khác nên dễ tìm.
- **Cờ TẮT** (UAT, và Production theo mặc định): hàng «Yêu cầu xóa tài khoản» → hộp «Yêu cầu xóa tài khoản?» → **Tiếp tục** → mở app email với thư soạn sẵn tới `support@tappyai.com`; không có app email → toast chỉ địa chỉ. **App không xoá, không đăng xuất**; người trực xác minh rồi xoá theo `docs/uat/ACCOUNT-DELETION-REQUEST-RUNBOOK.md` (`/delete-account` hứa 30 ngày, `legal.ts:179`).
- **Cờ BẬT**: hàng «Xóa tài khoản» → hộp liệt kê dữ liệu bị xoá → gõ **XÓA** → «Xóa vĩnh viễn tài khoản» → màn «Tài khoản của bạn đã được xóa…» → đăng xuất → về trang chủ. Khách (ẩn danh) không thấy luồng này (server 403). **CHƯA kiểm trên emulator UAT** (UAT cờ TẮT lúc chạy; web chụp tạm ở `81e8016` rồi gỡ).

**Đủ cho Google Play chưa?** (nguồn: support.google.com/googleplay/android-developer/answer/13327111, đọc 01/10; web trích cùng nguồn trong R26)
- Play yêu cầu CẢ (1) đường xoá tài khoản **trong app** và (2) **link web** để yêu cầu xoá. Email/biểu mẫu được chấp nhận cho phần web; vô hiệu hoá/đóng băng không tính là xoá.
- **Cờ TẮT = app chỉ mở email → có nguy cơ bị từ chối** ở khai báo Data deletion (app cho tạo tài khoản trong app). Tôi **không chắc** Google chấm thế nào — chỉ Google trả lời được; web cũng đánh giá là có nguy cơ.
- **Cờ BẬT** đáp ứng (1)+(2), nhưng hứa xoá hết dữ liệu: `src/lib/account/selfDelete.ts:1-25` nói hợp đồng này đúng khi migration D1/D2/D4 đã áp lên production (RELEASE-PLAN §1; D1/D2/D4 từng "hoãn" 29/09). **Huy quyết** ở `ENV-RELEASE-CHECKLIST.md` §1 (đề xuất của web/Claude: BẬT trước khi nộp AAB). Nếu bật mà D1/D2/D4 chưa áp thì app hứa quá mức — kiểm với phiên web trước.
- iOS (không phải Android): App Store 5.1.1(v) đọc 01/10 — phải có xoá tài khoản TRONG app, link web/email riêng không đủ ⇒ cờ TẮT càng không đạt trên iOS.

**Khai trong Play Console (Data deletion):** "app cho phép tạo tài khoản: Có"; URL xoá = `https://www.tappyai.com/delete-account`; khai "Có" cho xoá trong app **chỉ khi cờ BẬT lúc gửi duyệt** (khai đúng thực tế lúc duyệt — người duyệt mở URL và thử app). Cờ TẮT → khai là "yêu cầu xoá" và chấp nhận rủi ro bị yêu cầu sửa.
**Xoá một phần dữ liệu không cần xoá tài khoản:** Có — xoá từng cuộc chat, trí nhớ AI, bài đăng, bình luận, mục đã lưu (route `DELETE`, `docs/release/PLAY-LISTING.md` §2).
**Lệch cần biết:** `RELEASE-PLAN-2026-09-29.md:170` / `RELEASE-GOVERNANCE.md:103` ghi Production HIỆN `ACCOUNT_SELF_DELETE_ENABLED=true`; release đặt lại theo quyết định của Huy ở trên.

---

## C. (Cũ — Internal testing; Huy đã đổi sang phát hành CÔNG KHAI → dùng mục E) Upload AAB vc10 lên Internal testing

Nguồn: `docs/uat/RELEASE-PLAN-2026-09-29.md` §3(d), `docs/uat/OWNER-TOMORROW-2026-09-30.md` B7. 🔐 = cần Huy đăng nhập Google.

1. 🔐 Mở https://play.google.com/console → chọn app **TappyAI** (`com.tappyai.app`).
2. **Test and release → App integrity → App signing**. So SHA-256 của **Upload key certificate** với AAB:
   `02:5B:35:4D:1C:37:7B:DC:F3:D6:49:4A:71:8E:6B:2D:A4:56:2F:73:2B:CE:0A:42:11:9C:9B:09:37:74:5C:C7` (SHA-1: `33:09:7D:22:37:01:D0:1F:08:C6:E2:AA:82:19:AA:FE:F1:BD:28:24`). Lệch = dừng, không upload.
3. **App bundle explorer** (cùng khu vực Test and release): xác nhận **versionCode 10 chưa từng được upload** (mã dùng lại bị từ chối; bản vc10 build local 28/09 11:58 không được upload).
4. **Test and release → Testing → Internal testing → Create new release**.
5. **Upload** → chọn `D:\TappyAI-backups\TappyAI-release-vc10-68d6639.aab`. Kiểm SHA-256 trước: `79edd00910821470b4e198c7fd4d9915155ac335d214f12f9fd51b0d3df9c058`.
   ⚠️ Nếu phiên web đổi commit release (có thay đổi Android sau `68d6639`) thì AAB này KHÔNG còn đúng — hỏi phiên build lại. Đến 01/10 không có thay đổi Android nào sau `68d6639` trên rc.
6. Release name: `1.0.0 (10)`. Release notes — vi-VN: `Bản phát hành đầu tiên: hỏi đáp AI về ăn uống, mua sắm, du lịch; chia sẻ kế hoạch; kiểm tra lừa đảo.`
   en-US: `First release: AI answers for food, shopping and travel; plan sharing; scam check.`
7. **Next** → sửa mọi lỗi/cảnh báo Play hiện ra (đọc từng cái, báo lại nếu lạ) → **Save** → **Start rollout to Internal testing**.
8. Thêm email của Huy vào danh sách tester (Internal testing → Testers) nếu chưa có → mở link tham gia trên điện thoại → cài từ Play.
9. Thử trên máy: theo `docs/android/HUY-TEST-14-MUC.md`. Đạt hết mới sang bước 10.
10. 🔐 **Promote release → Production** (app vẫn ẩn cho tới khi anh công khai) → xem lại → **Save** → **Send changes for review** (Publishing overview).
    Trước bước này phải xong: Data safety (mục A), khai báo xoá tài khoản (mục B), chính sách quyền riêng tư `/privacy` đã có OpenAI (A0.1).
11. Sau khi Play duyệt và anh công khai: mở `https://play.google.com/store/apps/details?id=com.tappyai.app` bằng cửa sổ ẩn danh rồi mới bật huy hiệu Play trong app (`docs/release/PLAY-LISTING.md`, bước sau công khai).

Các form khác của Play (**App content**: Data safety, Data deletion / account deletion URL, chính sách quyền riêng tư URL `https://www.tappyai.com/privacy`,
đối tượng 18+) — vào **Policy and programs → App content** (tên menu Play đổi theo bản giao diện; tôi chưa kiểm vì cần đăng nhập). Dán từ mục A, B.

---

## D. Ghi chú cho người xem xét của Google (App access / "Thông tin đăng nhập") — chỉ MÔ TẢ, không tạo tài khoản
Dán vào Play Console → Chính sách và chương trình → Nội dung ứng dụng → **Thông tin đăng nhập** (hiện khai «Tất cả hoặc một vài chức năng bị hạn chế»):
> TappyAI works without an account for browsing and for asking Tappy (AI assistant): open the app and tap "Continue as guest" on the sign-in card, or simply use the Home / Chat / Explore / Deals tabs. Features that need an account (saving places, posting reviews and clips, profile, deleting the account) require signing in with Google, Zalo or email + password. A demo account can be provided on request through the contact email in the store listing (support@tappyai.com); we do not publish credentials in this field. Account deletion: Me → Settings → Other → "Delete account" (type the confirmation word), or https://www.tappyai.com/delete-account. Users must be 18+: a date-of-birth step gates chat and posting. User-generated content (reviews, photos, short clips, comments): before a user's first post they must agree to the community rules (a dialog with a link to the Terms of Service); every post and clip has a "Report" action in its "..." menu (reasons: spam, harassment, sensitive content, scam, copyright, other), the reported item disappears from the reporter's feed, and reports reach our moderation queue; violations can also be reported to support@tappyai.com and https://www.tappyai.com/copyright. [ONLY IF the server's blocking feature is enabled on production at submission time, add: "Users can block another user from the post's menu or the profile's menu and manage blocked accounts in Settings; a blocked user's posts and comments are hidden."] Do not write that sentence while the server flags are off.
(Tiếng Việt: app dùng được không cần tài khoản — «Tiếp tục với tư cách Khách»; tính năng cần tài khoản: lưu, đăng bài, hồ sơ, xoá tài khoản. Tài khoản demo: cung cấp theo yêu cầu qua email hỗ trợ; **không tạo tài khoản demo trên production** (đúng quy tắc).) **[CẦN HUY]** nếu muốn Google tự đăng nhập kiểm thử thì phải có tài khoản demo THẬT trên production — việc của Huy/web, không phải của tôi.

## E. Từng bước Huy phải bấm ở Play Console (🔐 = cần đăng nhập — Huy đang ở máy; tôi KHÔNG bấm các nút này)
Chỉ làm SAU khi web báo "OK release" và smoke production xong (mục C).
1. **Data safety** — Policy and programs (Chính sách và chương trình) → **Nội dung ứng dụng** → hàng **An toàn dữ liệu** → **Quản lý** → làm lại wizard 5 bước: (a) *Bảo mật và thu thập dữ liệu*: «có thu thập hoặc chia sẻ» = **Có**; «mọi dữ liệu được mã hoá khi truyền» = **Có**; «cho phép người dùng yêu cầu xoá dữ liệu» = **Có** (URL xoá `https://www.tappyai.com/delete-account`). (b) *Loại dữ liệu*: tick đúng theo bảng ở mục A (vị trí chính xác + gần đúng; tên, email, mã người dùng, ngày sinh; ảnh, video; tin nhắn khác trong app; nội dung do người dùng tạo; tương tác trong app + lịch sử tìm kiếm; mã thiết bị) — **KHÔNG tick**: mã nhận dạng quảng cáo, tài chính, danh bạ, sức khoẻ, âm thanh (nhận giọng nói chạy bằng dịch vụ của hệ thống), nhật ký sự cố. (c) mỗi loại: mục đích (Chức năng ứng dụng / Phân tích / Quản lý tài khoản), «có chia sẻ» = **Không** (bên xử lý: OpenAI, Supabase, Google Cloud, Firebase, Vercel, Upstash theo quyết định của Huy — **cần Huy xác nhận OpenAI**), bắt buộc/tuỳ chọn theo bảng. (d) Xem trước → **Gửi/Lưu**. 🔐
2. **Nội dung và đối tượng mục tiêu** → **Quản lý** → bỏ nhóm 16–17, chỉ để «18 tuổi trở lên» → Lưu. 🔐
3. **Mức phân loại nội dung** → làm lại bảng câu hỏi IARC với «người dùng tương tác/UGC = Có» → Lưu. 🔐
4. **Thông tin đăng nhập** → dán mục D → Lưu. 🔐
5. **Chọn quốc gia và khu vực** cho kênh Sản xuất (Phát hành công khai → tab *Quốc gia/khu vực*): chọn quốc gia (Việt Nam trước; hiện 0/178). 🔐
6. Tạo bản phát hành Sản xuất: Phát hành công khai → **Tạo bản phát hành mới** (nút hiện đang xám — có thể do chưa chọn quốc gia; xem lại sau bước 5) → tải `TappyAI-release-vc11-101a359.aab (SHA-256 451b7035…59a2; thay cho vc11 597698b, 1b12a7c, 684431f và vc10 891be6c — versionCode 11 cao hơn mọi bản đã tải, cao nhất trên Play là 8)` (đường dẫn trong báo cáo) → tên bản `1.0.0 (11)` → ghi chú vi/en → chọn phát hành **từng phần 10–20%** nếu giao diện cho chọn → **Xem trước và xác nhận**. 🔐
7. **Gửi để xem xét / Bắt đầu phát hành** — nút cuối (Trang tổng quan → «Gửi bản phát hành cho Google xem xét» / «Phát hành ứng dụng của bạn…»). 🔐 **Chỉ Huy bấm.**
8. (Tên nút ở bước 7–8 là suy từ giao diện Play thường gặp; tôi chưa thấy vì chưa có bản phát hành — có thể khác chút.) Sau khi phát hành: tăng tỉ lệ ở Phát hành công khai → Quản lý bản phát hành → «Tăng tỷ lệ phát hành»; tạm dừng/gỡ: cùng trang → «Tạm dừng bản phát hành» (nếu có sự cố); theo dõi 24 giờ đầu ở **Theo dõi và cải thiện → Android vitals → Sự cố và lỗi ANR** (ngưỡng "hành vi xấu" của Google tôi chỉ nhớ gần đúng — crash ~1,09%, ANR ~0,47% — **chưa kiểm nguồn**).

## F. Bổ sung chốt 01/10 tối (chỉ đọc + đo; KHÔNG điền Play Console)

**F1. Ghi chú reviewer — bổ sung theo phương án UGC Huy chọn** (dán nối vào mục D). **Huy đã chọn (b) ngày 01/10: báo cáo + đồng ý quy tắc + chặn (nút Chặn chỉ hiện khi server bật `p8`). Mục D phía trên đã viết theo (b); các dòng (a)/(c) dưới đây chỉ còn để tham khảo.**
- (a) release nguyên trạng: "Users can report a review/clip (feed menu) and report copyright via https://www.tappyai.com/copyright. A user-blocking feature is NOT in this version." — nói thật; có rủi ro bị từ chối.
- (b) báo cáo + chặn trong app: "Every review, clip and comment has a Report action (reason list) and every profile has Block user; blocked users' content is hidden; reports are reviewed by the team." — chỉ dán SAU khi build (b) tồn tại.
- (c) chờ Phase 8: không phát hành công khai.
Quyền và lý do: vị trí (chỉ khi cho phép, tìm quanh đây), camera/ảnh/clip (đăng bài), micro (nhận giọng nói do hệ thống Android xử lý), thông báo (tuỳ chọn, tắt được trong Cài đặt). Giọng nói trên web chạy trong trình duyệt. AI: OpenAI (xử lý thay mặt TappyAI — Huy xác nhận). ScamShield: kiểm tra tin nhắn/link/QR, không tra số điện thoại. Xoá tài khoản: Tôi → Cài đặt → Khác → «Xóa tài khoản», xoá ngay, hoặc https://www.tappyai.com/delete-account.

**F2. Nhóm tuổi**: bỏ «16–17», chỉ giữ «18+» (code: cổng ngày sinh 18+ chặn chat và đăng bài — `age/`, `onboarding/`).

**F3. Quốc gia (ĐỀ XUẤT, Huy quyết)**: bước 1 chỉ Việt Nam (ứng dụng tiếng Việt, địa điểm/giá VN, dịch vụ xoá dữ liệu & hỗ trợ bằng tiếng Việt); mở thêm sau 1–2 tuần nếu ổn. Alpha hiện ở 178 quốc gia nhưng không có nghĩa sản xuất phải vậy.

**F4. Phát hành từng phần**: 10% → 20% → 50% → 100%, mỗi bước chờ ≥24 giờ không có crash/ANR bất thường. Tạm dừng: Phát hành công khai → Quản lý bản phát hành → «Tạm dừng». Gỡ hoàn toàn: «Hủy xuất bản ứng dụng» ở Cài đặt nâng cao (tên nút gần đúng — chưa kiểm). 24 giờ đầu xem **Theo dõi và cải thiện → Android vitals → Sự cố và ANR**, và Firebase Crashlytics nếu có (**chưa kiểm app có Crashlytics không**).

**F5. Backlog (không làm bây giờ)**: khuyến nghị Android 15 edge-to-edge báo API cũ (`setStatusBarColor`…) — đến từ thư viện (Material/Compose), không phải mã của TappyAI; chỉ cần nâng thư viện sau.

**F6. Google đăng nhập (đọc 01/10 tối)**: dự án `imposing-league-499203-q8`, `speedy-method-500203-f2`, `pristine-skein-499103-g8`, `boreal-physics-499008-a1` — Google Auth Platform «chưa cấu hình», KHÔNG có client nào. `sixth-impulse-499009-a2` — không có quyền truy cập (không đọc được). Firebase `aerobic-lock-498409-u7`, app `com.tappyai.app`: bảng «SHA certificate fingerprints» TRỐNG. Vậy khoá ký Play hiện tại (`C2:0A:A1:…`) không có ở đâu → Google đăng nhập trên bản cài từ Play CHƯA chạy được cho tới khi Huy tạo client Android mới (mục A01 + HÀNG CHỜ). DAL SHA-256 `29:62:B4:…`: chưa giải thích được vì sao khác các chứng chỉ đọc được (giả thuyết, chưa kiểm: khoá ký đã xoay vòng; không ảnh hưởng đăng nhập Google, chỉ liên quan App Links).

## G. Google đăng nhập — lỗi «Requested entity already exists» và cách xử lý (01/10 tối; Huy làm, em KHÔNG làm gì ở Google Cloud)

**Nghĩa của lỗi.** Khi tạo client OAuth loại Android ở Google Cloud, cặp **tên gói + SHA-1** là duy nhất trên TOÀN Google, không chỉ trong một dự án. Báo «Requested entity already exists» nghĩa là cặp `com.tappyai.app` + SHA-1 `C2:0A:A1:27:E8:4C:2A:17:35:82:67:77:DA:A1:08:65:EF:2B:A9:1D` đã được đăng ký ở **một dự án khác**. Nhiều khả năng là `sixth-impulse-499009-a2` (em không có quyền vào dự án đó bằng tài khoản Chrome hiện tại) — có thể thuộc một tài khoản Google khác của anh. **Đây là giả thuyết, chưa kiểm.**

**Điều quan trọng cần biết trước khi chọn cách xử lý.** Web client ID mà app Play dùng (`TAPPYAI_GOOGLE_WEB_CLIENT_ID`) thuộc dự án có số `1023373437508` = `aerobic-lock-498409-u7` (em so tiền tố số dự án, không in giá trị). Đăng nhập Google trên Android chỉ chạy khi client Android và web client ID nằm **cùng một dự án**. Vì vậy client Android ở dự án `sixth-impulse-499009-a2` **không dùng được** cho app này (trừ khi đổi cả web client ID trong app + cấu hình Google của Supabase — không nên, phải build lại).

**Bước 1 — tìm client đang giữ cặp đó (chỉ xem, cần đăng nhập Google):**
1. Mở https://console.cloud.google.com. Bấm ảnh đại diện góc trên phải → **Chuyển đổi tài khoản** (Switch account) → chọn từng tài khoản Google của anh (Gmail cá nhân, tài khoản công ty…). Lặp lại các bước dưới với từng tài khoản cho tới khi vào được `sixth-impulse-499009-a2`.
2. Thanh trên cùng → bấm tên dự án → tab **Tất cả** (All) → gõ `sixth-impulse-499009-a2` → chọn.
3. Menu ☰ → **APIs & Services** → **Credentials** (hoặc **Google Auth Platform → Clients**).
4. Mục **OAuth 2.0 Client IDs**: tìm dòng loại **Android**. Bấm vào tên dòng đó và đọc **Package name** (phải là `com.tappyai.app`) và **SHA-1** (phải là `C2:0A:A1:27:…`). Đó là client đang giữ cặp.
5. Nếu không tài khoản nào vào được dự án đó: cặp có thể thuộc người khác (ví dụ nhà phát triển trước). Khi đó chỉ còn **Cách C** bên dưới.

**Bước 2 — xử lý (chọn một; cần đăng nhập + bấm):**
- **Cách A (đề xuất, nếu vào được dự án đó):** xoá client Android cũ rồi tạo mới ở dự án chính.
  1. Ở dự án `sixth-impulse-499009-a2`, trang Credentials → **tích ô vuông bên trái đúng dòng client Android đó** (cẩn thận: không tích dòng khác) → **Delete / Xoá** → xác nhận. (Việc xoá chỉ anh làm; client bị xoá có thể khôi phục trong 30 ngày.)
  2. Đổi sang dự án `aerobic-lock-498409-u7` → APIs & Services → Credentials → **+ Create credentials → OAuth client ID** → Application type **Android** → Name: `Android release (Play app signing)` → Package name `com.tappyai.app` → SHA-1 `C2:0A:A1:27:E8:4C:2A:17:35:82:67:77:DA:A1:08:65:EF:2B:A9:1D` → **Create**. Có thể phải đợi vài phút để Google cập nhật.
  3. (Khuyến nghị thêm) tạo client Android thứ hai cùng package với SHA-1 khoá hậu lượng tử `7F:2B:3A:E0:A8:7A:01:77:D0:35:7E:3F:31:00:6B:59:8E:11:E5:8A` (lấy từ trang App signing của Play) — nếu cũng báo «already exists» thì làm bước 1–2 cho nó.
- **Cách B:** nếu client cũ nằm ở một dự án anh muốn giữ vì lý do khác, KHÔNG xoá; chỉ khi đó mới phải đổi web client ID trong app (build lại + sửa Supabase) — không khuyến nghị cho đợt này.
- **Cách C:** nếu không vào được dự án giữ cặp: thêm SHA-1 khoá **tải lên** (`33:09:7D:22:37:01:D0:1F:08:C6:E2:AA:82:19:AA:FE:F1:BD:28:24`, đã có client «Android release (upload key, local builds)») KHÔNG giúp bản cài từ Play (Play ký lại bằng khoá khác). Lúc đó Google đăng nhập trên bản Play sẽ chưa chạy; email/Zalo vẫn chạy. Nên báo em để em ghi vào hồ sơ release là «Google login: chưa chạy trên Play».

**Bước 3 — kiểm sau khi xong:** Firebase không cần sửa cho đăng nhập Google (fingerprint ở Firebase chỉ dành cho Firebase Auth/Dynamic Links, app này không dùng). Kiểm bằng bản cài từ Play (Internal/closed track): «Tiếp tục với Google» phải hiện bảng chọn tài khoản của hệ thống. **Chưa kiểm được vì chưa có bản Play thật.**

**Giải thích chưa được:** SHA-256 `29:62:B4:…` ở mục Digital Asset Links trên trang App signing không khớp chứng chỉ nào em đọc được. Không ảnh hưởng đăng nhập Google; chỉ liên quan App Links.


## H. CHỐT 02/10 — quyết định của Huy và bản AAB cuối (THAY mọi chỗ «[CẦN HUY XÁC NHẬN]/[CẦN HUY QUYẾT]» ở trên)

> 🛑 **ĐÓNG BĂNG (02/10): CHƯA PHÁT HÀNH.** UAT web SHA 9474f65 trượt; chưa có lệnh release. Không tạo bản Sản xuất, không gửi xem xét, không chọn quốc gia/phát hành từng phần. Mọi bước dưới đây **CHỜ Huy tự nói «OK release»**. AAB chỉ được GIỮ, không tải lên.

**AAB cuối (giữ, chưa tải lên):** `D:\TappyAI-backups\TappyAI-release-vc11-101a359.aab`, SHA-256 `451b703501d233082d54a31979ecf51b3934d2dc5a57e91a8aba329dccbf59a2`, versionCode 11 / versionName 1.0.0, commit `101a3597c40937c487a837f03ad1ac4d54dc4b4f`, ký bằng khoá tải lên (SHA-256 `02:5B:35:4D:1C:37:7B:DC:F3:D6:49:4A:71:8E:6B:2D:A4:56:2F:73:2B:CE:0A:42:11:9C:9B:09:37:74:5C:C7`). Thay thế `597698b` (SHA-256 `e635627f…2292`) và bản trung gian `1b12a7c` (SHA-256 `bd0f659b…15c6`, KHÔNG dùng nữa) vì thêm Lá chắn lừa đảo đồng bộ theo Web (tin nhắn kiểm qua server `/api/scam-shield/analyze`, không AI; link/QR; QR giải mã trên máy; báo cáo/chặn đúng route Web) và chủ đề mặc định Tối; quyền không đổi (12 quyền, không thêm CAMERA); quét bí mật như cũ (0 chuỗi UAT/staging/secret).

**Quyết định của Huy (02/10):** giữ Firebase Analytics · OpenAI là **bên xử lý** (thay mặt TappyAI) · quốc gia **Việt Nam trước** · KHÔNG nâng `activity-compose`, KHÔNG tải ảnh máy ảo trước release.

### H1. Data safety — khai lại (Play đang ghi «không thu thập, chưa mã hoá» là SAI)
Câu chung: **Có thu thập · KHÔNG chia sẻ** (bên xử lý thay mặt TappyAI không tính là chia sẻ: OpenAI, Supabase, Google Cloud/Firebase, Vercel, Upstash, Brevo, Serper, Google Maps Platform, OpenStreetMap, wttr.in) · **Mã hoá khi truyền: Có** · **Người dùng yêu cầu xoá được: Có** (xoá NGAY trong app: Tôi → Cài đặt → Khác → «Xóa tài khoản», + `https://www.tappyai.com/delete-account`) · Dành cho trẻ em: Không (18+).

| Loại dữ liệu (Play) | Thu | Mục đích | Bắt buộc | Ghi chú cho chính xác |
|---|---|---|---|---|
| Vị trí → Chính xác (và Gần đúng) | Có | Chức năng ứng dụng | Tuỳ chọn | Chỉ khi cho phép; gửi cùng yêu cầu chat để tìm quanh bạn; không chạy nền |
| Thông tin cá nhân → Tên, Email, Mã người dùng | Có | Quản lý tài khoản; chức năng | Tuỳ chọn | Đăng nhập Google/Zalo/email |
| Thông tin cá nhân → Thông tin khác (**ngày sinh**) | Có | Chức năng (xác nhận đủ 18 tuổi) | Bắt buộc để chat AI/đăng bài | |
| Ảnh và video → Ảnh, Video | Có | Chức năng | Tuỳ chọn | Ảnh/clip bạn **đăng**; và **ảnh gửi cho trợ lý, Scan, Dịch — được gửi tới máy chủ TappyAI rồi tới OpenAI để xử lý** (không dùng để quảng cáo, không bán) |
| Tin nhắn → Tin nhắn khác trong app | Có | Chức năng | Tuỳ chọn | Chat AI (nội dung gửi tới OpenAI), nhắn tin giữa người dùng |
| Nội dung người dùng tạo khác | Có | Chức năng | Tuỳ chọn | Review, bình luận, bio, văn bản dịch, nội dung Viết content, tin kiểm tra lừa đảo |
| Hoạt động trong app → Tương tác trong app, Lịch sử tìm kiếm trong app | Có | **Phân tích**; chức năng | Bắt buộc | **Firebase Analytics** (sự kiện đóng, không nội dung/PII, không Advertising ID) |
| Mã thiết bị hoặc mã khác | Có | Chức năng (FCM); Phân tích | Bắt buộc | FCM token + app-instance id của Firebase |
| Âm thanh → Ghi âm | Không | — | — | Nhập giọng nói dùng bộ nhận dạng của HỆ THỐNG; app chỉ nhận chữ |
| Tài chính, Danh bạ, Sức khoẻ, Tệp, Crash/chẩn đoán, Advertising ID | Không | — | — | Không Play Billing, không Crashlytics; `AD_ID` bị gỡ |

Mục «chia sẻ»: **không đánh dấu** cho bất kỳ loại nào (OpenAI là bên xử lý). Khai báo kèm: **nội dung người dùng tạo → có báo cáo và chặn người dùng** (bản này: báo cáo bài/clip có sẵn; chặn bật khi server bật — xem F1).

### H2. Các mục còn lại (làm theo mục E; đây là giá trị cuối)
- **Quốc gia:** chỉ **Việt Nam** (mở thêm sau).
- **Nhóm tuổi:** bỏ «16–17», chỉ giữ «18 tuổi trở lên». **IARC:** khai có nội dung do người dùng tạo/tương tác.
- **Ghi chú cho người xem xét:** mục D (đã khớp phương án (b)); câu về chặn người dùng chỉ dán khi server đã bật `P8_USER_BLOCKS`.
- **Phát hành:** tạo bản Sản xuất → tải AAB `101a359` (CHỜ Huy nói «OK release») → từng phần 10–20% → Huy bấm gửi/phát hành (sau khi production có Phase 7).
- **Google đăng nhập:** làm mục G (xoá client đang giữ cặp `com.tappyai.app` + SHA-1 `C2:0A:A1:…` ở dự án khác, tạo lại ở `aerobic-lock-498409-u7`).
- **Quyền riêng tư (web):** `/privacy` còn 3 chỗ lệch (xoá tài khoản vẫn ghi «liên hệ hỗ trợ»; chưa nêu ảnh gửi tới OpenAI; nhắc Stripe) — đã ghi cho phiên web; Play đối chiếu Data safety với chính sách nên nên sửa TRƯỚC khi gửi.
