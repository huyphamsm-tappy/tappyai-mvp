# Containment backlog — phân loại 26 commit (2026-09-25)

**Chủ sở hữu quyết định.** Tài liệu này chỉ đề xuất; không có gì từ 44 nhánh được merge.
Nguồn: `docs/uat/evidence/merge-guard-2026-09-25/containment-all-at-HEAD-by-commit.txt` (lần chạy đầu, ship = HEAD),
và lần chạy lại với **ship = `rc/web-uat`** (SHIP_BRANCH đã đặt): `containment-rc-web-uat-after-f093.txt`.
Kết quả lần chạy lại (allowlist rỗng, sau `ee481d8`): **25 commit / 43 nhánh** — `6964bfb` đã được nhận là có trên nhánh ship; 25 commit còn lại đúng như bảng dưới.

Ba loại đề xuất:
- **Đưa vào (bring in)** — nội dung còn thiếu trên nhánh ship và cần cho launch.
- **Allowlist** — quyết định "chưa đưa vào" có lý do và hạn; hết hạn thì CI đỏ lại.
- **Bỏ (ignore as dead)** — đã vào bằng đường khác (squash / viết lại), hoặc ngoài phạm vi vĩnh viễn. Thực thi bằng một mục allowlist hạn dài, hoặc xoá nhánh (việc của chủ sở hữu).

"absent" / "%" = tỷ lệ dòng thêm của commit có mặt trong file cùng tên trên nhánh ship (ngưỡng 60%). Nhiều mục "absent"
là **đổi tên / di chuyển** (vd. `src/app/subscription` → `src/app/(app)/subscription`), không phải mất code — đã kiểm từng mục bên dưới.

---

## A. Dữ liệu người dùng / xoá tài khoản — 1 commit

| commit | nội dung | kiểm chứng | đề xuất |
|---|---|---|---|
| `6964bfb` (13d, `origin/claude/user-memory-auth-fk-f1z5nf`) | FK `user_memory.user_id` → `auth.users` ON DELETE CASCADE | Chủ sở hữu đã quyết (F-093 P1) | **Đưa vào — ĐÃ LÀM** `ee481d8` (nguyên văn; đổi port test 54379→54392). Áp lên audit; prod = DEPLOY-CHECKLIST D1 |

## B. Bảo mật AI — nhánh `integration/v3-foundation` / `security/v3-phase3` — 4 commit

| commit | nội dung | kiểm chứng | đề xuất |
|---|---|---|---|
| `66e4c46` (21d) | đóng 3 kênh egress (P3-F2/F4/F5) | đã khôi phục hôm nay dạng port (`streamEnrichment.ts` đã tách xa → chỉ 40% dòng khớp); live-verify + F-095 | **Allowlist** — "ported, không cherry-pick; khoá bằng `linkEgressBoundary.test.ts`", hạn 2026-10-31 |
| `a711181` (21d) | fence nội dung + streamEnrichment | đã khôi phục dạng port (MERGE-LOSS-AUDIT §2) | **Allowlist** — cùng lý do, hạn 2026-10-31 |
| `44d8f32` (21d) | test bất biến `needBriefBoundary` | module `needBrief` **không tồn tại** trên rc; bất biến đã khoá lại thành `decisionFrameBoundary.test.ts` | **Bỏ** |
| `2caff4b` (21d) | `/api/chat` bỏ thao tác service-role | chủ sở hữu: F-085 **hoãn sau launch** | **Allowlist** — "F-085 deferred by owner 2026-09-25", hạn = ngày launch + 30 ngày (đề xuất 2026-10-31) |

⚠️ Minh bạch: `containment-allow.json` **đã có** một mục cho hai nhánh này (tôi thêm sáng nay, dẫn quyết định F-085 của anh).
Anh xác nhận hoặc gạch nó; nếu gạch, CI đỏ lại với 4 commit trên.

## C. Chi phí / chất lượng AI (không phải bảo mật) — 6 commit

