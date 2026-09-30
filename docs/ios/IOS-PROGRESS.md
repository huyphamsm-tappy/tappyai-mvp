# iOS — nhật ký tiến độ (phiên ios/sync-2026-09-30)

Worktree: `D:\TappyAI-wt\wtios` (dời từ `C:\wtios` ngày 30/09 vì ổ C: đầy). Nhánh `ios/sync-2026-09-30`
(từ `origin/rc/web-uat` fbb1c3c + merge `ci/ios-build-rc`). Không push lên rc/web-uat. Cache/phụ thuộc đặt trên D:.
**Không có máy Mac: mọi thay đổi Swift CHƯA được biên dịch** — CI (`.github/workflows/ios.yml`, chạy trên push nhánh `ios/**`)
là lần biên dịch đầu tiên. Bảng dưới chỉ ghi "PASS" khi có ảnh chụp CI; chưa có run nào thì trạng thái là "code viết".

Việc cần Huy đăng nhập: `docs/ios/IOS-REQUESTS.md` §3 (một lần). Yêu cầu server/Apple: cùng file.

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
