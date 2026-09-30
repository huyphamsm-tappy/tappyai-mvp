# Play Console — nháp dán sẵn (soạn đêm 30/9→1/10, từ CODE tại rc/web-uat `848133c`, AAB vc10 = `68d6639`)

Nguyên tắc: mỗi dòng có căn cứ file:dòng. Chỗ chưa chắc ghi **[CẦN HUY XÁC NHẬN]**. Không có bước nào ở đây đã được làm trên Play Console
(cần đăng nhập — việc của Huy). Bản nháp Data safety gốc (29/09) nằm ở `docs/release/PLAY-LISTING.md` §1–§2; file này là bản
đã đối chiếu lại với code hôm nay và thêm 3 chỗ LỆCH mới (mục A0).

---

## A0. Ba điều đã đổi so với bản nháp 29/09 — đọc trước khi dán

1. **Bên xử lý AI đã đổi từ Anthropic sang OpenAI (GPT-6 Luna).** `src/lib/ai/llm/registry.ts:13,51` — mặc định `openai`, `claude` chỉ là rollback.
   Nội dung chat, ảnh gửi trong chat, văn bản dịch / Viết content / kiểm tra lừa đảo giờ đi tới OpenAI. Nhưng:
   - trang `/privacy` vẫn chỉ ghi Anthropic: `src/lib/i18n/legal.ts:58` (EN) và `:291` (VI) — **không có OpenAI**;
   - quyết định của Huy 29/09 ("bên xử lý, không tính chia sẻ") nêu đích danh Anthropic, chưa nêu OpenAI.
   → **[CẦN HUY XÁC NHẬN]** coi OpenAI cũng là bên xử lý thay mặt TappyAI; **và phiên web phải sửa `/privacy` (thêm OpenAI) TRƯỚC khi gửi
   Data safety** — Play đối chiếu Data safety với chính sách. Đây là lệch mới, chưa ai xử lý.
2. **Firebase Analytics CÓ trong bản release** (`android/core/analytics/build.gradle.kts:35`, `FirebaseAnalyticsProvider.kt:27`), dù comment
   `android/app/build.gradle.kts:447` còn viết "no Analytics" (comment cũ, sai). Manifest release có `AppMeasurementService/Receiver`.
   Advertising ID **không** thu: `AndroidManifest.xml:26-27` gỡ `AD_ID`, `:74` `google_analytics_adid_collection_enabled=false`
   (xác nhận trên manifest release đã gộp: không có `AD_ID` / `ACCESS_ADSERVICES_AD_ID`).
3. **Cờ xoá tài khoản**: xem mục B (kết quả khác với mô tả "thông báo xử lý trong 24 giờ").

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

## B. Khai báo xoá tài khoản

**URL trang xoá trên web:** `https://www.tappyai.com/delete-account` (nội dung trang đổi theo cờ, `src/app/delete-account/`).

**Trong app (đã đọc code + chụp emulator, xem báo cáo đêm):**
- Đường vào: **Tôi → Cài đặt → hàng "Yêu cầu xóa tài khoản"** (màu đỏ, biểu tượng thùng rác) — `profile/SettingsScreen.kt:268-272`.
- **Cờ `ACCOUNT_SELF_DELETE_ENABLED` TẮT** (mặc định, và là giá trị release đã chốt): bấm → hộp "Yêu cầu xóa tài khoản?" → **Tiếp tục** → mở app email với thư soạn sẵn tới `support@tappyai.com`; không có app email → toast chỉ địa chỉ (`SettingsScreen.kt:324-360`). **App không xoá gì; bộ phận hỗ trợ xác minh chủ tài khoản rồi xoá.**
- **Cờ BẬT**: hàng đổi tên thành "Xóa tài khoản" → hộp có danh sách dữ liệu bị xoá → gõ **XÓA** → nút "Xóa vĩnh viễn tài khoản" → `POST /api/account/delete` → màn "Tài khoản của bạn đã được xóa… ảnh, video, âm thanh xóa khỏi kho tệp trong vòng 48 giờ" → đăng xuất → về trang chủ (`profile/DeleteAccountDialog.kt`, `res/values-vi/strings_account_delete.xml`). **Không có "xử lý trong 24 giờ" trong code** — mô tả đó không khớp; xoá là NGAY, tệp trong 48 giờ. Khách (ẩn danh) không thấy luồng này.

**Hệ quả với khai báo Play nếu cờ TẮT lúc gửi duyệt:**
- Khai đúng theo thực tế: "app cho phép **yêu cầu** xoá tài khoản" + URL trên. Nếu khai "xoá ngay trong app" khi cờ tắt là **sai sự thật**.
- Rủi ro duyệt: chính sách Google (đã đọc 01/10, support.google.com/googleplay/android-developer/answer/13327111) yêu cầu "in-app path to delete their app accounts and associated data" cộng một link web. Luồng "gửi yêu cầu bằng email" có đường trong app + link web nhưng **không tự xoá** — tôi **không chắc** người duyệt có chấp nhận (chưa kiểm được, chỉ Google trả lời). Khả năng bị yêu cầu sửa là có.
- Ngược lại BẬT cờ khi migration D1/D2/D4 chưa áp lên production nghĩa là hứa xoá dữ liệu mà hệ thống chưa xoá hết (`src/lib/account/selfDelete.ts:1-25`; quyết định D1/D2/D4 hoãn, `RELEASE-PLAN` dòng 11) — **không nên bật**.
- ⚠️ **Lệch cần biết:** `RELEASE-PLAN-2026-09-29.md:170` ghi Production HIỆN `ACCOUNT_SELF_DELETE_ENABLED=true`, release sẽ đặt `false`. Trước khi web đặt `false`, app Android chạy với server production sẽ hiện luồng xoá NGAY. UAT hiện `accountSelfDelete:false` (đo 01/10 qua `GET /api/config`).
- Mục "Xoá một phần dữ liệu": **Có** — xoá từng cuộc chat, trí nhớ AI, bài, bình luận, mục đã lưu (route `DELETE`, `docs/release/PLAY-LISTING.md` §2).

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
