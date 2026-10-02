# Android ↔ Web ↔ D:\redesign — bước 1: bảng, cấu trúc, hiện trạng (2026-09-28)

Ảnh hiện trạng được chụp **trước mọi sửa đổi của phiên Android**:
- Android: rc/web-uat c835b3e, cộng thêm bản build `uat` (chưa commit lúc chụp). `android/` không đổi từ c835b3e tới f6c7faf; phiên web đã báo STOPPED @ 6e392d2.
- Web: uat.tappyai.com lúc 15:30–15:50 ngày 28/09.
- Điều kiện chụp: khách (chưa đăng nhập), giao diện tối, tiếng Việt. Web ở khung 412×915; Android trên emulator Pixel_8 1080×2400.

Tất cả ảnh ghép cạnh nhau nằm trong `evidence/android-parity/step1-hientrang/NN-*.png`.

## 1. D:\redesign → web → Android

D:\redesign có 6 ảnh.

| Ảnh D:\redesign | Màn web | Màn Android | Thiết kế: web | Thiết kế: Android | Ảnh |
|---|---|---|---|---|---|
| Sep 10 11_46 — **Xác nhận đủ 18 tuổi** (Ngày/Tháng/Năm, "Tiếp tục", hộp "Ngày sinh được giữ riêng tư") | `/age-check` (khách hỏi chat → màn này) | Không có màn riêng. Trong chat có dòng "Năm sinh" + "Tiếp tục" + "Tôi đủ 18 tuổi" | ✅ khớp | ❌ lệch cả cấu trúc lẫn thiết kế | 03 |
| Sep 11 11_12 — **Onboarding "Bước 2/4"**, 6 chủ đề | `/onboarding` | `OnboardingScreen`: 2 bước (sở thích → vị trí), chỉ hiện sau lần đăng nhập đầu | chưa chụp được (cần đăng nhập) | ❌ 2 bước so với 4 bước | 08 |
| Sep 22 01_41 — **Gợi ý cho bạn** (hero, "Địa điểm nổi bật gần đây", thẻ "Hỏi Tappy về chỗ này") | `/recommendations` (khách → `/age-check`) | `RecommendationsScreen`: khách nhận lỗi "Không tải được" (API 403) | khách bị đưa sang 18+, đúng luồng | ❌ khách thấy lỗi thay vì được hỏi 18+; thiếu hero và thẻ theo mockup | 09 |
| Sep 22 01_53 — **Tài khoản & Cài đặt** (9 mục + Cài đặt) | `/profile` | hub "Tôi" | ✅ đúng 9 mục | ❌ thừa Following/Friends, Kết nối ứng dụng, Đánh giá của tôi, thẻ Quyền riêng tư; nhãn khác ("Lịch sử trò chuyện", "Đặt chỗ", "Ăn uống nhóm"); khách không bị khoá | 06 |
| Sep 28 02_06 — **Đã lưu** (hero "Những điều bạn yêu thích", chip lọc, 2 thẻ đếm, trạng thái rỗng "Chưa có gì được lưu" + "Khám phá ngay") | `/profile/favorites` | `SavedScreen` | ❌ chỉ là danh sách 2 dòng, không có hero/chip/trạng thái rỗng → R1 | ❌ như web; nhãn "Đánh giá đã lưu" khác web "Bài viết đã lưu" | 11 |
| Sep 28 02_12 — **Viết content** (hero mascot xanh-tím, logo FB/TikTok/IG, "Thử gợi ý", tone có icon, độ dài có mô tả, nút gradient "Tạo caption ngay") | `/viet-content` | `VietWriterScreen` | ❌ hero hồng, icon emoji → R2 | ❌ như web; nhãn "Nền tảng/Giọng điệu", độ dài "Vừa/1–2 câu" khác mockup | 10 |

## 2. Cấu trúc điều hướng

### Web (mobile, bố cục < lg)

```
BottomNav: Trang chủ(/) · Chat(/chat) · Khám phá(/reviews) · Deals(/deals) · Tôi(/profile)
Tôi (/profile)
├─ khách: thẻ "Bạn đang dùng thử" + "Đăng nhập để lưu lại"; mọi dòng khoá "Cần đăng nhập" → /login?returnTo=
├─ TÀI KHOẢN: Tài khoản · Lịch sử chat · Lịch đặt chỗ · Sở thích của tôi · Đã lưu · Theo dõi giá ·
│             AI Planner (My Plans) · Tappy biết gì về bạn · Đi nhóm
└─ CÀI ĐẶT: Cài đặt (/profile/settings)
    ├─ TÙY CHỌN: Thông báo · Trí nhớ · Ngôn ngữ (VI|EN, ngay trong dòng)
    ├─ KHÁC: Hướng dẫn sử dụng (/how-to-use) · Điều khoản · Chính sách bảo mật
    └─ Đăng xuất · Yêu cầu xoá tài khoản
Khám phá (/reviews): feed clip + dock riêng; + → /reviews/new (Ảnh | Video | YouTube)
Hồ sơ người khác (/users/<id>): tab Bài đăng · Chia sẻ; nút Theo dõi
Hồ sơ của mình: /users/<own id> chuyển sang /profile (5e305f4: xem theo trạng thái Đã đăng/Chia sẻ/Lưu/Bị hạn chế/Ẩn)
Đăng nhập (/login): Google · Zalo · hoặc · Email · Mật khẩu · Đăng nhập · Tạo tài khoản(/register) · Tiếp tục với tư cách Khách
```

