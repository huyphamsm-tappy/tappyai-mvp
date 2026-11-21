# Hướng dẫn cài khóa — 4 việc, làm lần lượt (mỗi việc vài phút)

Em (Claude) đã mở sẵn 3 thẻ trong Chrome của anh: **OpenAI**, **Brevo**, **Vercel**. SePay làm sau cùng, sát ngày deploy.
Em không dán khóa thay anh được (quy tắc an toàn). Anh chỉ cần bấm theo từng bước dưới đây.

---

## Việc 1 — OpenAI: cho phép model kiểm duyệt (làm TRƯỚC, mở khóa clip và ảnh Messenger)

Thẻ Chrome đang ở sẵn trang này: **Cài đặt dự án, tab "Giới hạn"** của dự án **TappyAI**.

1. Nhìn mục **"Cách sử dụng mô hình"**, dòng **"Các mô hình được cho phép"**. Hiện chỉ có một model: `gpt-6-luna`.
2. Bấm nút **"Chọn mẫu"** (bên phải dòng đó, cạnh nút "Xóa").
3. Trong danh sách tìm `omni-moderation-latest` và tick chọn. (Giữ nguyên `gpt-6-luna`, đừng bỏ.)
4. Bấm lưu / xác nhận.
5. Nhắn em "OpenAI xong". Em kiểm tra lại và đăng lại clip của anh.

Lưu ý: Đừng bấm "Xóa" (nút bên cạnh), nó xóa danh sách model.
Mục "Chi tiêu" (hạn mức) anh đã đặt ở cấp tổ chức rồi nên không cần làm.

---

## Việc 2 — Brevo: tạo khóa gửi email thanh toán

Thẻ Chrome đang ở trang **Senders, Domains & Dedicated IPs**. Anh **đã có sẵn một địa chỉ gửi đã xác minh: `founder@tappyai.com`**, không cần tạo thêm.

1. Ở cột bên trái bấm **SMTP & API**, chọn tab **API keys & MCP**.
2. Bấm nút đen **+ Generate API key** (góc trên bên phải).
3. Đặt tên `tappyai-prod`, bấm tạo.
4. **Sao chép khóa ngay** (chỉ hiện một lần). Dán tạm vào Việc 3 (Vercel), đừng gửi cho em.
5. ⚠️ Trang có khung tím "Unauthorized IP addresses are not blocked". **ĐỪNG bấm "Activate for API keys"**. Bật cái này thì Vercel (IP thay đổi liên tục) sẽ bị chặn gửi mail.

Giá trị cho `PAYMENTS_MAIL_FROM` là **`founder@tappyai.com`** (chỉ địa chỉ email, không kèm tên).

---

## Việc 3 — Vercel: dán các biến vào Production

Thẻ Chrome đang ở trang **tappyai-mvp, Settings, Environment Variables**.

Với MỖI dòng dưới đây: bấm **Add Environment Variable**, nhập **Key** và **Value**, chỉ chọn môi trường **Production**, bấm **Save**.

| Key | Value lấy ở đâu |
|---|---|
| `BREVO_API_KEY` | khóa vừa sao chép ở Việc 2 |
| `PAYMENTS_MAIL_FROM` | `founder@tappyai.com` |
| `SEPAY_BANK_ACCOUNT` | số tài khoản BIDV liên kết trong SePay (menu **Ngân hàng** của SePay) |
| `SEPAY_BANK_CODE` | `BIDV` |
| `SEPAY_ACCOUNT_NAME` | `PHAM DOAN HUY` |
| `SEPAY_WEBHOOK_HMAC_SECRET` | chuỗi bí mật anh tự đặt ở Việc 4 (làm Việc 4 xong rồi mới thêm biến này) |
| `SUBSCRIPTIONS_ENABLED` | `true` |

Biến mới chỉ có hiệu lực ở lần deploy tiếp theo (lần deploy cuối của cả web). Không cần làm gì thêm.
`CRON_SECRET` đã có sẵn, không cần thêm.

---

## Việc 4 — SePay: tạo webhook (làm SÁT ngày deploy)

SePay chưa có webhook nào ("Webhooks 0").

1. Vào my.sepay.vn, cột trái chọn **Tích hợp WebHooks**.
2. Bấm **Tạo webhook đầu tiên**.
3. Địa chỉ nhận: `https://www.tappyai.com/api/payments/sepay`
4. Kiểu xác thực: chọn **HMAC-SHA256**. Đặt (hoặc sao chép) một chuỗi bí mật dài. **Dán đúng chuỗi đó vào biến `SEPAY_WEBHOOK_HMAC_SECRET` ở Việc 3.**
5. Bật gửi cho giao dịch **tiền vào**. Lưu.
6. (Nếu SePay có mục cấu trúc mã thanh toán) đặt tiền tố **`TAPPY`**, độ dài **6**. Không đặt cũng được, hệ thống vẫn tìm mã trong nội dung chuyển khoản.

Sau khi deploy, chuyển thử một khoản nhỏ qua trang thanh toán, rồi xem tab **Lịch sử gửi** của webhook trong SePay: phải thấy dòng thành công.

---

## Khi nào anh khỏe — việc nhỏ khác (không gấp)
- OpenAI: bật xác thực hai bước (Cài đặt, Bảo mật). Cần điện thoại để quét mã.
- Google Cloud: hạn chế khóa API (APIs & Services, Credentials, từng khóa: Application restrictions = Websites `www.tappyai.com`).
- Supabase Auth: bật CAPTCHA, anh bảo để sau khi có người dùng.
