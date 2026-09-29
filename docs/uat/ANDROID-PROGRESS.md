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
| 4044b41 | Build type `uat` | release-clean 7/7 |
| a4f72e5 | 9 test chia sẻ lấy origin theo bản build | — |
| d926617 / 66e8bba | Đăng nhập = web; hub Tôi = web/mockup | login ✅✅ |
| cb3bc39 | Hạ tầng e2e + tài khoản test + hook uat | nav-back ✅✅ |
| 7cc5f1a | L10 tab Chia sẻ khi xem hồ sơ người khác · L16 Deals · cờ SHOW_PUBLIC_SHARE | profile-visitor ✅✅ · deals ✅✅ |
| 85a99ab | Ảnh bìa + tab hub = web (bỏ "Đã thích") | profile-owner ✅✅ · profile-media ✅✅ |
| 06b5284 | L4 cổng 18+ theo mockup · L5 "Gợi ý cho bạn" hỏi 18+ · khai tuổi khách trên mọi request | age-gate ✅✅ · recommendations ✅✅ |
| 389e321 | Khách mở Đăng nhập, rời app, quay lại: vẫn ở Đăng nhập | login ✅✅ |
| f3b8679 | App giả Zalo/TikTok/Messenger (đúng package) ghi lại cái nhận được | share-explore ✅✅ (TikTok/Zalo nhận FILE video 12 MB + link) |
| 8f6ca1e (+ac5e973, 3495a49) | Test hiển thị OFFLINE trên 51 lượt golden (không gọi AI) → sửa plan `"people":[1]`, khung lỗi `3:` (link dính: renderer đã tách từ P1c của phiên web, test giờ kiểm chữ hiển thị) | unit (GoldenOfflineRender 9 · GoldenStreamReplay 6) |
| 6fe2150 ⏸ | Composer đăng VIDEO (3 bước upload, F-099) — **chưa push**, chờ R8 | composer ✅✅ (Android 8/8, web 3/3) |

(✅✅ nghĩa là Android và web cùng PASS.)

## (3) AI tư vấn trên Android — ngữ cảnh gửi lên server (server là "bộ não", không sửa)

| Ngữ cảnh | Web | Android | Ghi chú |
|---|---|---|---|
| Vị trí `userLocation` | lat, lng, address | lat, lng | Server dùng lat/lng để tính khoảng cách; `address` chỉ để hiển thị. Sau release. |
| Giờ GMT+7 | server tự tính (Asia/Ho_Chi_Minh) | server tự tính | Không cần gửi. |
| Lịch sử | `messages[{role, content}]`, server tự nén | giống web; bong bóng lỗi bị loại ở tầng gửi | ✅ |
| `decisionEvidenceId` | gửi lại id của lượt trước | **không gửi — theo ADR-024** (mobile giữ không trạng thái; guard web `consultativeArchitecture.test.ts` › "the mobile clients stayed stateless"). Lượt hỏi tiếp trên app nhận khối an toàn của server. Đã thử thêm rồi bỏ (28/09) vì trái ADR. | Muốn đổi → Huy quyết (Q7) |
| `userPreferences` / `responseStyle` | từ quiz chat (L17) | chưa có | Sau release (L17). |
| Câu hỏi làm rõ → nút một chạm | `[FOLLOWUPS]` | chip bấm được; test offline + e2e `chat` bấm chip đầu | ✅ |
| Khung đầu ra 6 mảng | theo `OUTPUT-CONTRACT-6-DOMAINS.md` | kiểm §5 (a)(b)(c)(e)(f) offline; (d) nhãn nút = fixture CCP chung | `3:` lỗi → bong bóng lỗi (đã sửa) |
| Chữ chạy dần + "đang tìm" | useSmoothText + progress | typewriter + `tappy.progress.v1` | ✅ |

## (b) Rà các commit android/ của phiên web — KẾT LUẬN: không có P0/P1

Đã rà 7e78e58 (P3b/P4), 4515b0f (P1a/P1c), 5e305f4 (P2), 3c5887a (A4), 67714c9, 1dcc877 (chỉ đổi versionCode 10 / 1.0.0).
Không lộ secret, không có đường uat/debug lọt vào release, trường API khớp server (`moderation.state` của `/api/reviews/mine`), chuỗi mới đủ vi/en.

