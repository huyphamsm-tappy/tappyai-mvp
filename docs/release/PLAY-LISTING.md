# Hồ sơ Google Play — TappyAI (Android) — chuẩn bị 29/09/2026

App đang **ẩn** trên Play. Tài liệu này để Huy tự nhập vào Play Console khi công khai.
Căn cứ: code tại `rc/web-uat` (Android `android/`, server `src/`), bản phát hành `versionCode 10` / `versionName 1.0.0`,
targetSdk 36, minSdk 26 (`android/app/build.gradle.kts:226-254`). Mọi dòng dẫn file làm căn cứ; chỗ code không trả lời được
ghi **CẦN HUY XÁC NHẬN**.

> ## 🚦 ĐIỀU KIỆN CÔNG KHAI (Huy quyết 29/09): chỉ công khai trên Play SAU KHI GỘP PHASE 8
> Play bắt buộc app có nội dung người dùng tạo (bài công khai, bình luận, hồ sơ, tin nhắn riêng) phải cho **báo cáo nội dung và
> chặn người dùng**. Bản Phase 7 (vc10) **không có**: Android chưa có nút "Báo cáo" (`android/.../reviews/ui/ReviewCard.kt:585-598`,
> `ReviewOverflowMenu.kt` chỉ Lưu / Ẩn / Xoá cho chủ bài), server không có route chặn (bảng `chat_blocks` không dùng).
> **Không làm ở Phase 7** — Phase 8 đã có chặn / báo cáo / chế tài. Trước khi công khai: gộp Phase 8, kiểm báo cáo + chặn trên bản
> Android sẽ phát hành, rồi mới làm checklist mục 8. Mọi câu trả lời dưới đây viết cho bản hiện tại; sau khi gộp Phase 8 phải rà lại
> mục 1 (Phase 8 có thể thu thêm dữ liệu, vd. báo cáo vi phạm, thanh toán — `docs/phase8/PAYMENTS.md`) và mục 3.

> ### ⛔ Các việc còn lại PHẢI xong trước khi bấm công khai (không phải việc nhập liệu)
> 1. **Báo cáo + chặn** — xem điều kiện công khai ở trên (Phase 8).
> 2. ~~**Chính sách quyền riêng tư lệch với code.**~~ **XONG trên UAT (29/09):** web `/privacy` sửa theo Data safety (R18, UAT `e3413ca`
>    — vị trí chính xác, ngày sinh, Firebase, FCM, ACCESSTRADE; bảng "Chính sách khớp" ở mục 1). Android bỏ màn chính sách tiếng Anh
>    cũ (lệch: không có vị trí/Firebase) — "Chính sách bảo mật" trong Cài đặt và thẻ "Quyền riêng tư" ở Tôi nay mở chính trang web
>    `/privacy` (`ProfileTab.kt` `openPrivacyPolicy`), một chính sách duy nhất. Còn phải: bản web lên **Production** trước khi
>    công khai.
> 3. **Cờ xoá tài khoản trên Production.** Kế hoạch phát hành đặt `ACCOUNT_SELF_DELETE_ENABLED=false`
>    (`docs/uat/RELEASE-PLAN-2026-09-29.md:115`) nhưng cùng dòng đó ghi Production hiện đang `true`. Mục 2 dưới đây viết theo `false`
>    (luồng gửi yêu cầu). **CẦN HUY XÁC NHẬN** giá trị trên Vercel Production trước khi khai.

---

## 1. Data safety (An toàn dữ liệu)

**Câu hỏi chung**

| Câu hỏi Play | Trả lời | Căn cứ |
|---|---|---|
| App có thu thập hoặc chia sẻ dữ liệu người dùng thuộc các loại bắt buộc khai? | **Có** | các dòng bên dưới |
| Mọi dữ liệu được mã hoá khi truyền? | **Có** | API release `https://www.tappyai.com/` (`android/app/build.gradle.kts:34,94,399`); Supabase bắt buộc https (`:176-183`); cleartext chỉ ở bản debug tới 10.0.2.2/localhost (`src/debug/res/xml/network_security_config.xml:8-12`) |
| Người dùng yêu cầu xoá dữ liệu được không? | **Có** | Cài đặt → "Yêu cầu xóa tài khoản" + trang web (mục 2); xoá lẻ cuộc chat, trí nhớ AI, bài, bình luận, mục đã lưu bằng các route `DELETE` |
| App có dành cho trẻ em / tham gia Families? | **Không** (đối tượng 18+, mục 3) | |

