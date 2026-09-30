# IOS-REQUESTS — việc iOS cần từ server/web và từ Apple (phiên `ios/sync-2026-09-30`)

Phiên iOS chỉ sửa `ios/` và workflow `ios.yml`. Mọi thứ dưới đây là việc NGOÀI phạm vi đó — ghi ở đây, không tự sửa.

## 1. Server / web (phiên web làm)

| # | Yêu cầu | Vì sao | Chỗ trong code server |
|---|---|---|---|
| I1 | Chấp nhận `x-tappy-surface: ios` như `web`/`android`: `rendersDecisionCard = true` | iOS gửi header này từ nay (đã vẽ thẻ địa điểm/mua sắm từ annotation `tappy.places.v1`). Giá trị lạ hiện coi là "client không vẽ thẻ" → server nhồi ảnh/link thô vào chữ | `src/lib/ai/decisionSurface.ts` |
| I2 | Gửi `[TAPPY_ASK]` cho request có `x-tappy-caps` chứa `ask` (đúng đề nghị R10) — iOS đã gửi `x-tappy-caps: ask` và có parser | Không cần thêm `ios` vào `ASK_BLOCK_SURFACES`; iOS cũ (build 50) không có parser và không gửi caps nên không bị ảnh hưởng | `consultBrain` / `ASK_BLOCK_SURFACES` |
| I3 | Xác nhận `chatSessionId` là UUID v4 chữ thường (iOS gửi `UUID().uuidString.lowercased()`) | Regex phía server phải chấp nhận chữ thường | route `/api/chat` |
| I4 | `/api/recommendations` không đọc khai tuổi của khách (R6) — iOS xử lý như Android: khách đã khai vẫn 403 thì hiện lời mời đăng nhập | Muốn khách xem được thì route phải đọc `x-tappy-age-declared` | `src/app/api/recommendations/route.ts` |
| I5 | `GET /api/users/{id}` không trả `cover_url` → iOS chưa vẽ ảnh bìa trên hồ sơ người khác (Android cũng vậy) | Nếu muốn ảnh bìa hiện cho người xem | route `/api/users/[id]` |
| **I6** 🟠 | **MOB-1 — trả lại `app_state` cho app.** iOS gửi `GET /api/auth/zalo?returnTo=/&platform=ios&app_state=<43 ký tự base64url>`. Server: (1) nhận `app_state` chỉ khi khớp `^[A-Za-z0-9_-]{16,128}$`, lưu cookie httpOnly/secure/lax `zalo_login_app_state` hạn 300 s như các cookie `zalo_login_*`; (2) ở redirect cuối về app thêm `&app_state=<giá trị>` vào **fragment** (`tappyai://auth/callback#access_token=…&refresh_token=…&expires_at=…&app_state=…`); nếu dùng PKCE `?code=` thì thêm vào query; (3) xoá cookie sau khi dùng. `/auth/confirm?platform=ios` (magic link) cũng nên nhận `app_state` và trả lại như vậy — iOS hiện không dùng magic link nên không bắt buộc. | Từ commit MOB-1, iOS **từ chối** mọi callback không có `app_state` khớp (state ngẫu nhiên 32 byte trong Keychain, hạn 10 phút, dùng một lần). ⇒ **Đăng nhập Zalo trên iOS không chạy được tới khi server có I6** — production phải có I6 trước bản TestFlight kế tiếp. Google không cần: iOS chỉ nhận PKCE `code` (verifier của lần đăng nhập đó là ràng buộc). Android dùng cùng tên `app_state`. | `src/app/api/auth/zalo/route.ts`, `…/zalo/callback/route.ts` (hoặc route cuối về app), `src/app/auth/confirm/route.ts:55-62` |

## 2. Yêu cầu của Apple — danh sách và đề xuất (CHƯA làm)

