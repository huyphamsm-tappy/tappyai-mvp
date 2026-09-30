# iOS — nhật ký tiến độ (phiên ios/sync-2026-09-30)

Worktree: `D:\TappyAI-wt\wtios` (dời từ `C:\wtios` ngày 30/09 vì ổ C: đầy). Nhánh `ios/sync-2026-09-30`
(từ `origin/rc/web-uat` fbb1c3c + merge `ci/ios-build-rc`). Không push lên rc/web-uat. Cache/phụ thuộc đặt trên D:.
**Không có máy Mac: mọi thay đổi Swift CHƯA được biên dịch** — CI (`.github/workflows/ios.yml`, chạy trên push nhánh `ios/**`)
là lần biên dịch đầu tiên. Bảng dưới chỉ ghi "PASS" khi có ảnh chụp CI; chưa có run nào thì trạng thái là "code viết".

Việc cần Huy đăng nhập: `docs/ios/IOS-REQUESTS.md` §3 (một lần). Yêu cầu server/Apple: cùng file.
Hồ sơ nộp App Store (metadata, App Privacy, câu trả lời cho người duyệt): `docs/ios/APPSTORE-SUBMISSION.md`.

## Kết quả đêm 30/09→01/10 — CI run 36759089506 (b96150c) XANH, 54 ảnh; đã mở xem: 30–33, 37, 39, 40, 44–48, 50

| Mục | Trạng thái | Ảnh đã xem / ghi chú |
|---|---|---|
| A0 Cài đặt | Đạt một phần | 33 xem so với Android: thứ tự/nhóm/biểu tượng khớp. Lệch CÓ CHỦ Ý: không có dòng «Âm thanh thông báo Tappy» (là kênh thông báo Android; iOS không có tương đương bật/tắt trong app), không có mascot đầu trang. 34/35/36 chưa mở lại. |
| A1 Báo cáo/chặn | Đạt (flag tắt mặc định) | 37 (form lý do), 39 (xác nhận chặn), 40 (danh sách chặn). 38/41/42/43 chưa mở. Server production chưa bật p8 → xem IOS-REQUESTS I7. |
| A2 Xoá tài khoản | Đạt | 44 (flag tắt: «Yêu cầu xoá tài khoản» mở email), 45 (form; CHƯA thấy ô nhập — nằm dưới màn hình), 46 (đã xoá + đăng xuất). Test gõ XÓA → xác nhận → xong XANH. |
| A3 Apple | Code + 47 (nút hiện khi bật cờ). KHÔNG kiểm trên tài khoản Apple thật. | |
| A4 PrivacyInfo | Xong, có test + bước CI | |
| A5 Push | Code + test đơn vị; không thử thật được | |
| B1 Thẻ plan v2 | Đạt | 48, 50 đã xem (ảnh gradient/emoji thay thế vì manifest ảnh; giá «chưa có giá — hỏi quán»). 49, 51–53 chưa mở. |
| B2 Thẻ địa điểm | CHƯA LÀM (chỉ đọc Android: bộ lọc, carousel, gập) |
| B3 Thẻ hỏi v2 | 30–32 đã xem |
| B4 | Màn Android chưa có ở iOS: MapsScreen (không ai gọi), DiscoveryHub/Category, ThreadScreen (Messenger Phase 8), VoiceListening, Games (ẩn) |

Lỗi của tôi trong đêm: 3 lần CI đỏ liên tiếp (trùng `nilIfEmpty`, thiếu `await`, test gõ chữ), đều là lỗi biên dịch/test do tôi viết.

## Việc của Huy — theo thứ tự (01/10/2026)

Đánh dấu **[ĐĂNG NHẬP]** = cần đăng nhập vào một dịch vụ (tôi không làm thay). Mỗi việc ghi: vào đâu → bấm gì → dán gì.
Thứ tự theo độ trễ: việc của Apple/Firebase mất thời gian chờ (đặt lên trước), việc server làm sau khi release Phase 7 xong.

