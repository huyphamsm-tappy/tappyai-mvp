# Android ↔ Web parity — evidence ledger (cập nhật 03/10/2026)

Quy tắc: Web là source of truth. Mỗi dòng có Web source / Android / Verification. Không có evidence trực tiếp → `BLOCKED — insufficient evidence`.
Web SHA: `56a26aeb72d3ae1dacb484885df04e6976d5d84e` (= `origin/rc/web-uat` = `GET https://uat.tappyai.com/api/version`, 03/10). ⚠ `C:\wtrel` đang checkout nhánh khác (`release/rc-merge-main-2026-09-29` @ `0b6bba2`) KHÔNG chứa chữ cuối → không dùng làm nguồn.
Mọi “Android SHA” là commit trên nhánh `android/parity-2026-09-28-step1` (chưa push).

## P1 — Kiểm TIN NHẮN (đã đổi so với bản 02/10)
Web: SHA `56a26ae` · `src/app/scam-shield/ScamShieldView.tsx` (`runMessage`), `ScamMessageResult.tsx`, `src/lib/scam-shield/verdict.ts`, `knowledge/match.ts` (server, commit `65685a7` — AI tắt mặc định), `message/advice.ts` · Contract: `POST /api/scam-shield/analyze {text?, url?}` → `verdict`, `scenario`, `signals`, `advice`, `urlChecks`; server không gọi AI ở bậc 0 (phản hồi thật UAT 03/10: `tier 0, aiStatus not_needed, quota null`).
Android: `be15031` · `ScamShieldViewModel.kt` (`analyzeMessage`), `ScamShieldResult.kt` (`MessageResultCard`, `ScenarioCard`), `data/*` · Change: BỎ khớp trên máy (`ScenarioMatcher` đã xoá) và hộp “đồng ý gửi AI”; gọi `/analyze` chỉ với text/url; hiển thị thẻ đúng thứ tự `ScamMessageResult.tsx`.
Verification: Tests `ScamMessageContractTest` (2 JSON THẬT của UAT), `ScamLocalParityTest` (thứ tự các khối, không điểm/độ tin cậy/quota, không ảnh) · Device Samsung A12s (`R58RC0V30BH`, Android 11) · Result PASS 16/16 · Log `android/e2e/out/phone-scam8c.log` · Ảnh `android/e2e/out/2026-10-03T04-10-07/scam-shield-parity/android/*.png` (đã mở xem).
⚠ Quyết định cần Huy xác nhận: trước đây Huy chỉ định khớp tĩnh TRÊN MÁY (tin không rời máy). Web (nguồn chuẩn) kiểm tin nhắn qua server (không AI, không lưu). Android đã theo Web; bản trên máy còn trong git `812b61b`.

## P2 — Link / QR-có-link
Web: SHA `56a26ae` · `ScamShieldResult.tsx`, `verdict.ts`, `reasons.ts`, `scamVerdict.ts` · Contract: `verdict`, `reasonCode/reason_vi/reason_en`; ≤6 lý do (warning/critical); hàng `safe` không hiện; hành động `INCONCLUSIVE` không lặp dưới “unrecognized”; nút “Cảnh báo cho mọi người” (`POST /api/scam-shield/share`); disclaimer.
Android: `be15031` · `ScamShieldResult.kt` (`VerdictCard`), `data/*` (share API) · Change: đúng thứ tự khối web, giới hạn 6, lọc safe, lọc INCONCLUSIVE, nút chia sẻ link.
Verification: `ScamCheckContractTest`, `ScamLocalParityTest` · máy thật PASS (QR link giả: thẻ “Đường link có đặc điểm thường gặp ở link giả mạo”, lý do tiếng Việt, nút “Cảnh báo cho mọi người” + hint; KHÔNG bấm vì tạo trang công khai trên UAT) · Log `phone-scam8d.log` · Ảnh `.../2026-10-03T04-17-58/...`.
Khác biệt: UI chia sẻ = bảng chia sẻ của hệ thống (web dùng `ShareMenu` riêng). Web không quy định giao diện bảng chia sẻ → không phát minh thêm.

## P3 — Chữ (3 trạng thái, QR, tình huống, chia sẻ, lỗi)
Web: `src/lib/i18n/scamVerdict.ts`, `scamQr.ts`, `share.ts`, `dictionaries.ts` (`scamShield.error.*`), `v3/web.ts` (`v3.scam.*`).
Android: `res/values{,-vi}/strings_scam_local.xml`, `strings_scam_shield.xml`, `strings_scam_v3.xml` · Verification: `ScamWordingCopyTest` (59 dòng × 2 ngôn ngữ, sinh từ web), `ScamV3WebParityTest` (90 khóa vi / 88 en) · PASS.
Đã sửa vì khác web: tiêu đề giới thiệu («Kiểm tra kỹ», «Duyệt web cẩn thận hơn», “Check it first”, “Browse more carefully”) — trước đó còn chữ «an toàn»; 5 dòng lỗi (`URL không hợp lệ`, `Không thể kiểm tra địa chỉ mạng nội bộ`, `Bạn đã kiểm tra quá nhiều lần. Thử lại sau.`, `Đã hết lượt kiểm tra hôm nay. Quay lại ngày mai.`, `Không thể kiểm tra URL`); lỗi hiển thị theo MÃ (không hiện `message` của server), lỗi mạng = “checkFailed”.