Desktop sidebar: P2c (5e305f4) đã bỏ Saved, History, Settings, Language và Help. Không còn trùng.

### Android (hiện trạng c835b3e)

```
Bottom bar: Trang chủ · Chat · Khám phá · Deals · Tôi          ✅ giống web
Tôi (ProfileScreen)
├─ khách: thẻ "Hồ sơ của bạn" (có nút QR) + thẻ "Đăng nhập"; các dòng KHÔNG khoá   ❌
├─ TÀI KHOẢN: Tài khoản · Lịch sử trò chuyện · Đặt chỗ · Sở thích · Đã lưu · Theo dõi giá · AI Planner ·
│             Following/Friends ❌ · Tappy biết gì về bạn · Kết nối ứng dụng ❌ · Đánh giá của tôi ❌ · Ăn uống nhóm
├─ thẻ Quyền riêng tư & Bảo mật ❌ (trùng mục trong Cài đặt)
└─ CÀI ĐẶT: Cài đặt
    ├─ TÙY CHỌN: Thông báo · Bộ nhớ · Âm thanh thông báo · Ngôn ngữ · Giao diện   (web không có dòng Âm thanh và Giao diện)
    ├─ KHÁC: Hướng dẫn sử dụng · Điều khoản · Chính sách bảo mật · Chính sách bản quyền · Yêu cầu xoá tài khoản
    └─ khách: thẻ "Đăng nhập" (web: khách bị khoá cả dòng Cài đặt)
Khám phá: feed + dock; + → composer (Ảnh | Video | Link). Tab Video là chỗ giữ chỗ, chưa upload clip được ❌
Hồ sơ người khác: chỉ có tab "Bài viết" ❌ (web: Bài đăng · Chia sẻ)
Đăng nhập: Google · Zalo · (debug: Dùng thử) — KHÔNG có Email/Mật khẩu/Tạo tài khoản/Khách ❌
Trang chủ còn có: Recent activity (lịch sử chat) — web Home không có
```

## 3. Danh sách lệch (hiện trạng) và kế hoạch

Mức độ: **S** = lệch cấu trúc hoặc luồng; **D** = lệch thiết kế; **B** = lỗi.

| # | Mục | Lệch | Mức | Kế hoạch |
|---|---|---|---|---|
| L1 | Đăng nhập | Thiếu Email + Mật khẩu, Tạo tài khoản, Khách | S | thêm như web (đã làm thử ở nhánh held, sẽ làm lại trên nền mới) |
| L2 | Đăng nhập, chế độ tối | Trang vẫn sáng; tiêu đề thẻ màu đen trên nền đen | B | Surface theo theme |
| L3 | Hub Tôi | 3 dòng thừa + thẻ Quyền riêng tư; nhãn khác; khách không bị khoá | S+D | theo web / mockup |
| L4 | Cổng 18+ | Nằm trong chat thay vì là màn Ngày/Tháng/Năm của mockup | S+D | màn 18+ theo mockup |
| L5 | Gợi ý cho bạn | Khách thấy lỗi (403) thay vì được hỏi 18+; bố cục khác mockup | S+D | qua cổng 18+; hero và thẻ theo mockup |
| L6 | Onboarding | 2 bước so với 4 bước trong mockup | S+D | kiểm lại sau khi đăng nhập |
| L7 | Đã lưu | Không có hero/chip/trạng thái rỗng như mockup; nhãn "Đánh giá đã lưu" | D | theo mockup |
| L8 | Viết content | Khác mockup: hero, icon thương hiệu, "Thử gợi ý", tone có icon, độ dài có mô tả, nút gradient | D | theo mockup |
| L9 | Composer | Tab Video là chỗ giữ chỗ (không upload clip được); thiếu hero "POST / UPLOAD" và ô kéo thả của web | S+D | cần kiểm khi đã đăng nhập |
| L10 | Hồ sơ người khác | Thiếu tab "Chia sẻ" | S | theo web |
| L11 | Cài đặt | Có thêm Âm thanh, Giao diện, Bản quyền; dòng Cài đặt không khoá với khách | S | ghi là quy ước nền tảng hoặc bỏ — cần quyết định |
| L12 | Home | Bố cục khác web (hero, 6 thẻ "Gợi ý nhanh" so với chip "Thử hỏi Tappy" + thẻ "Hỏi Tappy thử" + "Công cụ") | S+D | không có mockup; bố cục Android từng được owner duyệt riêng (V3 Android mockup) → **cần owner quyết** |
| L13 | Chat, 11 câu test | CHƯA KIỂM — cần đăng nhập | — | bước 2 |
| L14 | Chia sẻ Zalo/FB/TikTok, SHOW_PUBLIC_SHARE | CHƯA KIỂM — cần đăng nhập | — | bước 2; Android chưa có cờ publicShare (web `/api/config` → `flags.publicShare`) |
| L15 | Hồ sơ chính chủ theo trạng thái; avatar và ảnh bìa | CHƯA KIỂM — cần đăng nhập; Android chưa có upload ảnh bìa | S | bước 2 |
| L16 | Deals | Audit không có deal, cả hai đều rỗng. Web có thẻ "Hỏi Tappy trước khi mua" + "Hỏi Tappy ngay" ở đầu trang; Android không có | S | thêm thẻ theo web |
