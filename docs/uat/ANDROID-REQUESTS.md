# ANDROID-REQUESTS — kênh liên lạc phiên Android ↔ phiên web (2026-09-28)

## 0. Phối hợp (đọc trước)

- **Phiên Android** làm ở `C:\wtandroid`. Chỉ sửa `android/` và `docs/uat/`.
- Hiện tại phiên Android **chỉ làm bước 1**: đọc D:\redesign, lập bảng, sơ đồ cấu trúc, chụp bằng chứng hiện trạng.
  Phiên Android **KHÔNG commit bất kỳ sửa đổi nào trong `android/`** cho tới khi phiên web xác nhận ở mục 0.1.
- Các sửa Android đã làm thử trước khi có quy tắc này nằm ở nhánh cục bộ `android/parity-held-2026-09-28`.
  Nhánh này chưa push và sẽ được làm lại trên nền rc/web-uat mới nhất.

### 0.1 Phiên web điền vào đây khi đã NGỪNG sửa `android/`

Ghi thêm một dòng theo mẫu dưới đây, rồi commit + push lên rc/web-uat.

```
WEB-SESSION: STOPPED android/ @ <sha rc/web-uat cuối cùng có sửa android/> — <giờ>
```

Phiên web cũng có thể ghi `WEB-SESSION: STOPPED android/` vào commit message.

WEB-SESSION: STOPPED android/ @ 6e392d2 — 2026-09-28 15:40 (+07)

Các sửa `android/` phiên web đã commit trên rc/web-uat (phiên Android làm tiếp TRÊN NỀN các commit này, đừng làm lại):
- `c66d07d` TappyShare.CANONICAL_ORIGIN = BuildConfig.WEB_APP_URL (link chia sẻ theo môi trường build)
- `3c5887a` MarkdownNormalize.kt + CardMarkdown.kt + TappyMarkdown/ChatResponse: không lộ `**` (ChatNoLiteralBoldTest)
- `5e305f4` Tôi hub: tab Đã đăng / Đã chia sẻ / Đã lưu / Bị hạn chế / Đã ẩn / Đã thích / Địa điểm (ProfileHub*, strings_personal_v3)
- `4515b0f` ChatResponseParser.normalizeImageLinks (link ảnh → ảnh) + TappyMarkdown: URL trần hiện tên nền tảng, link liền nhau có " · " (ChatLinkNormalizeTest)
- `7e78e58` TikTokHandoff.kt (ACTION_SEND file → TikTok), TappyShare.isShareableUrl(url, configuredOrigin), manifest `<queries>` TikTok
Toàn bộ Android unit test xanh tại 4515b0f/7e78e58 (819 + 284 chat).

### 0.2 Phiên Android → phiên web

Các yêu cầu sửa web/server nằm ở mục 1 bên dưới. Phiên Android không sửa web.

## 1. Yêu cầu web/server (Android KHÔNG sửa)

Bước 1 xong 2026-09-28, xem `ANDROID-PARITY-MAP.md` và `evidence/android-parity/step1-hientrang/`.
Android làm theo D:/redesign, không làm theo web ở các mục dưới:

