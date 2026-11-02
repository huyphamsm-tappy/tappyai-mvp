# Đóng băng kiến trúc chat iOS "tham chiếu web một bộ não", ngày 02/11/2026

**Owner yêu cầu:** "audit lại toàn bộ kiến trúc iOS, sau đó tham chiếu web để hoàn thành bộ não cho iOS như bản web", "web là nguồn chính, Android và iOS làm theo, không cần hỏi lại".

**Mốc đóng băng:**
- Nhánh `ios/onebrain-20261102` (tách từ `ios/next-after-179`, commit `4fb88b7`).
- Tag `ios-arch-freeze-20261102` và nhánh sao lưu `backup/ios-arch-freeze-20261102` đặt trên commit đóng băng.

**Canh bằng test:**
- Test canh là `ios/TappyAITests/IOSArchitectureFreezeTests.swift`.
- Test đó đỏ nghĩa là kiến trúc đã đổi. Không sửa test cho qua: cần Owner duyệt, rồi thêm một mục có ngày vào cuối tài liệu này.

**Cách kiểm chứng:** máy làm việc không có Xcode. Mọi lần biên dịch và chạy test của nhánh này là của CI macOS trên GitHub (`ios.yml`, `Regression Gate`, `Architecture Guard`); cả ba xanh ở commit đóng băng. CI không chạy giao diện thật: chữ nằm đúng chỗ, PDF đẹp, cảm giác dùng cần thử trên iPhone.

## 1. Kiến trúc được đóng băng

### 1.1. Ứng dụng mỏng, máy chủ quyết
iOS chỉ gửi hội thoại và chế độ, rồi vẽ những gì máy chủ gửi về. Mô hình ở máy chủ là bên **duy nhất** đọc câu hỏi (web: `ONE-BRAIN-FREEZE-20261102.md`).
- **Không có trong app:** khối ASK và `areaOf` theo từ khoá, màn chào năm lĩnh vực, bảng gợi ý công cụ theo lĩnh vực, bộ lọc trùng địa điểm theo tên.
- **App vẫn giữ:** vẽ thẻ (kế hoạch, mua sắm, địa điểm, nghiên cứu), chặn nguồn từ sản phẩm AI, chỉ mở link http(s), xuất báo cáo, ẩn khối `[TAPPY_ASK]` của máy chủ cũ để không lộ JSON.

### 1.2. Chế độ gửi lên
- Trường `mode` luôn có trong request: `auto` (mặc định), `chat`, `web`, `think`, `deep`.
- Menu "+" chỉ có **đính kèm** và **Nghiên cứu sâu** (`ChatMode.menu == [.deep]`). Chat, Web, Suy nghĩ vẫn là chế độ máy chủ hiểu, không là mục menu.
- Nghiên cứu sâu dùng cho **một câu hỏi**: về Tự động khi luồng đã mở (khung đầu tiên), không phải lúc gửi; yêu cầu bị từ chối hay mất mạng thì giữ nguyên.
- **iOS không đọc gói, không ẩn menu theo gói.** Test `ExternalPurchaseGuardTests` cấm mọi tham chiếu thanh toán web trong app (Apple App Review 3.1.1: không có đường thanh toán ngoài In-App Purchase). Máy chủ vẫn chặn đúng: gói không có Nghiên cứu sâu thì chạy như Chat. Ẩn theo gói trên iOS chỉ làm khi nối gói mua với Apple IAP và cần Owner duyệt.
- Header: `x-tappy-surface: ios` và `x-tappy-caps: card` (bản này vẽ thẻ quyết định; máy chủ `rendersDecisionCard(surface, caps)`). Có tác dụng khi deploy máy chủ.

