# TappyAI — Báo cáo tổng hợp: Audit AI tư vấn (Phase 1) & Môi trường audit non-production

**Ngày:** 2026-09-17 · **Nhánh:** `design/v3-phase4` @ `f6712b8` (worktree `v3-phase4-design`) · **Người thực hiện:** Claude (Opus 5) theo uỷ quyền của owner
**Trạng thái cuối:** `READY FOR BASELINE — TASK COMPLETE` · **Baseline Phase 1: CHƯA CHẠY** (cần lệnh uỷ quyền riêng)

> Tài liệu này tóm tắt toàn bộ chuỗi công việc trong ngày, từ audit mã nguồn cho tới khi môi trường non-prod sẵn sàng. Chi tiết kỹ thuật và bằng chứng nằm trong các file được liệt kê ở §8. Không có secret, token, hay dữ liệu người dùng trong tài liệu này.

---

## 1. Mục tiêu ban đầu

Hiểu vì sao TappyAI đôi khi trả lời theo kiểu **USER → SEARCH → ĐỔ KẾT QUẢ TÌM KIẾM** thay vì **HIỂU Ý → QUYẾT ĐỊNH BẰNG CHỨNG → TÌM → ĐÁNH GIÁ → CHỌN/GỢI Ý → GIẢI THÍCH**, bằng cách:

1. Audit read-only toàn bộ pipeline AI thật (web/mobile → `/api/chat` → prompt → Haiku → tool → kết quả → hậu xử lý → client).
2. Chạy một baseline có kiểm soát trong môi trường DEV (15 câu × 2 lần, tối đa 36 lượt LLM/search).

Quy tắc cứng xuyên suốt: **không sửa code ứng dụng, không sửa prompt/tham số/tool/UI/mobile, không ghi vào production, không chạy LLM/search khi chưa đủ điều kiện an toàn.**

## 2. Dòng thời gian (10 phase trong ngày)

| # | Phase | Kết quả |
|---|---|---|
| 1 | **Phase 1 — Audit mã nguồn + baseline** | Audit hoàn tất; **DỪNG AN TOÀN** trước baseline vì `.env.local` trỏ thẳng vào Supabase **production** (`fwznnobrdctuskgrvuik`) và kho quota KV production. |
| 2 | **Review Phase 1** | Kiểm chứng lại từng kết luận; hạ 3 “P0” xuống **P1** (cơ chế chứng minh được từ code, nhưng **chưa đo** được quan hệ nhân quả); sửa 2 câu sai về mobile. |
| 3 | **Chuẩn bị môi trường (readiness)** | Không tồn tại bất kỳ tài nguyên non-prod nào trong repo/env. `NOT READY`. |
| 4 | **Phase 1A — thử provisioning** | PAT Supabase trong env đã **hết hạn (401)**; và phát hiện **bộ migration không tự dựng được schema** từ DB trống. `NOT READY`. |
| 5 | **Phase 1A.1 — điều tra bootstrap** | Chứng minh bằng phân tích phụ thuộc: 81 file `.sql`, thứ tự tên file sai ngay file thứ 3; 4 bảng (`reviews`, `profiles`, `user_memory`, `conversations`) **không có CREATE ở đâu cả**; cột `user_memory.budget/history` code đọc nhưng **không có DDL** trong Git. |
| 6 | **Phase 1A.2 — kiểm tra project “staging”** | `nhncoqyadofojjrnpiia` (`tappyai-staging`) được tài liệu nhắc tới nhưng **hostname không còn resolve** (đã xoá hoặc pause) → `UNVERIFIED — DO NOT USE`. |
| 7 | **Phase 1A.3 — provisioning tự động (lần 1)** | Owner cấp token mới nhưng scope thiếu; token chỉ có quyền **đọc DB** → trích xuất được **schema-only** của production (chỉ SELECT catalog, role read-only); tạo được project mới **`zdaprdfgpbpnxyofagmc`**; **chưa** apply được DDL, chưa lấy được API key. |
| 8 | **Phase 1A.3 (tiếp) — apply schema** | Owner thêm quyền Database WRITE → apply **1.233/1.233** câu DDL, **0 lỗi**; **parity 100%** với production. Vẫn thiếu quyền đọc API key. |
| 9 | **Phase 1A.3 (tiếp) — user/Pro/bearer/runtime** | Owner thêm quyền API Keys READ → lấy key, tạo **user audit**, gắn **Pro**, mint **bearer**, dựng **runtime riêng** (`audit-nonprod`, cổng 3101), xác minh runtime. Chỉ còn thiếu 3 vendor key. |
| 10 | **Hoàn tất + Finalization** | Owner dán 3 vendor key vào env audit → khởi động lại server, kiểm tra lại toàn bộ → **READY FOR BASELINE — TASK COMPLETE**. |

