# TappyAI iOS — hồ sơ nộp App Store (soạn 30/09–01/10/2026, phiên `ios/sync-2026-09-30`)

Tài liệu này là **bản nháp để Huy điền vào App Store Connect** — không phải bản đã nộp. Mọi dòng "căn cứ" trỏ tới mã hoặc tài liệu trong
repo. Chỗ nào **CẦN HUY** là quyết định hoặc dữ kiện mà mã không cho biết. Không có tài khoản thật nào được tạo, không có gì ghi lên
production để soạn tài liệu này.

Nguồn đối chiếu: `ios/` (mã thật), `docs/release/PLAY-LISTING.md` (bảng Data safety lập từ mã Android + server — iOS dùng CÙNG
bảng, chỗ nào khác nhau được nêu rõ), `docs/ios/IOS-REQUESTS.md` (việc server), `docs/ios/IOS-PROGRESS.md` (trạng thái + ảnh CI).

---

> **ĐÓNG BĂNG RELEASE (02/10/2026, lệnh của Huy):** chưa UAT thì chưa release. Không điền/gửi gì vào App Store Connect, không Add for Review/Submit, không build bản phát hành mới/TestFlight nếu Huy không yêu cầu. Mọi chữ «ngay sau web release / nộp ngay» trong tài liệu này đã đổi thành **«CHỜ Huy nói OK release»**. Build TestFlight đã có (xem báo cáo) chỉ được GIỮ.

## 0. KẾT LUẬN SẴN SÀNG NỘP (bản cuối 02/10/2026, build 100+; cập nhật sau mỗi lần CI)

**Phía app: SẴN SÀNG.** Phía server production: **CHƯA** (chờ web release). Bấm "Submit for Review" chỉ sau khi cả 3 cột dưới xong.

| Thứ | Trạng thái | Ai làm |
|---|---|---|
| Bản build nộp | build 100 trên TestFlight (đủ chức năng đến ScamShield cũ); **build mới** (ScamShield tin nhắn + QR, giao diện tối mặc định, hàng Quy tắc cộng đồng/Liên hệ) sẽ là bản nộp — số build ghi ở báo cáo | iOS (đã chạy 1 lần TestFlight), Huy chọn đúng build trong ASC |
| Chữ cửa hàng (§2), App Privacy (§4), xếp hạng tuổi (§5.4), ghi chú người duyệt (§5.1), quyền xin (§7) | **soạn xong, chờ Huy nói «điền»** | Huy |
| Ảnh màn hình (§3) | CI chụp 10 ảnh tối (đường dẫn §3) | iOS chụp; Huy duyệt từng ảnh |
| Đọc App Store Connect (ô bắt buộc thật, cảnh báo) | **CHƯA ĐỌC ĐƯỢC** (§1b) | Huy đăng nhập lại Chrome rồi báo |
| Tài khoản demo | chỉ mô tả (§5.3) | Huy tạo sau release |
| Server: xoá TK in-app, báo cáo/chặn (cờ `p8.*`), Sign in with Apple, Zalo `app_state`, `/privacy` `/terms` `/delete-account` `/community-guidelines`, route `analyze` | **chờ web release** (§0.1) | web + Huy |
| Quy trình xử lý báo cáo trong 24 giờ (1.2) | chưa có người | Huy |

### 0.1 Phụ thuộc web release — 4 điều kiện ngoài app (phải xong TRƯỚC "Submit"), vì người duyệt chạy bản build **với server production**:

| # | Điều kiện | Điều luật | Ai làm | Ghi chú |
|---|---|---|---|---|
| 1 | Production bật **xoá tài khoản trong app** (`ACCOUNT_SELF_DELETE_ENABLED=true`) | 5.1.1(v) | Huy (Vercel) | IOS-REQUESTS I10. Cờ tắt ⇒ app chỉ có luồng gửi email ⇒ bị từ chối. Server đã đọc 01/10: cờ bật = xoá NGAY (tệp ≤ 48 giờ, cần D4); không có bước "yêu cầu → 24 giờ" trong code. Chủ sở hữu hoãn D1/D2/D4 ⇒ cờ TẮT ở Phase 7 |
| 2 | Production bật **báo cáo + chặn** (`p8_reports_v2`, `p8_user_blocks`, migration Phase 8) | 1.2 | Web + Huy | IOS-REQUESTS I7. Kèm người/quy trình xử lý báo cáo **trong 24 giờ** |
| 3 | **Sign in with Apple** bật ở Supabase + `/api/config` | 4.8 | Huy + web | IOS-REQUESTS I8. Có Google/Zalo thì bắt buộc có Apple |
| 4 | Server **thu hồi token Apple** khi xoá tài khoản | 5.1.1(v) | Web | IOS-REQUESTS I8 (3). Chỉ cần khi (3) đã bật |

Bản TestFlight của job `iOS` in cảnh báo ngay trong log nếu production còn thiếu (1)–(3) (kiểm `GET /api/config`).
Thông báo đẩy (Firebase) **không** chặn việc duyệt nhưng server hiện chưa gửi được tới iPhone (IOS-REQUESTS I9).

---

## 1. Bản ghi ứng dụng (App Store Connect → My Apps → +)

| Mục | Giá trị | Căn cứ / ghi chú |
|---|---|---|
| Nền tảng | iOS (chỉ iPhone) | `project.yml` `TARGETED_DEVICE_FAMILY: "1"` — iPad chưa từng được kiểm, không khai iPad |
| Tên | `TappyAI – Đi đâu, ăn gì?` (≤ 30 ký tự; 24) | Android dùng `TappyAI – Hỏi đi đâu, ăn gì` (27). **CẦN HUY** chọn một |
| Ngôn ngữ chính | Tiếng Việt | thêm English (U.S.) |
| Bundle ID | `com.tappyai.ios` | `Config/Release.xcconfig`; đã có trong Identifiers (đã ký được bản 50) |
| SKU | `tappyai-ios` (tuỳ ý, không đổi được sau này) | |
| Phiên bản | `1.0.0` | `project.yml` `MARKETING_VERSION`; build = số run của workflow `iOS` (xem IOS-PROGRESS) |
| Danh mục chính / phụ | **Food & Drink** / **Travel** | app trả lời "ăn gì, đi đâu": **CẦN HUY** xác nhận (Lifestyle là phương án khác) |
| Giá | Miễn phí, không có mua trong app | xem §6 (IAP) |
| Quốc gia phát hành | Việt Nam (mở rộng sau) | nội dung, địa điểm, đối tác đều ở Việt Nam |
| Bản quyền | `© 2026 <tên pháp nhân / cá nhân>` | **CẦN HUY** (chưa có pháp nhân: ghi tên người đứng tài khoản Developer) |
| Đối tượng | 18+ | cổng tuổi `AgeCheckView`; xem §5.4 |

**Thông tin liên hệ / URL**

