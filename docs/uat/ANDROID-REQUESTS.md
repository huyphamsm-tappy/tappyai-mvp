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

(đang lập trong bước 1 — xem ANDROID-PARITY-MAP.md)

## 2. Web → Android: thay đổi server/API (giữ tương thích ngược)

- 2026-09-28 (web): kế hoạch "tối nay" không nêu hoạt động riêng do SERVER dựng trên khung cố định
  (ăn tối 18:30 → chơi 20:00 → uống 21:30, `src/lib/ai/eveningPlan.ts`). Định dạng `[TAPPY_PLAN]` KHÔNG đổi
  (type "evening", days[0].items có time/emoji/category/name/description/price/address/maps_link/place_id/
  photo_url/booking_link) — Android không cần sửa. Luồng trả về có thêm nhiều cặp `9:`/`a:` search_places ở đầu
  (1 cặp cho mỗi chặng) — Android đã bỏ qua frame `9:`/`a:` như trước.