| # | Việc | Đăng nhập? | Bước |
|---|---|---|---|
| 1 | **Đổi email chủ tài khoản Apple Developer** (đang là Yahoo cũ) | **[ĐĂNG NHẬP]** appleid.apple.com bằng Apple ID hiện tại + thiết bị tin cậy nhận mã 2 lớp | Mở **https://appleid.apple.com** → đăng nhập → **Đăng nhập và bảo mật (Sign-In and Security)** → **Apple ID** → nhập email mới (hộp thư bạn đọc hằng ngày, nên là Gmail/iCloud) → **Tiếp tục** → nhập mã 6 số Apple gửi tới email mới. Xong vào **https://developer.apple.com/account** → **Membership details** kiểm email đã đổi. Nếu không còn truy cập được hộp thư Yahoo để nhận mã xác minh ở bước cũ: gọi Apple Developer Support (https://developer.apple.com/contact/ → *Membership and Account*), họ đổi Apple ID của Account Holder. **Làm trước tiên** vì mọi thư duyệt app gửi về email này |
| 2 | **Đồng ý các thoả thuận** để tạo được app miễn phí | **[ĐĂNG NHẬP]** appstoreconnect.apple.com | **https://appstoreconnect.apple.com** → **Agreements, Tax, and Banking** → tab **Agreements** → dòng **Free Apps** → **View and Agree to Terms** → tick đồng ý → **Agree**. App miễn phí, không cần điền ngân hàng/thuế |
| 3 | **Tạo bản ghi ứng dụng** (bundle `com.tappyai.ios`) | **[ĐĂNG NHẬP]** App Store Connect | **My Apps → dấu + → New App** → Platforms: **iOS** · Name: `TappyAI – Đi đâu, ăn gì?` (xem `APPSTORE-SUBMISSION.md` §1) · Primary Language: **Vietnamese** · Bundle ID: chọn **`com.tappyai.ios`** trong danh sách (nếu không thấy: developer.apple.com/account → Certificates, Identifiers & Profiles → Identifiers → phải có App ID này; đã có vì bản 50 ký được) · SKU: `tappyai-ios` · User Access: **Full Access** → **Create**. Sau đó điền từng mục theo `APPSTORE-SUBMISSION.md` §1–§5 |
| 4 | **Sign in with Apple ở Supabase** (để nút Apple hiện, điều luật 4.8) | **[ĐĂNG NHẬP]** Apple Developer + Supabase (dự án PRODUCTION) | (a) developer.apple.com/account → Identifiers → **`com.tappyai.ios`** → phải tick **Sign in with Apple** (đã bật 28/09; kiểm lại, không đổi gì nếu đã tick) → **Save** nếu có thay đổi. (b) Supabase Dashboard (dự án production) → **Authentication → Providers → Apple** → bật **Enable Sign in with Apple** → ô **Client IDs** dán `com.tappyai.ios` → **Save**. Đăng nhập native bằng ID token KHÔNG cần Services ID/khoá .p8 (chỉ cần nếu sau này làm Apple trên web). (c) Báo phiên web: bật `flags.appleSignIn`/provider `apple` trong `/api/config` (IOS-REQUESTS I8) |
| 5 | **Firebase push — 4 bước** (xem chi tiết `IOS-REQUESTS.md` §3) | **[ĐĂNG NHẬP]** developer.apple.com, console.firebase.google.com, github.com | **(a) Khoá APNs:** developer.apple.com/account → Certificates, Identifiers & Profiles → **Keys → +** → tên `TappyAI APNs` → tick **Apple Push Notifications service (APNs)** → Continue → Register → **Download** `AuthKey_XXXXXXXXXX.p8` (chỉ tải được MỘT lần — cất vào thư mục khoá hiện có `D:\secrects\`, KHÔNG dán vào chat/repo) → ghi lại **Key ID** (10 ký tự) và **Team ID** (góc phải trên). **(b) App ID:** Identifiers → `com.tappyai.ios` → tick **Push Notifications** → Save. **(c) Profile mới:** Profiles → profile **App Store** của `com.tappyai.ios` → Edit → Save → Download → mã hoá base64 (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("D:\path\profile.mobileprovision"))`) → GitHub repo → **Settings → Secrets and variables → Actions** → sửa secret **`APPSTORE_PROFILE_BASE64`** dán chuỗi đó. **(d) Firebase:** console.firebase.google.com → dự án TappyAI (cái Android đang dùng) → bánh răng **Project settings → General → Your apps → Add app → iOS** → Bundle ID `com.tappyai.ios` → Register → **Download GoogleService-Info.plist** → (bỏ qua các bước thêm SDK) → tab **Cloud Messaging** → **Apple app configuration → APNs Authentication Key → Upload** → chọn file `.p8` → nhập **Key ID**, **Team ID** → Upload. **(e)** mã hoá base64 file `GoogleService-Info.plist` (cùng cách) → GitHub → Actions secrets → **New repository secret** → tên **`GOOGLE_SERVICE_INFO_PLIST_BASE64`** → dán → Add. **Lưu ý:** dù làm đủ, iPhone chỉ nhận thông báo khi server làm IOS-REQUESTS I9 |
| 6 | **Thêm SHA / khoá nếu cần** | **[ĐĂNG NHẬP]** Play Console + Firebase | *Chỉ Android.* Sau khi Play App Signing tạo khoá: Play Console → app → **Setup → App signing** → copy **SHA-1** và **SHA-256** của *App signing key certificate* → Firebase Console → Project settings → Your apps → app **Android** → **Add fingerprint** → dán từng chuỗi → Save (cần cho đăng nhập Google và FCM trên bản tải từ Play). *Phía iOS không có SHA*: tương đương là khoá APNs ở bước 5(a) |
| 7 | **Bật cờ production cho cửa hàng** (sau khi release Phase 7 xong) | **[ĐĂNG NHẬP]** Vercel (+ phiên web) | Vercel → dự án **tappyai-mvp → Settings → Environment Variables** → lọc **Production** → thêm/sửa: **`ACCOUNT_SELF_DELETE_ENABLED`** = `true` (chỉ sau khi migration D1/D2/D4 đã áp lên production — hỏi phiên web trước); các cờ Phase 8 **`p8_user_blocks`**, **`p8_reports_v2`**, **`p8_comment_moderation`** theo `DEPLOY_PHASE8.md` (áp migration trước). **Deployments → ⋯ → Redeploy**. Kiểm: mở `https://www.tappyai.com/api/config` trong trình duyệt → thấy `"accountSelfDelete":true` và khối `"p8":{"userBlocks":true,"reports":true,…}` |
| 8 | **Chỉ định người xử lý báo cáo trong 24 giờ** (điều luật 1.2) | Không | Quyết định: ai xem hàng đợi báo cáo (`moderation_queue`, màn admin) mỗi ngày kể cả cuối tuần, và quy trình gỡ nội dung/khoá tài khoản. Ghi tên người + cách liên lạc vào ô **Notes** cho người duyệt (`APPSTORE-SUBMISSION.md` §5.1) |
| 9 | **Tài khoản demo cho người duyệt** (tuỳ chọn, khuyến nghị) | **[ĐĂNG NHẬP]** hộp thư email riêng | Tạo hộp thư riêng (vd. `apple-review@…`) → mở app **production** → **Tạo tài khoản** bằng email + mật khẩu mạnh dùng một lần → xác nhận email nếu được hỏi → khai ngày sinh ≥ 18 → xong onboarding → đăng vài bài bằng ảnh thật của bạn → tạo **tài khoản thứ hai** (hộp thư khác) để người duyệt thử báo cáo/chặn. Nhập email + mật khẩu tài khoản 1 vào App Store Connect → mục **App Review Information → Sign-in information**. **Đổi mật khẩu sau khi duyệt xong.** Không dán mật khẩu vào repo/chat |
| 10 | **Sửa trang chính sách** (phiên web) | Không | Báo phiên web thêm vào `https://www.tappyai.com/privacy`: Đăng nhập bằng Apple và thông báo đẩy trên iOS; thêm trang hỗ trợ `/support` nếu chưa có (`APPSTORE-SUBMISSION.md` §1) |
| 11 | **Chọn ảnh App Store** | Không | Khi có bộ ảnh 6.9" từ CI (việc kế tiếp của phiên iOS): duyệt từng ảnh, loại ảnh có tên/email thật |
| 12 | **Báo "release Phase 7 xong"** | Không | Tôi chạy job TestFlight (Actions → **iOS** → *Run workflow* → nhánh `ios/sync-2026-09-30`) rồi kiểm trên máy thật: đăng nhập Apple, nhận thông báo đẩy, xoá tài khoản, báo cáo/chặn |

## Cụm 1 — hợp đồng chat, đăng nhập, màn theo mockup, push, quyền riêng tư

| Việc | Trạng thái | Commit |
|---|---|---|
| `chatSessionId` (UUID v4 chữ thường mỗi chat, lưu theo id lịch sử để mở lại giữ nguyên) | code + test (`ChatContractTests`) | 679d6a0 |
| Header `x-tappy-surface: ios`, `x-tappy-caps: ask` | code + test; server chưa nhận `ios` → REQUESTS I1 | 679d6a0 |
| `[TAPPY_ASK]` parser + thẻ hỏi nhanh (`AskCardView`); `[TAPPY_PLAN]` đã có sẵn từ trước | code + test | 679d6a0 |
| Đăng nhập email + mật khẩu, nút Khách, "nhận mã qua email" giữ làm phụ | code | a6ed6d1 |
| Hub "Tôi": đúng 9 dòng, thẻ khách, dòng khoá "Cần đăng nhập" | code | 88af7fa |
| Đã lưu (hero, chip Tất cả/Địa điểm/Bài viết/Video, 2 thẻ đếm, thẻ rỗng, mascot) | code | 7cf0413 |
| Viết content (hero, logo FB/TikTok/IG, "Thử gợi ý", tone có icon, độ dài có mô tả, nút gradient, kết quả + Copy tất cả/Viết lại) | code | 5082932 |
| Cổng 18+ thành màn riêng (Ngày/Tháng/Năm) — chat + Gợi ý | code | fed7740 |
| Gợi ý cho bạn (hero, thẻ ảnh/xếp hạng/sao/hoạt động/đánh giá); "Hỏi Tappy về chỗ này" trước đây KHÔNG gửi gì — nay gửi thật qua `router.chatSeed` | code | 5324c00 |
| Onboarding: header + thanh 2 đoạn + "Bước 1/2" (giống Android: 2 bước) | code | (cụm này) |
| Ảnh bìa (tải lên/gỡ) trong Sửa hồ sơ; hồ sơ người khác có tab Bài đăng / Chia sẻ | code | 4574fe7 |
| Hồ sơ của mình 5 bộ sưu tập (Bài viết/Đã thích/Đã lưu/Đã ẩn/Đã share) | ĐÃ CÓ sẵn (`MyPostsView`) | — |
| Đăng ảnh / video / YouTube | ĐÃ CÓ sẵn (`CreateReviewView`, link provider theo `/api/config`) | — |
| Cài đặt → Chính sách: mở trang web `/privacy` | ĐÃ CÓ sẵn (`LegalPageView` = web view của `/privacy`) | — |
| Push qua Firebase Cloud Messaging (`provider: "fcm"`); không có plist thì push tắt, app vẫn chạy | code; cần Huy làm REQUESTS §3 | (cụm này) |
| Chuỗi xin quyền camera/ảnh/vị trí/micro (vi+en, khớp `/privacy`) + `PrivacyInfo` thêm Device ID (FCM) | code + test | (cụm này) |
| UI test simulator + ảnh chụp từng màn + ghép cạnh ảnh Android (artifact `ios-screenshots`) | code; **chưa có run nào** | (cụm này) |

