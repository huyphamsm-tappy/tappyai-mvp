# Android — báo cáo cuối 03/10/2026 (trước Huy UAT)

Phạm vi: chỉ Android. Web là nguồn chuẩn `56a26aeb72d3ae1dacb484885df04e6976d5d84e` (= UAT `/api/version` = `origin/rc/web-uat`). AI Consultative: **UNTOUCHED** (`git diff --name-only 597698b..HEAD -- android/app/src/main/java/com/tappyai/app/chat` → 0 tệp). Không sửa Web/iOS (mọi tệp đổi nằm trong `android/` và `docs/`).

## DONE
- Lá chắn lừa đảo theo Web: tin nhắn qua `POST /api/scam-shield/analyze` (verdict/scenario/advice của server, không AI), link + QR-có-link (`verdict`, `reason_vi`, nút chia sẻ `POST /api/scam-shield/share`), QR không phải link (giải mã tại máy, phân loại `payload.ts`, Wi-Fi hiện như đã đọc), chữ chép từ Web (59 dòng + 90 khóa), lỗi theo mã, tiêu đề giới thiệu «Kiểm tra kỹ».
- Báo cáo bình luận / người dùng đúng 2 route riêng (không còn `/api/reports`); «Chặn người dùng» có ở menu bài trong Chi tiết khi `p8.userBlocks`.
- Giao diện tối mặc định (từ trước).
- E2E ổn định hơn: không còn chọn “ảnh mới nhất” để ĐĂNG; không cài app giả đè app thật (Zalo/TikTok/Messenger) trên máy thật; xoá dữ liệu app trước các luồng báo cáo/chặn; bỏ chặn bằng đúng API khi dọn; cuộn hai chiều ngắn; thử lại `adb install`.
- Test (commit `101a359`, lệnh `./gradlew testDebugUnitTest testReleaseUnitTest :app:testUatUnitTest --rerun-tasks`): Debug 1063/1063, Release 1063/1063, UAT 1063/1063, 0 lỗi, 0 bỏ qua.

## AAB (ứng viên phát hành duy nhất)
- Commit `101a3597c40937c487a837f03ad1ac4d54dc4b4f`, versionCode 11 / versionName 1.0.0
- `D:\TappyAI-backups\TappyAI-release-vc11-101a359.aab` — 26.278.324 byte
- SHA-256 `451b703501d233082d54a31979ecf51b3934d2dc5a57e91a8aba329dccbf59a2`
- Chữ ký: `jarsigner` “jar verified”; chứng chỉ upload `02:5B:35:4D:1C:37:7B:DC:F3:D6:49:4A:71:8E:6B:2D:A4:56:2F:73:2B:CE:0A:42:11:9C:9B:09:37:74:5C:C7` (phải bằng “Upload key certificate” ở Play Console — Huy so)
- BuildConfig: API `https://www.tappyai.com/`, WEB `https://www.tappyai.com`, DEBUG=false, bypass secret rỗng, Supabase production
- Quyền: 12, GIỐNG hệt bản `597698b`, không CAMERA
- Quét: 0 chuỗi `uat.tappyai.com`, 0 `com.tappyai.app.staging`, 0 localhost/10.0.2.2, 0 khoá riêng/service/OpenAI/Anthropic/AWS/ACCESSTRADE/ZALO; chỉ còn khoá công khai (JWT anon Supabase, khoá Firebase `AIza…`) và TÊN header bypass
- Thay thế `1b12a7c` và `597698b` — KHÔNG dùng nữa. APK UAT tương ứng: `TappyAI-UAT-101a359.apk` SHA-256 `c928f3916bf2e9ea7b6213d7d266475870546d8464c64aabbd5726b80dfaf66c` (cùng mã nguồn app với AAB: 0 tệp `android/app/src` khác từ `be15031` tới `101a359`)

