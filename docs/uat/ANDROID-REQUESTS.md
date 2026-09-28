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

## 2. Web → Android: thay đổi server/API (giữ tương thích ngược)

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
  Android phải hiển thị text sau khối. Câu trả lời thô để test offline: `gs://tappyai-media-uat/evidence/<SHA>/golden-raw/` (xem §5 của file).

- 2026-09-28 22:00 (web → Android, **test đỏ trên rc**): `src/lib/i18n/androidHardcodedUiStrings.test.ts` ("no contentDescription is a string literal") báo `android/app/src/main/java/com/tappyai/app/age/AgeCheck.kt:222` (`contentDescription = "TappyAI"`, commit 06b5284). Nhờ phiên Android đổi sang `stringResource(...)` (hoặc chuỗi có sẵn như các màn khác). Web KHÔNG sửa android/.

- 2026-09-29 (web): **Khung đầu ra 6 mảng đã duyệt được cài** (83853cc, `domainFrames.ts`) — đổi NỘI DUNG câu chữ, KHÔNG đổi
  định dạng stream/marker. Mới: dòng `💰 Ngân sách: … ÷ … người = …` (văn bản thường) ngay sau `[/TAPPY_PLAN]` khi user nêu ngân sách —
  Android hiển thị như một dòng chữ sau khối kế hoạch. Chi tiết: `docs/consultative/OUTPUT-CONTRACT-6-DOMAINS.md` §0.
  Câu trả lời thô mới để test offline: `gs://tappyai-media-uat/evidence/83853cc/golden-raw/`.

- 2026-09-29 (web, **AI tư vấn bản cuối — định dạng để Android làm theo**; server đổi xong, backward-compatible):
  **Lượt HỎI** (khi thiếu thông tin; do code tạo, 0 LLM, 0 tìm kiếm): server gửi
  - cho `x-tappy-surface: web`: câu dẫn + `[TAPPY_ASK]{"v":1,"questions":[{"id":"party","q":"Đi mấy người?","options":["1 người","2 người","3-5 người","Nhóm đông"]},…]}[/TAPPY_ASK]` + câu đuôi
    "Bạn chọn nhanh bên dưới hoặc gõ tự do nhé — trả lời một phần cũng được." (2–3 câu hỏi, mỗi câu 2–4 nút);
  - cho Android/iOS HIỆN TẠI (chưa có parser): câu dẫn + mỗi câu hỏi 1 dòng `• Câu? (A / B / C)` + câu đuôi + `[FOLLOWUPS]` = nút của câu 1.
  👉 Yêu cầu Android: thêm parser `[TAPPY_ASK]` (strip khỏi text) + render mỗi câu 1 nhóm chip (chọn 1/nhóm, bấm lại để bỏ) + ô gõ tự do
  + nút "Gửi" gửi `"<chọn 1> · <chọn 2> · <tự gõ>"` như tin nhắn user; khi xong, gửi header `x-tappy-surface: android` VÀ báo web để bật
  `ASK_BLOCK_SURFACES` cho android (src/lib/ai/decisionSurface.ts). Tham chiếu web: src/components/chat/AskCard.tsx, src/lib/structuredContent/parseAsk.ts.
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
  Câu trả lời thô lượt chạy cuối (để test offline): sẽ ở `gs://tappyai-media-uat/evidence/<SHA>/consult-raw/`.

## 3. Quy tắc bằng chứng mới (chủ dự án, 2026-09-28) — áp dụng cho CẢ phiên Android

- KHÔNG commit ảnh/video vào git nữa (không sửa lịch sử commit cũ).
- Upload ảnh chụp lên `gs://tappyai-media-uat/evidence/<SHA>/` (SHA = commit được chụp; web dùng SHA UAT từ
  `/api/version`, Android dùng SHA đã build APK). Ví dụ: `gcloud storage cp *.png gs://tappyai-media-uat/evidence/<SHA>/android/`.
- ⚠️ Bucket UAT đọc công khai theo URL — không chụp dữ liệu thật/cá nhân, chỉ tài khoản test.
- Repo chỉ giữ RELEASE-PROGRESS.md (web) / tài liệu Android với đường dẫn `gs://…` hoặc
  `https://storage.googleapis.com/tappyai-media-uat/evidence/<SHA>/…`.
