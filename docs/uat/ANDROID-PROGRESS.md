# Android parity — nhật ký tiến độ

Làm ở `C:\wtandroid`, nhánh `android/parity-2026-09-28-step1`, push lên `rc/web-uat`.
Chỉ sửa `android/` và `docs/uat/`. Liên lạc với phiên web qua `ANDROID-REQUESTS.md`
(phiên web đã ghi `STOPPED android/ @ 6e392d2`).

## Chạy lại toàn bộ e2e — MỘT lệnh

```bash
node android/e2e/run.mjs
```

- Chỉ chạy một số flow: `node android/e2e/run.mjs chat nav-back`.
- Chỉ một nền tảng: đặt `E2E_ONLY=android` hoặc `E2E_ONLY=web`.

Cần có trước khi chạy:
- APK uat đã build (`gradlew :app:assembleUat`).
- Emulator ở `E2E_SERIAL` (mặc định `emulator-5556`, AVD `Pixel_8`).
- Hai file ngoài repo: `D:/TappyAI-backups/uat-e2e.env` và `D:/TappyAI-backups/vercel-bypass.txt`.

Script tự làm những việc sau:
1. Seed tài khoản.
2. Đọc SHA đang chạy trên UAT (`/api/version`).
3. Cài APK và bật dark mode.
4. Chạy từng flow trên **Android** (adb + UI Automator dump; mỗi bước chụp ảnh, cả flow quay video) và trên **web** (Playwright 412×915, tối, vi-VN; mỗi bước chụp ảnh, có video webm).

Kết quả nằm ở `android/e2e/out/<run>/`: `results.json` và `summary.md` (bị gitignore).

Sau mỗi lượt chạy: `node android/e2e/scripts/evidence.mjs [run]`
- Tạo ảnh ghép web | Android | D:/redesign theo từng bước, cùng `RESULT.md` (có SHA UAT), trong `docs/uat/evidence/android-parity/<flow>/`.
- Video và ảnh gốc được chép **ngoài git** (vì dung lượng) sang `D:/TappyAI-backups/android-parity-evidence/<run>/`.

## Tài khoản test — chỉ trên DB audit `zdaprdfgpbpnxyofagmc`

`node android/e2e/seed/seed-accounts.mjs` (lệnh e2e cũng tự gọi):
- Từ chối chạy nếu `uat-e2e.env` không trỏ tới project audit, hoặc service key thuộc project khác.
- Tạo qua Supabase Admin API, email đã xác nhận, mật khẩu ngẫu nhiên 24 ký tự.
- Mật khẩu lưu ở `D:/TappyAI-backups/uat-test-accounts.txt` (ngoài repo) và không bao giờ bị in ra.

| Vai trò | Email | Dữ liệu |
|---|---|---|
| Pro (chính chủ) | `e2e.android.pro@example.com` | Gói `pro/active`, 18+. Có 2 bài đã đăng, 1 bài bị hạn chế (`publication_state=RESTRICTED`), 1 bài đã ẩn, 2 lượt đã chia sẻ, 2 bài đã lưu. Đang theo dõi "Người khác". |
| Free | `e2e.android.free@example.com` | 18+, không có gói. Dùng cho upload avatar/ảnh bìa. |
| Người khác | `e2e.android.other@example.com` | 3 bài công khai (2 ảnh, 1 clip), 1 bài chia sẻ không gắn địa điểm ("Chia sẻ", link YouTube), 1 bài ẩn (người xem không được thấy). |
| Chưa khai tuổi | `e2e.android.nodob@example.com` | Không có ngày sinh → kiểm cổng 18+. |

Mỗi lần seed, các bài `[E2E]` (`place_id e2e_*`), lượt chia sẻ, lượt lưu và theo dõi của các tài khoản này đều được dựng lại. Không đụng tài khoản có sẵn (quy tắc R11).