## Kết quả CI run đầu (36657639419, commit 722653c)
- **Biên dịch xanh**, toàn bộ unit test xanh (kể cả `ChatContractTests`, `PrivacyManifestTests` có Device ID).
- UI test: 4/8 qua (hub khách, Đã lưu rỗng, Viết content, Gợi ý), 4 đỏ. Ảnh chụp thật đã xem: hub, Đã lưu, Viết content, Gợi ý hiển thị đúng thiết kế.
- **Lỗi thật tìm ra nhờ ảnh chụp:** `ResponseDecoder` dùng `.convertFromSnakeCase` nhưng nhiều model (`Favorite`, `SavedReview`, `UserProfile`…)
  khai `CodingKeys` snake_case → `keyNotFound`, màn Đã lưu ở trạng thái lỗi khi có dữ liệu thật. Sửa ở f7ec551: decoder thêm khoá
  camelCase bên cạnh khoá snake_case (`ResponseDecoderKeysTests`).
- 3 lỗi UI test còn lại là lỗi của test (id nút bị container che, gửi tin bằng `\n` không submit) — đã sửa ở f7ec551, chờ run tiếp theo.
- Sửa bố cục từ ảnh: chip lọc Đã lưu bị cắt, tiêu đề hero Viết content bị cắt "...", mô tả highlight Gợi ý bị cắt.
- Architecture Guard / Regression Gate đỏ trên nhánh này là lỗi CÓ SẴN từ rc/web-uat (`src/app/go/at/route.ts:25` đọc `x-forwarded-for`), không phải của iOS.

## CI run 36664553879 (commit 9e8b0b7) — XANH
Build, unit test, 13/13 UI test, 13 ảnh + 13 ảnh ghép (artifact `ios-screenshots`, `pairs/pairs.md`). Từ ảnh ghép: ô Ngày/Tháng màn 18+
vẫn bị co (Menu co theo nội dung) → sửa bằng tỉ lệ cố định 1 : 1 : 1,25 như web/Android. Thẻ QR iOS không có handle, chữ viết tay,
skyline, huy hiệu cửa hàng của mẫu — đúng quy tắc (không có dữ liệu handle; không chữ viết tay/skyline; App Store chưa có).

## Lô tiếp theo (chưa push, chờ CI)
| Việc | Commit |
|---|---|
| Sửa cấu hình theo body production (lỗi TestFlight) + test | 51e353b |
| Hub "Tôi" khi đã đăng nhập = web `/profile` / Android `ProfileHubV3`: hero (ảnh bìa, avatar, tên, bio, Chỉnh sửa, QR, 3 số liệu), tab Đã đăng / Đã chia sẻ / Đã lưu / Bị hạn chế / Đã ẩn / Địa điểm, "Đang theo dõi"; ảnh CI `16`, `17` (tài khoản giả chỉ trong build DEBUG + máy chủ fixture) | f3208fb |
| Ưu đãi: thẻ "Hỏi Tappy trước khi mua" (cả khi không có deal, L16); ảnh `18-deals` | f2d4448 |
| Ô ngày sinh màn 18+ | (commit này) |
- Đã có sẵn trên iOS, không đổi: đăng ảnh / video / YouTube (`CreateReviewView`), Khám phá (`ReviewsFeedView`), hồ sơ người khác (+ tab Chia sẻ ở cụm 1), 5 tab điều hướng giống web/Android, Cài đặt (có thêm dòng Bản quyền).

## CI run 36666310746 (commit 23dc351) — 16/17 UI test, 17 ảnh
- Qua: màn lỗi cấu hình + Thử lại (`14`), cấu hình dạng production mở được đăng nhập (`15`), hub đã đăng nhập (`16`, `17`).
- Đỏ: `testDealsAskCardWhenEmpty` — stub trả `{"deals": []}` không có `success`, `DealsResponse` cũ bắt buộc `success` → màn lỗi, không có
  thẻ. Chính là lỗi mà đợt rà giải mã (fabce23) sửa (`success` giờ mặc định true).
- Lỗi thấy trên ảnh `16`/`17`, đã sửa: chip tab hiện khoá thô `profileHub.tab.posts` (`LocalizedStringKey` với nội suy thành khoá định
  dạng "…%@"); ảnh ô lưới tràn sang ô bên cạnh (ảnh fill làm view định kích thước) → ô 3:4 cố định, ảnh là overlay đã cắt.

## Lô sau run xanh (5e605a6 +)
- Hub "Tôi": thêm 3 thẻ bên dưới như Android — Thông tin cá nhân (tên, email, Chỉnh sửa), Thành tích (6 con số thật; chưa có số thì "—"),
  QR Profile. Ảnh CI `19-hub-panels`.
- Chia sẻ clip ĐÃ TẢI LÊN: nút "Gửi video (TikTok…)" gửi chính file video (≤150 MB, tải về tệp tạm, xong mới dùng); không lấy được thì gửi
  ảnh thẻ. Clip dạng link (YouTube…) vẫn gửi ảnh thẻ + link. Test `ClipVideoFileTests`. Chưa kiểm trên máy thật.
- Cài đặt → Thông báo: người đã từ chối quyền thì mở Cài đặt iOS (hộp xin quyền không hiện lại lần hai), giống Android `DIRECT_TO_SETTINGS`.
- Chưa làm, cần Huy quyết: Home (L12 — bố cục Android riêng đã được duyệt, web khác), onboarding 4 bước theo mockup hay 2 bước như web/Android.