**"Chia sẻ" theo định nghĩa Play**: chuyển dữ liệu cho **bên xử lý thay mặt mình** (service provider) KHÔNG tính là chia sẻ.
Bên nhận dữ liệu phía server: Anthropic (Claude — AI chat, dịch, quét ảnh, viết content, kiểm tra lừa đảo: `src/lib/ai/llm/registry.ts:37-55`,
`package.json:27`), Serper (tìm địa điểm, nhận toạ độ: `src/lib/ai/tools/serperPlaces.ts:136`), OpenStreetMap Overpass/Nominatim
(`src/lib/ai/tools/food.ts:197-203`), Google Web Risk (kiểm link lừa đảo), Travelpayouts (`src/lib/ai/tools/travel.ts`), Google Cloud
Storage (ảnh/video), Supabase (CSDL, đăng nhập), Vercel (máy chủ), Upstash (giới hạn tần suất), Google Cloud Logging, Firebase (Google).
**Huy quyết 29/09: Anthropic, Supabase, Google Cloud (Storage, Logging), Firebase là bên xử lý thay mặt TappyAI → KHÔNG tính
"chia sẻ".** Vercel, Upstash cùng loại hạ tầng → cũng không tính. Còn lại **CẦN HUY XÁC NHẬN**: Serper, OSM Overpass/Nominatim,
Google Web Risk, Travelpayouts nhận nội dung truy vấn (Serper/Overpass nhận toạ độ). Chúng là API tra cứu Tappy gọi thay người dùng;
khuyến nghị cũng coi là bên xử lý. Riêng Overpass là API công cộng không có hợp đồng xử lý — nếu muốn chặt chẽ thì khai
**Vị trí: có chia sẻ**, mục đích "Chức năng ứng dụng".

**Từng loại dữ liệu**

| Loại (mục Play) | Thu? | Chia sẻ? | Mục đích | Bắt buộc / tuỳ chọn | Xoá được? | Căn cứ |
|---|---|---|---|---|---|---|
| **Vị trí → Vị trí chính xác** (và **gần đúng**) | Có | Không (xem ghi chú service provider) | Chức năng ứng dụng (gợi ý quanh bạn) | Tuỳ chọn (xin quyền khi chat, từ chối vẫn dùng được) | Không lưu vào CSDL (không thấy cột vị trí trong `supabase/migrations`); log máy chủ ghi 2 chữ số thập phân (`food.ts:590`) | quyền FINE+COARSE `AndroidManifest.xml:17-18`; xin quyền `ChatScreen.kt:142-148`; gửi `userLocation` mỗi lượt chat `RealChatRepository.kt:70`; vào prompt 5 chữ số `promptBuilder.ts:506-510`. "Không lưu" = **CẦN HUY XÁC NHẬN** (bảng gốc profiles/conversations không nằm trong migrations của repo). Không dùng vị trí nền. |
| **Thông tin cá nhân → Tên** | Có | Không | Quản lý tài khoản; chức năng (hồ sơ công khai) | Tuỳ chọn (khách dùng được không cần tài khoản) | Có | Google/email/Zalo đăng nhập `features/auth/.../AuthRepository.kt:213-255`; `src/lib/zalo/identity.ts:39,76,112`; `src/app/api/profile/route.ts:53-54` |
| **Thông tin cá nhân → Địa chỉ email** | Có | Không | Quản lý tài khoản | Tuỳ chọn | Có | như trên |
| **Thông tin cá nhân → Mã người dùng (User IDs)** | Có | Không | Quản lý tài khoản; chức năng | Bắt buộc (cả khách có mã ẩn danh) | Có | Supabase UUID / phiên ẩn danh |
| **Thông tin cá nhân → Thông tin khác** (ngày sinh cho cổng 18+) | Có | Không | Chức năng ứng dụng (xác nhận đủ 18 tuổi); an toàn | Bắt buộc để dùng chat AI / gợi ý / đăng ảnh-video; khách: lưu trên máy, gửi kèm header | Có | `A/age/AgeCheck.kt:104-112`; `user_demographics.date_of_birth` `supabase/migrations/20260908_user_demographics_foundation.sql:129-142`; khách `GuestAgeStore.kt:12-15` |
| Số điện thoại | **Không** (app Android không hỏi SĐT) | | | | | Zalo không trả SĐT (`identity.ts`); đặt chỗ trên Android chỉ đọc (`BookingsApi.kt:15`). ⚠️ Nếu người dùng từng đặt chỗ trên web, SĐT họ nhập hiện lại trong app — dữ liệu đó do web thu. **CẦN HUY XÁC NHẬN** có khai "SĐT" hay không (khuyến nghị: khai **Có, tuỳ chọn, Chức năng ứng dụng** cho an toàn). |
| **Ảnh và video → Ảnh** | Có | Không | Chức năng ứng dụng (đăng bài, ảnh đại diện/bìa, quét ảnh, kiểm tra ảnh chụp lừa đảo, gửi ảnh trong chat) | Tuỳ chọn | Có (xoá bài/ảnh; xoá tài khoản) | picker hệ thống, không cần quyền camera: `ReviewsScreens.kt:762-852`, `AccountEditScreen.kt:86-170`, `ScanScreen.kt:100-154`, `ScamShieldScreen.kt:124-248`. Lưu GCS, **đọc công khai** (`src/lib/media/providers/gcs.ts:64-79`) |
| **Ảnh và video → Video** | Có | Không | Chức năng ứng dụng (đăng clip) | Tuỳ chọn | Có | composer video, sau cổng 18+ |
| **Âm thanh → Ghi âm giọng nói** | **Không** | | | | | nhập giọng nói dùng `SpeechRecognizer` của hệ thống, app chỉ nhận chữ (`ChatViewModel.kt:391-431`); đọc to dùng TTS trên máy. Quyền RECORD_AUDIO có khai (`AndroidManifest.xml:20`) cho dịch vụ nhận giọng của hệ thống. |
| **Tin nhắn → Tin nhắn khác trong app** | Có | Không | Chức năng ứng dụng (chat AI, tin nhắn giữa người dùng) | Tuỳ chọn | Có (xoá từng cuộc chat `src/app/api/conversations/route.ts:24-65`, xoá trí nhớ AI `MemoryApi.kt:25`) | chat → Claude; lưu bảng `conversations`; DM `MessagingApi.kt:23-38` |
| **Ảnh/nội dung → Nội dung khác do người dùng tạo** (bài review, bình luận, bio, chủ đề Viết content, văn bản dịch, tin nghi lừa đảo) | Có | Không | Chức năng ứng dụng | Tuỳ chọn | Có | reviews/comments; dịch/viết content/kiểm tra lừa đảo gửi Claude, không thấy lưu CSDL; lịch sử kiểm tra lừa đảo chỉ trên máy (`ScamCheckHistoryStore.kt:19`) |
| **Hoạt động trong app → Tương tác trong app** | Có | Không | Phân tích (Analytics); chức năng | Bắt buộc (không có nút tắt) | **CẦN HUY XÁC NHẬN** (sự kiện Firebase xoá theo thời hạn lưu của GA4; bảng `user_events` xoá khi xoá tài khoản?) | Firebase Analytics trong bản release `core/analytics/build.gradle.kts:34-35`; chỉ gửi tham số liệt kê sẵn (`FirebaseAnalyticsProvider.kt:5-35`); bảng `user_events` (`supabase/migrations/add_tracking_integrations.sql:5-11`) |
| **Hoạt động trong app → Lịch sử tìm kiếm trong app** | Có | Không | Chức năng (lịch sử chat), Phân tích (sự kiện `search`) | Tuỳ chọn | Có (xoá lịch sử chat) | như trên |
| Hoạt động → Lịch sử duyệt web | Không | | | | | |
| **Thông tin & hiệu năng app** (nhật ký sự cố, chẩn đoán) | **Không** | | | | | không có Crashlytics/Sentry trong dự án |
| **Mã thiết bị hoặc mã khác** | Có | Không | Chức năng (thông báo đẩy: FCM token), Phân tích (Firebase app-instance id) | Bắt buộc | Có (xoá khi xoá tài khoản — **CẦN HUY XÁC NHẬN** với bảng `notification_subscriptions`) | `NotificationsViewModel.kt:57-60`, `TappyFirebaseMessagingService.kt:36-39`, `src/app/api/notifications/subscribe/route.ts:75`. **Không thu Advertising ID**: gỡ quyền AD_ID `AndroidManifest.xml:26-27`, `google_analytics_adid_collection_enabled=false` `:73-75` |
| Thông tin tài chính / lịch sử mua | **Không** | | | | | Android không có Play Billing/RevenueCat; gói hội viên chỉ đọc (`MembershipRepository.kt:6-7`), `SHOW_PRO_UPGRADE=false` (`ProfileScreen.kt:115`) |
| Danh bạ, lịch, tệp, SMS, nhật ký cuộc gọi, sức khoẻ, thể chất | **Không** | | | | | không có quyền tương ứng; tử vi/tarot chạy trên máy, không gửi (`A/fortune/`) |

