# Setup đăng nhập: Google / Facebook / SĐT / Email

Code đã xong (login + register page). Còn 2 việc cần làm trong **Supabase Dashboard** (project `fwznnobrdctuskgrvuik`) vì cần credentials từ Facebook/nhà cung cấp SMS.

---

## 1. Facebook Login

### a. Tạo Facebook App
1. Vào https://developers.facebook.com/apps → **Create App** → loại "Consumer" hoặc "Business"
2. Vào app vừa tạo → **Add Product → Facebook Login → Set up**
3. Trong **Facebook Login → Settings**, thêm **Valid OAuth Redirect URI**:
   ```
   https://fwznnobrdctuskgrvuik.supabase.co/auth/v1/callback
   ```
4. Vào **Settings → Basic**, copy **App ID** và **App Secret**

### b. Cấu hình trong Supabase
1. Vào **Authentication → Providers → Facebook**
2. Bật **Enable Sign in with Facebook**
3. Paste **App ID** và **App Secret** từ bước trên → Save

### c. Khi app lên production
- Facebook App cần ở chế độ **Live** (không phải Development) để user bất kỳ đăng nhập được, không chỉ admin/tester.

---

## 2. Đăng nhập bằng số điện thoại (OTP SMS)

Supabase cần một **SMS provider** để gửi mã OTP. Phổ biến nhất: **Twilio**.

### a. Tạo Twilio account
1. Vào https://www.twilio.com → tạo account (có free trial credit)
2. Lấy: **Account SID**, **Auth Token**, và mua/đăng ký 1 **Messaging Service SID** (hoặc số điện thoại gửi SMS)
3. Lưu ý: free trial chỉ gửi được tới số đã verify trong Twilio. Để gửi cho mọi user thật cần nạp tiền/verify account.

### b. Cấu hình trong Supabase
1. Vào **Authentication → Providers → Phone**
2. Bật **Enable Phone provider**
3. Chọn SMS provider = **Twilio**, điền:
   - Account SID
   - Auth Token
   - Messaging Service SID (hoặc Sender)
4. Save

### c. Lưu ý
- OTP mặc định hết hạn sau 60s–60 phút (tùy config), có thể chỉnh ở **Authentication → Settings**
- Có thể dùng nhà cung cấp khác (Vonage, MessageBird, hoặc tự host) nếu không muốn dùng Twilio

---

## 3. Email/Password (Tạo tài khoản)

Đã hoạt động sẵn — không cần config thêm. Mặc định Supabase yêu cầu **xác nhận email** trước khi login được.

- Nếu muốn user vào app ngay sau khi đăng ký (bỏ qua xác nhận email): vào **Authentication → Providers → Email** → tắt **Confirm email**
- Nếu giữ xác nhận email: kiểm tra **Authentication → URL Configuration → Redirect URLs** đã có `https://tappyai-mvp.vercel.app/**` (đã setup từ trước cho Google)

---

## Tóm tắt code đã thêm

- `src/app/login/page.tsx` — đăng nhập: Google, Facebook, SĐT (OTP), Email/password
- `src/app/register/page.tsx` — tạo tài khoản bằng Email/password
- `middleware.ts` — redirect user đã login khỏi `/login` và `/register`
- `supabase-schema.sql` — thêm cột `phone` vào bảng `profiles`, cập nhật trigger `handle_new_user`

**Sau khi cấu hình Facebook/SMS xong**, chạy lại `supabase-schema.sql` trong SQL Editor để áp dụng thay đổi cột `phone`.
