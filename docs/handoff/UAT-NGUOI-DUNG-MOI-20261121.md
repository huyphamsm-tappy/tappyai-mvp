# UAT như người dùng mới — 21/11/2026 (localhost:3000, UAT, không đụng production)

Nhãn: ĐÃ KIỂM = em thấy tận mắt trên giao diện thật; CHƯA KIỂM = không làm được ở máy này.

## Đã kiểm, chạy tốt
- Mua gói Coco 225.000đ: tạo đơn, mã QR, mô phỏng webhook SePay có ký HMAC → trang tự báo "Coco đã đồng hành cùng bạn", hạn 21/12, lịch sử thanh toán đúng.
- Chat 9 lĩnh vực: ăn uống (thẻ quán, giờ mở, nút đặt/bản đồ), lịch trình Đà Lạt (tự lưu vào AI Planner, 16 điểm dừng), thời tiết, mua sắm (bảng so sánh), vàng/tỷ giá, sức khỏe (an toàn), lập trình, dịch, nhận diện lừa đảo.
- Nghiên cứu sâu: kế hoạch 9 mục → báo cáo 24 nguồn trong ~70 giây, xuất Markdown/Word/PDF/HTML/chia sẻ.
- Smart Tools, Scam Shield (nhận ra tên miền giả ngân hàng), Deals (Vexere/Agoda/Lazada), AI Planner, tạo Nhóm ăn.
- Hai tài khoản: theo dõi, chặn nhắn tin khi chưa theo dõi nhau, nhắn chữ + gửi ảnh, đăng clip (đồng ý AI → nén → kiểm duyệt → "Sẵn sàng đăng" → đăng), bình luận, chủ bài ẩn bình luận (người lạ không thấy), báo cáo bình luận, chặn, bỏ chặn.
- Thông báo: theo dõi, bình luận, thích, tin nhắn (gộp "2 tin nhắn mới"), chào buổi sáng của Tappy (hiển thị đúng; cron thật chưa chạy được vì máy này không có CRON_SECRET).

## Lỗi tìm thấy và ĐÃ SỬA (commit trên nhánh)
1. Tạo đơn thanh toán bị 429 ngay lần bấm đầu khi không có kho giới hạn chung (UAT/preview) → dùng publicRateLimit.
2. Thẻ "Nhóm ăn" hiện "Cần đăng nhập" dù đã đăng nhập.
3. Bấm "Nhắn tin" từ hồ sơ mở Hộp thư ở tab Thông báo thay vì Tin nhắn.
4. Hộp thoại "Đồng ý kiểm duyệt bằng AI" bị khung soạn bài che → không bấm được, không đăng được clip (nghiêm trọng).
5. Chặn xong không có chỗ bỏ chặn trên web → hồ sơ người bị chặn nay ghi rõ và có nút "Bỏ chặn".

## Cập nhật chiều 21/11 (sau khi anh dặn làm mục B, C)
ĐÃ SỬA: thông báo "bạn bè đăng bài" (có); trang Scam Shield ghi "Khách" (nay đọc tên hồ sơ của thành viên); dòng cảnh báo trên hồ sơ làm tên bị cắt (nay nằm hàng riêng); chân trang, banner, logo, ảnh thẻ gợi ý.
ĐÃ KIỂM LẠI BẰNG GIAO DIỆN THẬT: xóa clip (chủ bài) và xóa bình luận (người viết, cả bình luận đã bị ẩn) hoạt động; giao diện điện thoại 375px không tràn ngang, banner xếp dọc.

## Còn lại (chưa sửa / chưa kiểm được)
- Bảng tỷ giá: hàng "USD chuyển khoản" mất giá bán, câu ghi chú chèn nhầm vào ô (lỗi sinh nội dung của model; chưa có cách sửa an toàn mà không đụng bộ não).
- Cuộc trò chuyện trùng tên: gặp 1 lần, không tái hiện được trong 2 lần thử lại.
- Trang gói/Cài đặt không hiện số báo cáo nghiên cứu sâu còn lại: anh đã bỏ thẻ "AI còn lại hôm nay" khỏi trang chủ, nên chưa thêm chỗ hiển thị mới.
- Âm thanh clip Khám phá (bấm một lần là có tiếng): có test tự động; chưa nghe thử thật vì clip tải lên UAT là loại HLS không phát được trên máy cục bộ, clip còn lại là YouTube nhúng.
- Chat có công cụ chậm: chờ số đo production (xem công cụ `scripts/perf/latencyReport.mjs`).

## CHƯA KIỂM (cần tên miền/khóa thật)
- Phát clip qua CDN, ảnh bìa clip, đăng nhập Zalo/Google trên tên miền thật, thanh toán thật, cron thông báo hằng ngày thật, thông báo đẩy ra thiết bị.

## Dữ liệu thử trên UAT
Đã dọn sạch ngày 21/11 chiều (3 tài khoản thử, bài, clip, nhóm ăn, các cuộc chat, thông báo; đã quét mọi bảng không còn dòng nào trỏ tới các tài khoản đó; kho clip trống).