| Trường | Giá trị |
|---|---|
| Support URL | `https://www.tappyai.com/support` — **CẦN HUY/web**: trang này có tồn tại không? Nếu chưa: dùng `https://www.tappyai.com/how-to-use` hoặc tạo trang có `support@tappyai.com` |
| Marketing URL | `https://www.tappyai.com` |
| Privacy Policy URL | `https://www.tappyai.com/privacy` (app mở đúng trang này trong Cài đặt) |
| Email hỗ trợ | `support@tappyai.com` (`SUPPORT_EMAIL`, khớp web + Android) |
| Xoá tài khoản (mô tả công khai) | `https://www.tappyai.com/delete-account` |

---

## 2. Nội dung cửa hàng (chỉ nói điều app làm được hôm nay)

Giới hạn Apple: Tên ≤ 30 · Phụ đề ≤ 30 · Văn bản quảng bá ≤ 170 · Mô tả ≤ 4000 · Từ khoá ≤ 100 ký tự (cách nhau dấu phẩy, không cách).
Nội dung dưới đây lấy từ `PLAY-LISTING.md` §5 (đã được Huy duyệt cho Android), chỉnh cho đúng ngôn ngữ của App Store.

### Tiếng Việt (vi)

- **Phụ đề (≤ 30):** `Trợ lý AI chọn quán, lên lịch` *(28)*
- **Văn bản quảng bá (≤ 170):** `Hỏi Tappy: tối nay ăn gì, cuối tuần đi đâu, ở đâu — có lý do rõ ràng, tối đa hai phương án để so sánh, và lịch trình từng ngày khi bạn cần.` *(≈ 150)*
- **Từ khoá (≤ 100):** `ăn gì,đi đâu,du lịch,quán ăn,lịch trình,khách sạn,cà phê,review,AI,trợ lý,Đà Nẵng,Sài Gòn,Hà Nội,ưu đãi`
- **Mô tả:** dùng nguyên văn mô tả đầy đủ tiếng Việt ở `docs/release/PLAY-LISTING.md` §5 (2064 ký tự), thay 3 chỗ:
  1. bỏ câu nhắc "Google Play", nếu có;
  2. nhãn nút "Xem thêm" / "Lên kế hoạch chi tiết" giữ nguyên (app iOS hiện nhãn do server gửi — **CẦN HUY** xác nhận nhãn thật);
  3. thêm dòng vào mục LƯU Ý: `• Đăng nhập bằng Apple, Google, Zalo hoặc email; bạn cũng có thể dùng thử với tư cách khách.`
- **Có gì mới (1.0.0):** `Phiên bản đầu tiên của TappyAI trên iPhone.`

### English (en-US)

- **Subtitle (≤ 30):** `AI helper: where to eat & go` *(28)*
- **Promotional text (≤ 170):** `Ask Tappy where to eat, go or stay tonight — clear reasons, up to two alternatives to compare, and a day-by-day plan when you want one.`
- **Keywords (≤ 100):** `where to eat,travel,itinerary,restaurants,hotel,cafe,reviews,AI assistant,Vietnam,Da Nang,Saigon,Hanoi,deals`
- **Description:** the English full description in `PLAY-LISTING.md` §5 (2184 characters), with the same three edits.
- **What's new:** `The first version of TappyAI for iPhone.`

**Đừng viết** (Apple 2.3.1 / 1.1.6): "tốt nhất", "số 1", giá hoặc giờ chiếu đã xác nhận, hứa đặt chỗ/thanh toán trong app
(việc đó diễn ra trên trang đối tác), hay nhắc Android/Google Play.

---

## 1b. Đọc App Store Connect (app TappyAI, id 6816654420, bản 1.0) — 02/10/2026

**CHƯA ĐỌC ĐƯỢC.** Lần thử 02/10: Chrome mở `appstoreconnect.apple.com/apps/6816654420/...` bị chuyển về **trang đăng nhập** (`authResult=FAILED`) — phiên Chrome này chưa đăng nhập Apple (hoặc phiên hết hạn); cửa sổ Chrome cũng báo chiều rộng 0 khi chụp màn hình. Em **không nhập mật khẩu/mã** (cấm). Việc của Huy: đăng nhập App Store Connect trong Chrome, để cửa sổ cỡ bình thường, rồi nói «đọc lại»; em chỉ MỞ và ĐỌC các mục: App Information, App Privacy, App Accessibility, Ratings and Reviews, Pricing and Availability, Subscriptions/IAP, Version 1.0, App Review → lập bảng ô bắt buộc/cảnh báo nguyên văn/kích thước ảnh/ô chọn build/kiểu phát hành.

Bảng dưới là **dự kiến theo tài liệu Apple, CHƯA đối chiếu giao diện thật**:

| Ô (ASC) | Giới hạn / yêu cầu | Chữ ở mục |
|---|---|---|
| Tên / Phụ đề | ≤ 30 / ≤ 30 | §1, §2 |
| Danh mục chính/phụ, nội dung có bản quyền bên thứ ba (Content Rights) | chọn | §1; Content Rights: **CẦN HUY** (app hiển thị ảnh địa điểm từ nguồn công khai và ảnh người dùng — nên khai «Có quyền / đã được phép» chỉ khi Huy chắc) |
| Mô tả / Từ khoá / Promotional / What's New | ≤ 4000 / ≤ 100 / ≤ 170 / ≤ 4000 | §2 |
| Support URL / Marketing URL / Privacy Policy URL | URL hợp lệ (bắt buộc Support + Privacy) | §1 |
| Bản quyền | chữ | §1 |
| Ảnh màn hình iPhone | 6.9″ 1320×2868 (hoặc 1290×2796) **hoặc** 6.5″ 1284×2778 / 1242×2688; 1–10 ảnh | §3 |
| Build | chọn một build đã xử lý xong trong TestFlight | số build ghi ở báo cáo |
| Phát hành | **Manually release** (đề nghị) | §10 |
| App Review: tên, điện thoại, email, ghi chú, tài khoản demo | tên + điện thoại + email bắt buộc | §5.1–5.3 |
| Xếp hạng độ tuổi | bộ câu hỏi | §5.4 |
| App Privacy | khai từng loại dữ liệu + URL chính sách | §4 |
| Giá và quốc gia | Miễn phí; Việt Nam trước | §1 |
| Mã hoá / xuất khẩu | `ITSAppUsesNonExemptEncryption = false` đã nằm trong Info.plist ⇒ không hỏi lại mỗi build; câu trả lời «chỉ dùng mã hoá chuẩn của hệ điều hành (HTTPS)» | §6 |
| Accessibility | khai báo tính năng hỗ trợ tiếp cận: **tuỳ chọn** theo hiểu biết — CHƯA CHẮC mục này có bắt buộc ở tài khoản của Huy | ASC |

---

## 3. Ảnh chụp màn hình