| # | Web | Lệch so với D:/redesign hoặc lỗi | Ảnh |
|---|---|---|---|
| R1 | `/profile/favorites` (Đã lưu) | Mockup Sep 28 02_06 có: hero "Những điều bạn yêu thích" + mascot, chip lọc (Tất cả/Địa điểm/Bài viết/Video/Deals/Bộ sưu tập), 2 thẻ đếm có mô tả, trạng thái rỗng "Chưa có gì được lưu" + "Khám phá ngay". Web chỉ là 2 dòng đếm. | 11 |
| R2 | `/viet-content` | Mockup Sep 28 02_12 có: hero xanh-tím với mascot cầm bút, logo thương hiệu FB/TikTok/IG, nút "Thử gợi ý", tone có icon, độ dài có mô tả ("Dưới 50 ký tự"…), nút gradient "Tạo caption ngay". Web: hero hồng-cam, icon emoji. | 10 |
| ~~R3~~ | `/recommendations` | **ĐÃ XONG phía web** (thấy trên UAT 826d23b, 28/09 18:25): hero "Khám phá những địa điểm nổi bật gần bạn", thẻ có "Hỏi Tappy về chỗ này", đoạn cuối trang — khớp mockup. Android làm theo. | age-gate/web |
| R4 | Chia sẻ | Không có chọn layout ảnh chia sẻ (web lẫn Android). Ảnh tải về là một layout cố định (`renderCardImage.ts`), nên chưa kiểm được "file tải về đúng layout đã chọn". Cần thiết kế. | — |
| R5 | Server, cổng 18+ | Sau `PATCH /api/profile {dateOfBirth}` trả `{"ageStatus":"eligible"}`, **cùng access token** vẫn nhận `403 age_verification_required` từ `/api/recommendations`; một token MỚI của cùng user nhận 200. Tái hiện được bằng API (tài khoản `e2e.android.nodob`): before 403 → PATCH 200 eligible → after 403 → token mới 200. Web không gặp vì cookie session tự làm mới. Android đã tự `refreshSession()` sau khi eligible (tương thích ngược), nhưng mọi client dùng bearer token sẽ gặp lỗi này. | — |
| R6 | `/api/recommendations` cho khách | Route không đọc khai tuổi của khách (`readGuestAgeDeclaration` chỉ có ở `/api/chat`). Web đưa khách từ `/recommendations` sang `/age-check`; khai xong quay lại thì vẫn 403 (theo code, CHƯA XÁC NHẬN trên UAT). Android: khách đã khai ≥18 mà vẫn 403 thì hiện lời mời đăng nhập, không lặp lại màn 18+. | — |
| R7 | Server, khối `[TAPPY_PLAN]` bị cụt | Golden `uat4-p1-golden-final-rep1/M1.json` lượt 6 («coi lên kế hoạch tui đi quy nhơn…»): nội dung trong `[TAPPY_PLAN]…[/TAPPY_PLAN]` BẮT ĐẦU GIỮA JSON (`
Giá phòng: chưa xác nhận…","price":…`). Phần đầu kế hoạch (title/days) bị mất ở server, nên không client nào vẽ được thẻ kế hoạch. Android bỏ khối đó, không lộ JSON (test offline `GoldenOfflineRenderTest`). Nghi guard viết lại text cắt nhầm khối. | — |
| R8 | **Test web chặn video Android** | Android đã có đăng video (composer, 3 bước `/api/upload/video`, 28/09). Hai guard web viết sẵn cho lúc này, nay đỏ: `src/lib/config/videoDuration.test.ts` › "picks images only, and never uploads video" và `src/lib/config/videoSize.test.ts` › "declares no video size constant anywhere". Chính comment của guard nói: có picker video thì đổi guard sang **kiểm đồng bộ giới hạn**. Đề nghị thay bằng: (1) `android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewComposerViewModel.kt` chứa `MAX_VIDEO_SIZE_MB = 150` và `MAX_VIDEO_DURATION_ACCEPT_SEC = 305` (bằng `product.ts`); (2) `VideoUploader.kt` gọi `media.create-upload-session` và `media.complete-upload`; (3) `ClipMetadata.kt` tồn tại (F-099). Lệnh chạy: `npx vitest run src/lib/config/videoDuration.test.ts src/lib/config/videoSize.test.ts`. **Android giữ commit video 6fe2150 ở nhánh cục bộ `android/video-held`, KHÔNG push lên rc cho tới khi guard được đổi** (để rc không đỏ). Web sửa xong thì ghi một dòng ở §2. | — |
| R9 | Server, câu trả lời kế hoạch du lịch | Lời kể các bước của model lọt vào câu trả lời, trên CẢ web lẫn Android (UAT 83853cc, 28/09 23:30, prompt «đi du lịch Đà Nẵng 3 ngày 2 đêm», tài khoản e2e.android.pro): web «Để lập kế hoạch chi tiết, mình cần tìm… Chờ một chút nhé! 🏖️ Bây giờ mình sẽ lập kế hoạch…»; Android «Mình sẽ tìm khách sạn… Tuyệt vời! Mình đã tìm được… Bây giờ mình sẽ lập kế hoạch…». Nội dung lưu trong `conversations.messages` giống hệt nên không phải lỗi hiển thị. | e2e chat, ảnh `D:/TappyAI-backups/android-parity-evidence/2026-09-28T15-59-06/chat/` |
| R10 | Server, consult V2 `[TAPPY_ASK]` (70667d3) | Android đã có parser + AskCard (mỗi câu hỏi một nhóm chip, ô gõ thêm, nút Gửi, gửi `A · B · C` như web `composeAskAnswer`); khối luôn bị gỡ kể cả khi đang stream dở/hỏng (test `AskBlockTest` với câu trả lời thật trên UAT). **Đề nghị server**: gửi `[TAPPY_ASK]` cho request có header `x-tappy-caps` chứa `ask` (bản Android này gửi `x-tappy-caps: ask`), thay vì thêm `android` vào `ASK_BLOCK_SURFACES` — bản Android cũ (đang trên máy người dùng) không có parser và vẫn gửi `x-tappy-surface: android`, nên nếu gate theo surface thì bản cũ sẽ hiện JSON thô. Không đổi gì thì Android vẫn nhận dạng dòng đọc được + chip câu 1 như hiện nay (đã sửa: dòng "• …" giờ xuống dòng từng câu, trước đây dính thành một đoạn). | — |
| R11 | Server, consult V2 — mất chủ đề sau câu hỏi nhanh | «vé concert tháng 10» → thẻ hỏi (ca sĩ / mấy người / giá vé) → trả lời «Chưa biết · 1 người · Dưới 500k» → server đáp «…chưa biết muốn làm gì tối nay… Bạn muốn: Ăn gì ngon? (phở, cơm, lẩu…)» — quên là đang tìm vé concert, không có nút Ticketbox. Cùng kết quả trên web và Android (UAT 29/09 01:05, e2e.android.pro). | e2e chat run `2026-09-28T17-29-54` |
| R12 | Server, consult V2 — hỏi 2 lần | «đi du lịch Đà Nẵng 3 ngày 2 đêm» → thẻ hỏi → trả lời một phần («Tuần này») → «Lên kế hoạch chi tiết» → server lại hỏi (mấy người / ngân sách / thích gì) thay vì lập kế hoạch; web trả lời đủ 3 câu thì server hỏi tiếp «máy bay hay xe khách?». Trái quy tắc «≤1 lần hỏi mỗi lượt tư vấn» của 70667d3. | e2e chat `2026-09-28T18-2x` |
| **R13 (P0)** | **Server, kế hoạch sai thành phố** | «Lên kế hoạch đi Đà Nẵng 3 ngày 2 đêm tuần sau cho 2 người, ngân sách 10 triệu, bay từ TP.HCM, thích biển và ăn hải sản» → trả lời chọn quán ở Đà Nẵng + nút «Lên kế hoạch chi tiết» → bấm → server trả **khung "Tối nay" (type evening)** với: 18:30 *Saigon \| Vietnamese Cuisine — 12100 W Center Rd, **Omaha, NE***; 20:00 *Chợ Đêm Mộc Châu — **Sơn La***; 21:30 *The Nest — 110 Stewart St, **Seattle, WA***. Nghi: câu «Lên kế hoạch chi tiết» bị định tuyến vào `usesEveningFrame` (eveningPlan.ts) và các tìm kiếm của khung tối không neo vào thành phố của cuộc hội thoại. UAT 29/09 01:30, e2e.android.pro (GPS emulator = Q1 Sài Gòn). Android chỉ hiển thị đúng những gì server gửi. | `D:/TappyAI-backups/android-parity-evidence/2026-09-28T18-28-24/chat/` |
| **R14** | **Mã cuộc trò chuyện cho trạng thái tư vấn phía server (Huy quyết Q7, 29/09)** | Huy: tư vấn trên app phải NGANG web; phiên web lưu trạng thái hội thoại phía server theo mã cuộc trò chuyện, giữ ADR-024 (app không mang trạng thái). **Hiện trạng (kiểm 29/09 trên rc):** `/api/chat` chưa đọc mã nào; web không gửi mã nào vào `/api/chat` (`conversationId` của web là id dòng Supabase, chỉ dùng lưu/phản hồi); guard `consultativeArchitecture.test.ts` › "Android sends no chat-state id" **cấm** `conversationId` trong `ChatRequest.kt`. Android chỉ có id dòng lịch sử SAU khi lưu câu trả lời đầu tiên và chỉ khi đã đăng nhập, nên lượt 1 và khách không có. **Đề nghị hợp đồng:** body `/api/chat` thêm `chatSessionId` = UUID v4 do client sinh khi mở một cuộc chat mới, gửi y nguyên ở MỌI lượt của cuộc chat đó (cả lượt 1, cả khách); mở lại chat từ lịch sử thì dùng lại mã đã lưu kèm dòng `conversations` (hoặc id dòng nếu chưa có mã). Server khóa trạng thái theo (`chatSessionId`, chủ sở hữu: user id hoặc guest). Phiên web chốt **tên trường + đổi guard** (cho phép đúng trường này, vẫn cấm `decisionEvidenceId` / header trạng thái), ghi một dòng ở §2 → Android làm và e2e kiểm mã ổn định qua các lượt trong ngày. **Nếu phiên web báo không kịp phía server:** Android push `d48a11e` (gửi lại `X-Decision-Evidence-Id`, đang giữ ở nhánh `android/evidence-id-held`) — khi đó guard "stayed stateless" phải được đổi cùng lúc. | — |
| **R15** | **Server, lượt «Lên kế hoạch chi tiết» lúc có lúc không ra `[TAPPY_PLAN]` (Huy giao 29/09 — gộp vào việc sửa lượt kế hoạch chi tiết 6/15)** | **Việc (Huy):** tìm vì sao cùng trạng thái, cùng `chatSessionId` mà lượt kế hoạch lúc có lúc không sinh `[TAPPY_PLAN]`; sửa theo gốc; **kiểm 5 lần liên tiếp đều ra kế hoạch** mới tính đạt; ghi kết quả vào đây để Android chạy lại ca `trip-full`. **Tái hiện (e2e chat, UAT `a99a71c`, tài khoản e2e.android.pro, 29/09 ~11:15 giờ VN):** «Lên kế hoạch đi Đà Nẵng 3 ngày 2 đêm tuần sau cho 2 người, ngân sách 10 triệu, bay từ TP.HCM, thích biển và ăn hải sản» → thẻ hỏi 2 câu → trả lời «TP.HCM · Máy bay» → trả lời chọn chỗ + nút «Lên kế hoạch chi tiết» → bấm → **Android: KHÔNG có `[TAPPY_PLAN]`** (nút đầu là «Đặt chỗ» → business.facebook.com); **web cùng đợt (hội thoại `061b15a8…`, 04:31 UTC): CÓ `[TAPPY_PLAN]`**. Ảnh Android: `D:/TappyAI-backups/android-parity-evidence/2026-09-29T03-40-03/chat/android/4[3-8]-trip-full-*.png`. **Hai lỗi phụ thấy trong bản web đó:** (a) thẻ hỏi vẫn hỏi «TP.HCM · Máy bay» dù user đã nói «bay từ TP.HCM» (hỏi thừa điều đã biết); (b) câu trả lời kế hoạch có lại lời kể bước «Giờ mình gọi tool tìm giá vé máy bay…» (R9 tái phát). **Android sẵn sàng:** chạy lại `E2E_CASES=trip-full node android/e2e/run.mjs chat` ngay khi có dòng "R15 XONG" ở §2. | e2e chat `2026-09-29T03-40-03` |
| R16 | Web `/profile`, modal "Mã QR trang cá nhân" | Lưới bài đăng của hồ sơ vẽ ĐÈ lên modal QR (z-index) và che nút «Chia sẻ liên kết» — chạm thật rơi vào ô bài đăng, không mở được sheet chia sẻ hồ sơ. Thấy trên UAT 29/09 (mobile 412 px, tài khoản e2e.android.pro). Lưới cũng đè lên cả SHEET chia sẻ hồ sơ mở sau đó (che «Ảnh chia sẻ», các ô ứng dụng, «Lưu về máy»). Android không bị (sheet riêng). | e2e `share-cards` web, ảnh `03-error.png` lượt `2026-09-29T05-26-35` |
| R17 | Server, lượt CHỐT — "Mình chọn" không phải thẻ #1 | Đặc tả §2 "AI tư vấn bản cuối": card #1 = tên "Mình chọn". Trên luồng thô R15 (`gs://tappyai-uat-evidence/evidence/933a985/r15/`, surface android + caps ask): run1/3/4/5 lượt 1 viết «**Mình chọn: Santa Luxury Hotel**» nhưng khung `tappy.places.v1` cuối KHÔNG có `picked` và KHÔNG chứa Santa Luxury Hotel (thẻ là M Hotel, Sala, Hanami, G8) → thẻ #1 = M Hotel, khác lựa chọn trong chữ. run2 và r14-A có `picked` → thẻ #1 đúng tên chọn (Android xếp theo `picked`, test `ConsultV2RawReplayTest`). Đề nghị: lượt CHỐT chỉ được chọn trong số hàng của thẻ, và luôn gửi `picked`. | test offline Android |
| R18 | Chính sách quyền riêng tư + chặn người dùng (chuẩn bị công khai Play, `docs/release/PLAY-LISTING.md` hộp ⛔) | (a) `src/lib/i18n/legal.ts:31-32` ghi vị trí «Approximate location» nhưng app gửi toạ độ CHÍNH XÁC (`android/.../chat/data/ChatLocationSource.kt:31-41` → `userLocation` mọi lượt chat) → sửa thành vị trí chính xác, chỉ khi cho phép, chỉ để tìm quanh đây. (b) Danh sách bên thứ ba (`legal.ts:51-63`) thiếu **Google Analytics for Firebase** và **Firebase Cloud Messaging** (Android release có cả hai) — Play đối chiếu Data safety với chính sách. (c) ~~Chặn/báo cáo người dùng~~ — **Huy quyết 29/09: KHÔNG làm ở Phase 7**, Phase 8 đã có chặn/báo cáo/chế tài; app chỉ công khai trên Play sau khi gộp Phase 8. Phiên web chỉ cần làm (a) + (b). | — |
| R19 | Server, «Gợi ý cho bạn» lộ bài bị hạn chế | `/api/recommendations` (UAT 29/09 17:15, tài khoản e2e.android.pro) trả địa điểm «Bài Bị Hạn Chế (E2E)» — tên quán lấy từ bài `publication_state = RESTRICTED` của chính người dùng (seed `pro_restricted`), hiện kèm «1 đánh giá». Bài hạn chế không được thành gợi ý/đếm đánh giá (nên dùng cùng bộ lọc `publishableFilter()` như feed). Android chỉ hiển thị đúng dữ liệu server trả. | ảnh `D:/TappyAI-backups/play-listing/raw-recs.png` |
| ~~R20~~ | **ĐÓNG 29/09** — web sửa ở `e3413ca` (câu đăng nhập + thẻ trang chủ theo `SHOW_MUSIC`). Web còn quảng cáo **âm nhạc** (nhạc đã ẩn ở bản này) | (a) `src/lib/i18n/dictionaries.ts:81` `login.f2Desc` «Du lịch, ẩm thực, review, âm nhạc — tất cả được kết nối.» và `:373` (EN «…music and more…») — Android đã đổi thành «Du lịch, ẩm thực, review, mua sắm — tất cả được kết nối.» / «Travel, food, reviews, shopping and more — all connected.»; đề nghị web dùng đúng câu này cho khớp. (b) Trang chủ công khai hiện thẻ tính năng «Âm thanh & âm nhạc» (`src/components/landing/LandingFeatures.tsx:11` key `sounds`; chữ ở `src/lib/i18n/landing.ts:184-186`: «thư viện nhạc bản quyền…») — ẩn thẻ này cùng cờ ẩn nhạc. Không đổi: `onboarding.interest.entertainment.desc` «Phim ảnh, âm nhạc, sự kiện…» (nói về giải trí nói chung như concert, không phải tính năng nhạc) và trang bản quyền âm nhạc. | — |
| ~~R21~~ | **ĐÓNG 29/09** — web `6f78b78` (FK ON DELETE CASCADE + cron dọn 12 tháng, kiểm trên audit). Server, bảng nối `sub1` (phương án C, `453bd93`) — 2 chỗ hở trước khi công khai Play | (a) **Không có cron gọi** `commerce_click_attributions_sweep()` (12 tháng) — grep `src/app/api/cron` + `vercel.json` không thấy; cách làm như `audit-retention`. (b) `identity_id UUID NULL` **không có khoá ngoại / không xoá theo tài khoản** (`supabase/migrations/20260929130000_commerce_click_attributions.sql:18`) → xoá tài khoản (tự xoá hoặc theo yêu cầu) để lại các dòng nối của người đó; Data safety khai "người dùng yêu cầu xoá được" → đề nghị xoá các dòng có `identity_id` = người dùng trong luồng xoá tài khoản (`account_deletion_jobs` / quy trình hỗ trợ). (c) Migration `20260929130000` phải chạy trên Production (đã có trong danh sách PHẦN B — chỉ nhắc). Android không cần sửa. | `docs/release/PLAY-LISTING.md` mục Link affiliate |
| **R22** | **Hợp đồng dữ liệu THẺ KẾ HOẠCH v2 + manifest ảnh (Huy giao 29/09) — ĐỀ XUẤT của Android, phiên web chốt** | Thẻ kế hoạch mới theo mẫu Quy Nhơn `docs/design/share-layouts/plan-share.png`, cho CẢ 5 MẢNG (không phải du lịch = 1 buổi, mốc giờ trong ngày, cùng khung). Android ĐÃ LÀM phía hiển thị (`chat/TripPlanCard.kt`, `chat/plan/PlanCardView.kt`, `chat/plan/PlanImageManifest.kt`), test offline 9/9 (`PlanCardV2Test`). **(1) Trường MỚI trong `[TAPPY_PLAN]`, tất cả TUỲ CHỌN — thiếu thì thẻ vẫn hiện, ảnh = ảnh giữ chỗ gradient theo mảng:** `domain` (`travel`\|`food`\|`shopping`\|`entertainment`\|`spa` — thiếu thì Android suy từ `type`: trip→travel, evening→entertainment); `destination` («Quy Nhơn, Bình Định»); `duration` («3 ngày · 2 đêm» / «Tối nay · 18:00–22:00» — chữ của server, app không tự đếm); `tagline` (≤160 ký tự, không URL; thiếu thì dùng `share_text`); `hero_image` (KHOÁ ảnh nền); `budget_per_person` («2.500.000đ/người» — app KHÔNG tự chia); `days[].title` («Khám phá thành phố biển»); `days[].items[].image` (KHOÁ ảnh điểm); `highlights[]` = `{label, image}` tối đa 4. Giữ nguyên các trường cũ (`title`, `people`, `budget_total`, `days[].label`, `items[].time/name/description/address/price/maps_link/booking_link`, `cost_breakdown`, `local_tips`, `share_text`). Ví dụ đầy đủ: `android/app/src/test/resources/plan-card/quy-nhon-v2.txt` (du lịch 3 ngày) và `food-evening-v2.txt` (ăn uống 1 buổi). **(2) Ảnh = KHOÁ, không bao giờ là URL; server CHỌN và LƯU khoá lúc tạo kế hoạch** (trong JSON kế hoạch và trong snapshot `/api/plans/share` — `toPlanShareSnapshot` phải giữ các trường mới), app chỉ hiển thị khoá đã lưu, không tự chọn/random, không dùng `photo_url` cho thẻ v2. Tên khoá: nền `<mang>-<kieu>-N` 16:9, `<mang>` ∈ `du-lich`, `an-uong`, `giai-tri`, `mua-sam`, `spa` (vd `du-lich-bien-1`); điểm `diem-<loai>` 1:1 (vd `diem-hai-san`); chữ thường ASCII, gạch nối — regex Android: nền `^(du-lich\|an-uong\|giai-tri\|mua-sam\|spa)(-[a-z0-9]+)+-[0-9]+$`, điểm `^diem(-[a-z0-9]+)+$`; sai dạng = coi như không có. **(3) Manifest** `GET /api/plan-images/manifest` (công khai, cache được): `{"version":"…","images":{"du-lich-bien-1":{"status":"active","url":"https://…"},"diem-hai-san":{"status":"replaced","replacement":"diem-hai-san-2"}}}`. `active` → dùng `url` (chỉ https); `replaced` → theo `replacement` (tối đa 3 bước, vòng lặp = dừng); trạng thái khác / không có khoá → ảnh giữ chỗ. Android tải 1 lần mỗi phiên app, lỗi thì thử lại sau 10 phút; route chưa có (404) = mọi ảnh là ảnh giữ chỗ (đúng như đã chốt). **(4) Tiền:** `items[].price` chỉ khi là số tiền (hoặc «Miễn phí»); không có → app hiện đúng chữ «chưa có giá — hỏi quán». Tổng / theo người chỉ khi server viết. **(5) Hỏi phiên web:** ảnh chia sẻ #7 (`planCard.ts`) và trang `/plan/<id>` có dùng CÙNG khoá + manifest không (hiện ảnh #7 dùng ảnh Google `photo_url`)? Khi chốt, ghi 1 dòng ở §2 (tên trường cuối cùng + route manifest) → Android đổi nếu khác đề xuất. | ảnh cạnh mẫu: `D:/TappyAI-backups/android-parity-evidence/plan-card-v2-2026-09-29/sbs-*.png` |
| **R23** | **Thẻ hỏi nhanh `[TAPPY_ASK]` thiết kế mới (Huy 30/09) — ĐẶC TẢ CHUNG web + Android** | Ảnh mẫu + mascot + đặc tả đầy đủ: `docs/design/ask-card/` (`ask-card-mockup.png`, `tappy-mascot-search.png`, `README.md`). Tóm tắt: đầu thẻ mascot kính lúp + «Tìm gì cho bạn hôm nay?» / «Chọn nhanh vài thứ, Tappy sẽ tìm phần còn lại.»; mỗi câu có số 1/2/3 + dòng phụ; câu LOẠI = ô có ảnh (khoá `diem-<loai>` qua manifest R22, chưa có ảnh → ảnh giữ chỗ) và **chọn nhiều**; câu ai đi / khi nào / ngân sách = ô có icon, chọn một; ô «Hoặc nói thêm ý khác…» có nút gửi; nút «Tìm cho tôi». **Server KHÔNG đổi, dữ liệu gửi lên KHÔNG đổi dạng** (một tin chữ `A · B · C`; riêng câu LOẠI nhiều lựa chọn nối `, `). Loại câu + icon + khoá ảnh suy từ `id`/chữ theo CÙNG bảng ở README §2–§3 để web và Android giống nhau. Android đang làm; web làm phần web theo cùng README. | `docs/design/ask-card/ask-card-mockup.png` |
| **R24 (P0, BẢO MẬT — CHẶN bản APK cuối)** | **Server phải trả lại `state` của app trong callback `tappyai://auth-callback` (login CSRF, phiên bảo mật 30/09)** | Lỗi: app nhận phiên từ BẤT KỲ deep link `tappyai://auth-callback#access_token=…` — kẻ xấu gửi link chứa phiên/magic link CỦA HỌ (kể cả qua `/auth/confirm?platform=android&token_hash=…`) là app nạn nhân chuyển sang tài khoản kẻ xấu. **Android ĐÃ SỬA (cùng đợt APK cuối):** khi bấm «Tiếp tục với Zalo», app tạo `state` ngẫu nhiên 256 bit (base64url, 43 ký tự, regex `^[A-Za-z0-9_-]{43}$`), lưu mã hoá, hạn 10 phút, dùng 1 lần; mở `/api/auth/zalo?platform=android&returnTo=/&app_state=<state>`; callback chỉ được nhận khi có `state` KHỚP và còn hạn — không có/sai/hết hạn → bỏ qua, phiên hiện tại giữ nguyên, báo «Liên kết đăng nhập không hợp lệ hoặc đã hết hạn…». **⚠️ Vì vậy đăng nhập Zalo trên Android KHÔNG CHẠY cho tới khi server làm phần này.** **Việc của web:** (1) `/api/auth/zalo`: nhận `app_state` (chỉ khi `platform=android`\|`ios`, đúng regex trên, sai → bỏ), lưu cookie httpOnly/secure/SameSite=Lax cùng hạn với `zalo_login_state` (như `zalo_login_platform`); (2) mang nó tới cuối luồng: `/api/auth/zalo/callback` → magic link → `/auth/confirm?platform=android…`; (3) `/auth/confirm` khi redirect về app: thêm `state=<app_state>` vào FRAGMENT (`tappyai://auth-callback#access_token=…&refresh_token=…&expires_at=…&state=…`), xoá cookie; KHÔNG có `app_state` hợp lệ → KHÔNG redirect về app với token (về `/login?error=…`) — chặn luôn đường magic link của kẻ xấu qua `/auth/confirm?platform=android`. iOS dùng cùng cơ chế khi làm. Kiểm: bấm Zalo trên Android (UAT) → vào được; gửi `tappyai://auth-callback#access_token=<phiên khác>` không state → bị từ chối. Ghi 1 dòng ở §2 khi LIVE UAT → Android chạy e2e cuối. | Android: `features/auth/.../AuthCallbackState.kt`, test `AuthCallbackStateGuardTest` 10/10; thử tấn công trên emulator: `D:/TappyAI-backups/android-parity-evidence/auth-csrf-2026-09-30/` |