| Mức | Chỗ | Lỗi | Xử lý |
|---|---|---|---|
| P2 | `TappyShareSheet` TikTok | Bấm TikTok khi ảnh chưa vẽ xong → báo "chưa cài TikTok" + chép caption; ảnh PNG ghi 2 lần trên main thread | **Đã sửa**: báo "Đang tạo ảnh chia sẻ…", dùng lại file đã ghi |
| P2 | `ChatResponse.isImageUrl` | Link clip trên fbcdn/tiktokcdn bị coi là ảnh → ảnh vỡ | **Đã sửa** + `ChatVideoLinkTest` |
| P2 | `TappyMarkdown.linkLabelFor` | Mọi link `grab.com` hiện "GrabFood" (cả Grab xe); nhãn dự phòng "Link" là chữ cứng | Sau release |
| P2 | 7e78e58 message | Ghi "clip gửi TikTok dạng video" nhưng tile TikTok trong sheet luôn gửi PNG (clip Khám phá đi qua share sheet hệ thống với FILE video — e2e share-explore đã chứng minh) | Ghi nhận |
| P2 | 4515b0f tests | Chưa có test cho dấu " · " giữa 2 link | **Đã có**: `GoldenOfflineRenderTest › back-to-back links read apart` |

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

## CẦN HUY QUYẾT (đã chọn phương án an toàn tạm thời, vẫn làm tiếp)