## 3. Kết quả audit Phase 1 (tóm tắt các phát hiện)

### 3.1 Pipeline thực tế (khác với kiến trúc mục tiêu “Haiku quyết định → tool → Haiku đánh giá”)
- Mỗi lượt chat chỉ có **một** lời gọi `AI.stream()` (`route.ts`), model `claude-haiku-4-5-20251001` cho mọi vai trò; `toolChoice = auto` (mặc định SDK), `maxSteps 5`, `maxTokens 3072`, **không** truyền `temperature`, **không** bật thinking, prompt caching **bật**.
- Phần “hiểu ý / đánh giá / xếp hạng / chọn” đều là **hàm thuần deterministic** (regex + ranker + shortlist + pick) chạy **trước** model hoặc **bên trong tool**; model chỉ được yêu cầu **giải thích** quyết định đã có (`_tappy_shortlist`, `_tappy_ranking`).
- Web/Android/iOS cùng gọi một endpoint `/api/chat` trên Vercel; không có Cloud Run; mobile không có logic AI phía client (chỉ parse marker). Android **không** gửi GPS; iOS có gửi `userLocation`.

### 3.2 Cơ chế được chứng minh từ code (P1 — chưa đo nhân quả)
| Mã | Phát hiện | Bằng chứng |
|---|---|---|
| A | 6/15 câu hỏi mẫu cho `need.domain = null` (vd. “quán Nhật ngon và yên tĩnh”) → **không gửi** khối hướng dẫn `_tappy_ranking` và khối “giao diện đã có thẻ” (web); nhưng `_tappy_shortlist` + luật R1b vẫn có trong prompt chung. | `route.ts:788-803`, `needProfile.ts` (từ điển SUBJECTS/DOMAIN_HINTS), `route-signals.json` |
| B | **Bằng chứng không mang được nhu cầu người dùng**: không provider nào trả về thuộc tính “yên tĩnh/chill/đẹp/sạch”; `quiet` không nằm trong `SCOREABLE` của ranker; cuisine chỉ có từ OSM; **giá quán không bao giờ vào ranker** (`normalizePlaces` không set `priceVnd`) → ranker chỉ xếp theo rating/review/khoảng cách. | `rank.ts:99`, `candidate.ts:120-154` |
| C | **Lượt hỏi tiếp không có bằng chứng trong ngữ cảnh**: lịch sử gửi cho model chỉ gồm text user + text assistant (tool result bị lược bỏ ở biên bảo mật); carry-forward bằng chứng (ADR-024) **chỉ có cho shopping**, không có cho địa điểm → “Quán này mở cửa mấy giờ?” không có dữ liệu để trả lời. | `clientInput.ts:196-199`, `route.ts:697-712` |
| P1 khác | Prompt chung (~38k ký tự) chứa nhiều mệnh lệnh kiểu **liệt kê** (dòng rating cho từng quán, địa chỉ, link maps “BẮT BUỘC”, CTA cho từng quán, “tóm tắt 2-3 kết quả” cho web_search) cạnh tranh với luật tư vấn R1/R1b/R4; web card **luôn** hiển thị danh sách ≤8 ứng viên bất kể prose; tiếng Việt không dấu bị nhận là tiếng Anh (2/12 case FAIL). | `promptBuilder.ts`, `liveView.ts`, `intent.ts` |