**Chính sách khớp (web `/privacy`, UAT `e3413ca`, 29/09)** — mỗi dòng Data safety có câu tương ứng trong `src/lib/i18n/legal.ts`:

| Data safety | Câu trong chính sách (khoá) |
|---|---|
| Vị trí chính xác, tuỳ chọn | `legal.privacy.s1.b7` — chính xác, chỉ khi cho phép, không chạy nền |
| Tên, email, mã người dùng | `s1.b1`, `s1.b3`, `s1.note` (mã ẩn danh khi chưa đăng nhập) |
| Ngày sinh (18+) | `s1.b9` |
| Ảnh, video | `s1.b10`, `s3.b8` (Google Cloud Storage) |
| Tin nhắn trong app, nội dung người dùng tạo | `s1.b2` (chat AI), `s1.b10` (review, bình luận, bio, tin nhắn giữa người dùng) |
| Tương tác trong app, lịch sử tìm kiếm | `s1.b8`, `s3.b9` (Google Analytics / Google Analytics for Firebase) |
| Mã thiết bị | `s1.b8`, `s3.b10` (FCM token), `s3.p2` (push web) |
| Bên xử lý: Anthropic, Supabase, Google Cloud, Firebase, ACCESSTRADE | `s3.b1`, `s3.b3`, `s3.b8`, `s3.b9`–`s3.b10`, `s3.b11` |

**Link affiliate (ACCESSTRADE) — khai: KHÔNG chia sẻ dữ liệu người dùng** (Huy chọn phương án C 29/09; web làm xong, LIVE UAT `453bd93`)