**Bản cuối 02/10:** workflow `ios-appstore-shots` chụp **10 ảnh giao diện TỐI**, tiếng Việt, từ ứng dụng thật chạy với máy chủ giả (không có người thật), thanh trạng thái sạch 9:41, trên iPhone 16 Pro Max (1320 × 2868, khung 6.9″) nếu Xcode có, không thì cỡ 6.5″ được Apple nhận; kích thước thật in vào tóm tắt của run. Tên tệp: `01-chat-ask` (thẻ hỏi nhanh) · `02-chat-plan` (thẻ kế hoạch) · `03-chat-places` (thẻ địa điểm) · `04-home` · `05-explore` (feed clip, tranh vẽ giả) · `06-scam-message` (Lá chắn: tin nhắn «giống tình huống Mã QR giả») · `07-scam-qr` (mã QR chứa link bị chặn) · `08-profile` (Hồ sơ gọn) · `09-ai-consent` (màn đồng ý chia sẻ dữ liệu với AI) · `10-settings`. Thư mục Huy đọc được: **`D:\TappyAI-backups\appstore-screenshots\`**. Huy **duyệt từng ảnh** trước khi đăng.

*(Bản kế hoạch cũ bên dưới giữ để tham khảo.)*

Apple chỉ nhận ảnh đúng kích thước khung máy. App chỉ có iPhone, nên cần **bộ iPhone 6.9"** (1320 × 2868) — bộ 6.5" là tuỳ chọn.

- Ảnh của CI (`ios-screenshots`) chụp trên iPhone mặc định của runner (1206 × 2622, 6.3") — **dùng làm bằng chứng nội bộ, KHÔNG dùng để
  đăng lên App Store** (sai kích thước).
- Kế hoạch: thêm job CI chọn simulator "iPhone 16 Pro Max" (hoặc mẫu 6.9" mới nhất có sẵn) và chạy lại các ca chụp của `ScreenshotTests`
  cho 5–8 màn dưới đây; ảnh thô nằm trong artifact, **Huy duyệt từng ảnh** trước khi đăng. Ảnh dùng dữ liệu giả (fixture), không có tài khoản
  thật, không có tên/email thật — việc này làm sau khi chốt danh sách màn (không tốn công mới ở phía mã).
- Thứ tự đề xuất (mở bằng điều app làm tốt nhất, như Play): (1) Trang chủ · (2) thẻ hỏi nhanh · (3) thẻ kế hoạch Quy Nhơn · (4) thẻ quán/chốt
  lựa chọn · (5) chia sẻ kế hoạch · (6) Khám phá · (7) Viết content · (8) Tôi.
- Biểu tượng 1024 × 1024 (không alpha, không bo góc): lấy từ `AppIcon` của app — **CẦN HUY** xác nhận tệp gốc 1024.

---

## 4. App Privacy ("nhãn dinh dưỡng")

Khai trong App Store Connect → App Privacy. **Lập từ mã iOS**, khớp `ios/TappyAI/Resources/PrivacyInfo.xcprivacy` (có test giữ hai bên
đồng bộ: `PrivacyManifestTests`) và bảng Data safety Android.

**Theo dõi (Tracking):** **Không.** Không có SDK quảng cáo, không dùng IDFA, không có `NSUserTrackingUsageDescription`, `NSPrivacyTracking = false`,
không có tracking domain. Link affiliate (ACCESSTRADE) mở trang đối tác; theo quyết định Huy 29/09 (phương án C) **không chia sẻ dữ liệu
người dùng** với đối tác — **CẦN HUY** xác nhận lại khi nộp, vì Apple coi "liên kết dữ liệu với dữ liệu của bên thứ ba cho mục đích quảng cáo"
là tracking.

**BẢN CUỐI 02/10 — những điều phải khớp với khai báo (đối chiếu mã):**
- Nội dung chat, bản dịch, văn bản viết, **ảnh quét** (`/api/scan`) và (tuỳ chọn) vị trí gần đúng được gửi cho **OpenAI** qua máy chủ TappyAI → khai «Nội dung người dùng»/«Vị trí» và nêu OpenAI là bên xử lý; có màn đồng ý trước lần gửi đầu (5.1.2(i)).
- **Nhận diện giọng nói**: âm thanh có thể được **Apple** xử lý (SFSpeechRecognizer, không bắt buộc trên máy); TappyAI chỉ nhận chữ, **không thu/lưu âm thanh** ⇒ không khai «Audio Data».
- **Lá chắn lừa đảo**: tin nhắn dán vào được đọc tại máy, **không gửi, không lưu**; chỉ khi bấm «Phân tích sâu hơn» (sau đồng ý AI) văn bản đi tới `/api/scam-shield/analyze`, máy chủ không ghi nội dung. **Mã QR**: giải mã tại máy, ảnh không gửi/không lưu; chỉ link đã giải mã đi tới `/api/scam-shield/check`. Link được kiểm có thể được đối chiếu với Google Web Risk phía máy chủ.
- **Theo dõi (ATT): Không.** Không IDFA, không SDK quảng cáo; `NSPrivacyTracking = false`. FirebaseMessaging chỉ để thông báo đẩy (không Analytics).
- Bên xử lý: OpenAI (AI), Serper (tìm kiếm web), Supabase (CSDL/đăng nhập), Google Cloud (lưu tệp, log), Firebase (thông báo), Google Web Risk (kiểm link), OSM/Overpass (địa điểm).
- `PrivacyInfo.xcprivacy` của build thật được test `PrivacyManifestTests` giữ khớp bảng dưới; CI in danh sách manifest của SDK trong archive.

**Dữ liệu thu thập — tất cả "liên kết với danh tính người dùng" (Linked), không dùng để theo dõi**

| Nhóm Apple | Loại | Thu? | Mục đích | Căn cứ trong mã |
|---|---|---|---|---|
| Thông tin liên hệ | Tên | Có | Chức năng ứng dụng | tên hồ sơ; Google/Zalo/Apple lần đầu (`EditProfileView`, `AuthRepository.saveAppleName`) |
| | Địa chỉ email | Có | Chức năng ứng dụng | đăng nhập email / Google / Apple (email có thể là relay ẩn) |
| | Số điện thoại | Có | Chức năng ứng dụng | `BookingFormView` — số người dùng nhập khi yêu cầu đặt chỗ (Android chỉ hiển thị; **khai Có cho an toàn**, như khuyến nghị trong Play) |
| Định vị | Vị trí chính xác | Có (tuỳ chọn) | Chức năng ứng dụng | `LocationCoordinator` + `userLocation` mỗi lượt chat; chỉ khi cho phép, chỉ khi dùng app |
| | Vị trí gần đúng | Có (tuỳ chọn) | Chức năng ứng dụng | cùng nguồn (Play khai cả hai) |
| Nội dung người dùng | Ảnh hoặc video | Có (tuỳ chọn) | Chức năng ứng dụng | đăng bài, ảnh đại diện/bìa, quét ảnh; lưu Google Cloud Storage (URL đọc được công khai) |
| | Nội dung khác do người dùng tạo | Có | Chức năng ứng dụng; Cá nhân hoá sản phẩm | chat AI, review, bình luận, bio, văn bản dịch/viết/kiểm tra lừa đảo |
| Mã định danh | Mã người dùng | Có | Chức năng ứng dụng | UUID Supabase (khách có mã ẩn danh) |
| | Mã thiết bị | Có (khi bật thông báo) | Chức năng ứng dụng | FCM registration token (`NotificationManager`) |
| Hoạt động sử dụng | Tương tác với sản phẩm | Có | Chức năng ứng dụng; Cá nhân hoá | thời gian xem clip, thích, lưu, theo dõi (`/api/reviews/{id}/interact`) |
| Giao dịch | Lịch sử mua | Khai (mã có, đang ẩn) | Chức năng ứng dụng | `StoreKitProvider` → `/api/iap/apple/verify`; màn Pro ẩn bởi cờ server `showProUpgrade` (xem §6). **CẦN HUY**: nếu chắc chắn không bao giờ bật trong bản này, có thể bỏ dòng này — nhưng cờ là của server nên khai cho an toàn |
| Dữ liệu khác | Dữ liệu khác | Có | Chức năng ứng dụng | ngày sinh cho cổng 18+ (Apple không có loại riêng) |

**Âm thanh giọng nói (SỬA 02/10):** TappyAI **không** thu hay lưu âm thanh (app chỉ nhận chữ; đã bỏ dòng AudioData khỏi manifest 01/10; Music — nơi
duy nhất app gửi âm thanh lên — ẩn bằng hằng số `ProductFlags.showMusic = false`). Nhưng nhận diện dùng `SFSpeechRecognizer` **không đặt**
`requiresOnDeviceRecognition`, nên **âm thanh có thể được gửi tới Apple** để nhận diện. **Không được ghi «chạy hoàn toàn trên máy».** Chữ đúng:
«Nhận diện giọng nói dùng dịch vụ nhận diện của Apple; TappyAI chỉ nhận chữ, không lưu âm thanh.» (Dữ liệu do Apple xử lý theo chính sách của Apple, không
thuộc nhãn App Privacy của TappyAI.)

**Không thu thập:** ghi âm giọng nói (xem trên), danh bạ, lịch sử duyệt web, sức khoẻ, tài
chính, thông tin nhạy cảm, nhật ký sự cố, dữ liệu chẩn đoán/hiệu năng (không có Crashlytics/Sentry/MetricKit), analytics của bên thứ ba trên iOS
(Android có Firebase Analytics; **iOS chỉ có FirebaseMessaging**, không Analytics).

**Bên xử lý dữ liệu thay mặt TappyAI** (không tính là "chia sẻ", theo quyết định Huy 29/09): **OpenAI (AI — nhận nội dung chat/dịch/quét/viết; có màn đồng ý
trong app từ build 98, xem §9)**, Supabase (CSDL, đăng nhập), Google Cloud (Storage, Logging), Firebase (thông báo), Serper (tìm kiếm web). **CHÚ Ý chữ:**
chuỗi `integrations.privacy` hiện nói «không chia sẻ với bên thứ ba» — mâu thuẫn với danh sách này. Chữ đề nghị (cho web sửa trang /privacy và chuỗi đó):
«TappyAI không bán dữ liệu của bạn. Để hoạt động, TappyAI gửi nội dung bạn nhập cho các nhà cung cấp xử lý thay mặt chúng tôi: OpenAI (trả lời AI), Supabase
(đăng nhập, lưu trữ), Google Cloud và Firebase (lưu tệp, thông báo), Serper (tìm kiếm). Họ chỉ được dùng dữ liệu để cung cấp dịch vụ cho TappyAI.» **CẦN HUY** (từ Play): Serper, OSM Overpass/Nominatim, Google Web Risk, Travelpayouts nhận nội dung truy vấn —
khuyến nghị coi là bên xử lý.

**API cần lý do (Required Reason API):** chỉ `UserDefaults` (lý do `CA92.1`). Đọc kích thước tệp (`attributesOfItem[.size]`) không thuộc danh sách của
Apple. Manifest của các SDK (Firebase, Supabase…) đi kèm trong bản archive — CI in danh sách manifest có trong app ở bước "Privacy manifests in the
built app" (xem tóm tắt của run).

**Giữ chính sách web khớp:** `https://www.tappyai.com/privacy` phải nêu Sign in with Apple và thông báo đẩy trên iOS (hiện chỉ nhắc Google/Zalo/email và
FCM của Android) — **web sửa** (không thuộc phiên iOS).