### 1.3. Luồng trả lời
- Khung `0:` chữ, `9:`/`a:` công cụ (đọc đúng dạng object), `8:` chú thích (một mảng có thể có nhiều loại: places, turn_status, progress, research, research_charts, doc_media), `3:`/`d:`/`e:` kết thúc. Khung lạ bị bỏ, không làm hỏng lượt.
- Thời gian im lặng tối đa khi đọc: 130 giây, Nghiên cứu sâu 320 giây (`ChatStreamTimeout`). Hết giờ không còn bị báo "mất mạng".
- 401 giữa luồng: làm mới token một lần rồi mở lại.
- Dừng hay lỗi sau khi đã có chữ: giữ chữ, thẻ nguồn, biểu đồ, ảnh đã nhận. Các thứ này không lưu lên máy chủ (chỉ văn bản).
- Lưu hội thoại chạy **riêng, từng lượt một**, không bị nút Dừng hủy; trạng thái "đang trả lời" tắt khi tin nhắn dựng xong.
- Mỗi lượt có token riêng: lượt cũ kết thúc muộn không xoá trạng thái lượt mới. Thử lại sau lỗi không nhân đôi bong bóng. Khi đang chờ đồng ý chia sẻ dữ liệu AI, không gửi thêm.
- Tải lịch sử lỗi: bắt đầu hội thoại mới, không giữ mã cũ (lưu là PUT cả danh sách).
- Mã lỗi hiểu riêng: `deep_research_limit_reached`, `pro_daily_limit_reached`, `rate_limit` (dùng câu `message` của máy chủ).

### 1.4. Nguồn và link
- Chặn nguồn từ bất kỳ sản phẩm AI nào (AIHAY `ai-hay.vn` và app, ChatGPT, Perplexity…) bằng `AiSourcePolicy` (cùng danh sách và quy tắc bóc lớp bọc với web): ở văn bản, link, ảnh, nút CTA, nguồn nghiên cứu.
- Chỉ mở link http(s) (`safeWebURL`): link markdown, thẻ địa điểm, dòng người bán, nguồn nghiên cứu. Nút CTA giữ chính sách riêng theo web (`tel:`/`mailto:`) nhưng chặn nguồn AI và scheme lạ.

### 1.5. Đính kèm
- Ảnh png/jpeg/webp/gif hoặc PDF; PDF tối đa 3.000.000 byte (`ChatAttachmentLimits.pdfBytes`). Ảnh vẽ lại tối đa 1600 px, gửi JPEG, vừa 8.000.000 ký tự data URL.
- Dữ liệu tệp chỉ đi kèm câu hỏi cuối, dạng `experimental_attachments`; hội thoại lưu chỉ có văn bản.

### 1.6. Thẻ, bố cục và xuất báo cáo
- Thẻ kế hoạch: tab theo ngày, ảnh từng điểm (`photoUrl` https an toàn), dòng "Tổng ước tính", thứ tự dòng chi phí của máy chủ; không in câu "chưa có giá".
- Thẻ mua sắm: đánh giá, thông số, tình trạng, link dự phòng; **giá làm tròn một chữ số thập phân**, không cắt.
- Câu trả lời vẽ theo khối markdown (tiêu đề, danh sách, bảng, trích dẫn, code); ảnh trong văn bản đúng vị trí; biểu đồ và ảnh theo mục đặt dưới tiêu đề khớp, không khớp xếp cuối.
- Thẻ Nghiên cứu sâu: pha, bước, nguồn đánh số, biểu đồ (Swift Charts). Tải báo cáo: Markdown, PDF (A4, 12 pt, giãn 1,5, số trang "n / N", bảng lưới), Word (Calibri 11 pt; zip STORE tự viết); lưu xong báo "Đã lưu báo cáo".
- Nút sao chép câu hỏi đã gửi; nhãn trợ năng và vùng chạm ≥ 44 pt cho các nút biểu tượng.

## 2. Ngoài đóng băng (chưa làm, cần Owner duyệt)
- **Dựng bản TestFlight:** workflow `Archive + upload to TestFlight` (`ios.yml`) chạy tay và dựng bản Release **trỏ vào máy chủ production**. Máy chủ production chưa có các thay đổi một bộ não của web (chưa deploy), nên bản đó chạy các tính năng mới (Nghiên cứu sâu, đính kèm, khai `x-tappy-caps: card`) với máy chủ cũ. Cần quyết định: deploy web trước, hoặc dựng với máy chủ thử.
- Ẩn Nghiên cứu sâu theo gói trên iOS (App Review 3.1.1).
- Câu gợi ý nhanh theo giờ (`DynamicPrompts`) còn chữ cứng; web cũng còn 3 gợi ý theo giờ.
- Điều kiện hiện nút lưu theo `replyHasSavablePlace` như web/Android.
- Chưa merge vào `main`; nhánh `ios/onebrain-20261102` đã đẩy lên GitHub cho CI.

## 3. Nhật ký thay đổi sau đóng băng

(Chưa có. Mỗi mục: ngày, ai duyệt, đổi gì, vì sao.)
