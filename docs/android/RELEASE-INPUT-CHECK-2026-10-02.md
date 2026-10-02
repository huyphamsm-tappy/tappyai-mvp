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

---
## Kết quả Bước 4 (sau khi đối chiếu) — 02/10, mã `8763be5`+

**Sửa trong Android (theo hợp đồng Web, `origin/rc/web-uat` @ `56a26ae`):**
| Việc | File | Bằng chứng |
|---|---|---|
| Matcher tin nhắn = bản sao đúng `match.ts` của web (bảng cụm có trọng số, ngưỡng 6/4, chống đếm đôi) | `scamshield/data/ScenarioMatcher.kt` (sinh từ web) | `ScenarioMatcherTest`: 15 fixture của web đều đúng kịch bản + «mạnh»; ca yếu; 7 tin bình thường không khớp |
| Link/QR-link: đọc `verdict` + `reason_vi/reason_en`, chữ tiêu đề/nội dung link của web | `ScamShieldDtos.kt`, `RealScamShieldRepository.kt`, `ScamShieldResult.kt`, `ScamVerdict.kt` | `ScamCheckContractTest` (JSON thật của UAT 02/10), phản hồi thật trên máy thật: «Đường link có đặc điểm thường gặp ở link giả mạo» + lý do tiếng Việt |
| Chữ 3 trạng thái, tình huống, 113, disclaimer, QR không phải link: chép đúng từ `scamVerdict.ts`/`scamQr.ts` | `strings_scam_local.xml` (vi/en) | `ScamWordingCopyTest` (43 câu × 2 ngôn ngữ so từng ký tự) |
| QR classifier = bản sao `payload.ts` (bare host, scheme thanh toán, app_link, preview 500) | `QrCodes.kt` | `QrCodesTest` |
| Báo cáo bình luận/người dùng dùng đúng 2 route riêng; KHÔNG còn `POST /api/reports` | `SafetyApi.kt`, `SafetyRepository.kt` | `SafetyRepositoryTest` |
| Menu bài trong màn Chi tiết thiếu «Chặn người dùng» (lỗi Android thật) → thêm, chỉ khi `p8.userBlocks` | `ReviewsScreens.kt`, `ReviewDetailViewModel.kt` | `DetailBlockWiringTest`; máy thật: safety-report 17/17 |

**Test:** Debug / Release / UAT unit: mỗi bộ 1068 test, 0 lỗi (chạy 02/10 sau lần sửa cuối).

**Máy thật R58RC0V30BH (Samsung A12s, Android 11, 720×1600), APK UAT dựng từ `8763be5`:**
| Luồng | Kết quả | Bằng chứng |
|---|---|---|
| Lá chắn — tin nhắn (bình thường / phạt nguội / Trung thu / link giả) | PASS 16/16 | `e2e/out/2026-10-02T11-18-26/scam-shield-parity/android/*.png` (đã mở xem) |
| Lá chắn — QR (link giả / chữ / thanh toán / Wi-Fi / huỷ chọn ảnh) | PASS 7/7 | `e2e/out/2026-10-02T11-45-06/...` (đã mở xem) |
| Báo cáo bài + chặn người dùng + mất mạng + hàng `content_reports` trên server | PASS 17/17 | `out/phone-safety3.log` |
| nav-back, tuổi 18+, Gợi ý, Deals, thông báo | PASS (lượt trước, bản `1b12a7c`/`401a3e6`) | log trong `e2e/out/` |
| Hộp «Quy tắc cộng đồng» lần đăng đầu | PASS (2/3 kiểm tra đầu của composer) | `out/2026-10-02T12-17-45/composer/android/02-community-rules.png` |
| Đăng clip lên UAT | FAIL/chưa kiểm: bộ test không chọn được clip trên bộ chọn Samsung (xem cảnh báo) | `07-error.png` |
| Chat: thẻ hỏi 5 mảng, kính cường lực, phim 5 link rạp, vé máy bay «Bay từ đâu?» | **chưa kiểm trên máy thật**: bộ test cần cài app giả Zalo trùng gói với Zalo thật của máy (INSTALL_FAILED_VERSION_DOWNGRADE) — KHÔNG ép cài | — |
| Chia sẻ (Zalo/Messenger/TikTok) | chưa kiểm trên máy thật (cùng lý do) | — |
| Đăng nhập Zalo / Google | chưa kiểm (cần tài khoản thật) | — |

**⚠ Sự cố trong lúc kiểm (đã gỡ nguyên nhân):** ở bước «đăng ảnh», bộ test chọn «ảnh mới nhất» trên Samsung và đã đăng lên UAT (tài khoản test `e2e.android.pro`, DB audit) MỘT ảnh chụp màn hình của app đang có trong máy anh (không thấy thông tin cá nhân trong ảnh: danh sách ShopeeFood/TikTok Shop/Grab). Đã bỏ cách chọn đó khỏi luồng đăng bài, đã xoá hai tệp mẫu khỏi thư viện máy. Bài/ảnh trên UAT chưa xoá (cần anh quyết).

**AAB:** KHÔNG build. Lý do: còn mục BLOCKED (cờ production, Google OAuth, phê duyệt pháp lý chữ). AAB đang giữ `1b12a7c` (SHA-256 `bd0f659b…15c6`) đã LỖI THỜI so với mã hiện tại.