---

## 5. Thông tin cho người duyệt (App Review Information)

### 5.1 Cách dùng app để duyệt (đưa vào "Notes")

```
TappyAI is an AI assistant that helps people in Vietnam decide where to eat, go and stay.

NO ACCOUNT IS REQUIRED TO LOOK AROUND: tap "Continue as guest" on the sign-in screen.
AI chat, recommendations and posting need an age confirmation: the app shows an "18+" screen — enter any date of birth that makes you 18 or older.

Sign in: Sign in with Apple, Google, Zalo or email + password are offered. [DEMO ACCOUNT: see below]

AI AND YOUR DATA (5.1.2(i)): the first time you send a chat message (or use Translate, Scan text or Write content, or "Analyse deeper" in Scam Shield) a sheet explains that the text you send goes to our AI provider (OpenAI) through our servers, why, and how it is handled, with a link to the Privacy Policy. "Agree" continues; "Not now" sends nothing. It can be withdrawn at any time: Profile → Settings → "Share data with AI". The app also blocks every AI request in code until you agree.

USER-GENERATED CONTENT (1.2): posts, clips and comments are public to other users. On any post, clip, comment or profile tap the "..." button → "Report" (choose a reason) or "Block". Blocked accounts and their content disappear; the list is at Profile → Settings → "Blocked accounts". Community rules: Profile → Settings → "Community guidelines". Notices about your own content and how to appeal: Settings → "Moderation notices". Contact: Settings → "Contact support" (support@tappyai.com). Reports are reviewed within 24 hours. New posts pass an automatic safety check before they become public.

Where to find what App Review usually checks:
• Delete account (5.1.1(v)): Profile → Settings → Other → "Delete account" → type the word → confirm. The account is deleted immediately and you are signed out. (Deleting the demo account is expected.)
• Sign in with Apple is the first button on the sign-in screen.
• Terms / Privacy / Copyright policy: Profile → Settings → Other.
• Scam Shield (Home → Scam Shield): check a link, check a pasted message (read ON the phone against the Ministry of Public Security's published scam scenarios; nothing is sent unless you tap "Analyse deeper" and have agreed to AI sharing), scan a QR code with the camera or from a photo (decoded ON the phone; only a decoded web link is sent to our link checker, never the picture; the app never opens, pays or joins anything from a code), and read the 25 scenarios. It is an information tool, not a government service, and says so.
• Voice input in chat uses Apple's speech recognition (audio may be processed by Apple); TappyAI receives only text and keeps no audio.
• Permissions are optional and asked only when used: Camera (post/scan/QR), Photos (choose pictures), Microphone and Speech Recognition (voice input), Location "While Using the App" (nearby places), Notifications.
• The app is dark by default; Profile → Settings → Appearance has System / Light / Dark.

The app has no in-app purchases and no subscriptions. Some shopping/booking links are partner affiliate links that open the partner's website; booking and payment happen there.
AI answers can be wrong; the app says so and asks people to double-check opening hours and prices.
```

