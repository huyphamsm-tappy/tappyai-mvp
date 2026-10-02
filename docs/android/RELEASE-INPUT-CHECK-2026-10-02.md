# Android Release Input Check — 02/10/2026

Quy tắc: chỉ PASS khi có bằng chứng trực tiếp (git / tài liệu / test / phản hồi API). Không có thì BLOCKED. Web chỉ được ĐỌC (git `origin/rc/web-uat`, không checkout trong `C:\wtrel`).

## Audit Android (Bước 1)
| Mục | Giá trị | Bằng chứng |
|---|---|---|
| Nhánh / mã mới nhất local | `android/parity-2026-09-28-step1` @ `88a4fef3947e6a3f71714e56db86b14435aad695` (chưa push) | `git rev-parse HEAD` |
| AAB đang giữ | `1b12a7c` — `D:\TappyAI-backups\TappyAI-release-vc11-1b12a7c.aab`, SHA-256 `bd0f659b205b9bdda94a234b39409a71f7c59f18e09ae6f21b3a4113ddfb15c6` | build-aab.sh output 02/10 |
| «Lá chắn 3 trạng thái» trong source? | CÓ ở `401a3e6` (`ScamVerdict.kt`, `strings_scam_local.xml` `scam_verdict_*`); KHÔNG có trong `1b12a7c` | `git show 1b12a7c:…/ScamVerdict.kt` → «exists on disk, but not in '1b12a7c'» |
| «Ngừng AI phân tích tin nhắn» trong source? | CÓ ở `401a3e6`: `ScamShieldViewModel.kt:331 const val MESSAGE_AI: Boolean = false`; KHÔNG có trong `1b12a7c` (còn hộp xin đồng ý gửi AI) | `git grep MESSAGE_AI HEAD` |
| Test liên quan (UAT unit, chạy lại 02/10) | `ScamLocalParityTest` 13/0 lỗi · `ScenarioMatcherTest` 13/0 · `ScamShieldV3Test` 13/0 · `ScamShieldFailClosedTest` 13/0 · `QrCodesTest` 12/0 · `AppearanceDefaultTest` 7/0 → `BUILD SUCCESSFUL` | `app/build/test-results/testUatUnitTest/*.xml` |
| Ảnh e2e (máy ảo) | `android/e2e/out/2026-10-02T09-08-32/scam-shield-parity/android/*.png` (21/21 kiểm tra) | thư mục tạo ngày 02/10 |

## Đối chiếu Web (Bước 2–3)
Nhánh Web làm nguồn: `origin/rc/web-uat` @ `56a26aeb72d3ae1dacb484885df04e6976d5d84e`.
⚠️ **Xung đột phiên bản:** checkout `C:\wtrel` đang ở nhánh khác (`release/rc-merge-main-2026-09-29` @ `0b6bba2`) KHÔNG chứa commit chữ cuối `93948b2`. Không dùng nhánh đó làm nguồn; dùng `origin/rc/web-uat` vì chính phản hồi `/api/version` của UAT trả đúng SHA này.

| Item | Value | Evidence | Status |
|---|---|---|---|
| Web SHA (UAT) | `56a26aeb72d3ae1dacb484885df04e6976d5d84e` | `GET https://uat.tappyai.com/api/version` → `{"v":"56a26aeb…e5d84e"}` (02/10); = `git rev-parse origin/rc/web-uat` | PASS |
| Lá chắn wording (vi/en, 3 trạng thái, message + link) | Câu chữ cuối ở `docs/uat/SCAM-SHIELD-PARITY.md` §8 (`93948b2`); test web `src/lib/scam-shield/__tests__/verdictWording.test.ts`; SAFE/LOW → `unrecognized`, MEDIUM → `suspicious`, HIGH/CRITICAL → `familiar` (`src/lib/scam-shield/verdict.ts`) | git `origin/rc/web-uat` | PASS (nguồn). Ghi chú: chính doc nói chữ còn cần người am hiểu luật VN xem (`docs/uat/SCAMSHIELD-WORDING-FOR-REVIEW.md`) — chưa có bằng chứng đã duyệt → BLOCKED riêng cho phê duyệt pháp lý, không chặn việc khớp mã |
| Matcher tình huống tĩnh (tin nhắn) | Bảng cụm + ngưỡng RIÊNG của web: `STRONG_AT = 6`, `WEAK_AT = 4`, cụm có trọng số (`src/lib/scam-shield/knowledge/match.ts`, commit `65685a7`), fixture mỗi tình huống ở `knowledge/__tests__/match.test.ts`. **Khác với bản Android hiện tại** (bảng Phase 8: mạnh +2/yếu +1, ≥4 / 2–3) | git | PASS (nguồn) — Android PHẢI đổi |
| Web tắt AI cho kiểm tin nhắn | Commit `65685a7` «… AI off for message check …» | git | PASS (khớp quyết định A8) |
| Link reason VI | Phản hồi thật UAT `POST /api/scam-shield/check` có `verdict` + mỗi `evidence.items[]` có `reasonCode`, `reason_vi`, `reason_en` (vd. `dns.NO_A_RECORD` → «Tên miền chưa trỏ tới máy chủ nào…»); doc §8 + `src/lib/scam-shield/reasons.ts` (`f8f8f38`) | API UAT 02/10 + git | PASS |
| Report/Block contract | `docs/uat/ANDROID-REQUESTS.md` §4–5: chặn `POST/DELETE /api/users/{id}/block`, `GET /api/users/blocks`; báo cáo bình luận `POST /api/comments/{id}/report`, người dùng `POST /api/users/{id}/report` `{reason, note?}`; bài/clip `POST /api/reviews/{id}/report`; **KHÔNG có `POST /api/reports`**; cờ `GET /api/config → p8.{reports,userBlocks,commentModeration}` | git `origin/rc/web-uat` | PASS (hợp đồng). **Android hiện gọi `POST api/reports` (`SafetyApi.kt`) → LỆCH, phải sửa** |
| UAT flag (báo cáo/chặn) | `GET /api/config` UAT → `p8:{reports:true,userBlocks:true,commentModeration:true,accountDeletion:false,moderationNotices:true}`, `flags.accountSelfDelete:true` | API UAT 02/10 | PASS (UAT) |
| Production flag | Không có bằng chứng cờ nào đã bật trên production (`RELEASE-PROGRESS.md`: «Production: Huy quyết ở PHẦN B»; 5 migration «production CHƯA áp») | git docs | BLOCKED |
| Google OAuth SHA | Các SHA khoá ký nằm trong `PLAY-CONSOLE-PASTE.md` mục A01/G (đọc Play Console + Google Cloud 01/10); không có bằng chứng client Google đã được sửa/tạo lại (việc của Huy / phiên GCP) | docs Android | BLOCKED |

**Kết luận bảng:** PASS đủ để sửa mã Android theo hợp đồng (matcher, chữ link/QR/tin nhắn, lý do `reason_vi`, báo cáo bình luận/người dùng). BLOCKED còn lại: cờ production, Google OAuth, phê duyệt pháp lý chữ. → KHÔNG build AAB phát hành cho tới khi các mục BLOCKED có bằng chứng; chỉ build APK UAT để kiểm.