## Sẵn sàng build TestFlight trỏ PRODUCTION (30/09 tối) — CHƯA build, chờ Huy báo «release Phase 7 xong»
**Cách chạy khi được báo:** GitHub → Actions → workflow **iOS** → *Run workflow* → chọn nhánh `ios/sync-2026-09-30` (hoặc nhánh đã
gộp) → job *Archive + upload to TestFlight* (chỉ chạy khi bấm tay, không chạy từ push/PR).
- **Số build:** `CFBundleVersion` = `github.run_number` của workflow iOS. Build cuối đã lên TestFlight là **50** (run 50, 28/09); workflow
  hiện đã ở run **62+** và chỉ tăng → lần bấm tới ≥ 63, luôn lớn hơn. Bước «Verify the archive» kiểm `CFBundleVersion == BUILD_NUMBER`.
  Phiên bản hiển thị `1.0.0` (project.yml) — đổi nếu muốn 1.0.1.
- **Trỏ production:** `Release.xcconfig` mặc định `https://www.tappyai.com`, nhưng CI ghi đè bằng secret `TAPPY_API_BASE_URL`. Bản 50 hỏng
  vì secret trỏ host UAT (Vercel SSO, 302). Nay có 3 lớp chặn, đều dừng run TRƯỚC khi lên Apple:
  1. bước mới «Refuse a build that is not pointed at production»: host của secret phải là `www.tappyai.com`/`tappyai.com`, https, và
     `GET /api/config` **không kèm header bypass** phải trả 200 (in mã HTTP + tên host, không in khoá);
  2. «Verify the archive»: `TAPPY_API_BASE_URL` trong Info.plist của bản đã archive phải là production;
  3. cũng ở đó: nếu `plutil -p Info.plist` có chữ «bypass» → dừng. Kiểm tra mã nguồn: không có chuỗi bypass nào trong `ios/`
     (Swift, xcconfig, plist, yml, py); secret bypass của Vercel không được workflow này đọc ở bất kỳ bước nào.
- **I6 trên production:** cùng bước kiểm, gọi `GET /api/auth/zalo?platform=ios` không kèm `app_state`; production đã có I6 nếu trả về
  `/login?error=app_state_invalid`. Chưa có → cảnh báo (không dừng): đăng nhập Zalo của bản đó sẽ bị app từ chối.
- **Đối chiếu I6 với rc (54210f2 → 1e96071):** `src/lib/auth/appState.ts`, `/api/auth/zalo`, `/auth/confirm` khớp iOS — app gửi
  `app_state` (43 ký tự base64url, regex server `^[A-Za-z0-9_-]{43,128}$`), server trả `state` trong **fragment** cho `platform=ios`
  (`tappyai://auth/callback#access_token=…&refresh_token=…&expires_at=…&state=…`); iOS đọc `state`. Không lệch → không sửa code;
  thêm `AuthCallbackStateTests` ghim định dạng regex, đúng dạng fragment server và «chỉ `state`, không `app_state`».
- **Việc Huy vẫn phải làm để build có push** (IOS-REQUESTS §3): khoá APNs, app iOS trong Firebase, secret `GOOGLE_SERVICE_INFO_PLIST_BASE64`,
  cập nhật `APPSTORE_PROFILE_BASE64` (profile mới có Push). Thiếu thì build vẫn lên, chỉ không có thông báo đẩy (workflow cảnh báo).
- Chưa kiểm được ở đây (không có Mac/không chạy build ký): ký số + Apple xử lý — chỉ biết đúng khi chạy job lần đầu sau 50.

## Cài đặt = Android (L11, owner quyết 30/09) — code, chờ CI
Nguồn: `SettingsScreen.kt` trên rc 68d6639. iOS nay có: dòng phụ «Tùy chỉnh TappyAI theo cách bạn muốn»; thẻ **Tùy chọn** (Thông báo · Bộ nhớ ·
Ngôn ngữ — hiện «🇻🇳 Tiếng Việt», bấm mở bảng chọn · Giao diện — Theo hệ thống/Sáng/Tối, dùng `ThemeManager`); thẻ **Khác** (Hướng dẫn sử dụng · Điều
khoản dịch vụ · Chính sách bảo mật · Chính sách bản quyền · Yêu cầu xóa tài khoản / Xóa tài khoản khi server bật); «Phiên bản x»; đăng xuất, còn **khách
thấy thẻ Đăng nhập** (đăng xuất phiên khách chỉ tạo danh tính ẩn danh mới). Mỗi hàng có ô icon màu + dòng mô tả, nhãn/chữ lấy nguyên từ Android (vi + en).
- **Nhạc ẩn:** Android không có dòng Nhạc nào trong Cài đặt. iOS trước đây có «Chính sách bản quyền âm nhạc» mở trang nhạc native → bỏ; dòng bản quyền
  giờ là «Chính sách bản quyền» mở trang web `/copyright` (như Android). Cả deep link `/copyright` cũng mở trang web thay vì trang nhạc native (`AppRouter`).
- **Khác Android (một điểm, cố ý):** KHÔNG có dòng «Âm thanh thông báo Tappy». Trên Android nó tắt tiếng chuông riêng của app; trên iOS tiếng của push do
  server đặt trong payload APNs, nên công tắc cục bộ không giữ được lời hứa «vẫn nhận thông báo, chỉ không có tiếng» khi app ở nền. Cần server: cờ theo thiết
  bị (gửi kèm lúc đăng ký token) để bỏ `sound` khỏi payload — chưa có, chưa ghi IOS-REQUESTS. Khi có thì thêm dòng ~1 giờ.
- Test: `testSettingsMirrorsAndroid` (đủ hàng, không có chữ «nhạc»/«music», đổi Giao diện thì hàng hiện «Sáng»), `testSettingsAsGuestOffersSignIn`; ảnh `33`, `34`
  cạnh `step1-hientrang/12-settings.png` (ảnh gốc Android là bản 28/09, TRƯỚC khi Android thêm Âm thanh/Giao diện — chỉ để tham khảo bố cục).

## Yêu cầu Apple BẮT BUỘC trước khi gửi App Store duyệt (30/09) — ước lượng RIÊNG, không nằm trong 17–20 giờ các màn
Trạng thái kiểm từ code, không phải từ ghi chú cũ. «Giờ iOS» = việc của phiên iOS; việc của Huy/server ghi riêng. Không mục nào kiểm được trọn vẹn bằng CI
simulator — cần bản TestFlight production chạy trên máy thật.