**Trước khi dán, Huy kiểm 4 câu trong khối trên** (mỗi câu là một cam kết với Apple): (1) «Reports are reviewed within 24 hours» — chỉ giữ nếu có người trực `moderation_queue`; (2) «New posts pass an automatic safety check» — đúng theo cổng an toàn server (Phase 8), chỉ giữ khi production đã có; (3) các đường «Community guidelines / Moderation notices» chỉ hiện khi cờ `p8.*` bật — phải bật TRƯỚC khi nộp; (4) «Sign in with Apple is the first button» — chỉ đúng khi Apple provider đã bật ở production.

### 5.2 Liên hệ

| Trường | Giá trị |
|---|---|
| Họ tên, điện thoại | **CẦN HUY** (Apple bắt buộc một số điện thoại liên lạc được) |
| Email | `support@tappyai.com` hoặc email cá nhân Huy — **CẦN HUY** chọn hộp thư có người đọc hằng ngày trong tuần duyệt |

### 5.3 Tài khoản demo (chỉ mô tả — KHÔNG tạo trên production từ phiên này)

- **Không bắt buộc**: mọi màn xem được với tư cách khách; nếu Huy không tạo tài khoản demo, ghi "Sign-in required: No".
- **Nên có** một tài khoản dành riêng cho người duyệt, vì báo cáo/chặn/xoá tài khoản chỉ hiện khi đã đăng nhập:
  - Email riêng (vd. `apple-review@…` — hộp thư Huy kiểm soát), đăng ký bằng email + mật khẩu trong app (màn "Tạo tài khoản") hoặc ở web.
  - Khai ngày sinh ≥ 18 tuổi; hoàn tất onboarding 2 bước.
  - Có sẵn vài bài đăng và một tài khoản thứ hai công khai để người duyệt thử **báo cáo/chặn** (cần một người dùng khác trên production; tự tạo tài khoản
    phụ thứ hai của Huy, không dùng người thật).
  - Đặt mật khẩu mạnh, dùng một lần, **đổi sau khi duyệt xong**; nhập vào ô "Sign-in information" của App Store Connect (không ghi vào repo).
  - Lưu ý: xoá tài khoản là thao tác thật — người duyệt sẽ xoá thử, nên chuẩn bị thêm tài khoản thay thế hoặc ghi chú "deleting this account is expected".

### 5.4 Xếp hạng độ tuổi (questionnaire)

| Câu hỏi | Trả lời | Căn cứ |
|---|---|---|
| Nội dung người dùng tạo ra / chia sẻ | **Có** | review, bình luận, bio, ảnh/video công khai |
| Chat/nhắn tin với người khác | **Không** có nhắn tin trực tiếp giữa người dùng trong bản này (Messenger của Phase 8 chưa bật); bình luận có | **CẦN HUY** xác nhận khi bật Phase 8 |
| Truy cập web không giới hạn | **Không** (link ngoài mở bằng trình duyệt hệ thống, không có trình duyệt nhúng tuỳ ý) | |
| Rượu, thuốc lá, ma tuý (nhắc tới) | **Ít gặp/nhẹ** — AI có thể gợi ý quán bar/pub khi được hỏi | |
| Nội dung khiêu dâm, bạo lực, cờ bạc, y tế | Không | |
| Mã hoá | `ITSAppUsesNonExemptEncryption = false` (chỉ HTTPS chuẩn của hệ thống) → trả lời "No" | `Info.plist` |
| Kết quả mong muốn | **18+** (app tự chặn dưới 18 bằng cổng tuổi, đúng với Play: đối tượng 18+) | |

---

## 6. Câu trả lời cho những câu Apple thường hỏi / điều luật hay bị trích