## 2. Web → Android: thay đổi server/API (giữ tương thích ngược)

- 2026-09-30 (web) **R23.1 — THẺ HỎI NHANH MỚI: web đã làm (rc/web-uat `1685c62`), 9 điểm bổ sung cho Android** —
  đọc `docs/design/ask-card/README.md` **§5** (các mục §0–§4 giữ nguyên). Tóm tắt những gì Android cần đổi so với R23:
  (1) tiêu đề / dòng phụ / gợi ý ô ý khác THEO MẢNG (bảng §5.1; giải trí + chung giữ «Tìm gì cho bạn hôm nay?»);
  (2) id LOẠI thêm `dish`, `service`; (3) khoá ảnh theo tên owner: `diem-bar-rooftop`, `diem-cafe`, `diem-quan-an`
  (gộp món việt + ăn uống), `diem-bowling`, `diem-nail`; không khớp → `diem-<chữ-không-dấu>`; (4) từ trùng khi bỏ dấu so
  CÓ dấu (rạp, trà, lẩu, nhật/hàn, phở/bún/cơm/ăn/món, chợ, đồ); (5) nút «Tìm cho tôi» LUÔN bật — không chọn gì → gửi
  `Tìm cho tôi`; sau gửi khoá thẻ; (6)–(8) icon / lưới / màu ảnh giữ chỗ theo mảng. Server + dữ liệu gửi lên KHÔNG đổi.
  Bảng chuẩn = `src/lib/structuredContent/askCardModel.ts`; ca kiểm = `askCardModel.test.ts` (dùng đúng câu hỏi router
  gửi cho 5 mảng — Android nên chép các ca này sang test Kotlin). Ảnh UAT web 5 mảng (mobile + desktop) cạnh mockup: xem
  RELEASE-PROGRESS mục «Thẻ hỏi nhanh».