| # | Yêu cầu (điều khoản) | Trạng thái | Đã có | Còn thiếu | Giờ iOS |
|---|---|---|---|---|---|
| 1 | **Sign in with Apple** (4.8 — bắt buộc vì có Google/Zalo) | **MỘT PHẦN** | Capability + entitlement `applesignin`; nút native (AuthenticationServices), nonce SHA-256, `signInWithApple` + `AppleSignInTests`; nút **ẩn** tới khi `/api/config` có `flags.appleSignIn` hoặc provider `apple` | Huy bật provider Apple trong Supabase (Services ID, Team ID, Key ID, .p8 — IOS-REQUESTS A1); chưa thử trên máy thật; **server chưa thu hồi token Apple khi xoá tài khoản** (Apple đòi khi app có Sign in with Apple) | **1,5** (thử thật, ảnh màn đăng nhập có nút, xử lý huỷ / email ẩn). Ngoài iOS: Huy 0,5–1; server thu hồi token ~2–3 |
| 2 | **Xoá tài khoản bắt đầu từ trong app** (5.1.1(v)) | **MỘT PHẦN** | `AccountDeletionView` + `AccountDeletion` → `POST /api/account/delete`, có khi `flags.accountSelfDelete`; luồng email dự phòng | Production đang **tắt** cờ → app chỉ có luồng gửi email, **không đủ** theo Apple; chưa có UI test/ảnh cho luồng in-app | **1,5** (test + ảnh với cờ bật trong fixture, xác nhận gõ chữ, về lại khách sau khi xoá, kiểm bản thật). Ngoài iOS: Huy bật `ACCOUNT_SELF_DELETE_ENABLED=true` (sau release) |
| 3 | **Apple IAP** (3.1.1 — chỉ khi bán quyền Pro/nội dung số TRONG app) | **MỘT PHẦN — không bắt buộc cho lần nộp đầu nếu không bán gì** | StoreKit 2 (`StoreKitProvider`), `POST /api/iap/apple/verify`; màn Pro ẩn (`showProUpgrade=false` trên production) | Để nộp không-IAP: chứng minh **không có** bề mặt trả tiền nào trên iOS (Pro, nâng cấp, thanh toán VietQR/SePay của Phase 8 phải ẩn). Nếu bán Pro: sản phẩm trong App Store Connect, `appAccountToken = user.id` (audit 30/09), Restore Purchases, sandbox trên máy thật; server đã sửa API-1 nhưng mới ở nhánh security, chưa lên prod; cần pháp nhân | **1** (rà + test ẩn). Nếu bán Pro: thêm **7–9** |
| 4 | **Thông báo đẩy qua Firebase (FCM)** | **MỘT PHẦN** | Code FCM (`provider "fcm"`), entitlement `aps-environment`, `APS_ENVIRONMENT=production` ở Release, workflow ghi plist từ secret; thiếu plist thì tắt an toàn, app vẫn chạy | Huy làm 4 bước IOS-REQUESTS §3 (khoá APNs, app iOS trong Firebase, secret `GOOGLE_SERVICE_INFO_PLIST_BASE64`, profile App Store có Push); chưa từng nhận push thật trên máy | **2** (TestFlight máy thật: xin quyền, token lên server, nhận foreground/nền, chạm mở đúng màn, tắt/bật trong Cài đặt). Ngoài iOS: Huy ~1 |
| 5 | **PrivacyInfo.xcprivacy** + nhãn quyền riêng tư | **CÓ — cần rà** | Manifest trong app: không theo dõi, 13 loại dữ liệu (kể cả Device ID cho FCM), `UserDefaults` lý do CA92.1, có test giữ Device ID | Chưa đối chiếu với báo cáo Privacy Report của bản archive (manifest riêng của Firebase/Supabase; `Package.resolved` chưa commit nên bản SDK trôi); code đọc `FileManager.attributesOfItem` (`.size`) — nếu Apple báo ITMS-91053 phải thêm lý do file-timestamp; nhãn dinh dưỡng trong App Store Connect (A5) chưa khai | **1,5** (2 nếu Apple báo thiếu). Ngoài iOS: Huy/tôi điền nhãn khi tạo bản nộp ~1 |

**Cộng riêng iOS: 7,5 giờ** (1,5 + 1,5 + 1 + 2 + 1,5) nếu không bán Pro trong app; **~16,5 giờ** nếu bán Pro qua IAP. Phần ngoài iOS (Huy: Supabase Apple, cờ xoá tài khoản, Firebase/APNs,
nhãn; server: thu hồi token Apple) ghi cạnh từng dòng, chưa tính vào giờ iOS. Thứ tự thử trên máy thật, một lần sau khi có TestFlight production: 4 → 1 → 2 → 5.
Cũng phải có cho hồ sơ duyệt nhưng không nằm trong 5 mục: chặn người dùng + báo cáo nội dung (1.2, Phase 8 — đã quyết nộp iOS sau Phase 8), tài khoản demo cho người duyệt, URL hỗ trợ, phân loại độ tuổi 18+.

## Còn thiếu so với ANDROID-PARITY-MAP (30/09 tối) — ước lượng
Đã xong và có ảnh CI: L1 đăng nhập · L3 hub «Tôi» · L4 cổng 18+ · L5 Gợi ý · L6 onboarding 2 bước · L7 Đã lưu · L8 Viết content ·
L10 hồ sơ người khác (tab Chia sẻ) · L12 Home theo Android · L16 Ưu đãi (thẻ hỏi) · chia sẻ 6 bố cục · thẻ hỏi nhanh v2 · MOB-1.
Ước lượng = giờ làm việc + số vòng CI (mỗi vòng ~25 phút, có ảnh mới thì phải xem ảnh).

| # | Màn / việc | Hiện trạng iOS | Ước lượng |
|---|---|---|---|
| L2 | Đăng nhập chế độ tối | Màu thích ứng theo hệ thống nên có thể đã đúng; **chưa có ảnh tối** để chứng minh | 0,5 giờ, 1 ảnh |
| L9 | Composer Ảnh / Video / YouTube | Code có (`CreateReviewView`, 3 loại, tải video 3 bước) nhưng **chưa có ảnh CI** và chưa so với web | 1,5 giờ, 1–2 vòng (cần tài khoản giả + fixture upload) |
| L11 | Cài đặt | **ĐÃ LÀM theo Android (owner quyết 30/09)** — xem mục «Cài đặt = Android» dưới; chờ CI ảnh `33`/`34` | 0 (xong; còn xem ảnh CI) |
| L14 | Chia sẻ + cờ `flags.publicShare` | 6 bố cục xong; iOS **không đọc** `flags.publicShare` (server đã trả) → nút chia sẻ công khai luôn bật | 1 giờ |
| L15 | Hồ sơ chính chủ: ảnh đại diện | Ảnh bìa xong; tải ảnh đại diện có ở `ProfileService` nhưng **chưa có ảnh CI** | 1 giờ |
| — | Thẻ kế hoạch trong chat (Android 5c009f9, mẫu Quy Nhơn) | `TripPlanCardView` bản cũ: chưa ảnh hero/điểm dừng qua manifest R22, chưa «Xem kế hoạch đầy đủ trên Tappy». `PlanImageManifest` đã có sẵn để dùng | 3–4 giờ, 2 vòng CI |
| — | Thẻ địa điểm/mua sắm trong chat (2 địa điểm, ảnh lớn — web 2aefaf6) | có `PlaceCardView`, **chưa so với bản mới**, chưa có ảnh CI | 2 giờ, 1–2 vòng |
| — | Chat rỗng + 11 câu kiểm chat (L13) | Chưa kiểm với server thật; sẽ làm được trên bản TestFlight production | 2 giờ khi có bản TestFlight |
| — | Khám phá (feed clip + dock), chi tiết bài, bình luận | Có và chạy; **chưa có ảnh CI**, chưa so bố cục với Android/web | 2 giờ, 1–2 vòng |
| — | Ưu đãi khi CÓ deal (danh sách, thẻ, bộ lọc) | Chỉ có ảnh trạng thái rỗng (`18`); chưa fixture có deal | 1,5 giờ |
| — | 7 màn công cụ (Quét, Dịch, Tỷ giá, Chia bill, Cảnh báo lừa đảo, Nhóm ăn, Bói) + trang Smart Tools | Có đủ màn; **chưa ảnh CI cạnh `14-tools.png`**, chưa so từng màn | 3 giờ, 2 vòng (fixture cho Dịch/Tỷ giá/Scam) |
| — | Lịch sử chat, Đặt chỗ, Sở thích, Theo dõi giá, AI Planner, Tappy biết gì, Đi nhóm, Hướng dẫn | Có; **chưa ảnh CI**; nhãn hàng hub đã theo web | 2,5 giờ, 1–2 vòng |
| — | Sign in with Apple | Code xong, nút ẩn tới khi server bật provider (Apple 4.8) | phụ thuộc Huy (IOS-REQUESTS A1); 0,5 giờ khi bật |
| — | Push FCM | Code xong, tắt tới khi có plist | phụ thuộc Huy (§3); 1 giờ kiểm thật trên máy khi có |
| — | **Giao diện trả lời tư vấn mới (consult answer)** | Cố ý CHƯA làm — chờ đặc tả Luna | chờ Luna; ước 4–6 giờ khi có đặc tả |
| — | Universal Links (`/reviews`, `/users`, `/group`, `/plan`) | Phía web (A6) | phụ thuộc web; iOS 0,5 giờ |