**Đăng nhập, không ai gõ mật khẩu hay token:**
- Web: script tạo session trong code (password grant với mật khẩu lấy từ file ngoài repo), rồi ghi cookie `sb-<ref>-auth-token` — đúng cookie mà `@supabase/ssr` của web tự ghi.
- Android (chỉ bản uat): `UatTestHookActivity` nằm trong `src/uat`.
  - Session được ghi vào bộ nhớ **riêng** của app bằng `adb shell run-as`. Việc này chỉ làm được vì bản uat là debuggable.
  - Hook nạp session qua đúng đường `auth-callback` mà Zalo/OAuth dùng, rồi xoá file ngay.
  - Hook cũng đưa chữ tiếng Việt vào clipboard, vì `input text` không gõ được tiếng Việt.

Bằng chứng bản release **không** chứa hook và secret:
- `UatTestHookOnlyInUatTest` và `ReleaseCarriesNoUatSecretTest` (chạy ở debug/release/uat).
- `node android/e2e/scripts/verify-release-clean.mjs` kiểm trên **build output**: manifest release đã merge không có hook, BuildConfig release có `VERCEL_BYPASS_SECRET=""` và không trỏ tới uat. Kết quả 7/7 PASS.

## Mốc

| Commit | Việc | e2e |
|---|---|---|
| aebbf43 / b3ea273 | Mở kênh liên lạc; phiên web báo STOPPED android/ | — |
| 767e199 | Bước 1: bảng, sơ đồ, 16 chỗ lệch, ảnh hiện trạng | — |
| 4044b41 | Build type `uat` | — |
| a4f72e5 | 9 test chia sẻ lấy origin theo bản build | — |
| d926617 / 66e8bba | Đăng nhập = web; hub Tôi = web/mockup | (sẽ có flow login) |
| 865b2a2 | Hạ tầng e2e + tài khoản test + hook uat | — |
| e870b3b | L10 tab Chia sẻ khi xem hồ sơ người khác · L16 Deals · cờ SHOW_PUBLIC_SHARE | profile-visitor ✅✅ · deals ✅✅ |
| b6c0db0 | Ảnh bìa + tab hub = web (bỏ "Đã thích") | profile-owner ✅✅ · profile-media ✅✅ |

(✅✅ nghĩa là Android và web cùng PASS.)

## (c) Back "lạc / thoát app" — KẾT LUẬN: lỗi script, không phải lỗi app

Log bước 1 ghi "lạc sau lần Back đầu". Khi tái hiện:
- Chữ "Xem tất cả" trên Home khớp nhầm phần tử khác (mở Chat thay vì Công cụ).
- Script bấm Back thêm một lần ở Trang chủ nên app thoát. Đây là quy ước Android cho tab khởi đầu.

Flow `nav-back` (11/11 PASS trên Android):
- Back từ gốc của Chat / Khám phá / Deals / Tôi → về Trang chủ.
- Back từ Cài đặt / Đã lưu / Lịch sử chat → về Tôi.
- Back từ Viết caption / Gợi ý → về Trang chủ.
- Back từ hồ sơ tác giả → về Khám phá.
- Chỉ Back ở Trang chủ mới rời app.

## §ANR — hộp "TappyAI UAT isn't responding" trên emulator

Hộp này thỉnh thoảng hiện ở khung hình đầu sau khi cài (emulator dùng GPU phần mềm `swiftshader`, bản uat debuggable chưa biên dịch AOT).
- Stack main thread đọc từ `dumpsys dropbox data_app_anr`: đang vẽ chữ (`Layout.draw` ← Compose `TextStringSimpleNode.draw`), trạng thái Runnable, không chờ I/O hay khoá.
- Tôi xếp đây là do emulator chậm, **không đoán thêm**. Cần kiểm lại trên máy thật (có trong danh sách test máy thật).

## Việc tiếp theo

- L4 cổng 18+ theo mockup + L5 "Gợi ý cho bạn" hỏi 18+.
- L7 Đã lưu · L8 Viết content · L6 onboarding.
- L9 composer (ảnh / video / YouTube).
- Chat 11 câu · chia sẻ (intent tới Zalo/FB/TikTok qua app stub) · đăng nhập e2e.
- L11 Cài đặt · L17 quiz chat · screenshot test · rà các commit android/ của phiên web.
