# Android ↔ Web parity — evidence ledger (02/10/2026)

Quy tắc: Web là source of truth. Mỗi dòng có Web source / Android / Verification. Không có evidence trực tiếp → `BLOCKED — insufficient evidence`.
Web SHA dùng chung: `56a26aeb72d3ae1dacb484885df04e6976d5d84e` (= `origin/rc/web-uat`, = `GET https://uat.tappyai.com/api/version` ngày 02/10).
Android SHA: nhánh `android/parity-2026-09-28-step1` (commit cuối của mỗi dòng ghi bên dưới; mã mới nhất local chưa push).

## P1 — Matcher tin nhắn (khớp tình huống tĩnh)
Web source: SHA `65685a7` · File `src/lib/scam-shield/knowledge/match.ts` · Contract: bảng cụm có trọng số, `STRONG_AT=6`, `WEAK_AT=4`, khớp theo ranh giới từ trên văn bản bỏ dấu, cụm nằm trọn trong cụm dài hơn đã khớp chỉ đếm một lần.
Android: SHA `812b61b` · File `scamshield/data/ScenarioMatcher.kt` (SINH TỰ ĐỘNG từ bảng web) · Change: thay bảng Phase 8 cũ (mạnh +2 / yếu +1, ngưỡng 4/2) bằng bản sao đúng.
Verification: Test `ScenarioMatcherTest` — 15 fixture của `match.test.ts` (web) cho đúng số kịch bản + mạnh; ca yếu «hóa đơn kèm mã QR» < 6; 7 tin bình thường không khớp · Device: JVM (unit) · Result: PASS (1069/0 lỗi) · Log: `app/build/test-results/testUatUnitTest`.
Khác biệt còn lại: không.

## P2 — Link / QR-có-link: ba trạng thái + lý do tiếng Việt
Web source: SHA `56a26ae` · Files `src/lib/scam-shield/verdict.ts` (`linkVerdict`), `src/lib/scam-shield/reasons.ts`, `src/lib/i18n/scamVerdict.ts` · Contract: `verdict` ∈ familiar|suspicious|unrecognized; `evidence.items[].reasonCode/reason_vi/reason_en`; SAFE/LOW báo thành INCONCLUSIVE.
Android: SHA `812b61b` · Files `ScamShieldDtos.kt`, `RealScamShieldRepository.kt`, `ScamVerdict.kt`, `ScamShieldResult.kt` · Change: đọc `verdict` (rơi về `risk.level` nếu thiếu), hiện `reason_vi/reason_en`, tiêu đề/nội dung link của web.
Verification: Test `ScamCheckContractTest` (JSON trích từ phản hồi THẬT của UAT) · Device: Samsung A12s Android 11 (`R58RC0V30BH`), APK UAT · Result: PASS — thẻ «Đường link có đặc điểm thường gặp ở link giả mạo», lý do tiếng Việt · Screenshot: `android/e2e/out/2026-10-02T11-18-26/scam-shield-parity/android/07-link-in-message.png`.

## P3 — Chữ ba trạng thái / QR không phải link / tình huống / disclaimer / 113
Web source: SHA `56a26ae` · Files `src/lib/i18n/scamVerdict.ts`, `src/lib/i18n/scamQr.ts` (+ doc `docs/uat/SCAM-SHIELD-PARITY.md` §8).
Android: SHA `812b61b` · File `res/values{,-vi}/strings_scam_local.xml` · Change: 43 câu chép đúng (113 chỉ hiện cùng tình huống khớp, như web).
Verification: Test `ScamWordingCopyTest` (so từng ký tự vi + en) · Device: máy thật · Result: PASS · Screenshot: `.../11-18-26/.../03-scam-message-known-top.png`, `.../11-45-06/.../04-qr-text.png`.