Tổng phần iOS tự làm được ngay: khoảng **16–19 giờ** làm việc (đã trừ L11, xong), ~10–12 vòng CI. Chưa gồm yêu cầu Apple ở mục riêng phía trên. Thứ tự đề xuất sau release: (1) bản TestFlight production +
kiểm chat thật (L13) → (2) thẻ kế hoạch + thẻ địa điểm trong chat (nhìn thấy nhiều nhất) → (3) ảnh CI cho các màn «có mà chưa chụp» theo lô
→ (4) L14/L15/L11 → (5) consult answer khi Luna có đặc tả.

## Home V3 theo Android (L12, owner 30/09) — code, chờ CI
Thứ tự đúng `HomeScreen.kt`: hero (lời chào theo giờ — bộ câu chép nguyên web/Android, 7 khung giờ, cuối tuần, xoay theo ngày; dòng
"Hi {tên}! 👋" từ `/api/profile`, khách "Chào bạn! 👋"; 2 nhãn "Luôn sẵn sàng" / "Nhanh · Chính xác · Hữu ích"; mascot TappyWave + quầng
sáng) → ô hỏi (mở Chat) → 6 gợi ý nhanh (cafe/kế hoạch gửi câu vào Chat qua `chatSeed`; Dịch, Chia bill, Viết caption, Gợi ý du lịch
mở màn có sẵn) → "Gợi ý dành cho bạn" (`/api/recommendations`, ảnh minh hoạ xoay theo vị trí như Android — không giả ảnh quán) →
banner "Khám phá thêm" (→ Ưu đãi) → Cảnh báo lừa đảo (→ Scam Shield) → Ưu đãi hôm nay (cùng nguồn tab Ưu đãi; rỗng thì thẻ "Chưa có
ưu đãi") → Video gợi ý (feed trending, chỉ clip có ảnh; → Khám phá) → Khám phá theo lĩnh vực (5 mục, xuống dòng; mở Chat theo
category) → Gợi ý cho bạn (6 thẻ, 5 ảnh web `home_inspire_*`, gán ảnh không trùng như web) → Hoạt động gần đây (5 cuộc trò chuyện) →
Smart Tools (7 thẻ theo registry web, mascot từng công cụ; "Xem tất cả" → trang Smart Tools theo nhóm; "Nhóm ăn" → Tappy Together).
Bảng màu V3 tối như Android khi máy ở chế độ tối, sáng dùng xám của app. Test `HomeV3Tests`; ảnh CI `23`–`27` (tối, cạnh
`step1-hientrang/01-home.png`). Onboarding giữ 2 bước ("Bước 1/2", "Bước 2/2") — đã có.

## Thẻ hỏi nhanh v2 (IOS-REQUESTS I-1, R23 + R23.1) — code, chờ CI
`AskCardModel.swift` = bản chép 1:1 `askCardModel.ts` (mảng → tiêu đề/dòng phụ/gợi ý; loại câu; icon; khoá ảnh `diem-*` kể cả
từ trùng khi bỏ dấu; `Tìm cho tôi` khi không chọn gì). `AskCardView` theo mockup: mascot kính lúp, câu đánh số, ô ảnh chọn nhiều
(3 cột / 2×2), ô icon chọn một (bấm lại để bỏ), ô «Hoặc nói thêm ý khác…» có nút gửi, nút «Tìm cho tôi» luôn bật → «Đang tìm…» và
khoá thẻ. Nền tối cả hai chế độ. Ảnh ô qua manifest R22 (`PlanImageManifest`, tải 1 lần, theo `replaced` ≤3 bước, chỉ https);
manifest hiện rỗng → ảnh giữ chỗ gradient theo mảng + icon (đúng thoả thuận). Tin gửi đi không đổi dạng. Test `AskCardV2Tests`
(đúng các ca của web `askCardModel.test.ts` + `AskCard.test.tsx`); UI test 5 mảng `28`–`32` cạnh `ask-card-mockup.png`, kiểm tin
gửi «Karaoke, Bida/bowling · 2 người · Tối nay», gửi 1 lần, gửi rỗng = «Tìm cho tôi». Ca «giữ lựa chọn khi remount» của web là
do `router.replace` của web — iOS không remount thẻ, không áp dụng.

## CI run 36703401131 (859c112) — XANH, 32/32 ảnh
Build, toàn bộ unit test (có `HomeV3Tests`, `AskCardV2Tests`, `AuthCallbackStateTests`), toàn bộ UI test. Đã xem ảnh ghép:
`23` hero giờ khớp Android 1 (mascot cạnh chữ, không còn khoảng trống; ô hỏi ngay dưới); `26` video + 5 lĩnh vực + thẻ gợi ý có ảnh
web; `27` Smart Tools 7 thẻ đúng màu/mascot, «Nhóm ăn» có «Cần đăng nhập». Home (L12), thẻ hỏi nhanh v2 (5 mảng), MOB-1: PASS.

## CI run 36700541289 (ecec00e) — build + toàn bộ unit test xanh; UI 30/32 ảnh
- Thẻ hỏi nhanh: cả 6 UI test qua (5 mảng + gửi rỗng); tin gửi «Karaoke, Bida/bowling · 2 người · Tối nay», gửi 1 lần. Đã xem
  `28` (giải trí) và `29` (ăn uống): khớp mockup — tiêu đề theo mảng, số 1/2/3, ô ảnh giữ chỗ tím/cam + icon, ✓ xanh, ô icon.