Căn cứ (code đã kiểm 29/09):
- Link đối tác trong câu trả lời chat là link **của Tappy**: `https://<site>/go/at?u=<deep link ACCESSTRADE, không có sub1>&p=<đối tác>&a=<danh tính mã hoá AES-256-GCM>&h=…&s=<chữ ký HMAC>`
  (`src/lib/ccp/tracking/clickLink.ts:35-56`). Danh tính trong link đã mã hoá và chỉ server Tappy đọc được; nó không đi tới ACCESSTRADE.
- Mỗi lần bấm, server sinh một `sub1` **ngẫu nhiên mới** (`randomBytes(12)` = 24 hex, `clickLink.ts:91-92`; `src/app/go/at/route.ts:9-43`), không suy ra từ id, không lặp
  giữa các lần bấm → **ACCESSTRADE không liên kết được các lần bấm với nhau, cũng không biết người bấm là ai**. Nó chỉ nhận: `utm_source=tappyai`,
  `utm_medium=ccp` và `sub1` ngẫu nhiên đó (cộng IP/trình duyệt như mọi trang web người dùng tự mở — Play không tính là app chia sẻ).
- Bảng nối `sub1 → tài khoản/khách, đối tác, link, thời điểm` là dữ liệu **Tappy tự giữ** (`commerce_click_attributions`, RLS bật, không policy nào,
  thu hồi quyền anon/authenticated — `supabase/migrations/20260929130000_commerce_click_attributions.sql:14-34`), giữ **12 tháng** để đối soát hoa hồng.
  Trên Data safety nó thuộc **Hoạt động trong app → Tương tác trong app** (đã khai "Có thu, không chia sẻ"), mục đích *Chức năng ứng dụng* (đối soát).
- Chính sách `/privacy` (vi + en) đã viết theo cơ chế này (web, 29/09). Android không đổi code: vẫn mở `url` của link như cũ.
- ⚠️ Việc phía web trước khi công khai (R21 trong `docs/uat/ANDROID-REQUESTS.md`): migration `20260929130000` phải chạy trên Production; hàm dọn
  `commerce_click_attributions_sweep()` (12 tháng) **chưa có cron nào gọi**; `identity_id` không có khoá ngoại → **xoá tài khoản không xoá các dòng
  nối của người đó** (chỉ còn UUID mồ côi, không nối được về người nữa, nhưng nên xoá cùng tài khoản cho khớp câu "xoá được" ở Data safety).

## 2. Xoá tài khoản (mục "Data deletion" trong Play Console)

| Ô trong Play | Nội dung dán |
|---|---|
| URL trang xoá tài khoản | `https://www.tappyai.com/delete-account` (`src/app/delete-account/page.tsx` — trang tự đổi nội dung theo cờ) |
| Trong app | **Tôi → Cài đặt → "Yêu cầu xóa tài khoản"** → hộp "Yêu cầu xóa tài khoản?" → **Tiếp tục** → mở app email với thư soạn sẵn tới `support@tappyai.com` (`SettingsScreen.kt:76,264-340`, `res/values-vi/strings_settings.xml:101-107`). Không có app email → hướng dẫn gửi thư thủ công. |
| Xoá một phần dữ liệu không cần xoá tài khoản? | **Có**: xoá từng cuộc chat, trí nhớ AI, bài đăng, bình luận, mục đã lưu. |
| Dữ liệu giữ lại sau khi xoá | Tin nhắn đã gửi người khác (hiện là "tài khoản đã xoá") và hồ sơ kiểm duyệt, đã bỏ liên kết với người dùng; chỉ giữ khi luật yêu cầu (`src/lib/i18n/legal.ts:153`). Tệp ảnh/video xoá trong 48 giờ sau khi tài khoản bị xoá (`src/lib/account/selfDelete.ts:9-12`). |

Khớp cờ: với `ACCOUNT_SELF_DELETE_ENABLED=false`, app và trang web đều là **luồng gửi yêu cầu** (bộ phận hỗ trợ xác minh email rồi xoá);
Android đọc cờ qua `GET /api/config → flags.accountSelfDelete` (`AccountDeletionApi.kt:30,41`, `SettingsViewModel.kt:66-68`) nên không
cần build lại khi đổi cờ. Việc Huy phải lo: **có người trực `support@tappyai.com`** và xoá trong thời hạn đã hứa.
⚠️ Trang `/delete-account` phải có trên **Production** lúc công khai (đang ở rc) — kiểm bằng trình duyệt ẩn danh trước khi dán.

## 3. Phân loại nội dung (IARC) + đối tượng mục tiêu

**Danh mục app**: *Du lịch & Địa phương* (Travel & Local). Phương án khác: *Phong cách sống*. **CẦN HUY CHỌN**.

**Bảng câu hỏi IARC** (chọn loại "Tất cả các loại khác" / All Other App Types — không phải game):