### 3.3 Giả thuyết còn mở (P2)
`temperature` chưa set, thinking tắt, `maxSteps = 5` — **không có bằng chứng** nào cho thấy chúng gây ra hiện tượng “đổ kết quả” (đo lường cũ ngày 2026-08-10 cho thấy trung bình chỉ 2 bước/lượt). Chỉ có baseline mới trả lời được.

### 3.4 Kiểm thử không cần LLM đã chạy
- 14 case nhận diện ngôn ngữ (10 PASS, 2 FAIL tiếng Việt không dấu, 2 case “AMBIGUOUS” mà code không có đầu ra đó).
- 15 câu hỏi mẫu chạy qua toàn bộ bộ phân loại tiền-model (kết quả trong `route-signals.json`).
- Đo kích thước/trật tự các khối prompt (`prompt-shape.json`).

## 4. Vấn đề môi trường & cách đã giải quyết

| Vấn đề | Cách xử lý |
|---|---|
| Env local = production (Supabase + KV quota); guest quota 5 lượt **trọn đời** theo IP → chạy local sẽ “đốt” IP của owner trên prod | Dừng an toàn; không chạy baseline. |
| Không có project Supabase non-prod nào; project “staging” cũ không còn tồn tại | Tạo project mới **`tappyai-consultative-audit`** (`zdaprdfgpbpnxyofagmc`, ap-southeast-1, free). |
| `supabase/migrations/**` không dựng được schema (thứ tự sai, thiếu CREATE cho 4 bảng, cột ngoài Git) | Trích xuất **schema-only** từ production bằng các câu `SELECT` trên catalog, dưới role `supabase_read_only_user` (không thể ghi). 1.235 câu DDL, **0 dòng dữ liệu, 0 user, 0 secret** (đã quét). |
| Management API giới hạn tần suất (429) và `SET check_function_bodies` không giữ qua các lời gọi | Apply theo lô 25 câu + back-off; mỗi lô prefix `SET`. Kết quả **1.233/1.233, 0 lỗi**. |
| Token fine-grained thiếu scope (3 lần) | Owner bổ sung lần lượt: Database WRITE → API Keys READ. |
| Classifier của Claude Code chặn việc copy secret từ `.env.local` production sang file khác | Owner tự dán 3 vendor key vào env audit (runtime-only, gitignored). |

## 5. Trạng thái môi trường audit hiện tại (đã xác minh)

| Thành phần | Production | Audit | Xác minh |
|---|---|---|---|
| Supabase | `fwznnobrdctuskgrvuik` | `zdaprdfgpbpnxyofagmc` | ✅ |
| Schema | — | Parity 100%: 70 bảng / 619 cột / 66 hàm / 244 ràng buộc / 211 index / 16 trigger / 95 policy / RLS 70 bảng / RPC `decision_evidence_*` | ✅ |
| Auth | issuer prod | issuer `https://zdaprdfgpbpnxyofagmc.supabase.co/auth/v1` | ✅ |
| User audit | — | `consultative-audit-user@example.com` (id `5c9cceb8…`), chỉ tồn tại ở project mới; có `profiles` qua trigger | ✅ |
| Pro | — | `subscriptions` `plan='pro'`, `status='active'`, hết hạn 2027-09-17; `/api/subscription` trả `isPro: true` | ✅ |
| Quota | KV prod | Instance-local (không có `KV_*`/`UPSTASH_*`/`REDIS_URL` trong env hiệu lực) | ✅ |
| Runtime | Vercel prod | Worktree `.claude/worktrees/audit-nonprod` @ `f6712b8`, `next dev` cổng **3101**, chỉ nạp `.env.local` của audit; ref prod **không** xuất hiện | ✅ |
| Model | — | Không có `LLM_*` override → `claude-haiku-4-5-20251001`, maxTokens 3072, maxSteps 5, toolChoice auto, temperature unset, thinking off, caching on | ✅ |
| Vendor key | tài khoản prod | Anthropic/Serper/Google Places **PRESENT** trong env audit (runtime-only) | ✅ |
| Dữ liệu | — | DB mới: 1 user, 1 profile, 1 subscription, 0 memory, 0 conversation, 0 review — **không có dòng nào từ production** | ✅ |
| Runner baseline | — | Từ chối ref production vô điều kiện; cap 36 lượt (30 chính + 6 setup); không retry; bearer chỉ qua env | ✅ |