| Điều luật | Câu hỏi | Câu trả lời (và app làm gì) | Trạng thái |
|---|---|---|---|
| **4.8** Đăng nhập bên thứ ba | "Có Google/Zalo thì có Sign in with Apple không?" | Có: nút native `SignInWithAppleButton` đặt đầu danh sách đăng nhập, xin tên + email, nonce SHA-256, xử lý email ẩn, lưu tên lần đầu, phát hiện thu hồi trong Cài đặt Apple ID và đăng xuất. Hiện **ẩn tới khi server bật** (`flags.appleSignIn` hoặc provider `apple`) | Mã xong; **chờ Huy bật Supabase + web** (I8); chưa thử trên máy thật |
| **1.2** Nội dung người dùng tạo | "Lọc nội dung? Báo cáo? Chặn? Phản hồi kịp thời? Liên hệ?" | (a) Bài đăng qua cổng an toàn: bài bị giữ hiện cho tác giả kèm lý do (`MyPostsView`). (b) Báo cáo bài/clip/bình luận/người dùng với 10 lý do + ghi chú, ≤ 2 chạm từ nội dung. (c) Chặn/bỏ chặn, danh sách chặn trong Cài đặt, nội dung người bị chặn biến mất ngay. (d) Xử lý báo cáo **trong 24 giờ** — vận hành: **CẦN HUY** chỉ định người xem `moderation_queue`. (e) Liên hệ công khai `support@tappyai.com` | (b)(c) mã xong sau cờ tắt; **cần bật server (I7)**; (d) chưa có người — **CẦN HUY** |
| **5.1.1(v)** Xoá tài khoản | "Xoá được từ trong app chứ?" | Cài đặt → Khác → Xoá tài khoản → danh sách dữ liệu bị xoá/giữ lại → gõ chữ xác nhận → xác nhận lần cuối → xoá **ngay** (`POST /api/account/delete`) → hiện màn xong → đăng xuất | Mã + test xong; **cờ production đang TẮT (I10)**. Khi tắt, app chỉ hiện "Yêu cầu xoá tài khoản" (email) — **Apple sẽ từ chối** |
| **5.1.1(v)** (Sign in with Apple) | "Thu hồi token Apple khi xoá?" | Server gọi `appleid.apple.com/auth/revoke` | **Chưa có** (I8 §3) |
| **3.1.1** Mua trong app | "Có bán quyền Pro/nội dung số không?" | **Không ở bản đầu.** Màn Pro ẩn (`showProUpgrade=false` trên production); thanh toán VietQR/SePay của Phase 8 chưa bật và không hiển thị trên iOS. Khi bán Pro phải dùng IAP (mã StoreKit 2 đã có: `Core/Payments`), thêm `appAccountToken`, nút Khôi phục mua | Đúng hiện trạng; nếu sau này bán → công việc riêng |
| **3.1.3** Hàng hoá/dịch vụ ngoài app | "Link mua hàng/đặt chỗ?" | Hàng hoá và dịch vụ thực (quán, khách sạn, mua sắm) được mua trên trang đối tác; app chỉ mở link. Một số là link liên kết — app nói rõ "có thể nhận hoa hồng, giá bạn trả không đổi" (mô tả + chính sách) | Đúng |
| **5.1.1** Dữ liệu & đồng ý | "Xin quyền có lý do rõ ràng?" | Mọi chuỗi xin quyền có tiếng Việt + Anh (`InfoPlist.xcstrings`): vị trí khi dùng app, camera/ảnh/micro/nhận dạng giọng nói, thông báo. Vị trí, thông báo đều tuỳ chọn, từ chối vẫn dùng được | Đúng |
| **5.1.2** Chia sẻ dữ liệu | "Gửi dữ liệu cho bên thứ ba?" | Chỉ cho bên xử lý (xem §4). Không bán dữ liệu, không quảng cáo theo dõi | Theo quyết định 29/09 |
| **2.1** Hoàn chỉnh | "Có tính năng chưa xong/ẩn?" | Music **ẩn hoàn toàn** bằng hằng số biên dịch (bản quyền); không có màn "Coming soon". Tính năng sau cờ server mặc định tắt (báo cáo/chặn, Apple) khi cờ tắt không hiện gì | Đúng |
| **2.3.1 / 2.5** Tính năng ẩn | "Có mã kích hoạt từ xa làm app đổi chức năng?" | Cờ server chỉ **hiện/ẩn** màn đã có trong binary đã duyệt (Pro, báo cáo/chặn, Apple); không tải mã mới. Nêu thẳng với người duyệt nếu họ hỏi | Đúng |
| **4.2** Chức năng tối thiểu | "Chỉ là web bọc?" | App native SwiftUI 100%: chat AI streaming, thẻ kế hoạch/quán, camera + quét, dịch, tỷ giá, chia hoá đơn, chia sẻ ảnh/video, thông báo | Đúng |
| **1.4 / 1.1.6** An toàn / thông tin sai | "AI có thể sai?" | App và mô tả nói rõ "AI có thể sai — kiểm tra giờ mở cửa và giá"; thông tin chưa xác nhận (giá vé, giờ chiếu) được gắn nhãn chưa xác nhận | Đúng |
| **5.2.1** Bản quyền | "Có dùng nội dung/nhãn hiệu của người khác?" | Dữ liệu quán từ nguồn công khai; logo Zalo/Google/Facebook/TikTok chỉ dùng để nhận diện nút đăng nhập/chia sẻ. Music ẩn vì chưa rõ giấy phép. Có "Chính sách bản quyền" + đường báo cáo vi phạm (`/copyright`) | Đúng |
| **4.0 / 2.4.1** Thiết bị | "iPad?" | iPhone-only | Đúng |
| Quyền "Kids" | | Không (18+) | |

---

## 7. Danh sách kiểm trước khi bấm "Submit for Review"

1. (Huy) 4 điều kiện ở §0 đã bật trên **production** — kiểm bằng lệnh đọc (`GET https://www.tappyai.com/api/config`): `flags.accountSelfDelete` = true,
   `p8.userBlocks` + `p8.reports` = true, `flags.appleSignIn` = true hoặc có provider `apple`.
2. (Huy) `APPSTORE_PROFILE_BASE64` mới (có Push), `GOOGLE_SERVICE_INFO_PLIST_BASE64` — xem `docs/ios/IOS-PROGRESS.md` mục "Việc của Huy".
3. Chạy job TestFlight (chỉ khi Huy báo "release Phase 7 xong") → kiểm trên máy thật các mục ở bảng 5–7 của `IOS-PROGRESS.md` ("Chưa kiểm được ở đây").
4. App Privacy (§4), Age Rating (§5.4), mô tả + ảnh (§2–3), tài khoản demo (§5.3), liên hệ (§5.2) điền xong trong App Store Connect.
5. Chọn đúng build đã qua TestFlight; bật "Manually release" để tự quyết ngày lên kệ.
6. Có thể mất **đến 3 tuần** nếu bị hỏi lại (lưu ý của Huy): trả lời nhanh trong Resolution Center, đính kèm ảnh/clip quay màn hình cho báo cáo, chặn, xoá tài khoản.

## 8. Điều chưa biết / cần Huy trả lời (tóm tắt)

- Tên app, danh mục chính, pháp nhân trong dòng bản quyền.
- Support URL có trang thật chưa.
- Ai xử lý báo cáo trong 24 giờ (1.2) và bằng cách nào (công cụ: `moderation_queue` của Phase 8).
- Khai "Lịch sử mua" hay bỏ; khai "Số điện thoại" (đã khai Có).
- Có bật liên kết affiliate theo phương án C (không chia sẻ dữ liệu) như đã chọn 29/09 cho cả iOS.
- Số điện thoại/email liên hệ cho người duyệt; có tạo tài khoản demo không.

## 9a. ĐỐI CHIẾU BẢN CUỐI 02/10/2026 (đọc lại https://developer.apple.com/app-store/review/guidelines/ ngày 02/10, trích ngắn)