| Câu hỏi | Trả lời | Lý do / căn cứ |
|---|---|---|
| Bạo lực, máu me, nội dung tình dục, ngôn từ thô tục do NHÀ PHÁT TRIỂN tạo | Không | |
| Chất gây nghiện: app **nhắc đến / gợi ý** rượu bia, thuốc lá? | **Có — rượu bia** (nhắc đến, không bán) | AI gợi ý quán nhậu, bar, club, karaoke (`src/lib/ai/promptBuilder.ts:74,82`) |
| Cờ bạc (tiền thật / mô phỏng) | Không | tử vi, tarot, cung hoàng đạo chạy trên máy, không đặt cược (`A/fortune/`); `A/games/` = SuperTux (WebView) |
| Người dùng tương tác / trao đổi với nhau | **Có** | bình luận, tin nhắn riêng, nhóm, hồ sơ công khai |
| Người dùng chia sẻ nội dung do họ tạo | **Có** | bài review ảnh/video công khai |
| Chia sẻ vị trí hiện tại của người dùng với NGƯỜI DÙNG KHÁC | **Không** | vị trí chỉ gửi máy chủ để tìm quanh đây; bài đăng mang tên/địa chỉ quán, không mang toạ độ người đăng |
| Chia sẻ thông tin cá nhân với bên thứ ba | Không (service provider — xem mục 1) | |
| Mua hàng kỹ thuật số trong app | **Không** | không có Play Billing |
| Truy cập Internet không giới hạn (mở trình duyệt / link ngoài) | **Có** | link đặt chỗ/mua hàng mở trình duyệt; Custom Tab |
| Nội dung do AI tạo | Có (chat AI tư vấn) — nếu bảng hỏi có câu này | |

Kết quả dự kiến: PEGI 12–16 / ESRB Teen–Mature (vì nhắc rượu bia + UGC). Không cần tự chọn, IARC tự cấp.

**Đối tượng mục tiêu (Target audience)**: chọn **chỉ 18 tuổi trở lên**.
Lý do: chat AI, gợi ý và đăng ảnh/video đều sau cổng 18+ (`src/app/api/chat/route.ts:668-693`, `recommendations/route.ts:38`), và AI
gợi ý bar/nhậu/karaoke. ⚠️ Cổng 18+ KHÔNG chặn luồng Khám phá / đọc bài (xem được khi chưa khai tuổi) — vẫn hợp lệ khi đối tượng là 18+,
nhưng **không** được khai "hấp dẫn trẻ em". "App có vô tình hấp dẫn trẻ em không?" → **Không**.

**Kiểm duyệt nội dung**: server có cổng an toàn `CONTENT_SAFETY_GATE_ENABLED` (`src/lib/safety/gate/activation.ts:157`) — giá trị trên
Production **CẦN HUY XÁC NHẬN**. Thiếu báo cáo/chặn trên Android — xem hộp ⛔ đầu tài liệu.

**Khai báo khác trong "App content"**: App tin tức? **Không**. App COVID/sức khoẻ? **Không**. Tài chính? **Không**. Chính phủ? **Không**.
Quyền truy cập đặc biệt (Accessibility, vị trí nền, SMS, QUERY_ALL_PACKAGES, foreground service, exact alarm): **không dùng**.
Quyền cần giải thích: Vị trí (tìm quanh đây khi chat), Micro (nói thay gõ), Thông báo.

## 4. Quảng cáo

- **App có chứa quảng cáo không?** → **Không** (Huy xác nhận 29/09). App không có SDK quảng cáo nào (không AdMob, không mạng quảng cáo; Advertising ID
  bị gỡ — `AndroidManifest.xml:26-27,73-75`).
- **Link affiliate**: TappyAI nhận hoa hồng khi người dùng mua qua một số link đối tác (ACCESSTRADE → Shopee, Lazada, TikTok Shop…,
  `src/lib/config/product.ts:243,259`). Link nằm trong câu trả lời tư vấn / mục Deals, không phải banner trả tiền hiển thị. Play định nghĩa
  "quảng cáo" là nội dung do bên thứ ba trả tiền để hiển thị; link affiliate thường không thuộc diện đó **miễn là minh bạch**. Cách khai đúng:
  1. Ô "Contains ads": **Không**.
  2. Ghi rõ trong mô tả cửa hàng (đã có câu ở mục 5) và trong chính sách quyền riêng tư: "Một số link mua hàng là link liên kết; TappyAI có
     thể nhận hoa hồng, giá bạn trả không đổi."
  3. **CẦN HUY XÁC NHẬN**: nếu sau này có "vị trí nổi bật do đối tác trả tiền" (xếp hạng trả phí, deal được tài trợ) → phải đổi thành **Có**.

## 5. Trang cửa hàng

Giới hạn Play: tên ≤ 30 ký tự, mô tả ngắn ≤ 80, mô tả đầy đủ ≤ 4000 (đã đếm, xem cuối mục).
Chỉ nói điều app làm được hôm nay: không hứa đặt chỗ/thanh toán trong app, không hứa giá/giờ chiếu đã xác nhận.

### Tiếng Việt (vi-VN — ngôn ngữ mặc định)

**Tên**: `TappyAI – Hỏi đi đâu, ăn gì`

**Mô tả ngắn**: `Hỏi Tappy: chọn quán, chỗ ở, chỗ chơi, lên lịch trình – có lý do rõ ràng`

**Mô tả đầy đủ**:

