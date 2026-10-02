# Việc của bản cập nhật SAU release (chốt 02/10, Huy)

Không làm trong AAB `597698b`. Thứ tự gợi ý: trên xuống.

| # | Việc | Ghi chú / bằng chứng |
|---|---|---|
| 1 | **App Links** — link `https://www.tappyai.com/plan/…`, `/r/…` … mở thẳng vào app | Cần web sửa `assetlinks.json` trước, rồi app thêm bộ lọc `autoVerify` + màn nhận link. Đặc tả đủ ở `docs/uat/ANDROID-REQUESTS.md` mục «App Links — đặc tả cho SAU release» |
| 2 | Khám phá, màn **360×640dp**: cột nút bên phải (avatar, tim, bình luận, Hỏi Tappy, chia sẻ, …) chồng lên hàng nút phía trên | Ảnh `ugc-2026-10-01/matrix/_small360.png`, `_small-font15.png`. Cách sửa gợi ý: chế độ thu gọn khi chiều cao <700dp (nút 40dp, bỏ nhãn chữ, khoảng cách 2dp) |
| 3 | **Máy tính bảng** (≥600dp): bố cục điện thoại kéo giãn, hàng dài | Ảnh `matrix/_tablet.png`; cân nhắc giới hạn bề rộng nội dung/2 cột |
| 4 | Chat trống: thêm dòng **«Tappy nhớ sở thích của bạn · Quản lý»** (mở Trí nhớ) như web | Ảnh `compare-after/chat-empty.png` |
| 5 | Nâng **`activity-compose`** (1.9.3 → bản mới) để hết cảnh báo Play về `setStatusBarColor` / `setNavigationBarColor` / `layoutInDisplayCutoutMode` (nguồn: `androidx.activity.EdgeToEdgeApi26/28/29/30`) | Cần tải thư viện + đối chiếu BOM Compose; chạy lại toàn bộ e2e, kiểm viền trên API 35/36 |
| 6 | **Ảnh máy ảo API 26 (thấp nhất), 36, 37** + chạy lại ma trận máy và monkey | Hiện emulator chỉ có API 35 (thư mục API 31 và 37.2-beta rỗng) |
| 7 | **Chữ lệch theo web**: «Bộ nhớ» ↔ web «Trí nhớ», mô tả Thông báo, tên các hàng Cài đặt, hero composer/«POST / UPLOAD», thẻ «TappyAI V3»… | Ảnh `compare-before/` và `compare-after/` |
| 8 | **ScamShield: hiển thị 89 tình huống** khi server có dữ liệu | Hiện app dùng bộ trong app; chờ server |
| 9 | **Báo cáo trạng thái cho người báo**: sau khi báo cáo, cho người báo xem kết quả xử lý (đã nhận / đã xử lý) | Hiện chỉ có «Đã gửi báo cáo» + ẩn bài; cần server trả trạng thái (`content_reports` không có API đọc cho người báo) |
| 10 | Chặn người dùng chạy thật | Nút đã sẵn sau cờ `p8.userBlocks`; chờ server bật `P8_USER_BLOCKS`, `P8_REPORTS_V2` + migration (phiên web) |
| 11 | Biểu tượng ứng dụng đơn sắc (Android 13 «themed icon») | Lint `MonochromeLauncherIcon` |
| 12 | Dọn cảnh báo lint: 148 tài nguyên không dùng, 84 `UseKtx`, 74 thư viện cũ, 38 `PluralsCandidate`, 70 dấu «…» | `ugc-2026-10-01/lint-results-release-after.txt` |
| 13 | StrictMode ở bản debug/uat; thử hết phiên đăng nhập giữa chừng; chặn `ACTION_VIEW` với scheme lạ trong WebView trò chơi | Phần «chưa kiểm» của đợt 02/10 |
| 14 | **Quét QR bằng camera trực tiếp** (hiện chỉ chọn ảnh từ thư viện) | Cần CameraX + quyền CAMERA có giải thích; giải mã vẫn trên máy (ZXing). Chưa làm để không thêm quyền trước release |
| 15 | **Tin nhắn dạng giọng nói / loa đọc kết quả** của Lá chắn lừa đảo | Web Phase 8 (`p8_voice_input`); chưa có trên Android |
| 16 | **Nút xoá nhanh dữ liệu đã nhập** trong ô tin nhắn Lá chắn sau khi có kết quả; thẻ kết quả dài → cân nhắc thu gọn | Phát hiện khi chạy e2e 02/10 (kết quả «Giống thủ đoạn» dài ~3 màn hình) |
