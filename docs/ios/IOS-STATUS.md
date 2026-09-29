# iOS — tình trạng hiện tại

Ảnh chụp CHỈ ĐỌC, không sửa code, không build. Nền iOS: `ci/ios-build-rc` @ `adcb1540` (2026-09-28, gồm #257–#259) — **chưa có commit nào mới**. Nền so sánh: `rc/web-uat` @ `cc625119` (2026-09-29, mới hơn `ci/ios-build-rc` 265 commit, không commit nào đụng `ios/`). iOS tạm dừng ở đây — làm lại sau khi xong Luna và Phase 8.

## 0. Bản TestFlight ngày 28/9 (owner đã thấy)

**Run #50** (`workflow_dispatch`, id `36370450108`), commit `adcb1540`, chạy 02:36–02:44 UTC 28/9. Cả hai job xanh; log job Archive+TestFlight: `[02:44:43] upload=COMPLETE build=VALID` → `✅ Build 50 processed by Apple (VALID) — available in TestFlight`. Đây là lần đầu lên được TestFlight — trước đó run #49 (cùng commit) hỏng ở bước Archive vì thiếu capability Sign in with Apple trên profile; Local đã bật capability, tạo lại profile rồi chạy lại thành run #50. Không có run TestFlight nào mới hơn.

"Bố cục cũ": đúng — `adcb1540` có TRƯỚC toàn bộ đợt làm lại giao diện theo mockup D:\redesign (Đã lưu, Viết content, Gợi ý, cổng 18+, hub Tôi…) đang chạy trên `rc/web-uat`/Android từ 28–29/9 (`docs/uat/ANDROID-PARITY-MAP.md`, `ANDROID-REQUESTS.md` §2). iOS chưa nhận bất kỳ thay đổi nào trong đợt đó.

## 1. iOS thiếu gì so với bản web + Android mới nhất (`rc/web-uat` @ `cc625119`)

### 1a. Màn hình

| Màn | iOS (`ci/ios-build-rc`) | Web/Android mới nhất | Thiếu |
|---|---|---|---|
| Đã lưu (Saved) | `Discovery/UI/FavoritesView` — 2 dòng đếm | Mockup: hero + mascot, chip lọc (Tất cả/Địa điểm/Bài viết/Video), 2 thẻ đếm có mô tả, trạng thái rỗng "Khám phá ngay" (Android đã làm theo mockup) | Toàn bộ giao diện mới |
| Viết content | `UtilityTools/UI/VietContent` — hero hồng, icon emoji | Mockup: hero xanh-tím + mascot, logo FB/TikTok/IG, "Thử gợi ý", tone có icon, nút gradient | Toàn bộ giao diện mới |
| Gợi ý cho bạn | `Discovery/UI/RecommendationsView` | Web đã sửa theo mockup (hero, thẻ "Hỏi Tappy về chỗ này") | Chưa theo mockup mới |
| Cổng 18+ | Hỏi trong luồng chat | Mockup: màn riêng Ngày/Tháng/Năm + "Ngày sinh được giữ riêng tư" | Chưa có màn riêng |
| Hub "Tôi" | 9 mục, khách không bị khoá dòng nào | Web: đúng 9 mục theo mockup, khách bị khoá "Cần đăng nhập" | Khách chưa bị khoá đúng như thiết kế |
| Đăng nhập bằng mật khẩu | Không có (chỉ đăng ký) | Web có Email + Mật khẩu | Thiếu đăng nhập mật khẩu |
| Explore: tìm review, hồ sơ creator, xem clip dạng lướt | Chỉ tìm người | Web/Android có | một phần (đã ghi ở bản trước) |
| Tin nhắn riêng (DM) | Không có | Android có `MessagingApi` | Thiếu |
| Ảnh chia sẻ (share card) | Chỉ chia sẻ link/text qua UIActivityViewController | Web + Android **mới (29/9)**: vẽ ảnh thẻ tại máy (review/clip/gợi ý/kế hoạch/QR hồ sơ), theo mẫu cố định, "Lưu về máy" + gửi TikTok bằng đúng ảnh đó (`docs/design/share-layouts/`, `ShareImageRenderer.kt`/canvas web) | Thiếu toàn bộ tính năng vẽ ảnh chia sẻ |
| Smart Tools hub, Games | Không có | Android có (Games cũng chưa dùng được trên web) | Thiếu |

### 1b. Hợp đồng `/api/chat` — đây là phần đổi nhiều nhất kể từ lần đọc trước (28/9 → 29/9)

| Mục | Hợp đồng mới nhất (`rc/web-uat`) | iOS hiện tại | Thiếu |
|---|---|---|---|
| `chatSessionId` | **CHỐT 29/9 (R14/Q7, Huy duyệt).** Body `/api/chat` thêm `chatSessionId`: UUID v4 client sinh 1 lần khi mở cuộc chat mới, gửi y nguyên mọi lượt (kể cả lượt 1, kể cả khách); mở lại từ lịch sử thì dùng lại mã cũ. Server khoá trạng thái tư vấn theo (chủ sở hữu, mã). Thiếu mã → chạy như trước (tương thích ngược bản cũ). Web đã chuyển sang gửi. | Không gửi trường này | **Cần thêm**: sinh UUID v4 khi mở chat mới, giữ trong `ChatSession`/state hiện có, gửi ở mọi lượt, dùng lại khi mở lại lịch sử |
| `[TAPPY_ASK]` | **Định dạng CHỐT 29/9.** Server gửi `[TAPPY_ASK]{"v":1,"questions":[{"id","q","options":[...]}]}[/TAPPY_ASK]` cho client báo `x-tappy-caps: ask`. Không báo caps → vẫn nhận dạng cũ (mỗi câu hỏi 1 dòng `• Câu? (A / B / C)` + `[FOLLOWUPS]` của câu 1) — **tương thích ngược, không bắt buộc phải làm ngay** | Không gửi `x-tappy-caps`, không có parser `[TAPPY_ASK]` | iOS vẫn chạy được (nhận dòng đọc được), nhưng thiếu UI hỏi nhanh (chip theo nhóm + ô gõ tự do) mà web/Android đã có |
| `x-tappy-caps` | Request header, hiện có giá trị đã định nghĩa: `ask` (bật `[TAPPY_ASK]`) | Không gửi | Thiếu — cần gửi `x-tappy-caps: ask` để nhận cú pháp hỏi nhanh mới |
| `x-tappy-surface` | Request header: `web` hoặc `android` → server ẩn bớt chữ trùng lặp với thẻ card trong prose (giả định client tự vẽ thẻ) | Không gửi → server coi iOS "không vẽ được thẻ", nhồi link/ảnh thô vào văn bản | Thiếu — cần gửi `x-tappy-surface: ios` và xin server thêm giá trị này vào danh sách nhận `rendersDecisionCard = true` (đã có iOS parse `tappy.places.v1` qua card riêng, đủ điều kiện) |
| `[TAPPY_PLAN]` (thẻ kế hoạch) | Định dạng không đổi từ lần trước; R15 (29/9) sửa lỗi JSON cụt/hỏng ở server — không cần sửa client | iOS đã parse (`ContentParser.swift`) và có `TripPlanCardView` | Không thiếu — hưởng lợi tự động từ sửa lỗi phía server |
| Dòng `💰 Ngân sách: …` sau `[/TAPPY_PLAN]` | Mới (83853cc, 29/9): văn bản thường, in ngay sau khối kế hoạch khi user nêu ngân sách | Chưa kiểm — nhiều khả năng đã hiện đúng vì chỉ là văn bản thường sau marker | Không cần sửa, nên xác nhận lại khi build tiếp |
| Tiêu đề in đậm cố định trong "Kế hoạch chi tiết" (Ăn uống/Mua sắm/Giải trí/Spa) | Mới (29/9), văn bản markdown in đậm thường | iOS render markdown cơ bản (chưa kiểm in đậm) | Cần xác nhận renderer markdown xử lý đúng |
| `8:` annotation `tappy.turn.v1` (domain, turnType, usd) | Mới (29/9) | iOS đọc `8:` theo `kind`, bỏ qua kind lạ | Không thiếu — tự bỏ qua đúng theo hợp đồng |
| Thẻ hỏi lượt CHỐT: `**Mình chọn: <tên>**` phải trùng thẻ #1 | R17: có lúc lệch (server đôi khi không gửi `picked`) — đang chờ sửa phía server | iOS chưa có logic riêng cho lượt CHỐT | Theo dõi, chưa cần sửa ngay |

### 1c. Khác

| Mục | Hiện trạng |
|---|---|
| Ghi nhận lượt chia sẻ review (`POST /api/reviews/[id]/share`) | Backend có, iOS không gọi (đã ghi lần trước) |
| Universal Links / AASA | AASA chỉ khai `/r/*` + 5 trang danh mục, thiếu `/reviews`, `/users`, `/group`, `/plan`; cần biến môi trường `IOS_UNIVERSAL_LINKS_APP_ID` (như trước, chưa đổi) |

## 2. Yêu cầu riêng của Apple

| Yêu cầu | Tình trạng | Ghi chú |
|---|---|---|
| Sign in with Apple | **Có, hoạt động** | Mã + entitlement + capability trên profile đã xong (Local, 28/9); build 50 archive/ký thành công. Còn ẩn vì chờ: provider Apple trên Supabase, cờ `appleSignIn` hoặc provider "apple" ở `/api/config` |
| Xoá tài khoản bắt đầu từ trong app | **Có, theo cờ** | `Profile/UI/AccountDeletionView` → `POST /api/account/delete`; hiện khi `flags.accountSelfDelete` bật. Khi cờ tắt (hiện tại), Android/web dùng luồng gửi yêu cầu qua email tới `support@tappyai.com` — iOS **chưa có màn tương đương** cho trường hợp cờ tắt (chỉ có luồng tự xoá, chưa rõ có fallback email hay không, cần kiểm lại) |
| Apple IAP | **Một phần** | StoreKit 2 đã viết (`Core/Payments/StoreKitProvider`), gọi `POST /api/iap/apple/verify` (backend đã có, `src/lib/apple-iap/`). Còn thiếu: sản phẩm `com.tappyai.ios.pro.monthly` tạo/duyệt trên App Store Connect; màn Pro đang ẩn theo `showProUpgrade` (giống Android — Android cũng ẩn, `SHOW_PRO_UPGRADE=false`, không có Play Billing) |
| Thông báo đẩy | **Chưa hoạt động — đề xuất dùng Firebase Cloud Messaging (FCM)** | Hiện tại iOS tự đăng ký APNs rồi gửi `provider: "apns"` tới `/api/notifications/subscribe`, nhưng backend **chỉ nhận `fcm` hoặc `webpush`** (`src/app/api/notifications/subscribe/route.ts`) → mọi lần gửi đều bị 400. Android đã dùng Firebase Cloud Messaging (`TappyFirebaseMessagingService.kt`, `google_analytics_adid_collection_enabled=false`) và gửi đúng `provider: "fcm"`. **Đề xuất**: thêm Firebase SDK (FirebaseMessaging) vào iOS thay vì tự quản token APNs thô — Firebase Messaging trên iOS vẫn dùng APNs bên dưới (cần APNs key/cert trong Firebase Console) nhưng phát ra **FCM token**; app gửi token đó với `provider: "fcm"` như Android đang làm. **Lợi ích: backend không cần sửa gì** (route đã nhận `fcm`), chỉ cần đăng ký app iOS trong cùng project Firebase và thêm khoá APNs Auth Key vào Firebase Console (việc của Huy, không phải code). Không cần Huy quyết thêm — đây là hướng kỹ thuật thay thế cho việc sửa backend nhận thêm `provider: "apns"` |
| Quyền camera / ảnh / vị trí | **Có** | Chuỗi xin quyền đầy đủ: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`, `NSPhotoLibraryUsageDescription` (+Add), `NSLocationWhenInUseUsageDescription`. Cần đối chiếu lại câu chữ với `/privacy` mới (`e3413ca`, 29/9: vị trí ghi rõ "chính xác, tuỳ chọn, chỉ khi cho phép, không chạy nền") — chưa kiểm câu tiếng Việt trong Info.plist có khớp chính sách mới hay không |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | **Có** | `Resources/PrivacyInfo.xcprivacy` khai API UserDefaults, không tracking. Cần bổ sung khai báo nếu thêm Firebase (Google đã có hướng dẫn `PrivacyInfo` riêng cho FirebaseMessaging/FirebaseAnalytics — làm cùng lúc với việc thêm SDK) |

## 3. Trạng thái build / CI (không đổi so với lần đọc trước, xác nhận lại)

| Mục | Hiện trạng |
|---|---|
| CI | `.github/workflows/ios.yml`, macOS runner, XcodeGen sinh project mỗi lần chạy (không commit `.xcodeproj`) |
| Build + Test | Xanh trên `adcb1540` (run #50 job "Build + TappyAITests") |
| TestFlight | **Build 50 = VALID, đã lên TestFlight** (xem mục 0). Đây là bản owner thấy ngày 28/9 |
| Ký app | Ký thủ công trong CI bằng chứng chỉ phân phối + profile App Store lấy từ secrets; profile đã có Sign in with Apple từ 28/9 |
| Trên GitHub vs còn trên PC | `ci/ios-build-rc` (iOS) không đổi từ lần đọc trước. `rc/web-uat` đã tiến xa (265 commit, toàn bộ là web/Android/server, không ios/). Không thấy thêm gì "chỉ trên PC" ngoài các mục đã ghi lần trước (`Secrets.xcconfig`, `.xcodeproj` sinh tại máy — đúng thiết kế) |

## 4. Ước lượng khối lượng để iOS ngang bản mới nhất (web + Android, `rc/web-uat` @ `cc625119`)

Một người, ngày công, chưa gồm thời gian chờ Apple duyệt / Firebase thiết lập console.

| # | Việc | Ước lượng |
|---|---|---|
| 1 | Gửi `chatSessionId` (UUID v4, sinh khi mở chat mới, giữ khi mở lại lịch sử) | 0,5 |
| 2 | Gửi `x-tappy-surface: ios` (cần xin server thêm giá trị vào whitelist) + `x-tappy-caps: ask` | 0,5 (+ phối hợp backend) |
| 3 | Parser `[TAPPY_ASK]` + UI chip nhóm câu hỏi + ô gõ tự do (giống web/Android) | 1,5 |
| 4 | Ảnh chia sẻ vẽ tại máy (review/clip/gợi ý/kế hoạch) theo mẫu đã duyệt | 3–4 |
| 5 | Giao diện mới: Đã lưu, Viết content, Gợi ý, cổng 18+ riêng, hub Tôi (khoá khách) | 4–5 |
| 6 | Đăng nhập bằng mật khẩu (đang chỉ có đăng ký) | 0,5 |
| 7 | Thông báo đẩy qua Firebase Cloud Messaging (thêm SDK, đổi `provider: "apns"` → `"fcm"`) | 1–1,5 |
| 8 | Apple IAP: tạo sản phẩm trên App Store Connect, bật màn Pro, thử sandbox | 2 |
| 9 | AASA thiếu path, câu chữ quyền vị trí đối chiếu `/privacy` mới | 0,5 |
| 10 | Merge `ios/swift6` (#256, Swift 6 + parser ngày) | 1 |
| 11 | Tin nhắn riêng (DM) | 5–7 |
| 12 | Explore: tìm review, hồ sơ creator, xem clip dạng lướt | 3–4 |
| 13 | Smart Tools hub | 1 |
| 14 | Kiểm thử trên iPhone thật (đăng nhập, upload, chia sẻ, deep link, thông báo, chat session mới) | 3–5 |

**Tổng: khoảng 27–37 ngày công (5,5–7,5 tuần một người).** Mục 1–3 (khoảng 2,5 ngày) là phần hợp đồng chat mới nhất — làm trước để iOS không tụt lại thêm so với web/Android đang thay đổi nhanh. Mục 4–9 (khoảng 12–14 ngày) đưa iOS lên ngang bản 29/9 hiện tại. Mục 11–13 là các mảng Android có mà iOS chưa từng có.

**Ghi chú:** `rc/web-uat` đang đổi liên tục (265 commit trong ~1 ngày). Bảng trên là ảnh chụp tại `cc625119`; nên đọc lại `docs/uat/ANDROID-REQUESTS.md` §2 khi quay lại làm iOS, vì đó là nơi ghi mọi thay đổi hợp đồng server mới nhất.