| Điều | Apple nói (trích ngắn) | Trạng thái | Bằng chứng (file / ảnh) |
|---|---|---|---|
| **1.2** | UGC phải có «method for filtering objectionable material; mechanism to report … and timely responses; ability to block abusive users; published contact information» | **ĐÃ ĐỦ phía app, khi cờ server bật** · **THIẾU trên production hôm nay** (cờ `p8.*` tắt) · vận hành 24 giờ: **chưa có người** | báo cáo bài/clip/bình luận/người dùng theo 3 route cuối (`Safety/Data/SafetyService.swift`, test `SafetyTests`); chặn + danh sách (`BlockedAccountsView`, ảnh 40–41); liên hệ + Quy tắc cộng đồng + Thông báo kiểm duyệt (`SettingsView`, hàng `contact`/`guidelines`/`notices`); lọc: cổng an toàn server. **Chưa chạy thử trên UAT** (bản app trỏ UAT cần địa chỉ + khoá bypass UAT — không được đưa vào build; ghi «chưa kiểm») |
| **4.8** | đăng nhập bên thứ ba phải kèm lựa chọn tương đương, «limiting data collection to name and email, allowing private email» | **ĐÃ ĐỦ phía app, CHƯA BẬT** (Apple provider ở Supabase chưa bật) | `AuthFlowView` (nút `auth-apple` ẩn tới khi bật), `AppleSignIn.swift` |
| **5.1.1(v)** | «If your app supports account creation, you must offer account deletion within the app» | **ĐÃ ĐỦ phía app; cờ production TẮT** | `AccountDeletionView`, ảnh 44–46, 66; chữ chỉ «App Store» (2.3.10) |
| **5.1.2(i)** | «clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so» | **ĐÃ ĐỦ** (chờ Huy duyệt chữ) | `Core/Privacy/AIConsent*.swift`; chặn ở lớp mạng; `AIConsentTests`; ảnh 78–80, App Store 09 |
| **3.1.1** | «To unlock features … you must use in-app purchase» (cấm khoá bằng mã QR…) | **ĐÃ ĐỦ**: không bán gì trong app; quét QR chỉ để kiểm an toàn, không mở khoá chức năng | `showProUpgrade` tắt |
| **2.1(a)** | bản cuối, thử trên máy thật, «include demo account info and turn on backend services if login required» | **THIẾU (việc của Huy)**: tài khoản demo + bật backend production; chưa thử trên máy thật tất cả | §5.3 |
| **5.1.1(i)** | «link privacy policy identifying collected data, collection methods, uses, and third-party sharing» | **CHƯA CHẮC**: link `/privacy` có (Cài đặt); chữ trang chờ web sửa (IOS-REQUESTS I17) | `PrivacyPolicyView`, Cài đặt |
| **2.3.10** | không nhắc nền tảng khác trong app/metadata | **ĐÃ ĐỦ**: quét chuỗi 02/10, chỉ còn «App Store» | `Localizable.xcstrings` |
| **2.5.14** | ghi âm/camera phải xin phép và «clear visual/audible indication» | **ĐÃ ĐỦ**: mic có màn «đang nghe» (ảnh 63–65), camera quét QR hiện hình xem trước; xin quyền có chữ giải thích vi/en | `VoiceListeningView`, `QRScannerView`, `InfoPlist.xcstrings` |
| **1.1.6 / 1.4** | thông tin sai, gây hại | **ĐÃ ĐỦ ở mức đã làm**: «AI có thể sai»; Lá chắn nói «không phải bảo đảm an toàn», không bao giờ «an toàn» cho tin lạ; có khối gọi 113 | `ScamMessageView`, `ScamEmergencyCard` |
| **2.5.2** | không tải mã làm đổi chức năng | **ĐÃ ĐỦ**: cờ server chỉ hiện/ẩn màn có sẵn; dữ liệu Bộ Công an nằm trong app | `bocongan2026.json` |
| **4.2** | không chỉ là web bọc | **ĐÃ ĐỦ**: SwiftUI thuần | — |

Nguồn: developer.apple.com/app-store/review/guidelines/ (đọc 02/10/2026). Bảng 01/10 bên dưới giữ để đối chiếu.

## 9. Đối chiếu App Review Guidelines (bản 01/10/2026)

Mỗi yêu cầu: **ĐÃ ĐỦ** (có file) / **THIẾU** / **CHƯA CHẮC**. Chỉ ghi, không sửa mã.

| Điều | Yêu cầu (tóm lược) | Trạng thái | Chỗ nào / việc cần làm |
|---|---|---|---|
| 1.2 Nội dung người dùng | có cách lọc, báo cáo, chặn người dùng, có liên hệ công khai | **ĐÃ ĐỦ phía app, CHƯA BẬT trên production**: báo cáo + chặn (`ios/TappyAI/Features/Safety/*`) nằm sau cờ `p8` mặc định tắt; lọc nội dung do cổng an toàn server; liên hệ `support@tappyai.com`. Cần: bật cờ + migration Phase 8 trên production (IOS-REQUESTS I7), người xử lý báo cáo trong 24 giờ (việc của Huy), trang `/support` thật (CHƯA CHẮC) |
| 5.1.1(v) Xoá tài khoản | xoá được TRONG app | **ĐÃ ĐỦ phía app, CẦN cờ**: `Profile/UI/AccountDeletionView.swift`, ảnh 44–46 và 66. Cờ `ACCOUNT_SELF_DELETE_ENABLED` phải BẬT trên production lúc duyệt (Huy quyết bật lúc release, R29); thứ tự: áp D1/D2/D4 → bật cờ → xoá thử tài khoản test |
| 4.8 Đăng nhập bên thứ ba | có Google/Zalo thì phải có lựa chọn tương đương (Sign in with Apple) | **ĐÃ ĐỦ phía app, CHƯA BẬT**: `Auth/Data/AppleSignIn.swift`, nút ẩn tới khi server bật provider Apple (IOS-REQUESTS I8; việc Supabase để sau release). Nếu nộp mà nút chưa hiện thì bị 4.8 |
| 5.1.2(i) Chia sẻ dữ liệu cá nhân với AI bên thứ ba | **«phải nói rõ dữ liệu được chia sẻ với AI bên thứ ba và xin sự đồng ý rõ ràng trước khi chia sẻ»** | **ĐÃ LÀM phía app (02/10, build 98)**: `Core/Privacy/AIConsent*.swift`. Sheet hiện MỘT lần trước yêu cầu AI đầu tiên (chat, dịch, quét, viết nội dung), nêu gửi gì / cho ai (OpenAI) / để làm gì / xử lý thế nào + link `/privacy`; «Đồng ý» / «Để sau» (không gửi gì, chữ gõ trả lại ô nhập); công tắc «Chia sẻ dữ liệu với AI» ở Cài đặt để rút lại. **Chặn ở hai tầng**: màn hình hỏi trước, và lớp mạng (`URLSessionAPIClient`, `URLSessionStreamingClient`) từ chối `/api/chat|translate|scan|viet-content` khi chưa đồng ý (`AIConsentTests`). **Chữ do Huy duyệt.** Web/Android nên cân nhắc cùng cách (IOS-REQUESTS I14). |
| — chuỗi mâu thuẫn | | **CHƯA CHẮC**: `integrations.privacy` nói «không chia sẻ với bên thứ ba» (về kết nối ứng dụng) — nên đọc lại cho khỏi mâu thuẫn với việc gửi chat tới OpenAI |
| 5.1.1 Chính sách quyền riêng tư | URL chính sách, nêu thu thập/ bên thứ ba/ lưu giữ/ xoá | **CHƯA CHẮC**: `www.tappyai.com/privacy` đã cập nhật OpenAI + wttr.in/Upstash/Brevo/Overpass/Google Maps (R27) nhưng "chờ Huy duyệt chữ"; em chưa mở trang để so chữ (trình duyệt đang không hiển thị) |
| 3.1.1 Hàng hoá số | tính năng mở khoá phải dùng In-App Purchase | **ĐÃ ĐỦ cho bản đầu**: không bán gói (`showProUpgrade` tắt, không có mua trong app). Lưu ý: khi bật Pro phải dùng IAP (RevenueCat, Phase 8) |
| 2.3.10 Nền tảng khác | không nhắc tên/biểu tượng nền tảng khác trong app hoặc metadata | **ĐÃ SỬA (build 97)**: màn xoá tài khoản chỉ nói «App Store». Quét 02/10 toàn bộ chuỗi hiển thị của app: không còn chữ Android / Google Play (chỉ còn trong chú thích mã và một chú thích trong `PrivacyInfo.xcprivacy`, người dùng không thấy). Web và Android nên dùng chữ theo nền tảng (IOS-REQUESTS I14). Mô tả cửa hàng iOS đã tránh nhắc Android |
| 1.3 / 2.3.6 Độ tuổi | trả lời bảng câu hỏi trung thực | **CHƯA KIỂM TRONG GIAO DIỆN** (§5.4 soạn từ mã; Apple vừa thêm câu hỏi mạng xã hội — «Review New Social Media Questions on Age Ratings» hiện ở App Store Connect của Huy) |
| 2.1(a) Tài khoản demo | có đăng nhập thì phải đưa tài khoản demo, bật dịch vụ nền | **THIẾU (việc của Huy)**: tạo trên production sau khi web release (§5.3); em không tạo |
| 5.1.1(ix) Ngành bị quản lý | | **KHÔNG áp dụng** theo hiểu biết (app tư vấn đi chơi/mua sắm; có kiểm tra link lừa đảo nhưng không cung cấp dịch vụ tài chính) — CHƯA CHẮC |