## P4 — QR (không phải link)
Web: `qr/payload.ts` (`classifyQrPayload`), `ScamShieldView.tsx` (`data-qr-other`) · Contract: giải mã tại máy; thẻ: tiêu đề → loại → cảnh báo → “Nội dung đọc được” + văn bản đã giải mã (≤500 ký tự, kể cả Wi-Fi) → “chưa kiểm tra” → “đọc ngay trên thiết bị” → disclaimer; KHÔNG có nút chia sẻ.
Android: `QrCodes.kt`, `ScamShieldLocalResults.kt` · Change: phân loại sao chép; Wi-Fi hiển thị văn bản như đã đọc (bỏ ẩn mật khẩu — web không ẩn, test web `scamShieldV3.test.tsx:210-219` không đòi ẩn); bỏ nút chia sẻ; đúng thứ tự.
Verification: `QrCodesTest`, `ScamLocalParityTest` · máy thật PASS (link giả / chữ / thanh toán / Wi-Fi hiện “Cafe Mo” và mật khẩu của chính mã) · Log `phone-scam8d.log`; huỷ chọn ảnh PASS (`phone-scam8e.log`).
Kết luận mục Wi-Fi: Web hiển thị → Android đã sửa khớp Web.

## P5 — Báo cáo / chặn
Web: `src/app/api/comments/[commentId]/report/route.ts`, `users/[id]/report/route.ts`, `users/[id]/block/route.ts`, `lib/safety/userReports.ts`, `lib/reviews/reportReasons.ts`, doc `ANDROID-REQUESTS.md` §4 · Contract: `{reason, note?}`; lý do ⊂ `USER_REPORT_REASONS` (gồm `scam`, `sensitive` — “Android: scam, sensitive” ghi trong chính file); 404 thân rỗng khi cờ tắt; KHÔNG có `POST /api/reports`; web không có giao diện chặn (chỉ API) → vị trí nút chặn trong app là hành vi Android theo doc §4 (“CHỈ khi p8.userBlocks”).
Android: `SafetyApi.kt`, `SafetyRepository.kt`, `reviews/ui/ReviewsScreens.kt` (+ “Chặn người dùng” ở menu bài trong Chi tiết) · Verification: `SafetyRepositoryTest`, `SafetyModelsTest`, `DetailBlockWiringTest` · máy thật: báo cáo bài 17/17 (`phone-safety5.log`), báo cáo + chặn NGƯỜI DÙNG 9/9 (`phone-blockuser3.log`, hàng `user_reports`/`user_blocks` trên server), báo cáo BÌNH LUẬN 7/7 (`phone-reportcomment5.log`, hàng `user_reports target_type=comment`).

## P6 — Chat thẻ hỏi / kính cường lực / phim / vé máy bay (máy thật)
Web: không đối chiếu code chat (AI Consultative không đụng); chỉ kiểm hành vi Android hiển thị câu trả lời của UAT.
Android: không đổi. Verification máy thật (`phone-chatA/B/C.log`, ảnh `2026-10-03T05-21-50`, `05-31-39`, `05-38-54`): thẻ hỏi theo mảng — ăn uống “Hôm nay ăn gì nhỉ?”, mua sắm “Bạn đang tìm món gì?”, du lịch/bay “Chuyến đi thế nào đây?” kèm câu “Bay từ đâu?” khi chưa nói điểm đi và không có khi “bay từ HCM”; kính cường lực trả lời đúng phụ kiện; phim: 5 link rạp (CGV, Galaxy, Lotte, BHD, Beta) + nút “Tìm rạp gần mình” chạy tiếp.
Không đạt trên máy nhỏ: kiểm “3 câu + nút Tìm cho tôi” (thẻ cao hơn màn hình, cần cuộn) → `BLOCKED — insufficient evidence` cho riêng điều kiện này.

## P7 — AI Consultative
`git diff --name-only 597698b..HEAD -- android/app/src/main/java/com/tappyai/app/chat` → 0 tệp. **AI CONSULTATIVE: UNTOUCHED.**

## P8 — Còn BLOCKED
Xem `FINAL-REPORT-2026-10-03.md`.
