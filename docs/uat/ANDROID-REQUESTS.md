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
| R3 | `/recommendations` | Mockup Sep 22 01_41 có: hero "Khám phá những địa điểm nổi bật gần bạn" với 3 điểm nhấn, thẻ địa điểm có "Hỏi Tappy về chỗ này", đoạn cuối trang. Web với khách chuyển sang /age-check (đúng); trang khi đã đăng nhập chưa chụp. | 09 |
| R4 | Chia sẻ | Không có chọn layout ảnh chia sẻ (web lẫn Android). Ảnh tải về là một layout cố định (`renderCardImage.ts`), nên chưa kiểm được "file tải về đúng layout đã chọn". Cần thiết kế. | — |

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

## 3. Quy tắc bằng chứng mới (chủ dự án, 2026-09-28) — áp dụng cho CẢ phiên Android

- KHÔNG commit ảnh/video vào git nữa (không sửa lịch sử commit cũ).
- Upload ảnh chụp lên `gs://tappyai-media-uat/evidence/<SHA>/` (SHA = commit được chụp; web dùng SHA UAT từ
  `/api/version`, Android dùng SHA đã build APK). Ví dụ: `gcloud storage cp *.png gs://tappyai-media-uat/evidence/<SHA>/android/`.
- ⚠️ Bucket UAT đọc công khai theo URL — không chụp dữ liệu thật/cá nhân, chỉ tài khoản test.
- Repo chỉ giữ RELEASE-PROGRESS.md (web) / tài liệu Android với đường dẫn `gs://…` hoặc
  `https://storage.googleapis.com/tappyai-media-uat/evidence/<SHA>/…`.