**Nhận dạng giọng nói (sửa một câu trong §4 và nhắc trước khi khai):** app dùng `SFSpeechRecognizer` và **không** yêu cầu nhận diện trên thiết bị (`requiresOnDeviceRecognition` không được đặt), nên âm thanh **có thể được gửi tới Apple** để nhận diện. Không được ghi «chạy hoàn toàn trên máy». Chữ đúng cho người duyệt: «Nhận diện giọng nói dùng dịch vụ nhận diện của Apple; app chỉ nhận chữ, không lưu âm thanh.»

**Đọc App Store Connect (mục 4a của lệnh): CHƯA LÀM** — Chrome của Huy đang không hiển thị trang (cửa sổ 0×0), nên em chưa đi qua được các mục cột trái để lấy danh sách ô bắt buộc/cảnh báo nguyên văn. Việc này nằm trong HÀNG CHỜ.

## 10. ĐIỀU KIỆN TRƯỚC KHI NỘP (gom lại)

1. Web release Phase 7 xong; **cờ production**: `ACCOUNT_SELF_DELETE_ENABLED=true` (sau D1/D2/D4), cờ báo cáo/chặn Phase 8 + migration, nút Sign in with Apple hiện (provider Apple ở Supabase, thu hồi token khi xoá).
2. **Màn đồng ý chia sẻ dữ liệu với AI bên thứ ba (5.1.2(i))** — ĐÃ CÓ từ build 98; **kiểm trên iPhone** (đồng ý, để sau, công tắc Cài đặt) và Huy duyệt chữ.
2b. **Báo cáo/chặn (1.2) theo hợp đồng cuối của server** (`POST /api/reviews|comments|users/{id}/report`, `POST/DELETE /api/users/{id}/block`, `GET /api/users/blocks`; cờ `p8.reports`, `p8.userBlocks`): app đã đổi theo (build 98) nhưng **ẩn tới khi cờ bật** — phải bật trên production trước khi nộp.
3. Tài khoản demo trên production (Huy tạo) + số điện thoại liên hệ.
4. Bản build cuối đã qua TestFlight và kiểm trên iPhone thật: đăng nhập Apple, xoá tài khoản, báo cáo/chặn, mic (chấm cam tắt), push (chỉ khi server gửi được tin cho iOS).
5. Trang `/privacy` đã được Huy duyệt; trang hỗ trợ có thật.
6. App Privacy, độ tuổi, mã hoá/xuất khẩu: **Huy xác nhận từng câu** rồi mới điền.
7. Khoá repo SAU release (chuyển CI sang Xcode Cloud nếu cần).

---

## 11. Quyền xin và lý do (đúng chữ trong `InfoPlist.xcstrings`)

| Quyền | Khi nào hỏi | Chữ người dùng thấy (vi) |
|---|---|---|
| Camera | chụp ảnh/quay clip khi đăng bài, quét chữ, **quét mã QR** (Lá chắn) | «TappyAI dùng camera để chụp ảnh, quay video cho bài đăng của bạn và quét thực đơn, hoá đơn, mã QR. Ảnh chỉ được dùng khi bạn đăng bài hoặc quét.» |
| Thư viện ảnh (đọc) | khi bạn **chọn** ảnh/video để đăng, đặt ảnh đại diện, quét, hoặc chọn ảnh có mã QR | «TappyAI chỉ đọc ảnh và video bạn chọn … Không đọc phần còn lại của thư viện.» |
| Thư viện ảnh (ghi) | lưu thẻ chia sẻ | «TappyAI lưu vào thư viện ảnh những thẻ chia sẻ và hình ảnh bạn chọn lưu về máy.» |
| Micro | nhập giọng nói trong chat, ghi tiếng cho video đăng | «TappyAI dùng micro để nhập giọng nói khi trò chuyện và ghi âm thanh cho video bạn đăng.» |
| Nhận diện giọng nói | lần đầu dùng giọng nói | (en) «… Your voice is transcribed by Apple speech recognition and is not stored by TappyAI.» |
| Vị trí khi dùng app | tìm quanh đây | «… chỉ khi bạn cho phép, để tìm địa điểm quanh bạn. Không bao giờ dùng nền.» |
| Thông báo | khi bật | tuỳ chọn; từ chối vẫn dùng được |

Mọi quyền tuỳ chọn; từ chối không làm app sập (QR: từ chối camera ⇒ vẫn chọn ảnh có mã).

## 12. Lịch đề nghị (nộp — phát hành — cập nhật)

1. Web phát hành Phase 7 lên production (gồm báo cáo/chặn, xoá tài khoản kiểu mới, trang `/privacy` `/terms` `/delete-account` `/community-guidelines`).
2. Huy bật Sign in with Apple ở Supabase production; web bật Zalo `app_state`; Huy tạo tài khoản demo (không trước).
3. **Smoke production** (đăng nhập Google/email/Apple, chat khách, xoá tài khoản TEST, báo cáo/chặn, Lá chắn) — **CHỜ Huy nói «OK release» bằng chính lời của Huy** (đường release đang ĐÓNG BĂNG từ 02/10: UAT web 9474f65 trượt, chờ SHA mới). Chỉ khi có lệnh đó mới nộp; cờ `p8.*`, `accountSelfDelete`, `appleSignIn` phải đang BẬT khi người duyệt chạy.
4. Chọn **Manually release** (tự quyết ngày lên kệ).
5. Bản sửa lỗi nhỏ sau đó nộp thành **1.0.1** (tăng `MARKETING_VERSION`); cái nào đổi được qua máy chủ (cờ, chữ trả về, dữ liệu) **không cần nộp lại**.
6. Xem `POST-SUBMIT-PLAN.md` cho giai đoạn chờ duyệt, trả lời Resolution Center, bị từ chối.
