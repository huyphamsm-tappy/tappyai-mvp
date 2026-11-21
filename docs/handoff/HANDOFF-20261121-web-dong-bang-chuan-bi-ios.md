# BÀN GIAO 21/11/2026 — BẢN WEB ĐÃ ĐÓNG BĂNG, PHIÊN SAU LÀM iOS THEO WEB

> Đọc file này trước. Nó nói: web đang ở đâu, cái gì đã xong/chưa, iOS phải bắt chước những gì (và chỗ nào KHÔNG được bắt chước), luật làm việc với anh Huy, và có sẵn một prompt dán vào phiên mới (mục 12).
> Người đọc: một phiên Claude mới, không nhớ gì về hôm nay. Anh Huy không phải dân lập trình: nói tiếng Việt, ngắn, thật, có nhãn ĐÃ KIỂM / CHƯA KIỂM.

## 0. Tóm tắt trong 10 dòng
1. Bản web ở nhánh `feat/brain-r13-p1`, cây làm việc `D:\TappyAI-wt\wt-integration`. Đã đóng băng bằng tag `web-freeze-20261121` (mục 1). **Chưa đẩy lên GitHub, chưa deploy production.** Hơn 289 commit trước `origin/main`.
2. Web có đủ: chat (bộ não, nghiên cứu sâu), clip Khám phá (tải lên → nén → kiểm duyệt → đăng), nhắn tin, báo cáo/chặn/ẩn bình luận/tự ẩn bài bị báo cáo, thông báo (có "bạn bè đăng bài"), nhóm ăn, Scam Shield (tin Bộ Công an tự cập nhật hằng tuần), Deal, thanh toán SePay (gói web), chân trang trang chủ mới, ảnh thẻ gợi ý theo chủ đề.
3. iOS **chưa** theo kịp: app trên App Store là bản cũ (nhiều bug). Việc phiên sau: làm iOS theo web, web là bản đặc tả (`docs/ios/13_PARITY_GOVERNANCE.md`).
4. Không có máy Mac: mọi code Swift chỉ biên dịch được trên CI (nhánh `ios/**`, workflow `.github/workflows/ios.yml`). Chưa biên dịch = chưa chạy.
5. Trước khi deploy web còn việc của anh (biến môi trường Vercel, SePay, migration production): xem `DANH-SACH-VIEC-TRUOC-DEPLOY-20261121.md`. Kế hoạch ngày mai: `KE-HOACH-MAI-UAT-SEPAY-20261122.md`.

## 1. Trạng thái kho mã và môi trường
| Mục | Giá trị |
|---|---|
| Nhánh web | `feat/brain-r13-p1` (cây `D:\TappyAI-wt\wt-integration`) |
| Tag đóng băng | `web-freeze-20261121` (commit cuối của bàn giao này; xem `git rev-parse web-freeze-20261121`) |
| Tag cũ liên quan | `ios-arch-freeze-20261102b`, `release-freeze-3fce8b7` |
| Cách đo độ lệch | `git log --oneline origin/main..web-freeze-20261121` (289+ commit) |
| Production | KHÔNG đụng: dự án Supabase `fwznnobrdctuskgrvuik`; UAT là `zdaprdfgpbxyofagmc` (hai dự án dễ nhầm) |
| Cây `D:\Claude\Projects\TappyAI\.worktrees\g1-growth` | nhánh khác (`feat/g1-growth`), có thay đổi chưa commit về iOS/cron không phải của web này. Đừng nhầm hai cây; luôn `git -C <đường dẫn tuyệt đối>` |
| Thử nghiệm | UAT localhost:3000, cấu hình xem trước `wt-integration-uat-plans-3000` (đọc `flags-uat-blocks-plans.json`). Đổi cờ → `preview_stop` rồi `preview_start`. `LOCAL_DEV_GCLOUD_TOKEN` phải giữ đúng chuỗi `true` |
| Link đăng nhập UAT | `node D:\TappyAI-review-artifacts\uat-tools\make-login-link.mjs --list` rồi `... <số>`; link dùng một lần, ~1 giờ |
| Kiểm thử | `npx tsc --noEmit -p .` sạch; `npx vitest run --project app` ≈ 28.136 test qua (một test kiến trúc đôi lúc quá thời gian khi chạy cả bộ, chạy riêng thì qua) |

