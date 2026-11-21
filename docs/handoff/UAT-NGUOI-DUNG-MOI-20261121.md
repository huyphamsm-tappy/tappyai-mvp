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

## Lỗi/điểm còn lại (CHƯA sửa, cần anh quyết hoặc ưu tiên thấp)
- **Chưa có thông báo "bạn bè đăng clip/bài mới"** (không có loại này trong mã). Cần anh duyệt: nên có, giới hạn số người nhận mỗi bài, tôn trọng chặn.
- Bảng tỷ giá: hàng "USD chuyển khoản" mất giá bán, câu ghi chú chèn nhầm vào ô (lỗi sinh nội dung của model).
- Trang Scam Shield (trang công khai đã cache) ghi "Khách" ở góc dù đã đăng nhập.
- Trên hồ sơ người khác: dòng thông báo "cần theo dõi nhau" làm tên bị cắt, số liệu xếp dọc; thông báo không tự mất sau khi đã theo dõi (mất khi tải lại).
- Xóa bài/clip dùng hộp xác nhận gốc của trình duyệt (confirm) — hoạt động với người thật nhưng xấu và không tự động hóa được.
- Gặp 1 lần: câu hỏi gửi sát lúc câu trước đang chốt tạo cuộc trò chuyện trùng tên; chưa tái hiện lại.
- Trang gói/Cài đặt không hiện số báo cáo nghiên cứu sâu còn lại (chưa xác định chỗ hiển thị).
- Câu trả lời có công cụ chậm 45–70 giây (mua sắm, lịch trình).

## CHƯA KIỂM
- Phát clip qua CDN (cần tên miền thật), ảnh bìa clip, đăng nhập Zalo/Google trên tên miền thật, thanh toán thật, cron thông báo hằng ngày thật, thông báo đẩy ra thiết bị.
- Xóa clip/bình luận bằng giao diện (clip: hộp xác nhận gốc chặn công cụ; có test tự động).

## Dữ liệu thử còn trên UAT
Ba tài khoản thử (An, Bình, Cường), bài thử, 1 clip thử, 1 nhóm ăn, 9 cuộc trò chuyện. Dọn bằng `cleanup-ui-test-uat.mjs` (thư mục scratchpad của phiên) khi anh bảo.