```
Phân vân tối nay ăn gì, cuối tuần đi đâu, ở khách sạn nào? Hỏi Tappy — trợ lý AI giúp bạn RA QUYẾT ĐỊNH, không chỉ đưa một danh sách dài.

TAPPY TƯ VẤN THẾ NÀO
• Hỏi đúng điều cần hỏi: nếu thiếu thông tin, Tappy hỏi nhanh vài câu bằng nút bấm (đi mấy người, ngân sách, khu vực…) — trả lời một phần cũng được.
• Chốt một lựa chọn chính: kèm lý do, điểm cần lưu ý, và tối đa hai phương án khác để so sánh.
• Muốn thêm? Bấm "Xem thêm". Ưng rồi? Bấm "Lên kế hoạch chi tiết" để có lịch trình theo từng ngày, từng giờ.
• Thông tin quán lấy từ nguồn công khai (điểm đánh giá, số lượt đánh giá, giờ mở cửa). Điều gì chưa xác nhận được — như giá vé, giờ chạy — Tappy nói rõ là chưa xác nhận.

5 MẢNG TAPPY GIÚP BẠN CHỌN
🍜 Ăn uống: quán ngon quanh bạn, theo món, theo ngân sách, theo số người.
✈️ Du lịch: gợi ý điểm đến và lịch trình nhiều ngày, có ngân sách chia theo người.
🏨 Chỗ ở: khách sạn, homestay hợp nhu cầu và túi tiền.
🎉 Vui chơi: tối nay đi đâu, cà phê, sự kiện, chỗ chơi cuối tuần.
🛍️ Mua sắm: hỏi trước khi mua, so sánh lựa chọn và gợi ý nơi mua.

CHIA SẺ DỄ DÀNG
• Chia sẻ kế hoạch, gợi ý hay bài đánh giá qua Zalo, Messenger, Facebook, TikTok… bằng link hoặc một ảnh đẹp, sẵn sàng đăng.
• Mã QR hồ sơ để bạn bè theo dõi bạn.

KHÁM PHÁ CỘNG ĐỒNG
• Lướt ảnh và clip đánh giá thật từ người dùng, lưu lại quán muốn thử.
• Đăng đánh giá của bạn bằng ảnh, video hoặc link.

CÔNG CỤ NHỎ MÀ CÓ VÕ
• Viết caption cho Facebook, TikTok, Instagram theo tone bạn chọn.
• Dịch nhanh, quét ảnh để hiểu nội dung.
• Chia hóa đơn nhóm.
• Kiểm tra tin nhắn, đường link, mã QR nghi lừa đảo.

LƯU Ý
• TappyAI dành cho người từ 18 tuổi trở lên.
• Tappy dùng vị trí (nếu bạn cho phép) chỉ để gợi ý chỗ gần bạn.
• Một số link mua hàng/đặt chỗ là link liên kết của đối tác: TappyAI có thể nhận hoa hồng, giá bạn trả không đổi. Việc đặt chỗ và thanh toán diễn ra trên trang của đối tác.
• AI có thể sai — hãy kiểm tra lại giờ mở cửa và giá trước khi đi.

Quyền riêng tư: https://www.tappyai.com/privacy
Xoá tài khoản: https://www.tappyai.com/delete-account
Góp ý: support@tappyai.com
```

### English (en-US)

**Title**: `TappyAI – Where to go & eat`

**Short description**: `Ask Tappy to pick a place to eat, stay or go out – with clear reasons`

**Full description**:

```
Can't decide where to eat tonight, where to go this weekend, or which hotel to book? Ask Tappy — an AI assistant that helps you DECIDE, not just hands you a long list.

HOW TAPPY ADVISES
• Asks only what matters: if something is missing, Tappy asks a few quick tap-to-answer questions (how many people, budget, area…) — a partial answer is fine.
• Commits to one main pick, with the reasons, what to watch out for, and up to two alternatives to compare.
• Want more? Tap "See more". Happy with it? Tap "Plan in detail" for a day-by-day, hour-by-hour itinerary.
• Place facts come from public sources (ratings, review counts, opening hours). Anything Tappy could not confirm — like ticket prices or schedules — is clearly marked as unconfirmed.

5 AREAS TAPPY HELPS YOU CHOOSE
🍜 Food: great places near you, by dish, budget and group size.
✈️ Travel: destination ideas and multi-day itineraries with a per-person budget.
🏨 Stays: hotels and homestays that fit your needs and wallet.
🎉 Going out: where to go tonight, cafés, events, weekend plans.
🛍️ Shopping: ask before you buy, compare options and where to buy.

EASY SHARING
• Share a plan, a suggestion or a review via Zalo, Messenger, Facebook, TikTok… as a link or a ready-to-post image.
• A profile QR code so friends can follow you.

DISCOVER THE COMMUNITY
• Scroll real photo and video reviews from users, and save places to try.
• Post your own review with photos, video or a link.

HANDY TOOLS
• Write captions for Facebook, TikTok and Instagram in the tone you choose.
• Quick translation, and scan a photo to understand it.
• Split the bill with friends.
• Check suspicious messages, links and QR codes for scams.

GOOD TO KNOW
• TappyAI is for users aged 18 and over.
• Tappy uses your location (if you allow it) only to suggest places near you.
• Some shopping/booking links are partner affiliate links: TappyAI may earn a commission at no extra cost to you. Booking and payment happen on the partner's site.
• AI can make mistakes — please double-check opening hours and prices before you go.

Privacy: https://www.tappyai.com/privacy
Delete account: https://www.tappyai.com/delete-account
Feedback: support@tappyai.com
```