## REAL DEVICE — Samsung A12s (R58RC0V30BH), Android 11, APK UAT
| Flow | Kết quả | Evidence |
|---|---|---|
| Lá chắn — tin nhắn (bình thường / phạt nguội / Trung thu / link giả) | PASS 16/16 | `e2e/out/phone-scam8c.log`, ảnh `out/2026-10-03T04-10-07/...` |
| Lá chắn — link (QR link giả: thẻ link + lý do tiếng Việt + nút chia sẻ hiện) | PASS | `phone-scam8d.log` |
| QR chữ / thanh toán / Wi-Fi | PASS | `phone-scam8d.log` |
| Huỷ chọn ảnh QR | PASS 2/2 | `phone-scam8e.log` |
| Báo cáo bài (+ mất mạng, hàng `content_reports`) | PASS 17/17 | `phone-safety5.log` |
| Chặn người dùng + báo cáo người dùng (hàng `user_blocks`, `user_reports`) | PASS 9/9 | `phone-blockuser3.log` |
| Báo cáo bình luận (hàng `user_reports` comment) | PASS 7/7 | `phone-reportcomment5.log` |
| Hộp “Quy tắc cộng đồng” lần đăng đầu | PASS (kiểm 1 của composer) | `out/2026-10-02T12-17-45/composer/android/02-community-rules.png` — ⚠ artifact bị nhiễm, xem dưới |
| Chat — thẻ hỏi theo mảng (ăn uống, mua sắm, bay/du lịch); “Bay từ đâu?” | PASS (hiển thị đúng); điều kiện “3 câu + nút Tìm cho tôi” = BLOCKED (thẻ cao hơn màn nhỏ) | `phone-chatA/C.log`, ảnh `05-21-50`, `05-38-54` |
| Chat — kính cường lực | PASS | `phone-chatB.log`, ảnh `05-31-39` |
| Chat — phim 5 link rạp | PASS | `phone-chatB.log`, ảnh `05-31-39/04-phim-chip-streaming.png` |
| nav-back | PASS 11/11 (bản `401a3e6`, mã không đổi vùng điều hướng) | `phone-nav2.log` |
| Đăng ảnh | BLOCKED — bộ chọn ảnh Samsung không chọn được xác định; lần chạy trước đã đăng NHẦM ảnh chụp màn hình của máy (xem dưới) | — |
| Đăng clip | BLOCKED (cùng lý do) | — |
| Chia sẻ (Zalo/TikTok/Messenger) | BLOCKED — REAL ZALO PACKAGE CONFLICT (app giả dùng cùng mã gói với Zalo thật; không cài) | `adb install` → `INSTALL_FAILED_VERSION_DOWNGRADE` |
| Đăng nhập Google / Zalo | BLOCKED — cần tài khoản thật | — |

## ⚠ Dữ liệu UAT bị nhiễm (chưa xoá, chờ Huy)
Lần chạy `composer` ngày 02/10 trên máy thật đã chọn ảnh mới nhất = một ảnh chụp màn hình có sẵn trong máy (ảnh app, không thấy thông tin cá nhân) và đăng thành bài `[E2E] ảnh từ Android …` của tài khoản `e2e.android.pro` (DB audit UAT). Đã: bỏ cách chọn đó khỏi luồng đăng bài; xoá hai tệp mẫu khỏi thư viện máy; đánh dấu thư mục `android/e2e/out/2026-10-02T12-17-45/CONTAMINATED.txt`. **Không dùng thư mục đó làm evidence sạch.** Cần Huy dọn bài (và ảnh trong kho UAT) nếu muốn.