## 2. Luật làm việc (bắt buộc)
- Sửa mã CHỈ bằng Edit/Write (CLAUDE.md của dự án). Không `sed -i`, không heredoc để viết tệp mã, không `python -c`.
- Tệp dùng LF (`.gitattributes`).
- Tiếng Việt cho mọi chữ anh đọc. Kỹ thuật là việc của em; chỉ hỏi anh về quyền (tải, tài khoản), tiền, gu sản phẩm, riêng tư, production.
- Không push, không deploy, không áp migration production khi chưa có lời anh. Không in khóa/`.env`. Không tự thêm tài khoản/khóa vào ô nhập hộ anh.
- Không vá từng câu hỏi trong bộ não, không sửa lời nhắc để "chữa" một ca (anh đã cấm, 19/10 và 13/11). Chất lượng trả lời không được giảm để lấy tốc độ.
- Mọi thứ anh dặn đều là yêu cầu cứng: nếu không làm được, nói thẳng và nói vì sao.
- iOS: không biên dịch được ở máy này. Không bao giờ ghi "PASS" khi chưa có ảnh/run CI.

## 3. Web đã có gì — và iOS cần làm gì (bản đồ theo tính năng)
Mỗi dòng: **web làm gì** → API/tệp web làm nguồn → **việc iOS**. Web là đặc tả; khác với web phải có lý do ghi lại.

### 3.1 Thanh toán và gói
- Gói web trả bằng chuyển khoản SePay/VietQR, một lần, không tự gia hạn, **không hoàn tiền** (migration 20261203). Pip (miễn phí), MoMo 7 ngày 25.000đ (một lần), Coco 225.000đ/tháng (15 báo cáo nghiên cứu sâu/tháng), Tappy 300.000đ/tháng (30), bản 3 tháng 607.500đ / 810.000đ. Cấu hình duy nhất: `src/lib/plans/planConfig.ts` + `subscriptionPrices.json`.
- Mua chồng gói cùng loại cộng dồn ngày; báo cáo nghiên cứu sâu chưa dùng được **cộng sang gói mới** (`src/lib/plans/deepCarryover.ts`); phí SePay không cộng vào giá.
- **iOS KHÔNG hiện giá web**: giá lấy từ App Store (chính sách Apple). iOS dùng Apple IAP (RevenueCat), chỉ cần khớp *tên gói, hạn mức, câu chữ*. Đừng dẫn người dùng iOS tới thanh toán SePay.
- API: `payments/orders`, `payments/sepay` (webhook), `payments/me`, `subscription`.

### 3.2 Chat và bộ não
- Giao diện chat không đổi API: `POST /api/chat` (luồng), chế độ `auto`/`think`, nghiên cứu sâu (menu "+" → "Nghiên cứu sâu"; báo cáo 24 nguồn, xuất MD/Word/PDF/HTML). Header `x-tappy-deep-reset` báo ngày hạn mức làm mới; chú thích `8:[tappy.turn.v1]` cuối luồng (client bỏ qua loại không biết).
- Khối `[TAPPY_MEDIA]` (thẻ Wikipedia/tin/ảnh) nằm trong văn bản trả lời; iOS đã có bộ đọc khối, cần kiểm giữ được thẻ `entity`/`entities`.
- Lưu cuộc trò chuyện: ghim/lưu trữ (`conversations`, migration 20261118), Dự án (`chat-projects`, 20261119). **Việc iOS:** menu ghim/lưu trữ, danh sách dự án.
- Tốc độ: chưa tối ưu thêm; có `scripts/perf/latencyReport.mjs` đọc log `tappyai_usage`. Chờ số đo production.

### 3.3 Clip Khám phá (pipeline video)
- Luồng: đồng ý kiểm duyệt AI (`video/consent`, hộp thoại bắt buộc lần đầu) → tải lên có chữ ký (`video/uploads`, `.../complete`) → Google Transcoder HLS (720 + 360, tối đa 5 phút) → kiểm duyệt (omni-moderation + phiên âm; lỗi thoáng qua thử lại tối đa 4 lần rồi chờ người duyệt) → người duyệt (`admin/video-moderation/*`) → đăng bằng `POST /api/reviews` kèm mã tài sản video → phát qua Google Cloud CDN bằng **cookie ký** (tên miền `.tappyai.com`, `media.tappyai.com`).
- Cờ: `EXPLORE_VIDEO_PIPELINE_ENABLED` (để TẮT ở deploy đầu, bật sau khi kiểm). Khóa ký CDN 16 byte. Hướng dẫn: `VIDEO-CDN-HUONG-DAN-HUY-20261121.md`, `HUONG-DAN-CAI-KHOA-20261121.md`.
- **iOS cần chú ý:** AVPlayer phát HLS qua CDN cần giữ cookie ký (CookieStorage dùng chung cho `HTTPCookieStorage`); `video/playback/[assetId]` trả cookie. CHƯA kiểm bao giờ trên máy thật, cả web lẫn iOS.
- Khung xem clip: trang `/reviews/[id]` luôn mở trong khung Khám phá (mọi loại bài, kể cả chữ/ảnh).
- Tiếng clip: lần bấm đầu trên khung Khám phá chỉ bật tiếng, không tạm dừng (sửa 21/11; có test tự động, chưa nghe thử thật).

