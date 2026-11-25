# Quy trình gỡ bài theo yêu cầu cơ quan chức năng (25/11/2026)

**Lưu ý:** các mốc 24 giờ / 6 giờ / 48 giờ lấy từ báo chí về Luật An ninh mạng 2025 và Nghị định 147/2024 (chưa đối chiếu văn bản gốc). Luật sư cần xác nhận mốc, đầu mối tiếp nhận và việc Tappy có thuộc đối tượng áp dụng hay không. Công cụ được viết để đổi mốc dễ dàng (`src/lib/safety/takedown/clock.ts`).

## 1. Công cụ đã có (chưa bật, nằm sau `MODERATION_ADMIN_ENABLED`)
- **Sổ yêu cầu gỡ bài** (bảng `authority_takedowns`, migration `20261209_authority_takedowns.sql`, chỉ máy chủ truy cập, **không xoá được dòng nào**): cơ quan nào hỏi, số công văn, căn cứ, **thời điểm Tappy NHẬN**, **hạn** (nhận + 24 giờ / 6 giờ khẩn cấp / 48 giờ khiếu nại người dùng), nội dung nào, ai ghi, ai thực hiện, lúc nào, và **bản sao nội dung tại thời điểm gỡ** (phục vụ cơ quan điều tra).
- **Thực hiện gỡ** qua cơ chế sẵn có: bài đăng → ẩn (trạng thái `RESTRICTED`); bình luận → ẩn (không xoá) bởi kiểm duyệt viên; kế hoạch chia sẻ → gỡ liên kết; tài khoản → khoá vĩnh viễn và thu hồi mọi phiên đăng nhập (cần thêm quyền khoá tài khoản).
- **Nhật ký kiểm toán** mọi thao tác (không ghi nội dung).
- **Cảnh báo:** có yêu cầu mới thì báo ngay cho người nhận (`MODERATION_DIGEST_USER_IDS`); yêu cầu khẩn cấp báo cả người dự phòng; theo dõi hạn 4 lần/ngày (07:00, 13:00, 19:00, 01:00 giờ Việt Nam), báo khi **một nửa thời hạn đã trôi** hoặc **quá hạn** (quá hạn thì báo cả người dự phòng).
- API (đăng nhập quản trị, cùng nguồn gốc): `GET /api/admin/takedowns?view=open|recent`; `POST /api/admin/takedowns` (ghi yêu cầu; thêm `"execute": true` để gỡ ngay); `POST /api/admin/takedowns/<id>` với `action` = `execute` | `reject` (bắt buộc ghi lý do) | `needs_info` (yêu cầu vẫn mở, đồng hồ vẫn chạy).

## 2. CHƯA có
- (Đã có giao diện, xem mục 5.) CHƯA kiểm giao diện trên trình duyệt thật với cơ sở dữ liệu: cần áp migration `20261209` lên UAT và bật `MODERATION_ADMIN_ENABLED` ở UAT.
- Đầu mối tiếp nhận công khai: cần quyết định địa chỉ (ví dụ `legal@tappyai.com`) và công bố trên trang Điều khoản/Liên hệ; người trực **trong 24 giờ, kể cả cuối tuần** (và 6 giờ khi khẩn cấp). Không có người trực thì công cụ chỉ báo, không tự gỡ.
- Gỡ hàng loạt theo tài khoản (tất cả bài của một người); khôi phục khi cơ quan rút yêu cầu (hiện cần làm tay trong bàn kiểm duyệt).
- Báo cáo định kỳ/nộp văn bản trả lời cho cơ quan: làm tay.

## 3. Quy trình đề xuất khi nhận một yêu cầu
1. **Ghi nhận thời điểm nhận** (giờ trên email/văn bản). Đồng hồ tính từ lúc này, không phải lúc nhập vào sổ.
2. **Xác minh người gửi** là cơ quan có thẩm quyền (qua kênh chính thức); nghi ngờ thì ghi `needs_info` và hỏi lại, **nhưng đồng hồ vẫn chạy**.
3. **Tìm nội dung** (id bài/bình luận/kế hoạch/tài khoản) và ghi yêu cầu vào sổ.
4. **Gỡ trong thời hạn** (`execute`). Khẩn cấp (đe dọa an ninh quốc gia): 6 giờ.
5. **Phản hồi** cơ quan bằng văn bản (mẫu do luật sư soạn) kèm thời điểm đã gỡ.
6. **Lưu** văn bản gốc và phản hồi (bản sao nội dung đã tự lưu trong sổ).
7. Nếu yêu cầu không hợp lệ/không đủ căn cứ: `reject` kèm lý do, trả lời cơ quan.

## 5. Giao diện (đã làm 25/11/2026)
Trang **Quản trị → Kiểm duyệt** (`/admin/moderation`), phần "Yêu cầu gỡ bài của cơ quan chức năng" nằm dưới bàn duyệt báo cáo (chỉ hiện khi `MODERATION_ADMIN_ENABLED` bật):
- Ba ô đếm: đang mở / sắp quá hạn / quá hạn; danh sách theo hạn (gấp nhất lên đầu), mỗi yêu cầu có nhãn đồng hồ, "còn X giờ Y phút" hoặc "quá …", cơ quan, số công văn, nội dung.
- Nút **Gỡ ngay** (có bước xác nhận; với tài khoản ghi rõ là KHOÁ tài khoản), **Cần thêm thông tin** và **Từ chối** (bắt buộc ghi lý do). Chỉ vẽ nút khi người dùng có quyền; máy chủ kiểm lại từng thao tác.
- Tab **Lịch sử** là cả sổ (mọi trạng thái).
- Form **Ghi yêu cầu mới**: nguồn (cơ quan / khiếu nại người dùng, khiếu nại tự gán 48 giờ), thời hạn, cơ quan, số công văn, căn cứ, thời điểm Tappy nhận, loại nội dung, mã nội dung, ghi chú, tuỳ chọn "gỡ luôn khi ghi".
- Chữ tiếng Việt và tiếng Anh nằm ở `src/lib/i18n/admin/takedowns.ts`.

## 4. Cấu hình khi lên production
- `MODERATION_ADMIN_ENABLED=true` (đã có trong checklist deploy); `MODERATION_DIGEST_USER_IDS` = các tài khoản quản trị nhận cảnh báo (cần ít nhất 2 người, một dự phòng); `CRON_SECRET`.
- Áp migration `20261209_authority_takedowns.sql` (đã đăng ký trong `supabase/MIGRATION_ORDER.txt` và chính sách `apply-migration.sh`; bản gỡ ở `supabase/migrations/rollback/`).
- Kho dùng chung (`KV_REST_*`) và thông báo đẩy (VAPID) để cảnh báo đến nơi.
