# Play Console — nháp dán sẵn (soạn đêm 30/9→1/10, từ CODE tại rc/web-uat `848133c`, AAB vc10 = `68d6639`)

Nguyên tắc: mỗi dòng có căn cứ file:dòng. Chỗ chưa chắc ghi **[CẦN HUY XÁC NHẬN]**. Không có bước nào ở đây đã được làm trên Play Console
(cần đăng nhập — việc của Huy). Bản nháp Data safety gốc (29/09) nằm ở `docs/release/PLAY-LISTING.md` §1–§2; file này là bản
đã đối chiếu lại với code hôm nay và thêm 3 chỗ LỆCH mới (mục A0).

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

## C. Upload AAB vc10 lên Internal testing — từng bước (CHỈ làm sau khi phiên web báo "OK release")

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