- Home: `23`–`25` đúng (Hi Minh Anh, lời chào theo giờ, 6 gợi ý nhanh, ưu đãi rỗng, video, lĩnh vực). Lỗi: khoảng trống lớn dưới
  hero (quầng sáng 300pt làm cao ZStack) → mascot/quầng sáng chuyển thành nền, không chiếm chỗ. Test đỏ ở «suggestion cards» do vuốt
  cố định số lần trên trang dài → test vuốt tới khi thấy phần cần chụp.

## MOB-1 — CI run 36696907475 (b36706a) XANH, 22/22 ảnh
Đã xem ảnh: `20`/`21` màn đăng nhập báo «Liên kết đăng nhập không hợp lệ hoặc đã hết hạn…», vẫn là khách; `22` link callback từ
ngoài → vẫn hồ sơ Minh Anh.

## MOB-1 — chèn phiên đăng nhập qua callback (bảo mật 🟠, 30/09) — đưa vào bản TestFlight tới
Nguồn: `docs/security/SECURITY-AUDIT-2026-09-30.md` (nhánh `security/hardening-2026-09-30`) MOB-1.
- **Trước:** Zalo nhập mọi `access_token`/`refresh_token` trong fragment callback, không kiểm lần đăng nhập nào đang chờ.
- **Sửa** (`Features/Auth/Web/AuthCallbackState.swift`): bấm đăng nhập → state ngẫu nhiên 32 byte (base64url) lưu Keychain
  (`AfterFirstUnlockThisDeviceOnly`), hạn 10 phút; gửi `app_state`, server trả lại `state` trong fragment (cùng hợp đồng Android R24);
  callback chỉ nhận khi `state` khớp (so sánh thời gian hằng)
  và còn hạn; state bị xoá sau mỗi lần kiểm (khớp hay không) → không dùng lại được; lần đăng nhập mới thay state cũ; huỷ/lỗi → xoá.
  Kiểm state TRƯỚC khi đọc token. Google: chỉ nhận PKCE `code`, callback có token bị từ chối (verifier PKCE là ràng buộc một lần).
  Link `tappyai://auth…` mở từ ngoài app (Safari, tin nhắn) không bao giờ là đích điều hướng, không nhập phiên.
  Từ chối → "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại."
- **Test:** `AuthCallbackStateTests` (17 ca: thiếu/sai/rỗng state, dùng lại, hết hạn, sát hạn, thay state, Google, link ngoài).
  UI test (máy chủ fixture đóng vai kẻ xấu, `/api/auth/zalo` trả phiên tài khoản khác): `20` không state, `21` state lạ → báo lỗi, vẫn là
  khách; `22` link callback từ ngoài khi đang đăng nhập → vẫn tài khoản cũ.
- **Phụ thuộc server I6** (IOS-REQUESTS = R24 cho `platform=ios`): tới khi server trả lại `state`, đăng nhập Zalo trên iOS bị từ chối
  (đóng an toàn). Khác Android: Android giữ state đang chờ khi gặp link sai (link từ ngoài có thể tới bất cứ lúc nào); iOS chỉ nhận
  callback bên trong phiên đăng nhập của chính nó, nên callback sai kết thúc luôn lần đăng nhập đó và xoá state.
- Chưa làm (audit đề xuất, owner chưa yêu cầu): hỏi xác nhận khi callback đổi sang tài khoản khác; Universal Links thay custom scheme.

## CI run 36670956956 (commit e50bc97) — XANH, 18/18 ảnh
Build, 240/240 unit test (có `ResponseContractDecodeTests`, `AppConfigDecodeTests`), 17/17 UI test, 18 ảnh + 18 ảnh ghép.
Lỗi cuối (Ưu đãi): identifier đặt trên container đè lên identifier của nút con → test không thấy nút; bỏ id ở container (Ưu đãi, hero
hub). Đã xem ảnh: `16` chip tab hiện đúng chữ, lưới không tràn; `18` thẻ "Hỏi Tappy trước khi mua" hiện cả khi không có deal.
Push: từ 30/09 phiên này tự push bằng đúng lệnh `git -C D:/TappyAI-wt/wtios push origin ios/sync-2026-09-30` (hook guard-push).

## CI run 36668238909 (commit c7b6486) — 238/240 unit test
Build xanh. 2 test cũ (`OwnCollectionsTests`) khẳng định giải mã PHẢI hỏng (feed thiếu page/limit; dòng rút gọn giải mã thành `Review`)
— đúng là hành vi đợt rà cố ý đổi. Viết lại: vẫn giữ ý bảo vệ (mỗi route dùng đúng kiểu) nhưng ghim bằng kiểu trả về của service lúc
biên dịch, thay vì dựa vào việc giải mã thất bại. UI test không chạy vì bước unit test đỏ.

## Rà toàn bộ model giải mã response (30/09, sau lỗi build 50)
Nguyên tắc (ghi ở đầu `Core/Networking/LenientDecoding.swift`): chỉ bắt buộc trường màn hình thật sự cần (thường chỉ `id`); trường
khác optional hoặc có mặc định trung tính (0 / false / "" / []) khi mặc định đó không nói sai điều gì; danh sách bỏ phần tử hỏng, giữ phần
còn lại (`lossyArray`), thiếu/null = rỗng; số nhận cả `3`, `3.0`, `"3"`; trường thừa bị bỏ qua.
- Đã áp dụng: Khám phá (`Review`, `FeedResponse` — thiếu `page/limit` vẫn chạy), bình luận, người dùng/tìm người/theo dõi, 5 bộ sưu tập,
  Đã lưu (`Favorite`, `SavedReview`), Gợi ý, đặt chỗ (2 kiểu), đánh giá địa điểm, Ưu đãi, thông báo, lịch sử chat (4 nơi đọc mảng trần
  `/api/conversations` → `LossyList`), Planner, gợi ý câu hỏi Home, hồ sơ (`UserProfile` — production KHÔNG gửi `cover_url`), trí nhớ AI
  (một mục ngân sách hỏng chỉ mất mục đó), theo dõi giá, sở thích, kết nối, đi nhóm, công cụ (tỷ giá: một đồng tiền hỏng chỉ mất đồng đó;
  Viết content nhận hashtags dạng chuỗi hoặc mảng), danh sách trong thẻ địa điểm/mua sắm của chat (trước: 1 phần tử hỏng = mất cả danh sách).
- Cố ý GIỮ bắt buộc: token phiên (đăng nhập), `id`, `title` + `officialUrl` của deal (không có thì không phải deal), kết quả chính của dịch /
  quét / viết content, 3 con số hạn mức của `/api/subscription` (bịa "0 / 0" là nói sai; thiếu thì app lùi về gói Free như trước).
- Chưa đụng: model Nhạc (tính năng đang ẩn cứng `ProductFlags.showMusic = false`), Scam Shield (đã khoan dung sẵn).
- Test `ResponseContractDecodeTests`: body THẬT của production cho `/api/reviews/feed`, `/api/deals`, `/api/suggested-prompts` (lấy 30/09,
  đã thay id/tên/đường dẫn media); route cần đăng nhập thì dựng đúng từng khoá theo `.select(...)` + `NextResponse.json({...})` trên main
  `f42ae4b` (profile, favorites, notifications, users/[id], comments, conversations, recommendations); cộng các ca hỏng (1 dòng hỏng, list
  null, số dạng chuỗi, thiếu trường phân trang, thiếu hạn mức).