| # | Yêu cầu (App Review) | Hiện trạng iOS | Đề xuất |
|---|---|---|---|
| A1 | **Sign in with Apple** (4.8) — bắt buộc khi có đăng nhập bên thứ ba (Google, Zalo) | Code + entitlement + capability đã xong, nút ẩn cho tới khi server bật (`flags.appleSignIn` hoặc provider `apple` trong `/api/config`) | Huy: bật provider **Apple** trong Supabase (Authentication → Providers → Apple: Services ID, Team ID, Key ID, khoá .p8) rồi bật cờ. Không có bước này build sẽ bị từ chối 4.8 |
| A2 | **Xoá tài khoản bắt đầu từ trong app** (5.1.1(v)) | `AccountDeletionView` → `POST /api/account/delete` có sẵn nhưng chỉ hiện khi `flags.accountSelfDelete` bật. Production đang đặt `false` → iOS chỉ có luồng gửi email | Bật `ACCOUNT_SELF_DELETE_ENABLED=true` trên Production trước khi nộp App Store (luồng email không đủ theo 5.1.1(v)). Cần Huy quyết (PLAY-LISTING mục 0.3 cũng đang chờ) |
| A3 | **Apple IAP** (3.1.1) — nếu bán quyền Pro/nội dung số trong app | StoreKit 2 đã viết (`Core/Payments`), gọi `POST /api/iap/apple/verify`; màn Pro ẩn (`showProUpgrade=false`) | Giữ ẩn cho tới khi có pháp nhân. Khi bật: tạo sản phẩm `com.tappyai.ios.pro.monthly` trong App Store Connect, sandbox test. Không dẫn người dùng sang thanh toán web trong app iOS |
| A4 | **Nội dung do người dùng tạo** (1.2): chặn người dùng, báo cáo, điều khoản | Có báo cáo bài (`ReviewReportTests`), đồng ý Điều khoản trước khi đăng (`TermsConsent`). Chặn người dùng chưa có | Huy đã quyết 29/09: chặn/báo cáo/chế tài nằm ở Phase 8 → iOS chỉ nộp sau khi Phase 8 lên (giống Android/Play) |
| A5 | **Privacy nutrition labels** | `PrivacyInfo.xcprivacy` đã khớp Data safety (thêm Device ID = FCM token). Cần khai lại trong App Store Connect theo cùng bảng `docs/release/PLAY-LISTING.md` §1 | Huy/tôi điền khi tạo bản nộp |
| A6 | **Universal Links** | AASA chỉ khai `/r/*` + 5 trang danh mục, thiếu `/reviews`, `/users`, `/group`, `/plan`; cần biến môi trường `IOS_UNIVERSAL_LINKS_APP_ID` | Phiên web bổ sung path; đã có trong PR `fix/aasa-team-id` |

## 3. Việc Huy cần đăng nhập — GOM MỘT LẦN (để bật push FCM và build có push)

Làm theo thứ tự. Không ai cần gửi lại gì cho tôi ngoài **một file** ở bước 3.

**Bước 1 — Apple Developer** (https://developer.apple.com/account → *Certificates, Identifiers & Profiles*)
1. *Keys* → dấu **+** → đặt tên `TappyAI APNs` → tick **Apple Push Notifications service (APNs)** → *Continue* → *Register* → **Download** file `AuthKey_XXXXXXXXXX.p8` (chỉ tải được MỘT lần). Ghi lại **Key ID** (10 ký tự) và **Team ID** (góc trên bên phải trang).
2. *Identifiers* → chọn App ID `com.tappyai.ios` → tick **Push Notifications** → *Save*. (Sign in with Apple đã bật từ 28/09.)
3. *Profiles* → mở profile **App Store** của `com.tappyai.ios` → *Edit* → *Save* → *Download* → mã hoá base64 và thay secret `APPSTORE_PROFILE_BASE64` ở GitHub (profile cũ không có Push nên archive sẽ hỏng ký).

**Bước 2 — Firebase Console** (https://console.firebase.google.com → project TappyAI đang dùng cho Android)
1. *Project settings* (bánh răng) → tab **General** → *Your apps* → **Add app** → biểu tượng iOS. *Apple bundle ID* = `com.tappyai.ios` → *Register app*. (Bỏ qua các bước thêm SDK còn lại.)
2. Ở bước tải file: **Download GoogleService-Info.plist** (giữ file này).
3. *Project settings* → tab **Cloud Messaging** → mục *Apple app configuration* → *APNs Authentication Key* → **Upload** → chọn file `.p8` ở Bước 1, nhập **Key ID** và **Team ID**.

**Bước 3 — GitHub** (repo → *Settings → Secrets and variables → Actions → New repository secret*)
- Tên: `GOOGLE_SERVICE_INFO_PLIST_BASE64` — giá trị: nội dung file `GoogleService-Info.plist` đã mã hoá base64 (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("...\GoogleService-Info.plist"))`).
- Cập nhật secret `APPSTORE_PROFILE_BASE64` (Bước 1.3).

**Bước 4 — Supabase Dashboard** (chỉ khi muốn bật Sign in with Apple — mục A1): *Authentication → Providers → Apple* → bật, nhập Services ID/Key ID/Team ID/nội dung `.p8` (dùng khoá khác với khoá APNs nếu Apple yêu cầu *Sign in with Apple* riêng).

**Bước 5 — App Store Connect** (chỉ khi lên bản nộp): App Privacy → khai theo A5. Hiện tại KHÔNG cần đăng nhập cho TestFlight: secret ký đã có từ build 50.

Không có Bước 1–3, build vẫn lên TestFlight nhưng **không có thông báo đẩy** (workflow in cảnh báo, app chạy bình thường).
