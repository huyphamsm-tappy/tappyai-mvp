# Đóng băng kiến trúc chat Android "tham chiếu web một bộ não", ngày 02/11/2026

**Owner yêu cầu:** "đóng băng android và chuẩn bị mai anh UAT" (sau khi rà lại kiến trúc Android và sửa lỗi).

**Mốc đóng băng:**
- Nhánh `android/next-hide-translate-viet`.
- Tag `android-arch-freeze-20261102` đặt trên commit cuối của đợt sửa lỗi rà soát.
- Nhánh dự phòng `backup/android-arch-freeze-20261102`.

**Canh bằng test:**
- Test canh là `android/app/src/test/java/com/tappyai/app/chat/AndroidArchitectureFreezeTest.kt`.
- Test đó đỏ nghĩa là kiến trúc đã đổi. Không sửa test cho qua: cần Owner duyệt, rồi thêm một mục mới có ngày vào cuối tài liệu này.

## 1. Kiến trúc được đóng băng

### 1.1. Ứng dụng mỏng, máy chủ quyết

Android chỉ gửi hội thoại và chế độ, rồi vẽ những gì máy chủ gửi về. Mô hình ở máy chủ là bên **duy nhất** đọc câu hỏi (web: `ONE-BRAIN-FREEZE-20261102.md`).

- **Không có trong app:** phân loại câu hỏi theo từ khóa, nhánh riêng theo sản phẩm, ngôn ngữ, cửa hàng hay địa điểm, mô hình năm lĩnh vực.
- **App vẫn giữ:** hiển thị thẻ (kế hoạch, mua sắm, địa điểm, nghiên cứu), chặn nguồn từ sản phẩm AI, chỉ mở link http(s), xuất báo cáo.

### 1.2. Chế độ gửi lên

- Trường `mode` của request: `auto` (mặc định), `chat`, `web`, `think`, `deep`.
- Menu "+" chỉ có **đính kèm** và **Nghiên cứu sâu**. Chat, Web, Suy nghĩ không còn là mục menu: chế độ Tự động để mô hình tự chọn (web cùng quy tắc).
- Nghiên cứu sâu dùng cho **một câu hỏi**: app đưa về Tự động khi luồng đã mở (không phải lúc gửi), nên yêu cầu bị từ chối hay mất mạng thì chế độ còn nguyên.
- Menu theo gói như máy chủ (`lib/plans/tiers.ts`): khách hoặc tài khoản không có gói đang hoạt động chỉ thấy đính kèm; mọi gói trả tiền thấy cả hai mục. Gói đọc từ `/api/payments/me`; 404 (cờ gói bán tắt), mất mạng hay lỗi nghĩa là **chưa biết** và chưa biết thì giữ menu đủ.

### 1.3. Luồng trả lời

- Khung `0:` chữ, `8:`/`9:`/`a:` thẻ và trạng thái một bộ não, `3:`/`d:` kết thúc. Khung lạ bị bỏ, không làm hỏng lượt.
- **Không bỏ sót sự kiện nào:** luồng có bộ đệm không giới hạn.
- Thời gian im lặng tối đa khi đọc: 130 giây, Nghiên cứu sâu 320 giây.
- Dừng hay lỗi sau khi đã có chữ: giữ chữ, thẻ nguồn, biểu đồ và ảnh đã nhận. Lỗi trước khi có chữ: thẻ lỗi có hướng xử lý.
- Câu trả lời xong là xong: trạng thái "đang trả lời" tắt ngay khi tin nhắn dựng xong; việc **lưu hội thoại chạy riêng, từng lượt một** (khóa `persistLock`), không bị nút Dừng hủy, không giữ khóa ô nhập.
- Đang trả lời thì không gửi thêm (cả bằng giọng nói).
- Tải lịch sử lỗi: bắt đầu hội thoại mới, không giữ mã cũ (lưu là PUT cả danh sách).

### 1.4. Nguồn và link

- Chặn nguồn từ bất kỳ sản phẩm AI nào (AIHAY `ai-hay.vn` và app, ChatGPT, Perplexity…): ở khung nguồn nhận về, ở văn bản, ở link.
- Chỉ mở link `http`/`https`: link trong văn bản, nút CTA, dòng người bán, thao tác địa điểm.
- Địa chỉ có dấu ngoặc đọc nguyên vẹn (ghép cặp ngoặc; khi xuất tệp ghi `%28` `%29`).

### 1.5. Thẻ và xuất báo cáo

- Thẻ kế hoạch: tab theo ngày, ảnh từng điểm, dòng tổng ước tính; không in câu "chưa có giá".
- Thẻ mua sắm: đánh giá, thông số, tình trạng, link dự phòng; **giá làm tròn một chữ số thập phân**, không cắt.
- Báo cáo nghiên cứu sâu tải về dạng Markdown, PDF (A4, chữ 12 pt giãn 1,5, số trang "n / N", bảng có lưới, nguồn có địa chỉ), Word (Calibri 11 pt, link bấm được). Lưu xong có thông báo; lưu lỗi thì xóa tệp rỗng.
- Tệp đính kèm: ảnh hoặc PDF tối đa 3.000.000 byte.

## 2. Ngoài đóng băng (chưa làm, cần Owner duyệt)

- A8: thanh toán gói qua Play Billing và sản phẩm trên store.
- Ẩn mục theo gói là **hành vi chờ**: chỉ có tác dụng khi bật `SUBSCRIPTIONS_ENABLED` ở máy chủ.
- Mở khóa một bộ não trên production (`consultOneBrainOn`) khi deploy.
- Chưa push, chưa deploy.

## 3. Nhật ký thay đổi sau đóng băng

(Chưa có. Mỗi mục: ngày, ai duyệt, đổi gì, vì sao.)