## Sự cố hạ tầng — Android Emulator (03/10, không phải lỗi app)
- Triệu chứng: “Android Emulator closed unexpectedly” khi khởi động giả lập có cửa sổ (cả `swiftshader_indirect` và `angle_indirect`).
- Log (`/tmp/emu2.log`, `/tmp/emu3.log`): `Critical: Failed to load opengl32sw (The specified module could not be found.)` → `Showing crashdialog`. Bản cài emulator `36.6.11.0` (cài 09/07/2026) KHÔNG có `opengl32sw.dll` (tìm trong thư mục emulator: 0 tệp) → phần giao diện Qt của emulator sập.
- Dump trong `%LOCALAPPDATA%\Temp\AndroidEmulator\emu-crash-36.6.11.db\reports\` chỉ có 1 tệp 02/10 17:40 (exception `0xC0000005` — lần sập trước, khác phiên); lần sập này chưa ghi dump (hộp thoại chờ đồng ý).
- Khắc phục môi trường: chạy `-no-window` (không dùng Qt UI) → boot 45 s, ổn định (adb phản hồi sau 60 s).
- Hệ quả test: trên giả lập headless, `composer` dừng ở BƯỚC ĐĂNG NHẬP (bộ test) cả 2 lần, **trước mọi kiểm tra** → **BLOCKED — emulator infrastructure, không phải FAIL**. Không có kết luận nào về app từ lần này.

## BLOCKED (cần bên ngoài / Huy)
| Mục | Lý do | Ai |
|---|---|---|
| Cờ production (`P8_*`, `USER_BLOCKS_ENABLED`, `REPORTS_ENABLED`) | không có bằng chứng; `RELEASE-PROGRESS.md`: “Production: Huy quyết ở PHẦN B”; 5 migration chưa áp lên production | Huy / phiên Web |
| Google OAuth | không có bằng chứng client đã sửa (SHA khoá ký ghi ở `PLAY-CONSOLE-PASTE.md` A01/G) | Huy / phiên GCP |
| Chữ pháp lý Lá chắn | web ghi còn chờ người am hiểu luật VN (`SCAMSHIELD-WORDING-FOR-REVIEW.md`) | Huy |
| Quyết định kiểm tin nhắn qua server (theo Web) thay vì trên máy | Huy trước đó chỉ định trên máy; Android đã theo Web | Huy xác nhận |
| Đăng ảnh/clip, chia sẻ, đăng nhập Zalo/Google | xem bảng máy thật | Huy bấm tay |
| Bộ chọn ảnh Samsung / giả lập headless đăng nhập | hạ tầng test | Android (sau UAT) |

## BẢNG PHÁT HÀNH
| Item | Status | Evidence |
|---|---|---|
| Web parity | PASS (các mục đã đối chiếu) / BLOCKED (bố cục bảng chia sẻ web `ShareMenu`) | `WEB-PARITY-EVIDENCE-2026-10-02.md` |
| Scam Shield | PASS | test + máy thật 16/16 |
| QR | PASS | test + máy thật |
| Report | PASS (bài, người dùng, bình luận) | test + máy thật + hàng server |
| Block | PASS | test + máy thật 9/9 |
| UGC (đăng ảnh/clip, hộp quy tắc) | BLOCKED (đăng ảnh/clip); hộp quy tắc PASS | — |
| Share | BLOCKED — REAL ZALO PACKAGE CONFLICT | — |
| Chat | PASS (thẻ hỏi, kính, phim, vé bay) / BLOCKED (điều kiện 3 câu trên màn nhỏ) | log + ảnh |
| Google | BLOCKED | — |
| Zalo | BLOCKED | — |
| AI Consultative | UNTOUCHED | git |
| Production flag | BLOCKED | — |
| Google OAuth | BLOCKED | — |
| Legal wording | BLOCKED | — |

## HUY MANUAL UAT TOMORROW (cài `TappyAI-UAT-101a359.apk`, tài khoản thật)
1. **Đăng nhập Zalo** — Tôi → Đăng nhập → Zalo. Mong đợi: vào được, tên hiện ở Tôi. Chụp màn Tôi. PASS/FAIL.
2. **Đăng nhập Google** — Tôi → Đăng nhập → Google. Mong đợi: vào được (nếu lỗi “client” → ghi nguyên văn). Chụp. PASS/FAIL.
3. **Đăng ảnh** — Khám phá → “+” → Thêm ảnh → chọn MỘT ảnh anh tự chọn → viết 1 dòng → Đăng. Mong đợi: lần đầu hiện hộp “Quy tắc cộng đồng” (có link Điều khoản + support@tappyai.com) → đồng ý → bài lên. Chụp hộp + bài. PASS/FAIL. (Xoá bài sau.)
4. **Đăng clip** — như trên, tab Video, chọn clip ngắn (<5 phút). Mong đợi: “Video đã tải lên” rồi đăng được. Chụp. PASS/FAIL.
5. **Chia sẻ** — mở một bài/kết quả kế hoạch → Chia sẻ → Zalo/Messenger. Mong đợi: bảng chia sẻ mở, gửi được nội dung đúng (không lộ tin gốc). Chụp. PASS/FAIL.
6. **Nút “Cảnh báo cho mọi người” (Lá chắn → link)** — nhập `vietcombank-xacthuc-taikhoan.top` → Kiểm tra → bấm nút → chọn app → xem link `/r/…` mở được trang công khai, KHÔNG có chữ do anh nhập. Chụp. PASS/FAIL. (Tạo trang công khai trên UAT.)
7. **Chữ tiêu đề Lá chắn** — mở Lá chắn: tiêu đề “Kiểm tra kỹ”, dòng nhỏ “Duyệt web cẩn thận hơn”. PASS/FAIL.
8. **Thẻ hỏi trên màn nhỏ** — Chat → “quán phở ngon quận 1” → cuộn thẻ hỏi: đủ 3 câu + nút “Tìm cho tôi”. PASS/FAIL.
9. **Sanity (tuỳ chọn)** — Lá chắn → dán “Thông báo phạt nguội…” (đã PASS trên máy test).
Production-only (không làm được trước release): báo cáo/chặn trên production, xoá tài khoản thật, thẻ hỏi mới.

## RELEASE STATUS
**BLOCKED** — Android đã đóng phần có thể tự đóng; còn 3 mục bên ngoài (cờ production, Google OAuth, duyệt pháp lý chữ) và các mục manual ở trên.