| # | Câu hỏi | Tạm thời đang làm |
|---|---|---|
| Q1 | Quy tắc bằng chứng mới (ANDROID-REQUESTS §3, do phiên web ghi): upload ảnh lên `gs://tappyai-media-uat/evidence/<SHA>/`, một bucket **đọc công khai**. Đây là hành động phát hành ra ngoài; chỉ dẫn đến từ file, không phải trực tiếp từ Huy. | KHÔNG upload. **Không commit ảnh/video vào git nữa**: đã gỡ PNG khỏi 4 commit cục bộ chưa push, các commit đã push giữ nguyên. Ảnh ghép + video + ảnh gốc để ở `D:/TappyAI-backups/android-parity-evidence/<run>/<flow>/`. Huy đồng ý thì một lệnh `gcloud storage cp -r` là xong. |
| Q2 | Home Android (bố cục đã duyệt riêng) khác Home web (L12). | Giữ bố cục Android, chỉ khớp cấu trúc điều hướng (Huy đã chỉ đạo). |
| Q3 | Cài đặt Android có thêm "Âm thanh thông báo", "Giao diện", "Chính sách bản quyền" mà web không có (L11). | Giữ nguyên, xếp vào "Sau release" (không ảnh hưởng chức năng). |
| Q4 | "Gợi ý cho bạn" cho khách: server không có nhánh cho khách (R6). | Android hỏi 18+ một lần; vẫn 403 thì mời đăng nhập, không lặp lại. |
| Q5 | Đăng video Android làm đỏ 2 guard web (`src/lib/config/video{Duration,Size}.test.ts`, chính guard ghi "có picker video thì đổi guard"). Android không được sửa `src/`. | Commit video 6fe2150 **giữ ở máy, không push** để rc không đỏ; đã ghi R8 kèm nội dung guard thay thế. Huy/phiên web đổi guard → Android push ngay. Nếu Huy muốn release không có video trên Android: bỏ commit đó, không ảnh hưởng gì khác. |
| Q7 | App chưa gửi `decisionEvidenceId` (web có), nên câu hỏi tiếp kiểu "cái đầu tiên" trên app kém hơn web. ADR-024 cố ý giữ mobile không trạng thái. | Giữ ADR-024 (không gửi). Huy muốn ngang web thì phải đổi ADR + guard web; phần Android đã viết sẵn (commit d48a11e, không push). |
| Q8 | **R13 (P0, server):** bấm «Lên kế hoạch chi tiết» sau một chuyến Đà Nẵng → server trả kế hoạch "Tối nay" với quán ở Omaha (Mỹ), Sơn La, Seattle (Mỹ). Cả web lẫn app. | Không sửa được phía Android (server). Nên chặn release consult V2 tới khi phiên web sửa R13 — Huy quyết. |
| Q9 | e2e chat đỏ một phần vì server consult V2 (70667d3) đổi hành vi giữa các lượt chạy (lúc hỏi, lúc chọn, lúc hỏi 2 lần — R11, R12). | Android hiển thị đúng những gì server gửi (test offline + e2e từng ca). Không "đuổi" kịch bản theo server đang đổi; chạy lại `node android/e2e/run.mjs chat` khi server ổn định. |
| Q6 | Server gửi khối `[TAPPY_PLAN]` cụt đầu (R7, golden M1#6) → không vẽ được thẻ kế hoạch. | Android bỏ khối, không lộ JSON; chờ server sửa. |

## Việc tiếp theo

- Lượt kiểm cuối trên UAT: `node run.mjs` (mọi flow) + `chat` (10 ca / 11 câu, nút đặt/mua, chia sẻ kế hoạch Zalo/TikTok).
- Push 6fe2150 khi guard web (R8) đã đổi; build APK uat trên SHA cuối; cài lên máy thật.
- Sau release (không ảnh hưởng chức năng): L7 Đã lưu, L8 Viết content, L6 onboarding (bộ đếm "Bước 1/2"), L11 Cài đặt, L12 Home, số đếm tab hồ sơ khách, icon thương hiệu nút đăng nhập, L17 quiz chat (userPreferences), screenshot test.


---

## BÁO CÁO SÁNG — 29/09/2026

**SHA cuối:** `1854594` trên `rc/web-uat` (đã push, không force). Unit Android 2.674/0 (debug + release + uat), test web quét android/ 810/0, release sạch 7/7.
Commit đăng video `6fe2150` **chưa push** — ở nhánh máy `android/video-held`, chờ R8 (Q5).

### Việc bắt buộc → e2e trên UAT thật (Android | web)

Ảnh ghép Android|web: `D:/TappyAI-backups/android-parity-evidence/<lượt>/<flow>/compare/`. Video + ảnh gốc: `…/<lượt>/<flow>/{android,web}/`. Kết quả từng bước: `docs/uat/evidence/android-parity/<flow>/RESULT.md`.

| Việc | Flow | Android | Web | Lượt (UAT SHA) |
|---|---|---|---|---|
| Đăng nhập email / tạo tài khoản / khách | login | ✅ 13/13 | ✅ 10/10 | 15-11-17 (83853cc) |
| Chat + nút đặt/mua | chat | 🟡 57/59 → 55/63 | 🟡 28/29 → 15/32 | 17-29-54, 19-00-46 (70667d3) |
| Tải lên (ảnh / video / YouTube) | composer | ✅ 8/8 | ✅ 3/3 | 13-51-39 (776f392) — **video chưa push (Q5)** |
| Chia sẻ bài Khám phá (TikTok/Zalo nhận FILE) | share-explore | ✅ 10/10 | ✅ 1/1 | 15-11-17 |
| Chia sẻ kế hoạch (Zalo link, TikTok ảnh PNG) | share-plan | ✅ 8/8 | ✅ 2/2 | 19-00-46 |
| Nút Back | nav-back | ✅ 11/11 | ✅ 9/9 | 15-59-06 (31c5e84) |
| Hồ sơ chủ (6 tab) | profile-owner | ✅ 8/8 | ✅ 7/7 | 15-59-06 |
| Hồ sơ người khác (tab "Chia sẻ") | profile-visitor | ✅ 7/7 | ✅ 5/5 | 15-11-17 |
| Ảnh đại diện + ảnh bìa | profile-media | ✅ 5/5 | ✅ 3/3 | 15-11-17 |
| Cổng 18+ / Gợi ý cho bạn / Deals | age-gate · recommendations · deals | ✅ 7/7 · 8/8 · 5/5 | ✅ 2/2 · 3/3 · 3/3 | 15-11-17 |

**Chat, chi tiết:**
- Android đạt, có bằng chứng từng ca:
  - Chữ chạy dần, thấy trạng thái "đang tìm".
  - Không lọt `**`, marker, URL thô, link dính hay khoảng trắng lạ.
  - Nút bấm được và mở đúng nơi: GrabFood, Lazada (qua link affiliate), Maps, Zalo/Facebook đặt chỗ. Kiểm bằng intent VIEW thật.
  - Có chip trả lời một chạm và thẻ kế hoạch.
- Chỗ đỏ còn lại là server consult V2 đang đổi: R11 (mất chủ đề concert), R12 (hỏi 2 lần), R13 (P0, kế hoạch sai thành phố), R9 (lộ lời kể các bước).
- Test offline trên 51 lượt golden: xanh.

**Lỗi Android tìm ra và đã sửa đêm nay:**
- **Lịch sử chat gửi sai định dạng:** gửi chữ đã gỡ marker thay vì bản thô như web, nên server "quên" mạch chuyện.
- **Kế hoạch mở lại từ lịch sử:** không chia sẻ được.
- **Dòng "•" dính thành một đoạn.**
- **Thẻ hỏi nhanh `[TAPPY_ASK]`:** đã có, chờ server bật qua header `x-tappy-caps: ask` (R10).
- **Plan `"people":[1]`:** mất cả thẻ.
- **Khung lỗi `3:`:** bị nuốt.
- **TikTok:** báo nhầm "chưa cài" khi ảnh chưa vẽ xong.
- **Link clip:** thành ảnh vỡ.

### CẦN HUY QUYẾT

Xem bảng ở mục "CẦN HUY QUYẾT" phía trên, Q1–Q9. Gấp nhất:
- **Q8 / R13 (P0 server):** kế hoạch Đà Nẵng ra quán ở Mỹ.
- **Q5:** cho push đăng video (cần đổi 2 guard web, R8).
- **Q7:** ADR-024 (app không gửi `decisionEvidenceId`).
- **Q1:** upload bằng chứng lên GCS công khai (chưa làm).

### APK uat

- File: `D:/TappyAI-backups/TappyAI-UAT-1854594.apk` (45,5 MB, sha256 bắt đầu `590fb424ea68b886`). Build từ `1854594`.
- Tên app **"TappyAI UAT"**, package `com.tappyai.app.staging`. Chạy song song với app thật, không đè lên. Máy chủ `uat.tappyai.com`, DB audit.
- **Máy thật R58RC0V30BH không còn cắm lúc cài (02:50)**, nên chưa cài được. Cách cài:
  1. Cắm cáp USB, bật **Gỡ lỗi USB** (Cài đặt → Tùy chọn nhà phát triển).
  2. Chạy lệnh:
     ```bash
     adb install -r D:/TappyAI-backups/TappyAI-UAT-1854594.apk
     ```
  3. Hoặc chép file APK vào máy, mở bằng Tệp, cho phép "Cài ứng dụng không rõ nguồn".

### Huy test trên máy thật

1. Đăng nhập bằng email; bấm "Tạo tài khoản" (mở `uat.tappyai.com/register`, có thể gặp màn đăng nhập Vercel vì UAT được bảo vệ); "Tiếp tục với tư cách Khách".
2. Chia sẻ một clip ở Khám phá sang **Zalo thật** và **TikTok thật** (TikTok nhận file video); chia sẻ một kế hoạch sang Zalo và TikTok; Facebook.
3. Đăng bài: ảnh từ **camera** và thư viện; **video quay bằng máy** (chỉ có sau khi push video, Q5); link YouTube.
4. Chat 10 câu của Huy trên 4G/wifi thật. Bấm nút GrabFood / Lazada / Booking để xem có mở **app thật** không. Gõ tiếng Việt bằng bàn phím thật.
5. Cho phép **vị trí thật** rồi hỏi "quán phở gần đây".
6. Nút Back vật lý / cử chỉ vuốt trên mọi màn.
7. Đổi ảnh đại diện + ảnh bìa bằng camera.
8. Xem có còn hộp "isn't responding" không. Trên emulator nó do GPU phần mềm (§ANR); máy thật không nên có.