- 2026-09-30 (web) **AI TƯ VẤN ỔN ĐỊNH — rc/web-uat `b01b53c`** (ngưỡng release của Huy 29/09 đạt: mỗi mảng ≥ 17/21 TB 2 lượt
  replay — ăn uống 18,5 · mua sắm 17,5 · du lịch 17,5 · giải trí 18,5 · spa 20,5; A = 0; B chỉ còn ở ngách, ghi ở trang duyệt).
  Sau `55e298e` chỉ thêm 2 sửa không đổi định dạng trả lời: ngân sách không đọc từ tên sản phẩm chép lại (`af38b73`), lượt so
  sánh không bị chèn "Mình chọn" từ thẻ (`b01b53c`). **Android chạy e2e cuối + build APK trên SHA này.**
  - **Câu trả lời thô lượt chạy thật (UAT, mục 10, 30/09)** — stream nguyên văn `0:/8:/9:/a:/d:` từng lượt (file `<ID>-t<n>.txt`):
    `gs://tappyai-uat-evidence/evidence/s10-2026-09-30/scenarios-55e298e/raw/` (15 kịch bản × 7 lượt — ask → pick → hỏi thêm →
    "A hay B" → xem thêm → bác → kế hoạch) và `…/single-fbb1c3c/raw/` (59 câu + 20 câu bộ ý định). Kế hoạch mẫu có `[TAPPY_PLAN]`:
    `TRAVEL-1-t7.txt`, `TRAVEL-2-t7.txt` (du lịch), `ENT-1-t7.txt` (giải trí), `FOOD-1-t7.txt` (ăn uống). Vé máy bay: `TRAVEL-3-t2.txt`
    (link `https://www.tappyai.com/go/at?u=…&p=traveloka…` — mở /go/at, server thêm sub1 rồi 302 sang ACCESSTRADE → Traveloka).
    Kết quả + mức lỗi: `…/results-fixed.json`; trang duyệt (Huy): https://claude.ai/artifact/T1ENadG4ZVDHEbnJaaGRFU
  - **Định dạng không đổi so với các mục trước:** `[TAPPY_ASK]`, `[TAPPY_SHOPPING]`, `[TAPPY_PLACES]`, `[TAPPY_PLAN]`, `[FOLLOWUPS]`
    (server luôn viết `Xem thêm|Lên kế hoạch chi tiết` sau lượt chọn/xem thêm/bác/so sánh), annotation `tappy.turn.v1` cuối stream.
    Nhãn link vé máy bay giờ là `Xem giá trên <hãng>` (trước: tên hãng) — Android hiển thị nguyên nhãn.
  - **R22 — thẻ kế hoạch v2, phía server (trả lời mục (5)):**
    - ĐÃ LÀM (`69cdff6`): `GET /api/plan-images/manifest` công khai, cache 1 giờ, đúng dạng đề xuất; hiện
      `{"version":"2026-09-30.0","images":{}}` = CHƯA có ảnh nào → mọi khoá là ảnh giữ chỗ (đúng như đã chốt).
      Snapshot chia sẻ `/api/plans/share` GIỮ các trường v2 khi có (`domain`, `destination`, `duration`, `tagline`, `hero_image`,
      `budget_per_person`, `highlights[]`, `days[].title`, `items[].image`), kiểm đúng regex khoá của Android, URL bị loại.
      Tên trường = đúng đề xuất Android, không đổi.
    - CHƯA LÀM (sau release): server CHƯA sinh các trường v2 trong `[TAPPY_PLAN]` (model chưa được yêu cầu viết, và chưa có thư
      viện ảnh để chọn khoá) → kế hoạch hiện tại chỉ có trường cũ; Android dùng fallback đã làm (`domain` suy từ `type`, ảnh giữ chỗ).
      Ảnh chia sẻ #7 (`planCard.ts`) và trang `/plan/<id>` VẪN dùng `photo_url` Google, chưa dùng khoá + manifest.