### 3.4 An toàn nội dung (Apple 1.2) — phải khớp ở iOS
- **Báo cáo**: bài, bình luận, người dùng, tin nhắn (10 lý do). Mọi báo cáo → hàng đợi duyệt trong 24 giờ.
- **Tự ẩn bài bị báo cáo** (migration 20261207): đủ 3 người khác nhau báo cho lý do nặng (nội dung không phù hợp, bạo lực, nhạy cảm, thù ghét, tình dục, tự hại, an toàn trẻ em) hoặc 5 người cho quấy rối → bài ẩn đến khi người duyệt xem. Lừa đảo/spam/bản quyền/thông tin sai/mạo danh không tự ẩn. Báo cáo trước phán quyết "không vi phạm" mới nhất không tính lại. "Không vi phạm" gỡ ẩn.
- **Ẩn bình luận** (20261208): chủ bài ẩn bình luận dưới bài của mình (nút mắt, đảo được); ẩn thì chỉ người viết, chủ bài, người duyệt thấy. `POST /api/comments/[commentId]/hide`; `hidden_at/hidden_by ('owner'|'auto'|'moderator')`. Báo cáo bình luận cũng tự ẩn theo ngưỡng 3/5.
- **Chặn**: hai chiều (không theo dõi/nhắn/xem bài nhau); hồ sơ người đã chặn hiện "Bạn đã chặn người này" + nút **Bỏ chặn** (`users/[id]/block` DELETE). **Việc iOS:** màn hình hồ sơ người đã chặn có nút Bỏ chặn.
- Chính sách và Quy tắc cộng đồng: `/community-guidelines`, `/terms`, `/privacy`; Điều khoản §4 "không khoan nhượng".

### 3.5 Nhắn tin
- Chỉ nhắn được khi **theo dõi nhau** (mặc định `mutual_follow`) và chưa chặn. Nút Nhắn tin trên hồ sơ mở đúng tab Tin nhắn (`/profile/notifications?thread=<id>`).
- Ảnh trong tin nhắn **không hết hạn** (trước đây 30 ngày; giờ chỉ hết hạn nếu đặt `CHAT_MEDIA_RETENTION_DAYS`). Cài đặt có "Xóa bộ nhớ đệm ảnh" (cache trên máy, tối đa 300 bản).
- Thông báo tin nhắn gộp ("2 tin nhắn mới"); cờ `MESSAGE_NOTIFICATIONS_ENABLED` (Production chưa bật).

### 3.6 Thông báo
- Loại (`notifications.type`): `like`, `comment`, `follow`, `message`, **`friend_post`** (mới: người bạn theo dõi đăng bài/clip công khai; tối đa 200 người nhận/bài; bỏ qua người chặn; bài đang chờ duyệt không báo; tắt: `FRIEND_POST_NOTIFICATIONS_ENABLED=false`), `morning_brief` và các loại cron khác. `entity_url` là link sâu (`/reviews/<id>`).
- Thông báo buổi sáng của Tappy (cron) chỉ gửi cho người đã bật thông báo đẩy. Đang chờ anh quyết: cho vào hộp thư mọi người đang hoạt động.
- **Việc iOS:** hiển thị loại `friend_post` (không biết loại thì hiện dòng chung, đã có quy ước "client hiển thị dòng chung cho loại lạ"); mở link sâu; gộp tin nhắn.