Đếm ký tự (Python `len`, 29/09): tên VI 27 · EN 27; mô tả ngắn VI 72 · EN 69; mô tả đầy đủ VI 2064 · EN 2184 (đều < 4000).
Nhãn nút trong mô tả EN ("See more", "Plan in detail") là bản dịch — app tiếng Anh đang hiện nhãn server gửi; **CẦN HUY XÁC NHẬN** nhãn EN thật.
"5 mảng" (ăn uống / du lịch / chỗ ở / vui chơi / mua sắm) theo 5 miền tư vấn của Consult V2 — **CẦN HUY XÁC NHẬN** đúng 5 mảng Huy muốn nhấn.

### Thông tin liên hệ cửa hàng
Email: `support@tappyai.com` (bắt buộc) · Website: `https://www.tappyai.com` · Chính sách: `https://www.tappyai.com/privacy`.

## 6. Hình ảnh

**Ảnh chụp điện thoại** — đã chụp, ở `D:/TappyAI-backups/play-listing/` (1080×1920, PNG không kênh alpha, tỉ lệ 9:16 — đủ điều kiện
"đề xuất" của Play: ≥ 4 ảnh, ≥ 1080 px):

| File | Màn | Nguồn |
|---|---|---|
| `01-chat-hoi-nhanh.png` | Chat — thẻ hỏi nhanh (Phở Bắc hay Nam / mấy người / ngân sách) | e2e UAT 29/09, cắt từ 1080×2400 |
| `02-chat-chot-quan.png` | Chat — "Mình chọn…", 2 phương án khác, "còn 6 lựa chọn", thẻ quán có ảnh | e2e UAT 29/09 |
| `03-chia-se-ke-hoach.png` | Sheet chia sẻ (mẫu 6) với ảnh kế hoạch Đà Nẵng 3 ngày | e2e UAT 29/09 |
| `04-trang-chu.png` | Trang chủ | emulator 1080×1920, tài khoản test (tên tạm "Minh") |
| `05-kham-pha.png` | Khám phá | như trên |
| `06-viet-content.png` | Viết content (thiết kế 28/09) | như trên |
| `07-ho-so.png` | Hồ sơ (Tôi) | như trên |

⚠️ Dữ liệu là của DB audit/UAT: ảnh 03 in link `uat.tappyai.com/plan/…`, ảnh 05 có tên `@minh.anh.(uat)` (tài khoản UAT có sẵn — không
sửa theo quy tắc R11), ảnh 07 có email `e2e.android.pro@example.com`. Khuyến nghị: khi app đã lên Production, chụp lại 03/05/07 bằng
tài khoản thật. **Huy quyết 29/09: chụp lại sau khi app lên Production** (đã đưa vào checklist mục 8, bước 2). Không có ảnh Deals vì
UAT chưa có ưu đãi nào.

**Biểu tượng app** 512×512 PNG 32-bit: `D:/TappyAI-backups/play-listing/icon-512.png` (từ `public/icons/icon-512x512.png`).

**Feature graphic (nhờ ChatGPT làm)**: **1024 × 500 px**, JPEG hoặc PNG 24-bit **không alpha**, ≤ 15 MB. Gợi ý nội dung: nền xanh đậm →
tím như app, rái cá Tappy (dùng ảnh `public/branding/otter-mascot.png`, không vẽ lại), chữ "Hỏi Tappy: đi đâu, ăn gì?" ở nửa trái,
đừng đặt chữ/chi tiết quan trọng sát mép (Play có thể cắt/phủ nút Play ở giữa khi có video). Không dùng chữ "#1", "tốt nhất", giá, nút
giả "Tải ngay".

**Video quảng bá (tuỳ chọn)**: link YouTube công khai hoặc không công khai, tắt quảng cáo — chưa có.

## 7. Ghi chú phát hành — vc10 / 1.0.0

```
Phiên bản đầu tiên của TappyAI trên Google Play:
• Hỏi Tappy chọn quán ăn, chỗ ở, chỗ chơi, đồ mua — có lý do và lựa chọn thay thế.
• Lên kế hoạch chuyến đi theo từng ngày, chia sẻ bằng link hoặc ảnh.
• Khám phá và đăng đánh giá bằng ảnh, video.
• Công cụ: viết caption, dịch, quét ảnh, chia hóa đơn, kiểm tra lừa đảo.
```
(318 ký tự, dưới giới hạn 500.) ⚠️ Vì chỉ công khai sau khi gộp Phase 8, bản lên Play sẽ là versionCode mới hơn vc10 — đổi số phiên
bản ở tiêu đề và thêm dòng về tính năng Phase 8 (nếu có thứ người dùng thấy được) trước khi dán.

## 8. Checklist trong Play Console (khi công khai)

Làm theo thứ tự; mỗi bước lưu nháp được.

