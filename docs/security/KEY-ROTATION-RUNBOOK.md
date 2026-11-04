# Sổ tay xoay khóa TappyAI

Mục đích: khi nghi một khóa bị lộ (hoặc định kỳ), xoay nó đúng thứ tự, không làm sập production, không để lộ giá trị trong chat hoặc log. Biên soạn 04/11/2026 theo audit bảo mật (D-10). Tên biến lấy từ mã nguồn; **giá trị không bao giờ được dán vào chat, commit hay ticket**.

## Nguyên tắc chung
1. **Thu hồi trước hay tạo mới trước?** Tạo khóa mới → đặt vào Vercel → redeploy → kiểm tra → mới thu hồi khóa cũ. Chỉ thu hồi ngay (trước khi có khóa mới) khi khóa đang bị lạm dụng thật; chấp nhận gián đoạn ngắn.
2. **Nơi đặt:** Vercel → dự án `tappyai-mvp` → Settings → Environment Variables (Production, đánh dấu Sensitive). Biến `NEXT_PUBLIC_*` phải build lại mới có hiệu lực; các biến khác cần redeploy.
3. **Sau khi đổi:** kiểm `/api/health`, một câu chat, và dòng log `tappyai_*` không có lỗi 401/403 từ nhà cung cấp.
4. **Ghi lại:** ngày xoay, ai xoay, lý do (không ghi giá trị) vào `docs/security/` hoặc sổ riêng của Owner.
5. Nghi lộ khóa → xem log nhà cung cấp trước (có lệnh gọi lạ không), rồi mới xoay.

## Bảng khóa

| Khóa (biến môi trường) | Dùng cho | Nơi tạo mới | Ảnh hưởng khi xoay | Ghi chú |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Máy chủ ghi CSDL bỏ qua RLS | Supabase → Project Settings → API | Cao: mọi route dùng admin client | Quyền mạnh nhất. Xoay JWT secret làm vô hiệu cả khóa anon: chỉ làm khi bắt buộc và cập nhật các app (anon key nằm trong APK/IPA) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Khóa công khai (web, Android, iOS) | Supabase → API | Rất cao: nằm trong app đã phát hành | Công khai theo thiết kế; bảo vệ bằng RLS. Chỉ xoay khi RLS từng sai |
| `OPENAI_API_KEY` | Luna (bộ não) | platform.openai.com → API keys | Trung bình | Đặt giới hạn chi tiêu ở nhà cung cấp |
| `ANTHROPIC_API_KEY` | Ghi chú Nghiên cứu sâu (cờ tắt), viết | console.anthropic.com | Thấp (cờ tắt) | |
| `SERPER_API_KEY` | Tìm web/ảnh/maps | serper.dev | Trung bình: tìm kiếm ngừng | Tài khoản có thể là gói free xoay vòng |
| `PARALLEL_API_KEY` | Tìm kiếm Parallel (cờ `CONSULT_PARALLEL`) | Parallel dashboard | Thấp | Có trần ngày 5 USD trong mã |
| `EXA_API_KEY` | Tìm kiếm Exa | Exa dashboard | Thấp | |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_WEB_RISK_API_KEY` | Địa điểm, kiểm link | Google Cloud → Credentials | Trung bình | Hạn chế theo API và IP/referrer |
| `CRON_SECRET` | Xác thực các cron Vercel | Tự sinh (chuỗi ngẫu nhiên dài) | Thấp | Đặt cùng lúc trên Vercel; cron tự dùng giá trị mới sau redeploy |
| `UPSTASH_REDIS_REST_TOKEN`, `KV_REST_API_TOKEN` | Kho giới hạn tốc độ và hạn mức | Upstash / Vercel Storage | Cao nếu sai: giới hạn đổi sang chế độ từng instance | Xoay xong phải kiểm log `tappyai_limiter_store_missing` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Thanh toán thẻ | Stripe → Developers | Cao | Đổi webhook secret đồng thời trong Stripe và Vercel |
| `APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_KEY_ID` | Xác minh giao dịch Apple | App Store Connect → Keys | Cao với đăng ký iOS | Khóa `.p8` chỉ tải được một lần |
| `ZALO_APP_SECRET` | Đăng nhập Zalo | Zalo developers | Trung bình: đăng nhập Zalo ngừng | |
| `GOOGLE_CLIENT_SECRET` | Đăng nhập Google (web) | Google Cloud → Credentials | Trung bình | Cập nhật cả trong Supabase Auth nếu dùng |
| `TAPPY_BUSINESS_SECRET` | Băm/ký phía Tappy Business | Tự sinh | Cao: đổi sẽ làm mã đã phát vô hiệu | Đọc `lib/business/secrets.ts` trước khi xoay |
| `CCP_ATTRIBUTION_SECRET` | Ký liên kết ghi nhận | Tự sinh | Trung bình: liên kết cũ hết hiệu lực | |
| `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push web | `web-push generate-vapid-keys` | Cao: mọi đăng ký push cũ phải đăng ký lại | Chỉ xoay khi bắt buộc |
| `INDEXNOW_KEY` | Báo công cụ tìm kiếm | Tự sinh | Thấp | |
| `TURNSTILE_SECRET_KEY` | Xác thực Turnstile (đơn hàng công khai) | Cloudflare → Turnstile → Rotate Secret Key | Thấp | Chỉ xoay được 2 giờ một lần; khóa cũ còn hiệu lực trong lúc đổi |
| Android: `gradle.properties` cá nhân (keystore, Supabase, Google client) | Ký và build app | Máy build của Owner | Rất cao với keystore | **Mất keystore = không cập nhật được app trên Google Play.** Sao lưu keystore ngoài máy, tách mật khẩu |
| GitHub secrets cho iOS (`APPSTORE_PROFILE_BASE64`, ...) | CI iOS | GitHub → Settings → Secrets | Trung bình | Tạo lại profile ở Apple Developer rồi cập nhật secret |

## Khi nghi lộ khóa (thứ tự việc)
1. Xác định khóa nào, lộ ở đâu (commit, log, ảnh chụp màn hình, chat).
2. Xem log nhà cung cấp 7 ngày gần nhất tìm lệnh gọi lạ.
3. Tạo khóa mới → Vercel → redeploy → kiểm tra (mục *Nguyên tắc chung* 3).
4. Thu hồi khóa cũ.
5. Nếu khóa từng nằm trong lịch sử git: xoay là đủ, không cần viết lại lịch sử; chạy quét bí mật toàn lịch sử (xem `SECURITY-AUDIT` mục D-11).
6. Ghi lại sự việc.

## Việc định kỳ đề nghị
- Mỗi 6 tháng: `CRON_SECRET`, `TAPPY_BUSINESS_SECRET` (nếu cho phép), khóa nhà cung cấp tìm kiếm.
- Mỗi năm: khóa Apple IAP, rà soát quyền trên Google Cloud, kiểm sao lưu keystore Android.
