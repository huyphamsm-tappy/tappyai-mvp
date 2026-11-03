# iOS ↔ Web hiện tại — bảng đối chiếu (02/10/2026)

Nguồn tham chiếu Web: `origin/rc/web-uat`, HEAD `56a26ae` (02/10/2026 16:58 +07). Hai commit sau `93948b2`: `4601184` (sửa bảo mật: ngân sách mở rộng truy xuất, menu chia sẻ, CTA url, `safeInline`) và `56a26ae` (tài liệu). Hai commit này **không đổi** `src/lib/scam-shield`, `src/lib/i18n/scamVerdict.ts`, `src/app/scam-shield`, `docs/uat/SCAM-SHIELD-PARITY.md`, `docs/ios/IOS-REQUESTS.md` (`git diff --stat 93948b2 origin/rc/web-uat`).

Trạng thái "FINAL" của Web: `RELEASE-PROGRESS.md` (HEAD) ghi "KHỐI DUY NHẤT … SHA cuối" nhưng đồng thời ghi: danh sách test của Huy (`HUY-TEST-ONE-PASS-2026-10-02.md`) chưa có kết quả trong repo; chữ Scam Shield "cần luật sư xem" (`docs/uat/SCAMSHIELD-WORDING-FOR-REVIEW.md`); mục "Điều chưa chắc". Chưa có "OK release" của Huy. Vì vậy mọi dòng dưới đây dùng nhãn: **FINAL theo tài liệu Web** ≠ **đã được Huy xác nhận**.

## 1. Web hiện tại

| Tính năng Web | Triển khai hiện tại | Tệp | Test | Trạng thái |
|---|---|---|---|---|
| Scam Shield: ba trạng thái, không "An toàn", không điểm | `linkVerdict`, `messageVerdict` | `src/lib/scam-shield/verdict.ts` | `scamShieldV3.test.tsx` | Mã khớp `93948b2`/`65685a7`; chữ đợi luật sư → IN PROGRESS (chưa FINAL) |
| Scam Shield: AI tắt cho tin nhắn | `SCAM_SHIELD_AI_ENABLED` mặc định tắt | `src/lib/scam-shield/message/config.ts:80` | `src/app/api/scam-shield/analyze/route.test.ts` | IN PROGRESS (cùng lý do) |
| Scam Shield: lý do `reason_vi/en` | bảng `reasonCode` | `src/lib/scam-shield/reasons.ts` (theo `SCAM-SHIELD-PARITY.md` §8) | test chặn finding thiếu câu | IN PROGRESS |
| Báo cáo/chặn | `POST /api/reviews|comments|users/{id}/report`, `POST/DELETE /api/users/{id}/block`, `GET /api/users/blocks`; cờ `p8.reports`, `p8.userBlocks` | `src/app/api/**`, `src/app/api/config/route.ts:72-75` | `route.test.ts` | Mã có; migration production CHƯA áp (`RELEASE-PROGRESS.md`) → IN PROGRESS |
| Giao diện tối mặc định | tối trừ khi lưu `light` | `src/app/layout.tsx:97` | `useThemeMode.test.tsx` | Mã có; web chỉ có `dark`/`light` (không có "theo hệ thống") |
| Thông báo đẩy cho iOS | `fcm.ts` chỉ dựng tin Android, không có khối `apns`, không có `platform` | `src/lib/notifications/fcm.ts` | — | NOT IMPLEMENTED (IOS-REQUESTS I9) |
| Ghi nguồn OpenStreetMap | Chỉ `/privacy` liệt kê OSM là nhà cung cấp (`legal.ts:70,318`); không có "© OpenStreetMap contributors" ở đâu trong `src/` | `src/lib/i18n/legal.ts` | — | NOT IMPLEMENTED, chưa quyết → BLOCKED — WEB NOT FINAL |
| Đồng ý chia sẻ dữ liệu với AI (màn riêng) | Không có màn tương ứng (chỉ `consentStore` của marketing) | — | — | NO WEB EQUIVALENT (yêu cầu Apple 5.1.2(i), chỉ iOS) |
| Ảnh bìa (thumbnail) clip | cột `thumbnail` trong `/api/reviews/feed` và `/api/reviews/[id]` | `src/app/api/reviews/feed/route.ts:15` | `ownerVisibility.test.ts` | Mã có; nghĩa "thumbnail qua máy chủ" trong yêu cầu của Huy: NO EVIDENCE |

## 2. iOS hiện tại và độ khớp

| Tính năng | iOS hiện tại | Khớp Web? | Bằng chứng | Hành động |
|---|---|---|---|---|
| Chữ Scam Shield (34 chuỗi vi+en) | `Localizable.xcstrings` | **0 khác biệt** so với Web HEAD | `python ios/scripts/web_parity_check.py` | Không đổi. Chạy lại khi Web đổi |
| Ba trạng thái link / tin nhắn / QR | `ScamVerdict.swift`, `ScamShieldView.swift`, `ScamMessageView.swift` | Link: ánh xạ giống `linkVerdict`. Tin nhắn: **không chứng minh được** (iOS dùng bộ khớp riêng `ScamMessageMatcher`, Web dùng `matchScenario` + mức) | `ScamVerdictTests` (7 test) ; ảnh run 37000177700 | NOT PROVEN cho tin nhắn; cần Web final + test song song |
| AI cho tin nhắn | Đã bỏ nút và thẻ; VM giữ mã chết | Khớp (Web: AI tắt) | Ảnh 89, `testScamMessageUnsureHasNoAIEntry` | Không bật lại |
| Báo cáo/chặn | `SafetyService.swift`, `SafetyModels.swift` | Khớp đường dẫn và cờ `p8` (đọc mã) | `SafetyTests` | Chưa có response production |
| Giao diện tối mặc định | `ThemeManager.swift:20` `defaultMode = .dark` | Khớp mặc định. **Lệch:** iOS có thêm "theo hệ thống" | `ThemeModeTests` | Hỏi Web/Huy; không tự đổi |
| Thông báo đẩy | iOS đã gửi `platform:"ios"` | Web chưa xử lý | `fcm.ts` | BLOCKED — WEB NOT FINAL |
| Ghi nguồn OSM | Không có | Web cũng không có | — | BLOCKED — WEB NOT FINAL; LEGAL REVIEW NEEDED |
| Đồng ý AI | `AIConsent.swift` | Không có tham chiếu Web | `AIConsentTests` | Giữ (yêu cầu Apple) |
| Dải đen Khám phá | Bản vá `b6f1047` còn trong `VerticalPagingView.swift:106` | Không có tham chiếu Web | CI iOS 37004703588 xanh; chưa có ảnh | Chờ một lượt `[shots]` xác minh |