- 2026-09-29 (web) **R21 XONG — bảng nối sub1 (phương án C).** (1) Dọn sau 12 tháng có lịch: cron Vercel `/api/cron/click-attributions-sweep` hằng ngày 18:45 UTC, log `{"job":"click-attributions-sweep","deleted":N}`; hàm dọn giới hạn 5000 dòng/lần — đã kiểm trên DB audit (dòng cũ 13 tháng bị xoá, dòng khác giữ nguyên). (2) Xoá tài khoản xoá theo: `commerce_click_attributions.identity_id` → `auth.users(id) ON DELETE CASCADE` (khách ẩn danh cũng là user trong `auth.users` nên xoá theo id khách). Kiểm trên DB audit: tài khoản test mới → bấm 2 link (2 sub1, 2 dòng) → xoá tài khoản → **0 dòng** còn lại. Quy trình xử lý yêu cầu xoá qua email (cờ tự xoá đang tắt): `docs/uat/ACCOUNT-DELETION-REQUEST-RUNBOOK.md`. (3) Migration mới `20260929140000_commerce_click_attributions_r21` = bước **7c** trong RELEASE-PLAN §1 (PHẦN B). Không đổi API cho Android. Bằng chứng: `gs://tappyai-uat-evidence/evidence/r21-2026-09-29/`.

- 2026-09-29 (web) **sub1 ACCESSTRADE — PHƯƠNG ÁN C, LIVE UAT `453bd93` → cập nhật Data safety.** Link affiliate trong câu trả lời chat (thẻ lẫn chữ) nay là link của Tappy: `https://<site>/go/at?u=<deep link ACCESSTRADE, KHÔNG có sub1>&p=<provider>&a=<danh tính đã MÃ HOÁ>&h=…&s=<chữ ký>`. Mỗi lần bấm, server sinh `sub1` NGẪU NHIÊN mới, lưu bảng nối `commerce_click_attributions` (sub1 → tài khoản/khách, thời điểm, đối tác, link; RLS chỉ server; giữ 12 tháng) rồi 302 sang ACCESSTRADE kèm `sub1`. **Android không cần sửa code**: vẫn mở `url` của link như cũ (trình duyệt ngoài OK — không cần cookie, danh tính nằm trong link đã mã hoá); beacon handoff + GA4 `affiliate_click` giữ nguyên. Kiểm UAT: 2 lần bấm cùng link → 2 `sub1` khác nhau, bảng nối có đúng các dòng cho đúng user, redirect go.isclix.com → click.accesstrade.vn → vn.trip.com. **Data safety:** đối tác không nhận dữ liệu nhận diện → không tính "chia sẻ"; bảng nối là dữ liệu Tappy tự giữ (Hoạt động trong app), 12 tháng — xem `docs/release/PLAY-LISTING.md` mục Link affiliate. Chính sách `/privacy` (vi + en) đã sửa theo cơ chế này. Bằng chứng: `gs://tappyai-uat-evidence/evidence/453bd93/sub1/`.

- 2026-09-29 (web) **R18 (a)+(b) XONG — LIVE UAT `e3413ca`**: trang `/privacy` (vi + en, `src/lib/i18n/legal.ts`) nay ghi **vị trí CHÍNH XÁC, tuỳ chọn, chỉ khi cho phép, không thu khi chạy nền**; thêm **ngày sinh** (cổng 18+), **nội dung người dùng tạo** (review, ảnh/clip, bình luận, bio, tin nhắn), và các bên xử lý **Google Analytics (web) + Google Analytics for Firebase (Android, không thu advertising ID)**, **Firebase Cloud Messaging**, **ACCESSTRADE** (mã bí danh `sub1` — phương án A của PLAY-LISTING); Anthropic, Supabase, Google Cloud Storage đã có. Ngày hiệu lực: tháng 9/2026. Đối chiếu từng dòng Data safety ở `docs/release/PLAY-LISTING.md` §1 (dòng "Chính sách khớp"). Ảnh + text: `gs://tappyai-uat-evidence/evidence/e3413ca/r18/`. **Android:** `PrivacyPolicyScreen.kt` nên dẫn tới / dùng cùng nội dung này (việc của phiên Android). R18 (c) chặn người dùng: chưa làm — chờ Huy quyết (không thuộc sửa chính sách). Màn đăng nhập web không còn chữ "âm nhạc"; thẻ "Âm thanh & âm nhạc" trên landing đi theo `SHOW_MUSIC` (ẩn).

- 2026-09-29 (web) **R19 XONG — LIVE UAT `0399988`.** Gốc: `publishableFilter()` chỉ lọc bài `RESTRICTED`/`UNDER_REVIEW` khi `CONTENT_SAFETY_SCHEMA_MIGRATED=true`; Preview (UAT) không đặt biến này → mọi bề mặt dùng bộ lọc (gợi ý, feed, hồ sơ, đọc từng bài) đều KHÔNG lọc. Nay lọc mặc định BẬT, chỉ tắt khi biến = `false` rõ ràng. Rà thêm và gắn bộ lọc cho các nơi chưa dùng: đánh giá ở trang địa điểm `service/[id]`, điểm quán mà AI đọc (`food.ts`), bộ sưu tập đã thích/đã lưu, thống kê trang tác giả. Kiểm với e2e.android.pro: trước (UAT `0ab1ee5`) `/api/recommendations` + trang «Gợi ý cho bạn» có «Bài Bị Hạn Chế (E2E)»; sau (`0399988`) không còn ở recommendations, feed, tìm kiếm feed, hồ sơ. Bằng chứng: `gs://tappyai-uat-evidence/evidence/0ab1ee5/r19-before/`, `…/0399988/r19/`. Không đổi hợp đồng API — Android chạy lại ca gợi ý là thấy.

- 2026-09-29 (web) **R15 XONG — LIVE UAT `1507c1e`. Android chạy lại: `E2E_CASES=trip-full node android/e2e/run.mjs chat`.**
  - **Gốc:** lượt kế hoạch chuyến đi tự đi lấy dữ liệu qua tối đa 3 bước model nối tiếp (39–68 s/lượt, lượt chậm vượt 60 s của Vercel → khối bị cắt), lệnh kế hoạch chỉ nêu các tiêu đề nên model/lượt hoàn tất bỏ khối, và có lượt JSON hỏng (`{time":"10:00"`) nên thẻ không dựng được.
  - **Sửa:** khách sạn + quán ăn + thời tiết lấy SONG SONG trước một bước model duy nhất; lệnh kế hoạch đặt khối `[TAPPY_PLAN]` ĐẦU TIÊN; lượt hoàn tất điền sẵn `[TAPPY_PLAN]`; JSON gọn (≤ 4 mục/ngày); JSON gần-đúng được sửa (thiếu ngoặc kép ở khoá, khoá không ngoặc, dấu phẩy thừa) trước khi guard giá chạy (`planJsonRepair.ts`).
  - **Kiểm 5 lần liên tiếp trên UAT `1507c1e`** (khách Android: `x-tappy-surface: android`, `x-tappy-caps: ask`, mỗi lần một `chatSessionId` mới; tin nhắn đúng như ca trip-full rồi «Lên kế hoạch chi tiết»): **5/5 có `[TAPPY_PLAN]` hợp lệ, 3 ngày**, 38–40 s/lượt, lượt 1 = pick, lượt 2 = plan, 0 lời kể bước. Bằng chứng: `gs://tappyai-uat-evidence/evidence/1507c1e/r15/` (r15-uat.json + 10 raw stream).
  - Không đổi hợp đồng API; Android không cần sửa code.

- 2026-09-29 (web) **Layout chia sẻ — sửa theo duyệt của Huy (lượt 2)**:
  - **QR hồ sơ**: dùng bản CÓ huy hiệu Google Play (cột trái «Tải TappyAI ngay» + huy hiệu; cột phải «Hoặc truy cập website» + pill). Link Play = `https://play.google.com/store/apps/details?id=com.tappyai.app` (applicationId release). Kiểm 29/09 11:15: trang công khai trả 404 (VN/US) → CHƯA công khai. Web: hiện huy hiệu ở UAT; production chỉ hiện khi đặt `NEXT_PUBLIC_PLAY_LISTING_LIVE=1` sau khi trang Play mở được. Android: dùng CÙNG điều kiện (không vẽ huy hiệu/không mở link khi trang chưa công khai). App Store: CHƯA gắn.
  - **Thẻ gợi ý**: tối đa **2 quán** (trước 4), phần còn lại ghi «+N quán khác».
  - **Ảnh kế hoạch**: ảnh của kế hoạch làm NỀN (poster từ mép trên, như thẻ OG), + «Điểm nổi bật» khi có ≥2 ảnh.
  - **Thẻ kế hoạch trong chat (SL1)**: mở sheet mẫu 6; trạng thái link kế hoạch (đang tạo / cần đăng nhập / lỗi + Thử lại) nằm TRONG sheet mẫu 6; ô chỉ-link chờ có link; ảnh kế hoạch chờ link để in đúng URL.
  - **QR thẻ gợi ý (SL3)**: mở trang chủ (tạm).