## Lỗi TestFlight "Không tải được cấu hình" (build 50) — nguyên nhân + xử lý (30/09)
Kiểm chỉ bằng đọc code, cấu hình build và một GET công khai tới `/api/config`:
- **Host**: build 50 (commit `adcb154`, run #50) lấy `TAPPY_API_BASE_URL` từ secret CI; theo ghi chép pipeline đó là PRODUCTION
  `https://www.tappyai.com` (+ Supabase prod). `Release.xcconfig` mặc định cũng là www.
- **Endpoint**: `GET /api/config` (không cần đăng nhập) — màn Đăng nhập và Onboarding đọc nó trước tiên.
- **Có trên production (main `f42ae4b`) không**: CÓ, trả 200, không bị Vercel protection (chỉ `uat.tappyai.com` bị chặn: 302 → vercel.com/sso-api).
- **Nguyên nhân**: body production gửi `freemium.anonDailyLimit` (tên cũ); iOS build 50 BẮT BUỘC `freemium.anonLifetimeLimit` (đổi tên
  15/09 ở rc, chưa lên production) → giải mã cả cấu hình thất bại → "Không tải được cấu hình" cho mọi người. Nếu build trỏ UAT thì cũng
  hỏng, vì SSO của Vercel.
- **Sửa (code, chưa có build mới)**: `AppConfig` chỉ bắt buộc `flags` + `upload`; `freemium`/`auth`/`onboarding`/`video` hỏng hoặc thiếu
  thì thành nil, không kéo cả cấu hình. Chủ đề onboarding: production gửi `key`/`emoji` không có nhãn → lấy nhãn từ `tag.*` trong catalog.
  Test: `AppConfigDecodeTests` (giải mã nguyên văn body production); UI test `testConfigDownShowsRetryAndRecovers` (server 503 → màn lỗi
  thân thiện + nút Thử lại → server lên lại → bấm Thử lại vào được đăng nhập, ảnh `14-config-down`) và `testProductionConfigShapeOpensLogin`
  (ảnh `15-login-prod-config`).
- **Quyết định (Huy 30/09)**: KHÔNG đưa secret bypass của Vercel vào bất kỳ bản TestFlight nào. CHƯA build TestFlight mới. Bản TestFlight
  để test thật trỏ PRODUCTION và build SAU KHI release Phase 7. Trước đó iOS nghiệm thu bằng ảnh CI.

## CI run 36663001381 (commit d9a9136)
- Build xanh, unit test xanh, **13/13 UI test qua, 13 ảnh chụp đã xuất** (login, 18+, hub khách, Đã lưu có dữ liệu / rỗng / lọc địa điểm,
  Viết content, Gợi ý, 5 thẻ chia sẻ). Bước ghép ảnh đỏ chỉ vì `pip install` bị macOS chặn (PEP 668) — đã thêm `--break-system-packages`.
- Ảnh đã xem: các thẻ chia sẻ đúng mẫu #1/#7 (logo, panel, QR có ngoặc xanh, banner + rái cá, timeline kế hoạch). Còn sửa từ ảnh:
  banner của thẻ QR rộng 960 trong thẻ 1200 (nay theo bề rộng thẻ), ô Ngày/Tháng của màn 18+ bị co (nay chia đều), logo màn 18+ dùng
  logo cũ của iOS (nay dùng `tappyai_logo` của Android), thanh trạng thái lọt vào ảnh thẻ (nay ẩn trong màn xem thẻ).

## Cụm 2 — ảnh chia sẻ
| Việc | Commit |
|---|---|
| Thẻ sáng mẫu #1: review, clip Explore, gợi ý (1080×1920), QR hồ sơ/bài; thẻ kế hoạch tối mẫu #7 (`Core/Share/Cards/*`) | 3dd465c |
| Bộ tạo file MỘT LẦN cho mỗi (layout, link): xem trước = Lưu về máy = gửi (`ShareCardFiles`) | 3dd465c |
| Màn chia sẻ review/clip: chọn mẫu (thẻ bài / mã QR), xem trước, Lưu về máy, Gửi ảnh (TikTok, Zalo… nhận FILE PNG qua share sheet hệ thống), ghi lịch sử chia sẻ `POST /api/reviews/{id}/share` chỉ khi chia sẻ hoàn tất | ee37457 |
| Màn chia sẻ gợi ý/kế hoạch dùng thẻ đã duyệt; TikTok = gửi file thẻ; kế hoạch đã publish vẫn có "Lưu về máy" | ee37457 |
| QR hồ sơ: thẻ QR có thương hiệu + Lưu về máy + Gửi ảnh | ee37457 |
| 5 ảnh chụp thẻ trong CI (`09`–`13`), ghép cạnh mẫu layout đã duyệt | ee37457 |
- Không có huy hiệu Google Play trên thẻ QR bản iOS (không dùng được trên iPhone; App Store chưa có → không huy hiệu, như web).
- Chưa làm: gửi VIDEO clip đã tải lên cho TikTok (cần tải file video về máy trước); chia sẻ clip hiện gửi ảnh thẻ.

## Chưa làm
- Ảnh chia sẻ theo mẫu 1/6/7 (thẻ review/clip/gợi ý sáng 1080×1920, ảnh kế hoạch tối, QR hồ sơ), màn chia sẻ mẫu #6, "Lưu về máy",
  TikTok nhận FILE ảnh/video, ghi lịch sử chia sẻ (`POST /api/reviews/{id}/share`).
- Giao diện câu trả lời tư vấn theo khung mới — CHỜ Luna (không làm).
- Build TestFlight sau khi cụm 2 xong và CI xanh.

## Xác nhận thư mục `C:\wtios-untracked-backup` (30/09) — Huy tự xoá
24 file (693 KB), đều là file untracked cũ của worktree `ci/ios-build`. So từng file với nhánh này (= `rc/web-uat` fbb1c3c):
- 20 file GIỐNG HỆT bản đã có trên rc/web-uat.
- 4 file KHÁC, và bản trên rc/web-uat MỚI HƠN bản backup (chỉ khác ở comment/cách tra chuỗi/helper test, sau khi bỏ khác biệt xuống dòng):
  `Core/Share/PlanShareService.swift`, `Core/Share/ShareArtifact.swift`, `TappyAITests/CommerceActionContractTests.swift`,
  `TappyAITests/PlanShareTests.swift`.
→ Không có gì trong thư mục backup mà rc/web-uat chưa có. Xoá được.

## Ghi chú kỹ thuật
- Ảnh Android dùng để ghép là ảnh HIỆN TRẠNG 28/09 đã commit (`docs/uat/evidence/android-parity/step1-hientrang`), không phải bản
  cuối; ảnh Android cuối nằm ngoài git (GCS). Ghi rõ trên từng ảnh ghép.
- Hook `-uitest-route` chỉ có trong build DEBUG (`App/UITestLaunch.swift`), archive Release không chứa.
- Chưa dịch: DM (tin nhắn riêng), Smart Tools hub, Games (Android có, iOS chưa từng có) — ngoài phạm vi prompt.