| commit | nội dung | kiểm chứng | đề xuất |
|---|---|---|---|
| `207658b` (38d, `feat/consultative-v2-ranking`) | finalize consultative v2 | đã vào rc dưới dạng `64ae1f8` "feat(ai): finalize consultative v2", sau đó được viết lại | **Bỏ** |
| `95c88af` (30d, `phase9-shopping-marker`) | marker quyết định mua sắm | đã vào qua squash `f0b5c51` (#179), #178, #180 | **Bỏ** |
| `efb5713` (30d, cùng nhánh) | gộp marker vào finalText trước detector | rc làm cùng việc theo cách khác (`markerSuffix`, `streamEnrichment.ts:2470`) | **Bỏ** |
| `ff55c27` (21d) | tối ưu chi phí AI (test đo lường, cache boundary) | rc có `cacheBreakpoints.test.ts` + `cache_control` trong `claude.ts`; `costPhase2.test.ts` không có | **Bỏ** (đo lường, không phải hành vi launch) — nếu anh muốn giữ số đo chi phí thì Allowlist tới 2026-10-31 |
| `abd11b6` (36d, 8 nhánh) | `mediaPolicy.ts` — ngân sách ảnh theo lượt | không có trên rc; #180 đã bỏ khối media thừa theo cách khác | **Allowlist** — "tối ưu chi phí ảnh, quyết định sau launch", hạn 2026-10-31 |
| `8feaed6` (36d) | test của `mediaPolicy` | như trên | theo `abd11b6` |

## D. Auth / quota / controller (web) — 3 commit

| commit | nội dung | kiểm chứng | đề xuất |
|---|---|---|---|
| `e568393` (33d, `fix/v2-fix-phase`) | release-readiness B07–U15 (quota ẩn danh, trang subscription) | đã vào qua squash `066473f` (#149), sau đó thay bằng một nguồn quota duy nhất `aiQuestionQuota` (`24b9fb8`); `SubscriptionView.tsx` "absent" = đã chuyển sang `src/app/(app)/subscription/` | **Bỏ** |
| `2fa8bb2` (46d, `origin/fix/login-return-to`) | một tham số `returnTo` chuẩn | rc có `src/lib/auth/returnTo.ts` + `__tests__/returnTo.test.ts` (viết lại, test đã chuyển thư mục → "absent") | **Bỏ** (đã được thay thế) |
| `f83d3c0` (25d, `fix/controller-origin-gate`) | trang admin analytics/auth của controller | chương trình controller v2 riêng, không thuộc launch web | **Allowlist** — "controller v2 program, not in launch", hạn 2026-11-30 |

## E. Năng lực sản phẩm ngoài phạm vi launch — 3 commit

| commit | nội dung | kiểm chứng | đề xuất |
|---|---|---|---|
| `56a5726` (11d, `feat/ccp-mvp`) | adapter PasGo | `commerce.ts:51` trên rc: "PasGo removed from scope; see ADR-028 addendum" | **Bỏ** |
| `23f5e30` (15d, `feat/tappy-business-p0`, `wip/tappy-business-p0-…`) | Tappy Business P0–P5 (Turnstile, `routeGuard`, `anonymousWriteBoundary`, `businessDataBoundary`) | không có trên rc; cũng không có trên `phase8-master` với các file này | **Allowlist** tới quyết định Business (đề xuất 2026-11-30). ⚠️ Nếu Business ship, các primitive bảo mật này phải đi CÙNG nó |
| `254c28b` (19d, 6 nhánh) | Phase 6 Discovery/Monetization + Contact Sync (4 migration) | rc không có migration nào và không có code nào dùng các bảng này — **nhưng DB audit CÓ các bảng** (`contact_sync_state`, `contact_identity_index`, `governed_events`, schema `ads`) | **Allowlist** tới quyết định Phase 6 (2026-11-30). ⚠️ Lệch schema: audit có bảng mà nhánh ship không tạo được lại — ghi nhận, không xoá |

## F. Android auth — 5 commit

| commit | nội dung | kiểm chứng | đề xuất |
|---|---|---|---|
| `cd4cb31` (57d, 19 nhánh) | validate OTP + **R8 keep rules cho supabase-kt** | `consumer-rules.pro` trên rc thiếu đúng 14 dòng keep `io.github.jan.supabase.**`; **không** file `.pro` nào trên rc có rule này; build release bật `isMinifyEnabled = true` | **Đưa vào — chỉ khúc R8** (14 dòng). Tác động UNVERIFIED: kotlinx.serialization bản mới tự mang rule cho lớp `@Serializable`, nên có thể đã đủ; chỉ một bản release minified đăng nhập thật (email OTP / refresh) mới trả lời được (F-098) |
| `5e13751` (59d) | đăng nhập Zalo (Custom Tab) | thuộc phiên Zalo (R-1), không chạm theo chỉ đạo | **Allowlist** — "Zalo workstream owns it", hạn 2026-10-31 |
| `4bce517`, `e0b88ec`, `f661081` (56d) | layout đăng nhập "WIP, not PASS" | `LoginScreen.kt` trên rc là bản V3 về sau (44% trùng) | **Bỏ** |

## G. Ảnh chụp WIP (backup) — 4 commit

| commit | nhánh | đề xuất |
|---|---|---|
| `beba191` | `wip/main-repo-2026-09-17` | **Bỏ** |
| `782ce59` | `wip/tappyai-controller-v2-2026-09-17` (có migration controller org) | **Bỏ** (controller program giữ bản gốc) |
| `67dab52` | `wip/tappyai-memberapi-2026-09-17` (forensic snapshot) | **Bỏ** |
| `f2998b1` | `wip/wtandroid-2026-09-17` (file subscription = nội dung `e568393`, khác CRLF) | **Bỏ** |

Đây là bản chụp công việc chưa commit ngày 2026-09-18, không phải ứng viên ship. Đề xuất chính sách: loại `^wip/` và
`^backup/` khỏi containment vĩnh viễn (một dòng regex trong `branch-containment.mjs` hoặc một mục allowlist hạn dài).

---

## Tóm tắt

| đề xuất | số commit | commit |
|---|---|---|
| Đưa vào | 2 | `6964bfb` (đã làm), `cd4cb31` (chỉ khúc R8 — chờ anh duyệt) |
| Allowlist có hạn | 9 | `66e4c46`, `a711181`, `2caff4b`, `abd11b6`, `8feaed6`, `f83d3c0`, `23f5e30`, `254c28b`, `5e13751` |
| Bỏ | 15 | `44d8f32`, `207658b`, `95c88af`, `efb5713`, `ff55c27`, `e568393`, `2fa8bb2`, `56a5726`, `4bce517`, `e0b88ec`, `f661081`, `beba191`, `782ce59`, `67dab52`, `f2998b1` |

## SHIP_BRANCH
`.github/workflows/merge-guard.yml`: mặc định đổi từ `main` sang **`rc/web-uat`**; biến repo `SHIP_BRANCH` vẫn ghi đè được.
Chưa push, nên CI trên GitHub chưa thấy thay đổi này; đặt biến repo `SHIP_BRANCH=rc/web-uat` trên GitHub là việc của anh
(cần quyền repo, tôi không làm).