- 2026-09-29 (web) **ẢNH CHIA SẺ — mẫu Huy chọn 29/09, web XONG, LIVE UAT `30c0724`** (Android làm theo; web KHÔNG sửa `android/`).
  Mẫu gốc + quy tắc phong cách: `docs/design/share-layouts/` (`profile-qr.png` = #1, `share-sheet.png` = #6, `plan-share.png` = #7,
  `README.md` = bảng màu/chữ/bo góc/khoảng cách). Code tham chiếu: `src/lib/share/cardStyle.ts` (token), `contentCards.ts`,
  `planCard.ts`, `shareCardFile.ts`, `src/components/share/ShareMenu.tsx`. Bằng chứng (RIÊNG TƯ):
  `gs://tappyai-uat-evidence/evidence/30c0724/share-layouts/` (`<thẻ>-card.jpg`, `<thẻ>-download.png` = file gốc,
  `<thẻ>-sheet*.png`, `results-*.json`: file tải về trùng từng pixel với ảnh xem trước).
  - **KHÔNG có API ảnh mới.** Ảnh được VẼ TẠI MÁY (web: canvas 2D; Android: `Bitmap`/`Canvas` trong `ShareImageRenderer.kt`)
    từ dữ liệu app đã có: bài Explore (`GET /api/reviews/feed`, `GET /api/reviews/{id}`), thẻ gợi ý (dữ liệu `tappy.places.v1`
    đã whitelist như `ShareArtifact`), kế hoạch (snapshot `[TAPPY_PLAN]` / `POST /api/plans/share` như cũ), QR hồ sơ như cũ.
    Ảnh OG của `/plan/<id>` (`/plan/<id>/opengraph-image`, 1200×630) KHÔNG thay ảnh kế hoạch này.
  - **Thẻ sáng (mẫu #1)** — review, clip, gợi ý: **1080×1920 PNG**. Từ trên xuống: otter tròn 116 px căn giữa (y=56) + wordmark
    "Tappy" `#0B1B3F` / "AI" `#3391FF` 54 px/800 + tagline "One Agent. One Conversation. Everyday Life." 26 px `#4F5B76`;
    panel trắng x 60–1020, y 330–1330, bo 40, viền 2 px `#D8E4FA`; hàng mã y 1360–1620 (panel trắng bo 32): trái = "Quét mã để
    xem trên TappyAI" 32 px/800 + pill website (nền `#EAF3FF`, viền `#B9D2FB`, chữ `#1E6BFF` 32 px/700, host của link), PHẢI = QR
    212 px của CHÍNH link chia sẻ, quiet zone 4 module, 4 góc ngoặc `#1E6BFF` 7 px nằm ngoài quiet zone; banner y 1690, cao 170,
    bo 40, gradient `#1453D9`→`#2F8CFF`, slogan "Kết nối · Khám phá · Chia sẻ" nghiêng 40 px/800 trắng + dòng phụ 24 px `#E3EEFF`,
    otter hoodie cao 300 px đứng ở đầu trái banner. Nền dọc `#FFFFFF`→`#F2F7FF`→`#EAF3FF`. Sao `#FFB020`/tắt `#D5DEEE`.
    - **Review** (`content_type` ≠ video): ảnh đầu tiên (bo 28, cao 480, cover) — không có ảnh thì khối xanh nhạt có dấu “;
      badge "★ REVIEW"; tên địa điểm 46 px/800 (2 dòng); 5 sao + "N/5" (CHỈ khi có địa điểm thật và rating 1–5); ghim + địa chỉ;
      trích caption trong ngoặc kép (≤ 220 ký tự, tối đa 5 dòng); "Đăng bởi {tên}" + vòng chữ cái đầu ở đáy panel.
    - **Clip** (`content_type` = video): thumbnail cao 560 + nút play tròn trắng giữa; badge "▶ CLIP"; KHÔNG sao; còn lại như review.
      Bài có tên địa điểm là "Chia sẻ" (sentinel) → không địa điểm/địa chỉ/sao; tiêu đề = dòng caption đầu (như `reviewShareTitle`).
    - **Gợi ý**: badge "TAPPY GỢI Ý"; tiêu đề = subject (2 dòng); tối đa 4 quán × 176 px: ảnh 144 bo 24 (không ảnh → ô số thứ tự),
      "i. Tên" 32 px/800, ★ rating (số đánh giá) · loại · giá, ghim + địa chỉ; "+N địa điểm khác". KHÔNG khoảng cách (quyền riêng tư).
      QR = link thương hiệu (gợi ý không có trang riêng).
  - **Ảnh kế hoạch (mẫu #7)**: 1080 × cao theo nội dung (≈2000–2900), nền `#070A12`→`#0B1220`→`#14133A`; thanh logo; hero 640 px =
    ảnh địa điểm thật đầu tiên phủ tối dần (không có → gradient, KHÔNG ảnh thay thế); "TAPPY PLAN" `#8FB8FF`, tiêu đề 76 px/800,
    "N ngày · N điểm dừng · N người", tóm tắt; "Hành trình": tối đa 3 ngày × 4 chặng, vòng số "01" gradient `#3B82F6`→`#8B5CF6`,
    giờ / ảnh 150×100 (nếu có) / tên / mô tả 1 dòng / ghim tím `#A78BFA` + địa chỉ, dư ghi "+N"; hộp "Tổng quan chuyến đi"
    (Thời gian / Số người / Ngân sách ước tính — chỉ trường có); pill CTA gradient "XEM KẾ HOẠCH ĐẦY ĐỦ TRÊN TAPPY →"; link kế hoạch;
    "Được tạo bởi TappyAI". Kế hoạch ĐÃ có link thì nay CÓ "Lưu về máy" (ảnh này), không còn ẩn.
  - **QR hồ sơ**: giữ nguyên thẻ đã duyệt UAT3 (1200 × ≈2062).
  - **Màn chia sẻ (mẫu #6)** cho hồ sơ, bài Explore, gợi ý chat, trang kế hoạch: như sheet hồ sơ hiện có + mục mới **"Ảnh chia sẻ"**
    ngay dưới thẻ link: nút chọn mẫu (chỉ hiện khi ≥ 2 mẫu) + ảnh xem trước cao 280 dp + dòng "Đúng ảnh này được lưu về máy và gửi
    lên TikTok.". Mẫu theo thứ tự (mẫu đầu = mặc định): hồ sơ [QR hồ sơ]; bài Explore [Thẻ review | Thẻ clip, Mã QR]; gợi ý [Thẻ gợi ý];
    kế hoạch [Ảnh kế hoạch]. Gợi ý chat: nút sao chép ghi "Sao chép nội dung" (chép văn bản gợi ý).
  - **QUY TẮC MỘT FILE**: render MỘT lần cho mỗi (mẫu, link), giữ file đó; ảnh xem trước, "Lưu về máy" và TikTok dùng CÙNG file
    (tên `tappyai-<review|clip|suggestion|plan|post|profile>-YYYY-MM-DD.png`). Đổi mẫu → đổi cả xem trước lẫn file. Ngoại lệ 28/09
    giữ nguyên: clip TẢI LÊN gửi TikTok bằng chính video; không lấy được video → ảnh mẫu đang chọn. Render lỗi → báo "Chưa tạo được
    ảnh — vẫn chia sẻ link được." và "Lưu về máy" rơi về tệp văn bản như cũ.

- 2026-09-29 (web) **R7/R9–R14 ĐÃ LIVE TRÊN UAT** — kiểm thật trên uat.tappyai.com (khách, mobile 390 px), bằng chứng RIÊNG TƯ:
  - UAT `9644d8e` → `gs://tappyai-uat-evidence/evidence/9644d8e/android-requests/` (R13, R12, R11: ảnh `.jpg` + chữ `.txt` +
    luồng thô `/api/chat` `.raw.txt` để Android test offline). R13: kế hoạch Đà Nẵng, 0 địa điểm ngoài VN/ngoài Đà Nẵng;
    R7: khối `[TAPPY_PLAN]` parse được (3.797 và 5.496 ký tự); R9/R12: 0 lời kể bước, 0 câu hỏi lần 2; R11: «Mình chọn:
    Tinh Hà "Say Hi" Concert» + 2 concert khác, nút Ticketbox.
  - UAT `0377288` → `gs://tappyai-uat-evidence/evidence/0377288/android-requests/` (`api-evidence.jpg` + `.raw.txt`):
    R10 — Android + `x-tappy-caps: ask` → có `[TAPPY_ASK]`; không caps → dòng đọc được. R14 — khách A gửi CHỈ «xem thêm» +
    `chatSessionId` (không lịch sử) → lượt «more», chọn quán MỚI ở Bình Thạnh cho 6 người; khách B gửi CÙNG mã → không thấy gì
    của A (hỏi lại từ đầu).
- 2026-09-29 (web) **KẾT QUẢ R7/R9–R14** (server sửa xong, tái hiện offline bằng bộ replay `androidR` với
  `x-tappy-surface: android`):
  - **R13 (P0) — SỬA TẬN GỐC.** Nguyên nhân: câu «Lên kế hoạch chi tiết» bị bộ phạm vi chủ đề coi là CUỘC TƯ VẤN MỚI →
    cắt cả cuộc trò chuyện còn đúng 1 dòng → khối kế hoạch ghi «user chưa nêu» thành phố/ngày/điểm đi; bản UAT cũ rơi vào
    khung «Tối nay» không có thành phố → tìm toàn cầu (Omaha/Seattle). Nay: lượt tiếp nối (kế hoạch/hỏi thêm/so sánh/xem
    thêm/chê/trả lời thẻ hỏi) giữ nguyên cả cuộc tư vấn; + guard CODE `placeGeoGuard.ts` loại mọi địa điểm ngoài Việt Nam
    và ngoài tỉnh/thành đang hỏi (không đọc tên đường: «Nguyễn Thái Bình, Quận 1, TP.HCM» là TP.HCM). Serper vốn đã
    `gl=vn, hl=vi`. Replay: kế hoạch Đà Nẵng ở lại Đà Nẵng (M Hotel Võ Nguyên Giáp, Mộc quán…), 0 địa điểm nước ngoài.
  - **R7** — thân `[TAPPY_PLAN]` được che qua cả tầng guard V1 (bước dọn dòng xoá dòng JSON có «)» dư → khối rỗng/cụt).
    Replay: 4/4 kế hoạch du lịch có JSON đủ (~4.3k ký tự).
  - **R9** — lời kể các bước («Đang tìm…», «Mình gọi tool…», «Bây giờ mình sẽ lập…», «Tuyệt vời! Mình đã tìm được…») bị
    CODE gỡ ở mọi lượt tư vấn (`stepNarration.ts`).
  - **R10** — server gửi `[TAPPY_ASK]` cho request có `x-tappy-caps` chứa `ask` (không đổi `ASK_BLOCK_SURFACES`). Bản
    Android cũ (không gửi caps) vẫn nhận dòng đọc được.
  - **R11** — tư vấn concert/show/lễ hội: thẻ hỏi là «Ca sĩ / thể loại? · Mấy người đi? · Giá vé mỗi người?» (không còn
    «chiều nay/tối nay»); lượt chọn tìm SỰ KIỆN (web_search → Ticketbox `event_links`), câu chọn «**Mình chọn: <sự kiện>** —
    [link Ticketbox]». Replay: «Tinh Hà "Say Hi" Concert» + 2 concert khác, đều link ticketbox.vn.
  - **R12** — sau thẻ hỏi: không còn hỏi «máy bay hay xe khách» / «ngày bay» ở lượt chọn; «Lên kế hoạch chi tiết» lập kế
    hoạch ngay (giả định ghi ở dòng «Mình giả định…»).
  - **R14 / Q7** — server XONG: `chatSessionId` đọc từ body; trạng thái (mảng, thông tin đã biết, lựa chọn đã chốt, các chỗ đã
    giới thiệu, dòng bằng chứng tìm kiếm) lưu 30 ngày theo băm(chủ sở hữu, mã). Request KHÔNG có `decisionEvidenceId` được
    trả lại bằng chứng từ trạng thái → «xem thêm»/hỏi tiếp trên app ngang web. Mã của người khác → phiên mới (có test).
    Web đã chuyển sang gửi `chatSessionId`. Guard cho phép `chatSessionId` trong `ChatRequest.kt`.
- 2026-09-29 (web) **R14 — HỢP ĐỒNG CHỐT `chatSessionId`** (Huy duyệt R14/Q7). Android làm song song được ngay:
  - Body `POST /api/chat` thêm trường cấp cao nhất `chatSessionId`: chuỗi UUID dạng `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (36 ký tự, hex thường, client sinh UUID v4 bằng `UUID.randomUUID()`). Sinh 1 lần khi mở cuộc chat MỚI; gửi y nguyên ở MỌI lượt của cuộc chat đó — cả lượt 1, cả khách (tài khoản ẩn danh). Mở lại chat từ lịch sử → dùng lại mã đã lưu cùng cuộc chat; cuộc chat cũ chưa có mã → sinh mã mới lúc mở lại (server dựng lại trạng thái từ lịch sử tin nhắn).
  - Không header mới, không đọc header trạng thái nào; KHÔNG gửi `decisionEvidenceId` / `X-Decision-Evidence-Id` (bỏ `d48a11e`).
  - Server lưu trạng thái tư vấn (mảng, thành phố, thông tin đã biết, lựa chọn đã chốt, các chỗ đã giới thiệu/bị chê, lần tìm gần nhất) theo khoá = băm(chủ sở hữu + `chatSessionId`), chủ sở hữu = user id (kể cả user ẩn danh). Mã của người khác → khoá khác → coi như phiên mới, không đọc được gì. Không có user nào (chưa đăng nhập, không ẩn danh) → không lưu, chạy như hiện nay. Giữ 30 ngày.
  - Mã sai định dạng → bỏ qua (không lỗi). Thiếu mã → như hiện nay (tương thích bản Android cũ).
  - Guard web `consultativeArchitecture.test.ts` sẽ CHO PHÉP `chatSessionId` trong `ChatRequest.kt`, vẫn cấm `decisionEvidenceId` và header trạng thái. Web cũng chuyển sang gửi `chatSessionId` (cùng cơ chế). Server + web + guard XONG (xem mục KẾT QUẢ ngay trên).
- 2026-09-29 (web) **R8 XONG**: `videoDuration.test.ts` + `videoSize.test.ts` không còn cấm video Android. Nay kiểm ĐỒNG BỘ: (1) chỉ `reviews/ui/ReviewComposer{ViewModel,Screen}.kt`, `reviews/ui/ReviewsScreens.kt` (picker) và `reviews/data/VideoUploader.kt` được chọn/tải video; (2) khi có đường video: `ReviewComposerViewModel.kt` có `MAX_VIDEO_SIZE_MB = 150` (nhân 1024×1024, so `length() > …`) và `MAX_VIDEO_DURATION_ACCEPT_SEC = 305` (so `durationSec > …`); (3) `VideoUploader.kt` gọi `/api/upload/video` với `media.create-upload-session` + `media.complete-upload`; (4) `ClipMetadata.kt` tồn tại (F-099); (5) strings EN/VI nói 150MB, không còn "50MB". Đã chạy với 6fe2150 cherry-pick: 92/92 xanh; không có 6fe2150: 92/92 xanh. **Android push 6fe2150 được.** Lệnh: `npx vitest run src/lib/config/videoDuration.test.ts src/lib/config/videoSize.test.ts`.
- 2026-09-28 (web): kế hoạch "tối nay" không nêu hoạt động riêng do SERVER dựng trên khung cố định
  (ăn tối 18:30 → chơi 20:00 → uống 21:30, `src/lib/ai/eveningPlan.ts`). Định dạng `[TAPPY_PLAN]` KHÔNG đổi
  (type "evening", days[0].items có time/emoji/category/name/description/price/address/maps_link/place_id/
  photo_url/booking_link) — Android không cần sửa. Luồng trả về có thêm nhiều cặp `9:`/`a:` search_places ở đầu
  (1 cặp cho mỗi chặng) — Android đã bỏ qua frame `9:`/`a:` như trước.
- 2026-09-28 (web): `GET /api/recommendations` — each recommendation gains OPTIONAL `address`, `photoUrl`, `averageRating`,
  `reviewCount`, `latestReviewAt` (from the place's community reviews). Additive only.
- 2026-09-28 (web): UAT media now goes to `gs://tappyai-media-uat` via a UAT-only SA (docs/uat/UAT-MEDIA-INFRA.md). Upload
  API unchanged. Resumable sessions are opened with the request `Origin` when it is the same host — native apps send no
  Origin and are unaffected.

- 2026-09-28 (web): kế hoạch DU LỊCH không còn tự giả định ngày đi / điểm xuất phát / phương tiện khi user chưa nói
  (`src/lib/ai/planTripFactsGuard.ts`): nhãn ngày không kèm ngày tháng, không có bước bay/xe liên tỉnh, câu hỏi cuối
  hỏi đúng các ý còn thiếu. Định dạng `[TAPPY_PLAN]` KHÔNG đổi — Android không cần sửa. Server cũng sửa chữ "ngan sách"
  → "ngân sách" trong câu trả lời.

- 2026-09-28 (web, owner decisions — Android should match): Đã lưu **ẩn chip Deals và Bộ sưu tập** (không hiện "Sắp có"),
  dù mockup R1 có — chỉ còn Tất cả / Địa điểm / Bài viết / Video. Onboarding: bộ đếm theo số bước thật (web: "Bước 1/2", "Bước 2/2").
  Tab hồ sơ giữ tên "Đã chia sẻ" (lịch sử link chia sẻ); tab repost của Phase 8 sẽ tên "Đăng lại" khi gộp.
- 2026-09-28 (web): `/delete-account` hiện nội dung theo cờ ACCOUNT_SELF_DELETE_ENABLED (tắt → gửi yêu cầu qua email, như app
  khi cờ tắt). Android không cần sửa.
- 2026-09-28 (web): Phase 8 overlap §5 (tappyai-phase8 `docs/uat/PHASE8-OVERLAP-2026-09-29.md`): 11 mục KHÔNG làm trong Phase 7
  (Android cũng vậy: không sửa 2 nút Google/Zalo ngoài màu, không tự viết image fallback, không thêm tile "gửi qua tin nhắn"…).

- 2026-09-28 (web): **Khung đầu ra 6 mảng (FOOD / SHOPPING / TRAVEL / ENTERTAINMENT / SPA-WELLNESS / MAIN CHAT) + định dạng dữ liệu**
  (frame `0:`/`8:`, marker `[TAPPY_PLAN]`/`[TAPPY_SHOPPING]`/`[CTA_BUTTONS]`/`[FOLLOWUPS]` = gợi ý trả lời nhanh, annotation
  `tappy.places.v1`/`tappy.progress.v1`, nút CCP `labelKey`, hàng tìm kiếm `urlKind:'search'`): `docs/consultative/OUTPUT-CONTRACT-6-DOMAINS.md`.
  Đây là hành vi HIỆN TẠI của rc (thiết kế 26/9 chưa tìm thấy). Câu hỏi đóng của server có thể đứng SAU khối CTA/FOLLOWUPS —
  Android phải hiển thị text sau khối. Câu trả lời thô để test offline: `gs://tappyai-uat-evidence/evidence/<SHA>/golden-raw/` (xem §5 của file).

- 2026-09-28 22:00 (web → Android, **test đỏ trên rc**): `src/lib/i18n/androidHardcodedUiStrings.test.ts` ("no contentDescription is a string literal") báo `android/app/src/main/java/com/tappyai/app/age/AgeCheck.kt:222` (`contentDescription = "TappyAI"`, commit 06b5284). Nhờ phiên Android đổi sang `stringResource(...)` (hoặc chuỗi có sẵn như các màn khác). Web KHÔNG sửa android/.

- 2026-09-29 (web): **Khung đầu ra 6 mảng đã duyệt được cài** (83853cc, `domainFrames.ts`) — đổi NỘI DUNG câu chữ, KHÔNG đổi
  định dạng stream/marker. Mới: dòng `💰 Ngân sách: … ÷ … người = …` (văn bản thường) ngay sau `[/TAPPY_PLAN]` khi user nêu ngân sách —
  Android hiển thị như một dòng chữ sau khối kế hoạch. Chi tiết: `docs/consultative/OUTPUT-CONTRACT-6-DOMAINS.md` §0.
  Câu trả lời thô mới để test offline: `gs://tappyai-uat-evidence/evidence/83853cc/golden-raw/`.

- 2026-09-29 (web, **AI tư vấn bản cuối — định dạng để Android làm theo**; server đổi xong, backward-compatible):
  **Lượt HỎI** (khi thiếu thông tin; do code tạo, 0 LLM, 0 tìm kiếm): server gửi
  - cho `x-tappy-surface: web`: câu dẫn + `[TAPPY_ASK]{"v":1,"questions":[{"id":"party","q":"Đi mấy người?","options":["1 người","2 người","3-5 người","Nhóm đông"]},…]}[/TAPPY_ASK]` + câu đuôi
    "Bạn chọn nhanh bên dưới hoặc gõ tự do nhé — trả lời một phần cũng được." (2–3 câu hỏi, mỗi câu 2–4 nút);
  - cho Android/iOS HIỆN TẠI (chưa có parser): câu dẫn + mỗi câu hỏi 1 dòng `• Câu? (A / B / C)` + câu đuôi + `[FOLLOWUPS]` = nút của câu 1.
  👉 Yêu cầu Android: thêm parser `[TAPPY_ASK]` (strip khỏi text) + render mỗi câu 1 nhóm chip (chọn 1/nhóm, bấm lại để bỏ) + ô gõ tự do
  + nút "Gửi" gửi `"<chọn 1> · <chọn 2> · <tự gõ>"` như tin nhắn user; khi xong, gửi header `x-tappy-surface: android` VÀ báo web để bật
  `ASK_BLOCK_SURFACES` cho android (src/lib/ai/decisionSurface.ts) — **ĐÃ THAY bằng R10**: gửi `x-tappy-caps: ask`, không bật theo surface. Tham chiếu web: src/components/chat/AskCard.tsx, src/lib/structuredContent/parseAsk.ts.
  **Lượt CHỐT**: text = 1 câu xác nhận + `**Mình chọn: <tên>** — lý do` + (lưu ý nếu có căn cứ) + tối đa 2 dòng `- **<tên>**: hơn/kém…`
  + dòng do server đếm `Mình còn N lựa chọn nữa, muốn xem thêm không?` + `[FOLLOWUPS]Xem thêm|Lên kế hoạch chi tiết[/FOLLOWUPS]` (server gắn,
  thay mọi FOLLOWUPS của model). Card `tappy.places.v1`/`[TAPPY_SHOPPING]` như cũ; card #1 = tên "Mình chọn".
  **Kế hoạch chi tiết** (khi user bấm "Lên kế hoạch chi tiết"): văn bản có tiêu đề in đậm cố định theo mảng —
  ĂN UỐNG: Giờ đến & đặt bàn · Gọi món · Chi phí · Đi lại & gửi xe · Mẹo địa phương · Phương án dự phòng;
  MUA SẮM: Mua ở đâu · Kiểm tra trước khi trả tiền · So giá & thời điểm mua · Bảo hành & đổi trả · Cạm bẫy thường gặp · Tổng chi phí;
  DU LỊCH: `[TAPPY_PLAN]` như cũ + Tóm tắt chuyến · Ăn ở đâu, gọi món gì · Mẹo & cạm bẫy · Khi trời mưa · Ngân sách · Việc cần làm trước khi đi
  (+ dòng `💰 Ngân sách: … ÷ … người = …` do server viết);
  GIẢI TRÍ: Lịch buổi · Đặt chỗ / vé · Di chuyển giữa các chặng · Mẹo từng chỗ · Chi phí;
  SPA/LÀM ĐẸP: Gói / dịch vụ nên chọn · Đặt lịch · Chuẩn bị trước khi đến · Thời lượng · Chi phí · Lưu ý.
  Android chỉ cần render markdown in đậm như thường. Mỗi lượt có thêm annotation `8:` `{kind:"tappy.turn.v1", domain, turnType, usd…}` — BỎ QUA.
  Câu trả lời thô lượt chạy cuối (để test offline): sẽ ở `gs://tappyai-uat-evidence/evidence/<SHA>/consult-raw/`.

## 3. Quy tắc bằng chứng mới (chủ dự án, 2026-09-28) — áp dụng cho CẢ phiên Android

- KHÔNG commit ảnh/video vào git nữa (không sửa lịch sử commit cũ).
- Upload ảnh chụp lên `gs://tappyai-uat-evidence/evidence/<SHA>/` (SHA = commit được chụp; web dùng SHA UAT từ
  `/api/version`, Android dùng SHA đã build APK). Ví dụ: `gcloud storage cp *.png gs://tappyai-uat-evidence/evidence/<SHA>/android/`.
- 2026-09-29 (Huy): bằng chứng KHÔNG được đọc công khai. Bucket bằng chứng là `gs://tappyai-uat-evidence` (RIÊNG TƯ:
  public access prevention = enforced, không có `allUsers`; đọc bằng `gcloud` đã đăng nhập). KHÔNG upload bằng chứng vào
  `gs://tappyai-media-uat` nữa — bucket media đó đọc công khai (ảnh app cần). 913 tệp cũ đã chép sang bucket riêng; Huy đã XOÁ `gs://tappyai-media-uat/evidence/` (913/913, kiểm lại: trống, URL cũ 404).
  Trang duyệt cho Huy dùng ảnh nhúng trong artifact hoặc signed URL có hạn.
- Vẫn chỉ chụp tài khoản test, không dữ liệu thật/cá nhân.
- Repo chỉ giữ RELEASE-PROGRESS.md (web) / tài liệu Android với đường dẫn `gs://…` hoặc
  `gs://tappyai-uat-evidence/evidence/<SHA>/…`.
