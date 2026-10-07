# Mẫu chia sẻ TappyAI — bản chủ dự án chọn (29/09/2026)

Huy chọn qua trang picker ngày **29/09/2026**. Ba file dưới đây là bản gốc (chép nguyên, không sửa) từ
`C:/Users/Admin/Downloads`. Mục **"Khác" = không chọn**; không có ghi chú thêm.

| File | Dùng cho | Tên gốc | Ngày tạo |
|---|---|---|---|
| `profile-qr.png` (mẫu #1, 1024×1536) | **Mọi thẻ ảnh sáng**: QR hồ sơ, thẻ review, thẻ clip Explore, thẻ gợi ý (chat) | `ChatGPT Image Sep 22, 2026, 01_17_38 PM.png` | 22/09/2026 |
| `share-sheet.png` (mẫu #6, 1085×1449) | **Màn chia sẻ** "Chia sẻ với mọi người" (mọi nơi có ảnh thẻ) | `ChatGPT Image Sep 22, 2026, 01_14_10 PM.png` | 22/09/2026 |
| `plan-share.png` (mẫu #7, 1024×1536) | **Ảnh kế hoạch** + trang `/plan/<id>` ("TAPPY PLAN") | `ChatGPT Image Sep 13, 2026, 04_04_45 PM.png` | 13/09/2026 |

Code: token màu/kích thước ở `src/lib/share/cardStyle.ts` (MỘT nguồn); thẻ review/clip/gợi ý ở
`src/lib/share/contentCards.ts`, ảnh kế hoạch ở `src/lib/share/planCard.ts`, QR hồ sơ ở
`src/lib/qr/brandedCard.ts`; bộ chọn mẫu + "một file" ở `src/lib/share/shareCardFile.ts` và
`src/components/share/ShareMenu.tsx`. Android: `docs/uat/ANDROID-REQUESTS.md` §2 (29/09, "Ảnh chia sẻ").

## Quy tắc phong cách (mọi thẻ theo MỘT kiểu)

### Thẻ sáng — theo mẫu #1
- **Nền**: dải dọc `#FFFFFF` → `#F2F7FF` (55%) → `#EAF3FF`, kín mép (không trong suốt).
- **Chữ**: đậm `#0B1B3F` (tiêu đề), thân `#33415C`, phụ `#4F5B76`. Xanh thương hiệu `#1E6BFF` (khung QR, icon,
  link); chữ "AI" của wordmark `#3391FF`.
- **Panel nội dung**: nền `#FFFFFF`, viền 2 px `#D8E4FA`, bo góc **40 px**, bóng mờ xanh nhẹ. Ảnh trong panel bo **28 px**.
- **Pill** (badge, website): nền `#EAF3FF`, viền `#B9D2FB`, bo tròn hết cỡ.
- **Sao** `#FFB020` (tắt `#D5DEEE`); tim `#F0457A`.
- **Banner**: dải ngang `#1453D9` → `#2F8CFF`, bo 40 px, slogan nghiêng đậm trắng "Kết nối · Khám phá · Chia sẻ",
  dòng phụ `#E3EEFF`.
- **Chữ**: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif. Tiêu đề 800, nhãn 700, thân 500.
- **Khoảng cách**: lề 60 px (ở khổ 1080). Thẻ review/clip/gợi ý = **1080×1920** (9:16, TikTok ảnh). QR hồ sơ giữ khổ
  1200×(theo nội dung) như đã duyệt UAT3.
- **Logo**: otter tròn (`/branding/otter-logo.png`) CĂN GIỮA trên cùng, dưới là wordmark "Tappy"+"AI", dưới nữa
  tagline "One Agent. One Conversation. Everyday Life.".
- **Linh vật**: otter áo hoodie (`/branding/otter-mascot.png`) đứng ở ĐẦU TRÁI banner. Vì vậy mã QR của thẻ nội
  dung nằm BÊN PHẢI hàng mã (không bị linh vật che).
- **Mã QR**: nền trắng, quiet zone ≥ 4 module, 4 góc ngoặc xanh `#1E6BFF` NẰM NGOÀI quiet zone; không vẽ gì lên mã.
- **Chân thẻ**: pill website `www.tappyai.com` (host lấy từ `NEXT_PUBLIC_SITE_URL`) có icon quả cầu + mũi tên.
- **Không bịa**: trường nào thiếu thì không vẽ (không sao giả, không ảnh stock). Không chữ viết tay/skyline (quyết định
  UAT3 còn hiệu lực).
- **Huy hiệu Google Play (Huy quyết SL2, 29/09)** — chỉ trên thẻ QR TappyAI (QR hồ sơ, và mẫu "Mã QR" của bài Explore):
  panel đáy chia 2 cột như mẫu #1: TRÁI "Tải **TappyAI** ngay" (34/40 px) + "Trải nghiệm trọn vẹn trên mọi thiết bị" + huy
  hiệu Google Play (nền đen, viền `#A6A6A6`, logo Play 4 màu, dòng nhỏ "TẢI NỘI DUNG TRÊN" / "GET IT ON" + "Google Play"
  trắng, cao 84 px); vạch chia `#D8E4FA`; PHẢI "Hoặc truy cập website" + pill website. Huy hiệu vẽ bằng canvas theo quy tắc
  huy hiệu của Google (chưa tải được file gốc của Google). Ảnh PNG không mang link; không ghi URL cửa hàng. **App Store: chưa
  có** — không huy hiệu, không ô "sắp có". Thẻ review/clip/gợi ý: không huy hiệu (mẫu #1 chỉ có ở thẻ QR).

### Ảnh kế hoạch — theo mẫu #7
- Nền navy `#070A12` → `#0B1220` → `#14133A`; panel `#111A2E` viền `rgba(255,255,255,0.08)` bo 28 px.
- Chữ `#F4F6FB`, phụ 70%/50% trắng; eyebrow "TAPPY PLAN" `#8FB8FF` giãn chữ.
- **Có ảnh (ghi chú Huy 29/09 "tấm plan … có ảnh nền")**: ảnh địa điểm THẬT đầu tiên của kế hoạch làm NỀN cả phần đầu thẻ
  (0–1000 px, từ mép trên — logo và tiêu đề nằm trên ảnh), phủ tối 3 lớp như ảnh OG của `/plan/<id>`: trên (0.70→0 trong
  260 px), dưới (0.10→0.45→`#070A12`), trái (0.60→0.15→0); tiêu đề có bóng chữ. Có ≥ 2 ảnh khác nhau → thêm "Điểm nổi bật"
  (lưới 2 cột, ô cao 280 bo 24, tên dưới ảnh, tối đa 4). Không có ảnh → dải gradient dưới thanh logo, KHÔNG ảnh thay thế.
- Ảnh các chặng lấy từ `photo_url` của kế hoạch; kế hoạch tư vấn (consult) không có `photo_url`, nên khi chia sẻ từ chat thì
  ảnh thẻ địa điểm CÙNG lượt trả lời được gắn vào chặng trùng TÊN (`src/lib/plans/share/planPhotos.ts`: trùng tên, hoặc chứa
  nhau ≥ 4 ký tự; chỉ ảnh Google Places).
- Timeline ngày: vòng số "01/02/03" gradient `#3B82F6` → `#8B5CF6`, đường dọc xanh; mỗi chặng: giờ, ảnh nhỏ (nếu có),
  tên, mô tả 1 dòng, địa chỉ có ghim tím `#A78BFA`. Tối đa 3 ngày × 4 chặng, phần còn lại ghi "+N".
- Hộp "Tổng quan chuyến đi" (Thời gian / Số người / Ngân sách — chỉ trường có thật), nút CTA pill gradient
  "XEM KẾ HOẠCH ĐẦY ĐỦ TRÊN TAPPY →", link kế hoạch, chân "Được tạo bởi TappyAI".

### Màn chia sẻ — theo mẫu #6
Tiêu đề "Chia sẻ với mọi người" + dòng phụ; khối thẻ TappyAI + thẻ link (tên · TappyAI, dòng mô tả, link, nút
"Sao chép link"; với kế hoạch từ chat: dòng trạng thái link ngay dưới — "Đang tạo liên kết kế hoạch…" / "Đăng nhập để tạo…" /
"Chưa tạo được…" + "Thử lại"; Huy quyết SL1 29/09); **"Ảnh chia sẻ"** (bộ chọn mẫu + ảnh xem trước — chính là file sẽ lưu/gửi); lưới 4 cột
Facebook/Zalo/WhatsApp/Telegram/Viber/LINE/TikTok/Email; "Tùy chọn khác" (Tappy Inbox, Lưu về máy, Ứng dụng khác);
banner otter xanh ở đáy. Theo giao diện sáng/tối của app (mẫu là bản tối).

### Quy tắc "một file"
Ảnh xem trước trong màn chia sẻ, file "Lưu về máy" và file gửi TikTok là **cùng một File** (render một lần cho mỗi
cặp mẫu+link). Đổi mẫu → đổi cả ảnh xem trước lẫn file. Ngoại lệ đã duyệt 28/09: clip TẢI LÊN TappyAI gửi TikTok bằng
chính video; không lấy được video thì dùng ảnh thẻ đang chọn.
