# iOS — tình trạng hiện tại

Ảnh chụp tại `ci/ios-build-rc` @ `adcb1540` (2026-09-28, đã gồm #257, #258, #259). Chỉ đọc mã nguồn và git log, không build lại. Chưa có gì được kiểm trên iPhone thật: "có" nghĩa là mã tồn tại, màn tới được và gọi API thật; CI chỉ chứng minh biên dịch được và unit test xanh.

## 1. Cấu trúc project

| Mục | Hiện trạng |
|---|---|
| Thư mục | `ios/TappyAI/{App, Core, DesignSystem, Features, Resources}`, `ios/TappyAITests`, `ios/TappyAIUITests`, `ios/Config` (xcconfig), `ios/scripts` |
| Features | Auth, Chat, Deals, Discovery, GroupDining, Home, Music (ẩn), Notifications, Planner, Profile, Reviews, UtilityTools — 246 file `.swift` |
| Target | `TappyAI` (app), `TappyAITests` (unit), `TappyAIUITests` (UI) |
| File project Xcode | **Không commit** `.xcodeproj` — sinh bằng XcodeGen từ `ios/project.yml` (`xcodegen generate`); CI cũng sinh như vậy |
| iOS tối thiểu | 16.0 (ghi chú trong `project.yml`: giá trị tạm, chưa chốt ADR-003) |
| Thiết bị | Chỉ iPhone (`TARGETED_DEVICE_FAMILY = 1`) |
| Phiên bản | `MARKETING_VERSION 1.0.0`; build number = số run CI |
| Swift | 5.9, strict concurrency `minimal`. Bản Swift 6 nằm ở `ios/swift6` (PR #256, chưa merge) |
| Thư viện (SPM) | Chỉ **supabase-swift** `from: 2.0.0`. Còn lại dùng framework hệ thống (StoreKit 2, AuthenticationServices, Speech, AVFoundation, CoreImage, UserNotifications) |

## 2. Màn hình so với Android

`docs/uat/ANDROID-PARITY-MAP.md` **không có trên bất kỳ nhánh GitHub nào** (đã tìm cả `main`, `rc/web-uat`, `ci/ios-build-rc`). Bảng dưới so với các màn thực có trong `android/app/src/main` (`android/docs/FEATURE_STATUS.md` đã cũ, ngày 2026-07-13). Tab hai bên giống nhau: Home, Chat, Explore, Deals, Profile.

| Màn (Android) | iOS | Tình trạng | Ghi chú |
|---|---|---|---|
| Đăng nhập / OTP email | `Auth/UI/AuthFlowView`, `RegisterView` | có | Google, Zalo, email OTP, đăng ký; Apple ẩn |
| Onboarding | `Auth/UI/OnboardingView` | có | |
| Home | `Home/UI/HomeView` | có | |
| Smart Tools hub | — | thiếu | iOS chỉ có lưới 7 ô trên Home |
| Games (SuperTux) | — | thiếu | |
| Chat + giọng nói | `Chat/UI/ChatView` | có | Giọng nói nằm trong thanh nhập |
| Explore feed | `Reviews/UI/ReviewsFeedView` | một phần | Thiếu lối vào tìm kiếm, hộp thư, hồ sơ creator |
| Chi tiết review | `Reviews/UI/ReviewDetailView` | có | |
| Soạn review (ảnh/video) | `Reviews/UI/CreateReviewView` | có | Xoá GPS/metadata trước khi upload |
| Tìm kiếm review | `Reviews/UI/UserSearchView` | một phần | Chỉ tìm người, không tìm review |
| Hồ sơ tác giả / clip | `Reviews/UI/UserProfileView` | một phần | Chưa có trình xem clip dạng lướt |
| Hồ sơ của tôi + sửa | `Profile/UI/AccountView`, `EditProfileView` | một phần | Không có hồ sơ creator trong Explore |
| Deals | `Deals/UI/DealsView` | có | |
| Gợi ý | `Discovery/UI/RecommendationsView` | có | |
| Chi tiết dịch vụ | `Discovery/UI/ServiceDetailView` (+ `BookingFormView`) | có | |
| Tiền tệ / Dịch / Quét / Scam Shield / Viết tiếng Việt | `UtilityTools/UI/*` | có | |
| Chia hoá đơn | `UtilityTools/UI/SplitBill` | có | Tính tại máy |
| Tử vi / Tarot / Cung hoàng đạo | `UtilityTools/UI/Fortune/*` | có | Dữ liệu tại máy, như Android |
| Ăn nhóm + chi tiết nhóm | `GroupDining/UI/*` | có | Có deep link `/group/{id}` |
| Hồ sơ (tab) | `Profile/UI/ProfileMainView` (+ `ProfileQRView`) | có | |
| Cài đặt | `Profile/UI/SettingsView` | có | Có xoá tài khoản |
| Cài đặt thông báo | `Profile/UI/NotificationsSettingsView` | có | |
| Hộp thư thông báo | `Notifications/UI/NotificationsInboxView` | một phần | Không có tab Tin nhắn |
| Tin nhắn riêng (thread) | — | thiếu | |
| Gói Pro | `Profile/UI/SubscriptionView` | một phần | Ẩn theo `showProUpgrade`; nút mua tắt khi chưa có sản phẩm StoreKit |
| Tappy biết gì | `Profile/UI/TappyKnowsView` | có | |
| Lịch sử chat | `Profile/UI/ChatHistoryView` | có | Chuỗi "phút/giờ/ngày trước" cứng tiếng Việt |
| Đã lưu | `Discovery/UI/FavoritesView` | có | |
| Đặt chỗ | `Profile/UI/BookingsView` | có | |
| Sở thích | `Profile/UI/PreferencesView` | có | |
| Theo dõi giá | `Profile/UI/PriceWatchesView` | có | |
| Kết nối ứng dụng | `Profile/UI/IntegrationsView` | một phần | Ẩn theo `showAppConnections` |
| Review của tôi | `Reviews/UI/MyPostsView` | có | |
| Kế hoạch | `Planner/UI/PlannerView` | có | |
| Theo dõi / Người theo dõi | `Reviews/UI/SocialView` | có | |
| Hướng dẫn / Điều khoản / Quyền riêng tư | `Profile/UI/HowToUseView`, `LegalPageView` | có | |
| Maps, Discovery hub | — | thiếu | Android cũng không có đường vào (mã chết) |
| Nhạc | `Music/*` | ẩn | `ProductFlags.showMusic = false`, giống Android |

Chỉ iOS có: QR hồ sơ, form đặt chỗ, sheet so sánh mua sắm, sheet bình luận / chia sẻ / đồng ý điều khoản.

## 3. Hợp đồng API

| Hạng mục | iOS | Bằng chứng / ghi chú |
|---|---|---|
| `/api/chat` streaming | có | `Core/Networking/StreamingClient.swift` — SSE data-stream của Vercel |
| Body `/api/chat` | có | `messages`, `userPreferences`, `responseStyle`, `userLocation` (`Chat/Data/ChatService.swift:179`) |
| `chatSessionId` | chưa | **Không có ở đâu trên GitHub** (iOS, Android, backend). Hội thoại lưu riêng qua `/api/conversations` |
| `[TAPPY_PLAN]` | có | `Chat/Model/ContentParser.swift:224` → `TripPlanCardView`; còn đọc CTA_BUTTONS, FOLLOWUPS, TAPPY_SHOPPING, TAPPY_PLACES |
| `[TAPPY_ASK]` | chưa | Không có trên GitHub ở cả ba nền tảng |
| Header `x-tappy-caps` | chưa | Không có trên GitHub ở cả ba nền tảng |
| Header `x-tappy-surface` | **chưa** | Backend đọc (`src/app/api/chat/route.ts:1380`), Android gửi `android`; iOS không gửi → server coi iOS không hiển thị được thẻ |
| Header `x-tappy-age-declared` | có | Chỉ với khách (`Chat/Model/AgeGate.swift`) |
| Đăng nhập email OTP | có | Supabase `signInWithOTP` / `verifyOTP` |
| Đăng ký email + mật khẩu | có | Supabase `signUp`; **không có** đăng nhập bằng mật khẩu |
| Google | có | Supabase OAuth + `ASWebAuthenticationSession` |
| Zalo | có | `/api/auth/zalo` trong web session, token qua fragment, dự phòng PKCE |
| Khách | có | `POST /api/auth/anonymous`; sau khi đăng nhập gọi `POST /api/auth/claim-anonymous` (cả 5 đường) |
| Sign in with Apple | một phần | Có mã (native sheet → `signInWithIdToken`), ẩn tới khi server bật cờ |
| Upload ảnh review | có | Multipart `POST /api/reviews/upload`; tối đa 6 ảnh, 5 MB |
| Upload video | có | `POST /api/upload/video`: create-upload-session → PUT → complete-upload; 150 MB, 300 s; xoá GPS/metadata |
| Upload avatar | có | Multipart `POST /api/profile` |
| Chia sẻ | có | Share sheet; link `www.tappyai.com/reviews/…`, `/plan/…`, `/group/…`, `/users/…`; `POST /api/plans/share` |
| Ghi nhận lượt chia sẻ review | chưa | Backend có `/api/reviews/[id]/share`, iOS không gọi |
| Hồ sơ | có | `GET` / `PATCH /api/profile` (tên, bio, ngôn ngữ, ngày sinh) |

## 4. Trạng thái build

| Mục | Hiện trạng |
|---|---|
| CI GitHub Actions | Có: `.github/workflows/ios.yml`, `macos-latest`, XcodeGen |
| Job "Build + TappyAITests" | Chạy mỗi PR đụng `ios/**` và khi chạy tay. Xanh: PR #259 (run #47, `a6a60af5`) và `adcb1540` (run #49) |
| Job TestFlight | Chỉ chạy tay (`workflow_dispatch`): archive có ký → upload bằng App Store Connect API key → chờ Apple xử lý (`ios/scripts/asc_wait_for_build.py`) |
| Lần TestFlight gần nhất | Run #49 (2026-09-28, `adcb1540`) **thất bại ở bước Archive**: profile "TappyAI App Store CI" thiếu Sign In with Apple. Phiên Local đang bật capability, tạo lại profile và chạy lại |
| Trước đó | Build 16 upload được nhưng Apple **từ chối** (ITMS-90683, thiếu chuỗi quyền nhận dạng giọng nói); đã sửa ở `8cfaeb7e` |
| Đã lên TestFlight chưa | **Chưa xác nhận được** build nào ở trạng thái VALID. API GitHub không truy cập được lúc viết nên không đọc được các run sau run #49 |
| Ký app | Có, ký thủ công trong CI. Chứng chỉ phân phối + profile App Store + API key nằm trong secrets (`DIST_CERT_P12_BASE64`, `DIST_CERT_P12_PASSWORD`, `APPSTORE_PROFILE_BASE64`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, `APPLE_TEAM_ID`). Chạy local: `CODE_SIGN_STYLE Automatic`, `DEVELOPMENT_TEAM` để trống, tự điền trên máy |

## 5. Phần trên GitHub và phần có thể còn trên PC

| Nội dung | Vị trí |
|---|---|
| Toàn bộ mã iOS đã merge (#257, #258, #259) | GitHub `ci/ios-build-rc`. Nhánh này **chưa vào `main`** (65 commit iOS chưa có trong `main`) |
| Swift 6 + parser ngày + sửa DIContainer / realtime | GitHub `ios/swift6` (PR #256, 7 commit, chưa merge) |
| `ios/marker-leak-parity`, `ios/shopping-decision-evidence-parity` | GitHub; nội dung đã có trong `ci/ios-build-rc` qua commit khác, có thể xoá nhánh |
| `docs/uat/ANDROID-PARITY-MAP.md` | **Không có trên GitHub** → có thể còn trên PC |
| `chatSessionId`, `[TAPPY_ASK]`, `x-tappy-caps` | **Không có trên GitHub** (cả backend) → nếu đã làm thì còn trên PC hoặc nhánh chưa push |
| `ios/Config/Secrets.xcconfig` | Chỉ trên máy (gitignore, đúng thiết kế); CI tạo từ secrets |
| `TappyAI.xcodeproj` | Sinh trên máy / CI từ `project.yml`, không commit (đúng thiết kế) |
| Chứng chỉ, profile, file `.p8` | Apple Developer + GitHub secrets; bản gốc ở máy người tạo |
| Worktree `C:\wtrc` | PC; cần `git pull origin ci/ios-build-rc` để theo kịp |
| Lịch sử | iOS viết trên Windows không có Mac (commit `9393357d` "complete Windows implementation and pre-Mac validation"); lần biên dịch thật đầu tiên là CI |

## 6. Yêu cầu riêng của Apple

| Yêu cầu | Tình trạng | Ghi chú |
|---|---|---|
| Sign in with Apple | một phần | Mã + entitlement có. Còn thiếu: capability trên App ID / profile (đang làm), provider Apple trên Supabase, cờ `appleSignIn` hoặc provider "apple" ở `/api/config` |
| Xoá tài khoản trong app | có (theo cờ) | `Profile/UI/AccountDeletionView` → `POST /api/account/delete`; chỉ hiện khi `flags.accountSelfDelete` bật trên server |
| Apple IAP | một phần | StoreKit 2 (`Core/Payments/StoreKitProvider`), sản phẩm `com.tappyai.ios.pro.monthly`, xác minh qua `/api/iap/apple/verify` (backend có, dùng `src/lib/apple-iap/`). Màn Pro đang ẩn; sản phẩm chưa tạo / chưa duyệt trên App Store Connect |
| Thông báo đẩy APNs | một phần | App đăng ký token và gửi `provider: "apns"` tới `/api/notifications/subscribe`, nhưng **backend chỉ nhận `fcm` / `webpush` → trả 400**; server chưa có mã gửi APNs. Entitlement `aps-environment` có |
| Chuỗi xin quyền | có | Camera, micro, nhận dạng giọng nói, thư viện ảnh (đọc + ghi), vị trí khi dùng app |
| PrivacyInfo.xcprivacy | có | `Resources/PrivacyInfo.xcprivacy` (API UserDefaults, dữ liệu thu thập, không tracking) |
| Universal Links | một phần | App nhận `/reviews`, `/users`, `/group`, `/plan`…; file AASA của server chỉ khai báo `/r/*` và 5 trang danh mục, và trả 404 nếu thiếu env `IOS_UNIVERSAL_LINKS_APP_ID` |

## 7. Lỗi đã biết và khối lượng để ngang Android

Ước lượng cho một người, tính theo ngày công, chưa gồm thời gian chờ Apple duyệt.

| # | Việc | Loại | Ước lượng |
|---|---|---|---|
| 1 | Profile App Store thiếu Sign In with Apple → TestFlight hỏng | cấu hình Apple | đang làm (phiên Local) |
| 2 | iOS không gửi `x-tappy-surface` → thẻ mua sắm không hiện | lỗi | 0,5 |
| 3 | APNs: backend chưa nhận `apns` và chưa gửi được | thiếu (backend) | 2–3 |
| 4 | AASA thiếu `/reviews`, `/users`, `/group`, `/plan`; cần env Team ID | thiếu (web) | 0,5 |
| 5 | `StreamingClient.swift`: `case "8"` lặp, nhánh annotation không bao giờ chạy | lỗi nhỏ | 0,5 |
| 6 | 3 màn còn tự parse ngày (`FavoritesView`, `ServiceDetailView`, `Planner.swift`) | lỗi nhỏ | 0,5 |
| 7 | `ChatHistoryView`: "phút/giờ/ngày trước" cứng tiếng Việt | i18n | 0,5 |
| 8 | Merge `ios/swift6` (#256) | kỹ thuật | 1 |
| 9 | Tin nhắn riêng (tab Tin nhắn + thread, realtime) | thiếu | 5–7 |
| 10 | Explore: tìm review, hồ sơ creator, xem clip dạng lướt | thiếu | 3–4 |
| 11 | Smart Tools hub | thiếu | 1 |
| 12 | Games (SuperTux WebView) | thiếu | 2–3 |
| 13 | `chatSessionId` / `[TAPPY_ASK]` / `x-tappy-caps` — sau khi phần backend được push | chờ backend | 2–3 |
| 14 | Kích hoạt IAP (tạo sản phẩm, bật màn Pro, thử sandbox) | thiếu | 2 |
| 15 | Kiểm thử trên iPhone thật (đăng nhập, upload, chia sẻ, deep link, thông báo) | QA | 3–5 |

**Tổng: khoảng 25–35 ngày công (5–7 tuần một người).** Mục 1–8 (khoảng 6 ngày) đủ cho một bản TestFlight dùng được. Mục 9–14 là phần tính năng Android có mà iOS chưa có.
