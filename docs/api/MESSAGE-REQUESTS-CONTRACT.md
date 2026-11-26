# Tin nhắn chờ (message requests) — hợp đồng API cho iOS / Android

Quyết định của chủ sản phẩm (26/11/2026). Mọi luật nằm trong cơ sở dữ liệu (migration `20261210_message_requests.sql`), nên cả ba nền tảng cùng một hành vi.

## Luật
- Hai người **chưa theo dõi lẫn nhau** vẫn nhắn được. Cuộc trò chuyện là một **lời nhắn chờ** ở phía người nhận.
- Người gửi tối đa **3 tin, chỉ chữ (không ảnh)**, cho tới khi người nhận trả lời.
- Người nhận **trả lời** → thành cuộc trò chuyện bình thường (hết giới hạn). Hoặc **bỏ qua** → người gửi không gửi thêm được, **không được báo**.
- Mỗi người gửi mở tối đa **10 lời nhắn mới / 24 giờ**.
- **Không có thông báo đẩy** cho lời nhắn chờ; chỉ hiện chấm trên tab "Tin nhắn chờ".
- Lời nhắn chờ quá **30 ngày** không ai trả lời thì biến khỏi danh sách người nhận.
- Chặn (user_blocks / chat_blocks) vẫn chặn tất cả, kể cả lời nhắn chờ. Lời nhắn vẫn bị kiểm duyệt / báo cáo như tin thường.

## Endpoint (đều cần đăng nhập; tài khoản ẩn danh bị từ chối ghi)

### Bắt đầu nhắn người lạ — không đổi
`POST /api/messaging/threads` `{ "kind": "direct", "userId": "<uuid>" }` → `{ "threadId": "<uuid>" }`
- Nếu hai người không theo dõi lẫn nhau, thread được tạo ở trạng thái chờ (client không cần làm gì khác).
- `429` `{ "error": "request_daily_limit", "message": "…" }` khi đã đủ 10 lời nhắn mới trong 24 giờ.
- `400 invalid_input` nếu bị chặn hoặc không có tài khoản (cùng một lỗi, không lộ ai chặn ai).

### Gửi tin — thêm lỗi mới
`POST /api/messaging/threads/:id/messages`
- `403` `{ "error": "request_limit" }` — người gửi đã đủ 3 tin, hoặc lời nhắn đã bị bỏ qua. Nên hiện thông điệp trong `message` và khóa ô nhập.
- `403` `{ "error": "request_text_only" }` — thử gửi ảnh khi chưa được trả lời.

### Danh sách lời nhắn chờ
`GET /api/messaging/requests` → `{ "requests": [ { …như một phần tử của /threads…, "direction": "incoming" | "outgoing", "remaining": 0-3, "startedAt": "ISO" } ] }`
- `incoming`: người khác nhắn mình (chỉ còn chờ, dưới 30 ngày). Hiển thị ở tab **Tin nhắn chờ**. Chấm báo = có phần tử.
- `outgoing`: mình đã nhắn; `remaining` = số tin còn gửi được. Thread này **cũng nằm** trong `/api/messaging/threads` của người gửi (người gửi thấy như thường).
- Lời nhắn chờ **đến** không nằm trong `/api/messaging/threads` và không cộng vào `/api/messaging/unread`.

### Bỏ qua / xóa
`POST /api/messaging/threads/:id/decline` → `{ "declined": true }`; `404` nếu không phải người nhận hoặc đã xử lý.

### Trả lời để chấp nhận
Chỉ cần gửi tin bình thường (`POST …/messages`). Cuộc trò chuyện tự chuyển sang danh sách chính.

## Gợi ý giao diện
- Tab "Tin nhắn | Tin nhắn chờ" (chấm khi có lời nhắn đến). Mở lời nhắn chờ: dải "Người này chưa theo dõi lẫn nhau với bạn. Trả lời để bắt đầu trò chuyện, hoặc bỏ qua." + nút Bỏ qua.
- Phía người gửi: khi `remaining` = 0, khóa ô nhập và hiện "Hãy chờ người này trả lời".