1. **Kiểm trước (ngoài Console)**: **đã gộp Phase 8** và kiểm báo cáo + chặn trên bản Android sẽ phát hành (điều kiện công khai 🚦);
   các việc trong hộp ⛔ xong; mở ẩn danh `https://www.tappyai.com/privacy` và
   `https://www.tappyai.com/delete-account` trên **Production** thấy nội dung đúng; bật huy hiệu Play cho web (`NEXT_PUBLIC_PLAY_LISTING_LIVE=1`)
   và Android (`TAPPYAI_PLAY_LISTING_LIVE=true` khi build) **sau khi** trang Play mở được.
2. **Chụp lại ảnh cửa hàng trên Production** (Huy quyết 29/09): tài khoản thật, không có chữ `uat`, `(E2E)`, `example.com`; 1080×1920,
   PNG không alpha; ít nhất: chat hỏi nhanh, chat chốt quán có thẻ, sheet chia sẻ kế hoạch (link `www.tappyai.com`), Trang chủ, Khám phá
   (bài của người dùng thật), Viết content, Hồ sơ. Cách chụp: `adb shell wm size 1080x1920` → `node android/e2e/scripts/drive.mjs …`
   → `adb shell wm size reset`. Thay các file trong `D:/TappyAI-backups/play-listing/`.
3. Play Console → chọn app **TappyAI** → menu trái **Grow users → Store presence → Main store listing**:
   dán Tên / Mô tả ngắn / Mô tả đầy đủ (mục 5, tiếng Việt); tải icon 512, feature graphic 1024×500, ảnh điện thoại chụp lại ở bước 2
   (kéo đúng thứ tự).
   **Manage translations → Add your own translations → English (United States)**: dán bản EN.
4. **Store presence → Store settings**: App category = Travel & Local (hoặc Lifestyle); Tags; Contact details: email `support@tappyai.com`,
   website `https://www.tappyai.com`.
5. **Policy → App content** (từng thẻ, bấm **Start** / **Manage**):
   - **Privacy policy**: `https://www.tappyai.com/privacy`.
   - **Ads**: "No, my app does not contain ads" (mục 4).
   - **App access**: "All or some functionality is restricted" → thêm hướng dẫn cho người duyệt: tài khoản test (email + mật khẩu tạo
     riêng cho Google review trên Production, **không** dùng tài khoản e2e audit), ghi chú "Ngày sinh: nhập ≥ 18 tuổi để mở chat AI".
     **CẦN HUY tạo tài khoản đó.**
   - **Content rating**: Start questionnaire → email → category "All Other App Types" → trả lời theo bảng mục 3 → Submit.
   - **Target audience and content**: chọn **18 and over** → "Appeal to children?" No.
   - **News apps**: No. **COVID-19 apps**: No. **Government apps**: No. **Financial features**: none.
   - **Data safety**: trả lời theo mục 1 (Data collection → Yes; encrypted in transit → Yes; deletion → Yes + URL mục 2) → từng loại dữ liệu
     theo bảng → Preview → Submit.
   - **Account deletion** (nằm trong Data safety): URL `https://www.tappyai.com/delete-account`.
   - **Advertising ID**: "No" (app không dùng Advertising ID — đã gỡ quyền).
   - **Health apps**: không chọn gì.
6. **Release → Production → Countries/regions**: thêm Việt Nam (+ nước khác nếu muốn).
7. **Release → Production → Create new release** (hoặc **Promote** bản vc10 đang ở kênh test): dùng AAB vc10 đã ký; dán ghi chú phát hành
   (mục 7, `<vi-VN>`); **Review release** → sửa mọi cảnh báo → **Start rollout to Production** (có thể chọn tỉ lệ rollout, vd 20%).
8. **Publishing overview**: nếu bật *Managed publishing* thì sau khi Google duyệt phải bấm **Publish** thủ công.
9. Sau khi trang Play mở được: kiểm link `https://play.google.com/store/apps/details?id=com.tappyai.app` ẩn danh; bật huy hiệu (bước 1);
   theo dõi **Quality → Android vitals** và **Ratings and reviews** tuần đầu.

## 9. Sau release — việc đã biết, làm ở Phase 8

Không chặn việc công khai, nhưng phải sửa ở Phase 8 (Huy quyết 29/09):

| Việc | Hiện trạng (căn cứ) | Hướng sửa |
|---|---|---|
| **Ảnh/video người dùng trên GCS đang công khai** | bucket đọc công khai (`src/lib/media/providers/gcs.ts:64-79`); ai có URL tệp là mở được, kể cả khi bài đã bị ẩn/xoá khỏi feed | chuyển sang **signed URL** có hạn, cấp qua server sau khi kiểm quyền xem bài |
| **Bài bị ẩn / hạn chế vẫn mở được qua link** | feed và hồ sơ không trả các bài này, nhưng tệp ảnh/video của chúng vẫn tải được bằng URL trực tiếp (hệ quả của dòng trên) | cùng thay đổi signed URL: bài ẩn/hạn chế → server không cấp URL cho người ngoài chủ bài/kiểm duyệt |
| Data safety sau signed URL | "Ảnh/video" vẫn là **thu thập, không chia sẻ**; bỏ ghi chú "đọc công khai" ở mục 1 | cập nhật mục 1 khi Phase 8 lên |