### 3.7 Nhóm ăn (Group dining)
- Tạo nhóm → chia sẻ link → thành viên điền sở thích → Tappy gợi ý 3 quán → bỏ phiếu → chốt → chia bill. Duyệt thành viên khi vào (20261204), bình chọn (20261205), bill (20261206). API `group/*` (`[id]`, `join`, `members`, `leave`, `suggest`, `vote`, `choose`, `bill`).
- Trên web: thẻ "Nhóm ăn" có ở trang chủ cùng Cảnh báo lừa đảo, Chia bill. Thẻ "Cần đăng nhập" chỉ hiện cho khách.

### 3.8 Scam Shield
- Kiểm link/ảnh QR/tin nhắn; 25 tình huống Bộ Công an; **tự cập nhật tin mỗi tuần** (cron `scam-shield-sync`, thứ Hai 10:00 giờ Việt Nam, đọc bocongan.gov.vn; ĐÃ KIỂM chạy thật 21/11). Bảng `scam_knowledge_versions` (20261201).
- Tệp tin nhắn: dòng trợ giúp 0692.345.860 (Cục Cảnh sát hình sự) hiển thị cố định. iOS khớp nội dung và nguồn.

### 3.9 Deal
- Chỉ hiện đối tác Accesstrade, Lazada, Agoda, Vexere. Thẻ đối tác dùng **logo chính thức**: sổ đăng ký thương hiệu `src/config/brandRegistry.ts` (web) ↔ `android/core/common/.../BrandRegistry.kt` (Android, bài test đối chiếu từng trường). **iOS chưa có sổ đăng ký thương hiệu**: tạo bản tương ứng và đóng gói logo (`public/brands/*`; Android dùng PNG trong `assets/brands/`).
- Deal có giảm giá tự động: chưa làm (cần khóa API Accesstrade, anh đặt trên Vercel). Hiện trang trống thì hiện 3 thẻ "Mở trang đối tác".

### 3.10 Trang chủ, hồ sơ, cài đặt
- Trang chủ web: bỏ tiêu đề/nút "Hỏi Tappy" ở đầu, bỏ hàng "Thử hỏi Tappy" và thẻ "AI còn lại hôm nay"; có "Hỏi Tappy thử" (5 thẻ), "Công cụ" (3 thẻ), "Tiếp tục", banner tải ứng dụng, chân trang 4 cột (logo, Khám phá, Tải ứng dụng có QR, Về TappyAI, Hỗ trợ), mạng xã hội (Facebook, TikTok, Instagram, Threads; LinkedIn chờ link). Đây là trang web, iOS không cần banner tải app.
- Thẻ "Hỏi Tappy thử": API `suggested-prompts` có thêm trường tùy chọn `topic` (work, study, money, health, family, news, tech, writing) cho câu thuộc nhóm "chung"; ảnh theo chủ đề ở `public/home/topics/*.webp` (840×320). Chủ đề `tech`, `writing` chưa có ảnh (web dùng mascot Tappy). **iOS:** đọc `topic` (bỏ qua nếu không biết); dùng đúng 10 ảnh đó.
- Logo mới: `public/branding/otter-logo.png` (512px, đã thay trên web); mascot xe máy `public/branding/mascot-scooter.webp`. iOS cần icon ứng dụng/logo mới nếu anh duyệt.
- Cổng 18+ (khai báo người lớn): `age-declaration` (20261202).
- Link cửa hàng: App Store `https://apps.apple.com/vn/app/tappyai/id6816654420` (bundle `com.tappyai.ios`), Google Play `...id=com.tappyai.app`.

### 3.11 Chỉ phía máy chủ (iOS không làm UI)
TVI (`cron/tvi-*`, `entity-facts`, `entity-profile`), MCP (`mcp`, `cron/mcp-jobs`), `link-preview`, `pdf-image`, các cron video. iOS chỉ cần không vỡ khi API đổi.

