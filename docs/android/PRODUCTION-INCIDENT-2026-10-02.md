# Sự cố 02/10/2026 — bản debug Android ghi nhẹ lên PRODUCTION

(Để Huy tham chiếu. Không chứa dữ liệu cá nhân.)

| | |
|---|---|
| **Khi nào** | Khoảng 01:19–01:22 (giờ máy, UTC+7) ngày 02/10/2026 |
| **Nguyên nhân** | Tệp cục bộ `C:\wtandroid\android\gradle.properties` (bị `.gitignore`, không nằm trong repo) đặt `TAPPYAI_API_BASE_URL_DEBUG=https://www.tappyai.com/`. Bản **debug** dựng từ đó trỏ vào production. Phiên Android chạy `adb shell monkey` (bộ gõ/chạm ngẫu nhiên) trên bản debug ở chế độ khách. |
| **Phía production nhận** | 1 × `POST /api/auth/anonymous` → 200 (tạo 1 phiên ẩn danh); 2 × `POST /api/reviews/<1 bài>/interact` → 200 (sự kiện xem clip, ẩn danh); 8 × `POST /api/reviews/<1 bài>/like` → 403 (bị từ chối, không ghi); 2 × `POST /api/chat` → 401 (bị từ chối, không ghi); cộng một số `GET` (feed, config, deals, recommendations…) — chỉ đọc |
| **Không xảy ra** | Không đăng nhập thật, không tài khoản người dùng thật, không dữ liệu cá nhân, không tạo bài/bình luận, không xoá |
| **Không hoàn tác được** | Phiên ẩn danh và 2 sự kiện xem vẫn nằm trong production (phiên Android không được ghi production nên không tự xoá). Tác động rất nhỏ: một dòng người dùng ẩn danh + 2 điểm xem |
| **Đã làm** | (1) Sửa cấu hình cục bộ về `http://10.0.2.2:3000/` (không tới được → debug chỉ để thử ngoại tuyến). (2) Thêm chốt chặn trong `android/app/build.gradle.kts` (cuối tệp): mọi tác vụ Gradle của biến thể **debug / staging / uat** BỊ TỪ CHỐI nếu `API_BASE_URL` của biến thể đó là `www.tappyai.com`, trừ khi có cờ rõ ràng `-PTAPPYAI_ALLOW_PROD_FOR_NON_RELEASE=true`. Biến thể release không bị chặn. Không đổi giá trị BuildConfig nào, không đổi đầu ra release. (3) Từ nay mọi kiểm thử trên UAT dùng bản `uat` (cố định `https://uat.tappyai.com/`), KHÔNG chạy bản debug ở `C:\wtandroid` |
| **Đã kiểm** | `--dry-run`: debug mặc định (`10.0.2.2`) chạy được; debug trỏ production → "Refusing to build/run a non-release variant against PRODUCTION…"; thêm cờ cho phép → chạy được; `uat` chạy được; `bundleRelease` với thuộc tính debug trỏ production → không bị chặn |
| **BuildConfig từng biến thể** (đọc từ tệp sinh ra) | debug: `API_BASE_URL=http://10.0.2.2:3000/` · staging: `https://staging.tappyai.example.com/` · uat: `https://uat.tappyai.com/` (WEB cũng uat) · release: `https://www.tappyai.com/`. Lưu ý: `WEB_APP_URL` của debug/staging mặc định là `https://www.tappyai.com` (chỉ dùng cho link chia sẻ, trang chính sách và WebView trò chơi — chỉ ĐỌC, không ghi) |

Bản phát hành (AAB `597698b`) KHÔNG bị ảnh hưởng: nó trỏ production có chủ đích và không được dựng từ thuộc tính debug.
