# Kế hoạch ngày mai (22/11/2026): anh thử UAT, nếu ổn thì làm SePay

Bản web đã đóng băng (tag `web-freeze-20261121`). Việc ngày mai gồm hai phần. Phần 2 chỉ làm khi anh thấy phần 1 ổn.

## Phần 1 — Anh thử trên UAT (khoảng 30–45 phút)
### Chuẩn bị (em làm sẵn, hoặc anh chạy 2 lệnh)
1. Máy chủ UAT chạy ở `http://localhost:3000` (cấu hình xem trước `wt-integration-uat-plans-3000`). Nếu đã tắt, nhờ em "bật UAT" hoặc mở lại cấu hình đó trong ứng dụng.
2. Tạo link đăng nhập một lần (hết hạn sau khoảng 1 giờ, chỉ dùng được 1 lần — làm ngay trước khi mở):
```powershell
node D:\TappyAI-review-artifacts\uat-tools\make-login-link.mjs --list
node D:\TappyAI-review-artifacts\uat-tools\make-login-link.mjs 5
```
Số `5` là tài khoản số 5 trong danh sách (đăng nhập gần nhất 17/11). Link cũng được ghi vào `D:\TappyAI-review-artifacts\uat-tools\last-link.txt`. Dán link vào trình duyệt muốn đăng nhập.
3. Muốn thử nhắn tin/bình luận giữa hai người: mở hai trình duyệt khác nhau (hoặc một cửa sổ ẩn danh) và tạo link cho hai số khác nhau; hai tài khoản phải theo dõi nhau mới nhắn được.

### Danh sách thử (đánh dấu ✔ khi thấy ổn)
- [ ] Trang chủ: không còn tiêu đề/nút "Hỏi Tappy" ở đầu; 5 thẻ "Hỏi Tappy thử" có ảnh đúng nội dung; "Công cụ" có 3 thẻ (Cảnh báo lừa đảo, Chia bill, Nhóm ăn); banner tải ứng dụng + chân trang (logo "Tappy" trắng "AI" xanh, 2 mã QR, 4 mạng xã hội).
- [ ] Chat: hỏi một câu đơn giản, một câu cần tìm web, một nghiên cứu sâu (menu "+").
- [ ] Khám phá: mở bài bất kỳ (ảnh/chữ) thấy đúng khung Khám phá; clip YouTube bấm một lần có tiếng không bị dừng.
- [ ] Clip tự đăng: Đăng bài → Video → "Đồng ý và tiếp tục" bấm được → chờ "Sẵn sàng đăng" (phát lại trên máy này sẽ báo không phát được: bình thường, chỉ chạy trên tên miền thật).
- [ ] Nhắn tin, bình luận, ẩn bình luận (chủ bài), báo cáo, chặn rồi Bỏ chặn ở hồ sơ.
- [ ] Thông báo ở Hộp thư: theo dõi, bình luận, thích, tin nhắn, "bạn bè đăng bài".
- [ ] Scam Shield: dán một link lạ; góc trên phải hiện tên anh (không còn "Khách").
- [ ] Deal: logo Vexere, Agoda, Lazada.
- [ ] Nhóm ăn: tạo nhóm, sao chép link.
- [ ] Gói: trang Nâng cấp hiển thị giá (đang dùng tài khoản ngân hàng giả của UAT).
Ghi lại chỗ nào lệch rồi nhắn em: em sửa trước khi lên production.

## Phần 2 — SePay (làm sau khi Phần 1 ổn)
SePay cần một địa chỉ công khai để gửi tin báo khi có tiền vào, nên **chỉ thử được thật trên production** (UAT localhost không nhận được). Vì vậy "làm SePay" nghĩa là đưa bản web lên production rồi nối webhook. Thứ tự, em đánh dấu ai làm:

| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 1 | Sao lưu cơ sở dữ liệu production | Em (sau câu "Thêm quyền cho em") | Chưa sao lưu thì không áp migration |
| 2 | Đọc trạng thái migration production (chỉ đọc), áp các bản còn thiếu theo `supabase/MIGRATION_ORDER.txt` | Em | Từng tệp, có tệp gỡ; cần câu "Thêm quyền cho em" |
| 3 | Thêm biến môi trường Vercel (Production): `SUBSCRIPTIONS_ENABLED=true`, `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_CODE=BIDV`, `SEPAY_ACCOUNT_NAME=PHAM DOAN HUY`, `SEPAY_WEBHOOK_HMAC_SECRET`, `BREVO_API_KEY`, `PAYMENTS_MAIL_FROM=founder@tappyai.com`, `CRON_SECRET`, khóa VAPID | Anh (em cầm tay từng cú bấm; em không nhập khóa vào ô hộ anh) | Chuỗi bí mật webhook đã tạo sẵn ở `D:\TappyAI-review-artifacts\secrets\sepay-webhook-secret.txt` (em không in ra; anh mở tệp, sao chép; dùng CÙNG chuỗi này ở Vercel và ở SePay). Số tài khoản BIDV anh tự nhập |
| 4 | Rà bảo mật lần cuối + build thật trên đúng commit | Em | `/code-review` và `next build` |
| 5 | Đẩy nhánh, mở PR vào `main` | Em, **cần anh đồng ý đẩy** | `main` được bảo vệ: cần PR + 4 kiểm tra CI |
| 6 | Anh bấm gộp PR, Vercel tự deploy | Anh | Lần deploy đầu để TẮT cờ clip (`EXPLORE_VIDEO_PIPELINE_ENABLED` chưa đặt) |
| 7 | Tạo webhook ở SePay: menu **Tích hợp WebHooks** → địa chỉ `https://www.tappyai.com/api/payments/sepay`, kiểu xác thực **HMAC-SHA256**, chuỗi bí mật = chuỗi ở bước 3. Cấu hình mã thanh toán: tiền tố `TAPPY`, 6 ký tự | Anh (em hướng dẫn từng bước) | Nếu SePay hỏi "dùng API key" thì chọn HMAC |
| 8 | Thử thật: tạo đơn gói rẻ nhất (MoMo 25.000đ, mỗi tài khoản chỉ mua được một lần), chuyển khoản đúng số tiền và đúng nội dung, xem SePay tab "Lịch sử gửi" báo thành công, gói được cấp, có thư xác nhận | Anh chuyển; em kiểm | **Đây là tiền thật và gói này không hoàn tiền** (chính sách). Chuyển từ tài khoản của anh vào tài khoản của anh |
| 9 | Kiểm nhanh sau deploy (đăng nhập Google/Zalo/email, chat, Deal, báo cáo) | Anh + em | Danh sách ở `DANH-SACH-VIEC-TRUOC-DEPLOY-20261121.md` giai đoạn 5 |
| 10 | Có sự cố: bỏ `SUBSCRIPTIONS_ENABLED` để tắt bán gói; hoặc Vercel → Deployments → bản trước → Promote | Em/anh | Gói đã cấp không bị ảnh hưởng |

### Điều kiện trước khi bắt đầu Phần 2 (em cần từ anh tối nay hoặc sáng mai)
- Anh đã thử Phần 1 và nói "ổn" hoặc đưa danh sách lỗi.
- Anh nói rõ: có dùng bản web hiện tại để deploy không, hay chờ iOS xong.
- Các việc chỉ anh làm được còn mở: đăng ký địa chỉ callback Zalo `https://www.tappyai.com/api/auth/zalo/callback`; xác nhận chứng chỉ `media.tappyai.com` đã ACTIVE (em kiểm chỉ đọc); biến môi trường ở bước 3.
- Không bắt buộc cho SePay nhưng nên xong trước khi bật clip: khóa API Accesstrade (deal giảm giá), link LinkedIn.

## Nếu ngày mai chỉ làm được Phần 1
Không sao: Phần 2 dời sang hôm sau. Bản web đã đóng băng nên không có gì thay đổi; mọi lỗi anh tìm ra em sửa trên nhánh rồi đóng băng lại bằng tag mới (`web-freeze-<ngày>`).