## 4. Thay đổi API đã sửa so với `origin/main` (iOS cần rà từng cái, sai khác là lỗi parity)
Đã sửa: `reviews` (POST, kèm video), `reviews/feed`, `reviews/[id]/comments` (GET trả thêm `hidden_at`, `hidden_by`), `reviews/[id]/report`, `reviews/[id]/share`, `reviews/upload`, `comments/[commentId]/report`, `users/[id]/block`, `users/[id]/report`, `messaging/threads/[id]/messages`, `messaging/messages/[id]/report`, `payments/orders`, `payments/sepay`, `profile`, `config`, `conversations`, `chat`, `scam-shield/analyze`, `scam-shield/share`, `scan`, `translate`, `track`, `age-declaration`, `auth/zalo(/callback)`, `group` + `group/[id]/join|suggest`, `stripe/*`, `webhooks/stripe`, `shared-results`.
Mới: `video/*`, `admin/video-moderation/*`, `chat-projects`, `comments/[commentId]/hide`, `group/[id]` + `bill|choose|leave|members|vote`, `entity-facts`, `entity-profile(/sense)`, `link-preview`, `pdf-image`, `mcp`.
Migration mới (đều có tệp gỡ trong `supabase/migrations/rollback/`): 20261111–20261121 (video, ghim/lưu trữ, dự án chat, TVI, MCP), 20261201–20261208 (tri thức Scam Shield, 18+, không hoàn tiền, nhóm ăn ×3, tự ẩn bài, ẩn bình luận). Thứ tự áp: `supabase/MIGRATION_ORDER.txt`.

## 5. Cờ và biến môi trường (tên; giá trị không ghi ở đây)
Thanh toán: `SUBSCRIPTIONS_ENABLED`, `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NAME`, `SEPAY_WEBHOOK_HMAC_SECRET`, `BREVO_API_KEY`, `PAYMENTS_MAIL_FROM`.
Clip: `EXPLORE_VIDEO_PIPELINE_ENABLED`, `GCS_VIDEO_SOURCE_BUCKET`, `GCS_VIDEO_DELIVERY_BUCKET`, `GCP_TRANSCODER_SERVICE_ACCOUNT`, `GCP_CDN_SERVICE_ACCOUNT`, `CDN_URL_MAP_NAME`, `VIDEO_CDN_HOST`, `VIDEO_CDN_KEY_NAME`, `VIDEO_CDN_COOKIE_DOMAIN`, `VIDEO_CDN_SIGNING_KEY`, `VIDEO_SPEECH_TRANSCRIBE_ENABLED`.
An toàn: `REPORTS_ENABLED`, `USER_BLOCKS_ENABLED`, `MODERATION_ADMIN_ENABLED`.
Tin nhắn/thông báo: `MESSAGE_NOTIFICATIONS_ENABLED`, `CHAT_MEDIA_RETENTION_DAYS` (đặt = bật hết hạn), `FRIEND_POST_NOTIFICATIONS_ENABLED` (mặc định bật), khóa VAPID.
Chân trang: `NEXT_PUBLIC_PLAY_LISTING_LIVE` (`0` = ẩn), `NEXT_PUBLIC_APP_STORE_URL` (`off` = ẩn), `NEXT_PUBLIC_SOCIAL_*`.
Khác: `CRON_SECRET`, `SCAM_SHIELD_SYNC_AI`, `ACCESSTRADE_*` (mới có `ACCESSTRADE_PUBLISHER_ID`; thiếu `ACCESSTRADE_API_KEY`).

