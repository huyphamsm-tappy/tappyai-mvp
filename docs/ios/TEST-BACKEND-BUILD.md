# Bản iOS thử với web trên máy anh (backend=test)

Mục đích: xem **bộ não mới** (thẻ khẩn cấp, bảng so sánh, ảnh chủ thể, chỗ ở và món nên thử, giá khách sạn, khung đọc link…) trên iPhone, khi web mới **chưa** lên production. Các thứ đó nằm ở máy chủ web local; bản TestFlight thường (build 234) nói chuyện với production nên không hiện.

Cách làm: một bản TestFlight riêng, trỏ vào web trên máy anh qua một đường hầm Cloudflare. Bản này **không bao giờ** được nộp duyệt.

## An toàn (đã đưa vào workflow `ios.yml`)
- Mặc định của workflow vẫn là `production`. Chỉ khi anh chọn `backend = test` lúc bấm chạy thì mới khác.
- Chế độ `test` **chỉ nhận** địa chỉ đúng dạng `https://<tên>.trycloudflare.com`, không có tài khoản, cổng, đường dẫn đi kèm. Địa chỉ khác bị từ chối.
- Chế độ `test` đọc hai bí mật **riêng** (`TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`). Thiếu một cái là **dừng**, không bao giờ tự lấy khóa production.
- Trước khi build, workflow gọi `/api/config` của đường hầm; đường hầm tắt thì dừng, tránh ra một bản hỏng.
- Bản build ghi cảnh báo "TEST BACKEND BUILD" trong tóm tắt lần chạy.

## Việc của anh (em không nhập khóa hộ anh)
1. **Chạy web local** ở cổng 3000 bằng cấu hình UAT như mọi lần (cấu hình xem trước `wt-integration-uat-plans-3000`). Đây là web có bộ não mới.
2. **Mở đường hầm** (cần `cloudflared`; máy này chưa cài. Cài bằng `winget install Cloudflare.cloudflared`):
   `cloudflared tunnel --url http://localhost:3000`
   Nó in ra một địa chỉ dạng `https://xxxx-xxxx.trycloudflare.com`. Địa chỉ **đổi mỗi lần mở lại đường hầm**, và bản build ghi cứng địa chỉ đó.
3. **Thêm 2 bí mật** vào kho GitHub (Settings → Secrets and variables → Actions):
   - `TEST_SUPABASE_URL` = địa chỉ dự án Supabase **UAT** mà web local đang dùng
   - `TEST_SUPABASE_ANON_KEY` = khóa `anon` của dự án UAT đó (có trong tệp cấu hình của web local)
4. **Chạy bản thử:** GitHub → Actions → "iOS" → Run workflow →
   - Branch: `ios/consolidated-20261122`
   - backend: `test`
   - test_api_base_url: địa chỉ ở bước 2
5. Khi xong (khoảng 25 phút) sẽ có một build mới trong TestFlight, số **lớn hơn 234**. Cài và đăng nhập bằng tài khoản UAT.

## Lưu ý khi thử
- Phải **giữ máy bật, web local và đường hầm chạy** suốt lúc thử. Tắt đường hầm là app báo không tải được.
- Đăng nhập: dự án UAT có thể **chưa bật** Google/Apple/Zalo như production. Đăng nhập bằng email là chắc nhất.
- Hai bản (234 production và bản thử) cùng tên trong TestFlight. Phân biệt bằng **số build**: bản thử luôn lớn hơn.
- **Không gắn bản thử vào phiên bản 1.1.0 trong App Store Connect, không nộp duyệt.** Bản nộp là build 234 (hoặc bản production mới hơn).