## P4 — Chữ màn hình Lá chắn (`v3.scam.*`)
Web source: SHA `56a26ae` · File `src/lib/i18n/v3/web.ts` · Contract: 101 khóa vi / 99 khóa en.
Android: SHA (commit sau đợt đối chiếu này) · Files `res/values{,-vi}/strings_scam_v3.xml` · Change: ĐỔI `heroEyebrow` («Duyệt web cẩn thận hơn» / «Browse more carefully»), `heroTitle1` («Kiểm tra kỹ» / «Check it first») — Android trước đó còn chữ cũ có «an toàn»; `kb.contentLanguage` (vi) = rỗng như web.
Verification: Test `ScamV3WebParityTest` (90 khóa vi, 88 khóa en, sinh từ web) · Result: PASS. **Chưa chụp màn hình bản đổi chữ này trên máy thật** → hiển thị: BLOCKED — insufficient evidence (chỉ có test chuỗi).

## P5 — QR classifier
Web source: SHA `56a26ae` · File `src/lib/scam-shield/qr/payload.ts` (`classifyQrPayload`).
Android: SHA `812b61b` · File `scamshield/data/QrCodes.kt` · Change: sao chép thứ tự/biểu thức của web (bare host, scheme thanh toán, app_link, preview 500 ký tự).
Verification: Test `QrCodesTest` · Device: máy thật (QR link/chữ/thanh toán/Wi-Fi) · Result: PASS 7/7 · Log: `android/e2e/out/phone-scam7d.log`.
**Khác biệt Android-only chưa có bằng chứng duyệt:** Wi-Fi — Android KHÔNG hiện mật khẩu (web hiện «nội dung đọc được»). Không có evidence đây là hành vi Android đã được duyệt → `BLOCKED — cần Huy xác nhận` (nghiêng về riêng tư hơn web).

## P6 — Báo cáo bình luận / người dùng / bài; chặn
Web source: SHA `56a26ae` · Files `src/app/api/comments/[commentId]/report/route.ts`, `src/app/api/users/[id]/report/route.ts`, `src/app/api/users/[id]/block/route.ts`, `src/lib/safety/userReports.ts`, `src/lib/reviews/reportReasons.ts`, doc `docs/uat/ANDROID-REQUESTS.md` §4 · Contract: body `{reason, note?}`; lý do ⊂ `USER_REPORT_REASONS`; 404 thân rỗng khi cờ tắt; `GET /api/config → p8.{reports,userBlocks}`; KHÔNG có `POST /api/reports`.
Android: SHA `812b61b`, `8763be5` · Files `safety/SafetyApi.kt`, `SafetyRepository.kt`, `reviews/ui/ReviewsScreens.kt` · Change: hai route riêng; menu bài (Chi tiết) có «Chặn người dùng» khi `p8.userBlocks`.
Verification: Tests `SafetyRepositoryTest`, `SafetyModelsTest`, `DetailBlockWiringTest` · Device: máy thật · Result: PASS 17/17 (hàng `content_reports` trên server, mất mạng) · Log: `android/e2e/out/phone-safety3.log`.
Chưa kiểm trên thiết bị: báo cáo BÌNH LUẬN và báo cáo NGƯỜI DÙNG (`/api/comments/…/report`, `/api/users/…/report`) và hành động chặn thật → `BLOCKED — insufficient evidence` (chỉ có test đơn vị; luồng máy thật mới kiểm bài + sự hiện diện của mục Chặn).

## P7 — Các phần KHÔNG đối chiếu được (BLOCKED — insufficient evidence)
- Bố cục thẻ kết quả link của web (`src/app/scam-shield/ScamShieldResult.tsx`: thứ tự khối chính thức / khuyến nghị / chi tiết) so với Android: chưa so từng khối.
- Văn bản chia sẻ kết quả của Android (câu tự dựng): doc web chỉ nói «văn bản thường (mức + lý do ngắn)», không có câu chữ cố định.
- Không gian tên `scamShield.*` (cũ) của web: chưa so với `strings_scam_shield.xml`.
- Chữ pháp lý Lá chắn: web ghi còn chờ người am hiểu luật Việt Nam duyệt (`docs/uat/SCAMSHIELD-WORDING-FOR-REVIEW.md`).

## P8 — AI Consultative (Luna 6.0 / 35 câu reference)
Web source: không đối chiếu (không sửa).
Android: KHÔNG sửa. Evidence: `git diff --stat 597698b..HEAD -- android/app/src/main/java/com/tappyai/app/chat` → rỗng (không file nào trong `chat/` đổi trong toàn bộ đợt này).
Verification: git · Result: PASS (không chạm architecture/routing/giọng).