Quyết định đã ghi: **`AUDIT_SURFACE = web`**, **khởi động lại server giữa lần chạy 1 và 2** (tránh cache 30 phút của `searchPlaces`).

## 6. Bộ đếm an toàn (toàn bộ ngày)

```text
LLM calls: 0 · Search calls: 0 · /api/chat calls: 0 · Baseline runs: 0
Ghi vào production: 0 (chỉ SELECT catalog, dưới role read-only)
Copy dữ liệu production: KHÔNG (schema-only; đã quét: 0 INSERT/COPY, 0 email thật, 0 token)
Sửa code ứng dụng: KHÔNG · Sửa migration: KHÔNG
Git: `git diff --stat` của worktree nguồn giống hệt snapshot đầu ngày; chỉ thêm docs/audit/** và scripts/audit/** (untracked); .env.local audit và .claude/launch.json đều gitignored
```

## 7. Việc cần làm trước khi chạy baseline (phase kế tiếp, cần uỷ quyền riêng)

1. **Mint lại bearer** — token hiện tại hết hạn lúc **14:44 (+07) ngày 17/09**; dùng thông tin đăng nhập đã lưu trong `.env.local` của worktree audit (password grant hoặc refresh token).
2. Đảm bảo server audit đang chạy (`preview_start` config `audit-nonprod`, cổng 3101).
3. Chạy runner **từ thư mục gốc worktree audit** (`…\.claude\worktrees\audit-nonprod`) với các biến `AUDIT_*` nạp từ `.env.local`; chạy `AUDIT_DRY_RUN=1` trước (0 request), rồi chạy thật.
4. Khởi động lại server giữa lần 1 và lần 2.
5. Kết quả sẽ ghi vào `docs/audit/baseline-before.json` (hiện đang là placeholder `baseline_executed: false`).

## 8. Danh sách artefact

| File | Nội dung |
|---|---|
| `docs/audit/consultative-audit-phase1.md` | Báo cáo audit Phase 1 + phần Review v1.1 (§R) |
| `docs/audit/route-signals.json`, `lang-detect-results.json`, `prompt-shape.json` | Kết quả các probe deterministic (không LLM) |
| `docs/audit/nonprod-environment-readiness.md` | Nhật ký readiness đầy đủ (mọi phase, ma trận tách biệt, gate cuối) |
| `docs/audit/nonprod-bootstrap-investigation.md` + `migration-dependency-analysis.json` | Chứng minh bộ migration không tự dựng được schema |
| `docs/audit/staging-verification.md` | Kết luận về project staging cũ |
| `docs/audit/schema-baseline/prod-schema-only.sql` (+ `manifest`, `apply-log*.json`, `verify-new-project.json`) | DDL schema-only của production, log apply, đối chiếu parity |
| `docs/audit/runtime-verification.json` | Env hiệu lực của runtime audit + kiểm tra `/api/subscription` |
| `docs/audit/baseline-before.json` | Placeholder, `baseline_executed: false` |
| `scripts/audit/baselineRunner.mjs` + 3 file `*.audit.test.ts` | Runner baseline (chưa chạy) và các probe |
| `.claude/worktrees/audit-nonprod/` | Runtime audit (code @ `f6712b8`, `.env.local` non-prod, `scripts/audit/`) |

## 9. Phát hiện phụ đáng lưu ý cho owner (ngoài phạm vi sửa của task)

- **Repo không tự dựng lại được database của chính nó** (khoảng trống DR): `reviews`, `profiles`, `user_memory`, `conversations`, các cột `user_memory.budget/history/discovery_city`, policy nền của `reviews` chỉ tồn tại ở production. File `prod-schema-only.sql` vừa tạo là bản chụp schema đầy đủ đầu tiên — nên cân nhắc đưa vào Git như baseline có kiểm soát.
- Project staging cũ `nhncoqyadofojjrnpiia` không còn resolve DNS — nên dọn tài liệu tham chiếu.
- Quota guest **5 lượt trọn đời theo IP** trên production là rào cản cho mọi kiểm thử từ máy dev; đã né bằng môi trường riêng, không đổi code.