## 6. iOS — nơi bắt đầu
- Đọc theo thứ tự: `docs/ios/00_README.md` → `13_PARITY_GOVERNANCE.md` (web là đặc tả) → `IOS-PROGRESS.md` → `IOS-REQUESTS.md` → `PARITY-AUDIT-2026-10-01.md` → `HANDOFF-20261104-messenger-web-android-ios.md` và `PROMPT-SESSION-MOI-20261104-messenger.md` (hai tệp này nằm ở cây `D:\Claude\Projects\TappyAI\.worktrees\g1-growth\docs\handoff\`, không có ở cây web).
- Việc đã ghi: iOS đã phát hành công khai (10/11) nhưng nhiều lỗi; anh dặn "lập backlog, làm hết rồi mới deploy production". PR #313 (Messenger theo web) từng mở, CI macOS xanh — **phải kiểm bằng git/GitHub** xem đã gộp chưa, đừng tin ghi chú.
- Cách làm đề xuất: (1) kiểm kê iOS hiện tại so với mục 3 và mục 4 (bảng "web có / iOS có / thiếu"); (2) trình anh backlog xếp theo mức độ (Apple 1.2 an toàn nội dung trước, rồi thanh toán/gói, nhắn tin, clip, nhóm ăn, thông báo, deal, trang chủ); (3) làm từng lát, mỗi lát một commit, nhánh `ios/**` để CI biên dịch; (4) ảnh chụp CI làm bằng chứng.
- Việc luôn cần anh: đăng nhập Apple/TestFlight, thử trên iPhone thật, duyệt giá/IAP.

## 7. Còn lại của web (không chặn iOS)
Xem `DANH-SACH-VIEC-TRUOC-DEPLOY-20261121.md` (việc trước deploy) và `UAT-NGUOI-DUNG-MOI-20261121.md` (kết quả UAT, lỗi đã sửa, lỗi còn). Tóm tắt còn mở: deal giảm giá tự động; thông báo hằng ngày cho mọi người; bảng tỷ giá thỉnh thoảng mất ô (lỗi do model); chat trùng tên (không tái hiện); ảnh Công nghệ/Viết/Học thứ hai/Tin tức thứ hai; LinkedIn; tốc độ chat chờ số đo production; CAPTCHA để sau.

## 8. Đã kiểm / chưa kiểm
ĐÃ KIỂM (UAT, giao diện thật): mua gói qua webhook SePay giả có ký; chat 9 lĩnh vực; nghiên cứu sâu; nhắn chữ và ảnh; đăng clip tới "Sẵn sàng đăng"; bình luận; chủ bài ẩn; báo cáo; chặn/bỏ chặn; xóa clip; xóa bình luận; thông báo (theo dõi, bình luận, thích, tin nhắn gộp, bạn đăng bài); Scam Shield (kiểm link, tin Bộ Công an chạy thật); chân trang/banner/QR; giao diện 375px.
CHƯA KIỂM: phát clip qua CDN thật; Zalo/Google trên tên miền thật; SePay thật; thông báo đẩy ra thiết bị; cron thông báo hằng ngày thật; âm thanh clip bằng tai người; mọi thứ trên iOS.

## 9. Bẫy đã gặp (đỡ tốn thời gian)
- Chrome tự động hóa: tab nền chụp màn hình bị treo → mở tab mới/đưa lên trước; hộp `confirm()` gốc chặn công cụ → ghi đè `window.confirm=()=>true` rồi bấm; kết quả JS có URL/cookie bị chặn → trả về số.
- Hai máy chủ `next dev` trên cùng thư mục làm hỏng `.next` (xóa `.next`, khởi động lại).
- Máy chủ phát triển lần đầu mỗi tuyến biên dịch rất chậm (4–10 giây): đừng đo tốc độ chat khi chưa "nóng".
- Cờ mới phải thêm tên vào danh sách cho phép của launcher UAT (`flags-uat-blocks-plans.json`).
- Test Windows: `process.exit` sau `fetch` trong Node 24 in lỗi "Assertion failed ... async.c" — vô hại, tránh bằng không gọi `process.exit`.

## 10. Tệp tham chiếu nhanh
`docs/handoff/` — `DANH-SACH-VIEC-TRUOC-DEPLOY-20261121.md`, `UAT-NGUOI-DUNG-MOI-20261121.md`, `KE-HOACH-MAI-UAT-SEPAY-20261122.md`, `VIDEO-CDN-HUONG-DAN-HUY-20261121.md`, `HUONG-DAN-CAI-KHOA-20261121.md`, `HANDOFF-20261120-web-viec-con-lai.md` (mục 4k quyết định 21/11), `HANDOFF-20261120-bo-nao-tong-ket-day-du.md` (bộ não). Công cụ ngoài kho: `D:\TappyAI-review-artifacts\uat-tools\make-login-link.mjs`.
Mã nguồn then chốt web: `src/app/HomeV3.tsx`, `src/components/discovery/PublicFooter.tsx`, `src/components/v3/V3Shell.tsx`, `src/app/reviews/clipStage.tsx`, `src/lib/notifications/friendPost.ts`, `src/lib/suggestedPrompts.ts`, `src/config/brandRegistry.ts`, `src/lib/plans/*`, `src/app/api/payments/*`.

## 11. Quyết định của anh Huy còn hiệu lực (tổng hợp)
Ngưỡng tự ẩn 3/5; cộng dồn gói và báo cáo sang gói mới; phí SePay không cộng; không hoàn tiền; CAPTCHA để sau; ảnh Messenger không hết hạn; clip tối đa 5 phút, 720 + 360; phát clip bằng Google Cloud CDN; deploy lần đầu để tắt cờ clip rồi bật sau khi kiểm; web trước, iOS/Android theo web sau; không tạo thêm nhánh/cây cho web; không dùng nguồn từ sản phẩm AI khác; chat nhân vật AI đã hủy.

## 12. PROMPT dán vào phiên mới (iOS)
Xem tệp `PROMPT-SESSION-MOI-20261121-ios.md` (cùng thư mục).
