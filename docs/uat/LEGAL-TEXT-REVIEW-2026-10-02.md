# Chữ pháp lý /privacy, /terms, /delete-account — đối chiếu và sửa (02/10/2026)

**CHỈ CHỮ** (không đổi tính năng). **Nhờ người am hiểu luật Việt Nam xem lại tất cả các trang này trước khi coi là bản cuối** — kể cả thời hạn lưu, việc gỡ nội dung theo yêu cầu của cơ quan chức năng, và việc giữ mã băm email của tài khoản bị khoá. Các trang KHÔNG nêu tuyên bố pháp lý cụ thể (không trích nghị định, luật nào); có test chặn việc đó (`src/lib/i18n/legalCopy.test.ts`).

## Trang đổi chữ (Huy chỉ đọc lại những trang này)
1. `/privacy` (vi + en)
2. `/terms` (vi + en)
3. `/delete-account` (vi + en) — bản khi cờ xoá tài khoản BẬT (bản «gửi yêu cầu qua email» khi cờ tắt không đổi)
(`/community-guidelines` đã có từ trước và vẫn chờ Huy duyệt chữ.)

## Đã đối chiếu với mã và app thật — những chỗ lệch đã sửa
| Lệch | Thực tế (nguồn trong mã) | Sửa |
|---|---|---|
| /privacy nói xoá tài khoản bằng «liên hệ hỗ trợ» | Xoá NGAY trong app (Cài đặt → Xóa tài khoản) và trên web `/delete-account` (cờ `ACCOUNT_SELF_DELETE_ENABLED` bật trong release) | Mục «Quyền của bạn» viết lại: xoá ngay, nêu trang `/delete-account` |
| Chỉ nói đăng nhập Google/Zalo | Đăng nhập: Google, Zalo, email + mật khẩu (`AUTH_PROVIDERS`), Apple trên iPhone | Nêu đủ; Zalo thu tên + ảnh đại diện |
| Ảnh gửi tới OpenAI chưa nói | Mọi vai trò mô hình chạy trên OpenAI (Luna); chat nhận ảnh, Scan dùng `vision`; Dịch / Viết content / kiểm tra lừa đảo gửi chữ | Mục OpenAI nêu ảnh (trợ lý, Scan) và chữ (Dịch, Viết content, kiểm tra lừa đảo) |
| Còn nhắc Stripe, «gói trả phí» | Gói trả phí chưa bán ở release | Bỏ Stripe khỏi /privacy; bỏ đoạn gói trả phí và «hồ sơ thanh toán» khỏi /delete-account; thay bằng Apple (đăng nhập iPhone) |
| Không có mục báo cáo / chặn / kiểm duyệt / kháng nghị | Có (migration 20261001…; web: API + `/profile/notices`; app: nút theo cờ `p8.*`) | Thêm dữ liệu thu «báo cáo, chặn, kiểm duyệt»; mục mới «6. Báo cáo, chặn và kiểm duyệt» (link `tappyai.com/community-guidelines`, kháng nghị một lần trong 30 ngày qua `tappyai.com/profile/notices` hoặc support@tappyai.com, người bị báo không biết ai báo) |
| Chưa nói mã thông báo thiết bị, độ tuổi rõ | Token FCM / đăng ký push; cổng 18+ | Thêm mục dữ liệu «mã thông báo»; nhấn 18+ ở /privacy và /terms |
| Không có thời hạn lưu | Chỉ có số THẬT trong mã/cấu hình: nhật ký bảo mật quản trị 12 tháng (IP/trình duyệt 90 ngày) — `audit-retention`; bản ghi bấm link đối tác 12 tháng; trạng thái tư vấn ≤ 30 ngày (Upstash) | Đoạn «Thời hạn lưu» chỉ nêu đúng các số đó; báo cáo/kiểm duyệt «giữ để an toàn và tuân thủ, không gắn tài khoản»; KHÔNG bịa số khác |
| Người bị khoá vĩnh viễn | Mã băm email giữ lại (migration 20261001e), không giữ gì khác | Nêu ở /privacy (mục lưu trữ) và /delete-account (mục «Còn lại nhưng không gắn với bạn»); **thời hạn lưu mã băm chưa nêu — chờ luật** |
| /terms không nhắc quy tắc cộng đồng | Có trang `/community-guidelines` | Thêm đoạn 4b + link bấm được; thêm 18+ và Apple/email ở mục «Tài khoản» |
| Scam Shield không được mô tả | Link → dịch vụ kiểm tra (có thể gồm Google Web Risk); tin có chữ → OpenAI (trừ khi chỉ là link); ảnh chụp tin → OpenAI; QR giải mã trên máy; không lưu tin/ảnh/số kẻ lừa đảo; lịch sử trên máy | Đoạn mới trong mục «Dịch vụ bên thứ ba» |

## Chưa nêu / cố ý để trống
- Thời hạn lưu của: lịch sử chat, bộ nhớ AI, bản ghi sử dụng (không có số trong mã/cấu hình) — trang nói «giữ trong khi tài khoản còn và xoá khi bạn xoá tài khoản».
- Mã băm của người bị khoá: thời hạn chờ luật.
- Gói trả phí: khi bán, phải thêm nhà xử lý thanh toán và điều khoản gói (backlog PL-COPY-PREMIUM).
