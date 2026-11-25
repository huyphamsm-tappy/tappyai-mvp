# FRAGMENT — Mục 10 (Security), 11 (Quota/Budget), 12 (Observability/Test) — TappyAI

Nguồn: D:/TappyAI-wt/wt-integration, nhánh feat/brain-r13-p1, HEAD b0fe4bf13ac77629a6662a6bae068c393ed767de. READ-ONLY, ngày 2026-11-18.
Không chạy test/build, không truy cập DB/production/mạng, không đọc .env*. Mọi nhãn trạng thái dưới đây dựa trên CODE (đọc mã) trừ khi ghi rõ.
Quy ước nhãn: IMPLEMENTED = có mã; TESTED = có tệp test trong repo (CHƯA CHẠY trong audit này, nên "TESTED" chỉ nghĩa là test tồn tại); VERIFIED = chưa gắn cho mục nào (cần chạy/đối chiếu); PRODUCTION VERIFIED = KHÔNG gắn cho bất kỳ mục nào (không có bằng chứng production trong phạm vi audit).
Bằng chứng: CODE / LOG / BENCHMARK / SUY LUẬN / CHƯA XÁC MINH. Mức: THẤP / TRUNG BÌNH / CAO. Độ chắc chắn: chắc / vừa / thấp.

---

## 10. Security, Safety, Permissions, Data Isolation

### 10.1 Điểm mạnh (CODE)

1. **Xác thực hai đường, kiểm thật theo người dùng.** `src/lib/auth/getRequestUser.ts` (hàm `getRequestUser`, dòng 17-43): Bearer JWT gọi `supabase.auth.getUser(bearerToken)` (dòng 35), cookie web gọi `getUser()` (dòng 41); client trả về mang danh tính nên RLS `auth.uid()` hoạt động. Middleware `middleware.ts` dòng 41 dùng `getUser()` (không `getSession()`). IMPLEMENTED; test `src/lib/auth/*` (13 tệp test). Không gắn PRODUCTION VERIFIED.
2. **Ranh giới ghi ẩn danh phủ cả bề mặt API từ filesystem**: `src/lib/auth/anonymousWriteBoundary.test.ts` (dòng 11-41: duyệt mọi `route.ts` có POST/PUT/PATCH/DELETE; route chưa phân loại thì FAIL; bảng `EXEMPT` có lý do từng mục). Có 213 `route.ts` dưới `src/app/api` (đếm bằng find). IMPLEMENTED + TESTED (test tồn tại). Độ chắc: chắc về cơ chế; CHƯA KIỂM TRA kết quả chạy.
3. **SSRF nhiều lớp.**
   - `src/lib/security/safePageFetch.ts`: `validateHop` (dòng 75) kiểm từng hop (cả redirect) trước khi mở socket, `realHop` (dòng 111) dùng `lookup: safeLookup` (dòng 125), giới hạn `PAGE_FETCH_DEFAULTS` (dòng 70: 800 KB, 4 redirect, timeout 3/5/8 s).
   - `src/lib/security/safeFetch.ts`: `safeGetText` (dòng 167) tự lặp redirect từng hop và kiểm `isSafeHttpsUrl` mỗi hop (dòng ~178); khoảng hở IP-literal ở redirect đã được vá và có test `src/lib/security/__tests__/safeGetTextRedirect.test.ts`.
   - `src/lib/security/urlGuard.ts`: `isSafeHttpsUrl` (dòng 18-43) chỉ https, không credential, chặn localhost/.local/.internal, IP literal đi qua `isAllowedDestinationAddress` (`addressPolicy.ts`).
   - `src/app/api/link-preview/route.ts` dùng `publicRateLimit` (dòng 24) + `isSafeHttpsUrl` (dòng 28) + `fetchPublicPage` (dòng 33).
   IMPLEMENTED + TESTED (test tồn tại).
4. **URL grants (chống dữ liệu không tin cậy sinh link).** `src/lib/ai/security/urlGrants.ts` (header dòng 3-35): URL chỉ được cấp quyền từ trường nêu trong `TOOL_URL_CONTRACT` (dòng 143); ba quyền `action|turn|source` (dòng 45); tool lạ hoặc trường lạ không cấp gì; URL trong văn bản (snippet, trang web) không bao giờ được cấp. `urlsFromToolResult` (dòng 214), `serverBuiltAllowed` (dòng 199). Test: `urlGrants.test.ts`, `urlGrantsBuilderContract.test.ts`, `linkEgressBoundary.test.ts`. IMPLEMENTED + TESTED (test tồn tại). Giới hạn do chính tác giả ghi (dòng ~22-26): trong văn bản prose, bộ lọc egress không phân biệt được link trích dẫn với link hành động, URL loại `source` viết dạng markdown link vẫn được giữ — mức THẤP-TRUNG BÌNH, chắc (CODE, comment tự thừa nhận).
5. **Prompt injection / dữ liệu không tin cậy từ công cụ.** Có tầng riêng `src/lib/ai/security/`: `fence.ts`, `toolResultFence.ts`, `outputSanitizer.ts`, `clientInput.ts`, `src/lib/ai/tools/serperUntrusted.ts`, test `viPromptInjectionSuite.test.ts`, `fenceBoundary.test.ts`, `imageEgressBoundary.test.ts`; prompt tách biến không tin cậy khỏi system (`src/lib/ai/agent/prompt.ts` dòng ~181). Có harness đo ngoài CI: `scripts/consult/injection/injectionCheck.mjs` (tiêu chí: 0 obeyed, 0 leak, 0 link ngoài allow-list). IMPLEMENTED + TESTED; BENCHMARK chỉ là script, CHƯA KIỂM TRA kết quả chạy gần nhất.
6. **Cron auth** thống nhất: `src/lib/security/cronAuth.ts` `isAuthorizedCronRequest` (dòng 14-22) so sánh hash SHA-256 + `timingSafeEqual`, fail-closed khi thiếu `CRON_SECRET`. Cả 25 route trong `src/app/api/cron/*/route.ts` đều dùng hàm này (kiểm bằng grep, không route nào thiếu). Registry quy định mọi route cron tốn tiền phải kiểm secret. IMPLEMENTED + TESTED (`cronAuth.test.ts`).
7. **Webhook SePay.** `src/lib/payments/sepay.ts`: HMAC-SHA256 trên RAW body (`sepaySignature` dòng 72, `checkSepaySignature` dòng 82), lệch thời gian tối đa 300 s (dòng 70), `constantTimeEqual` (dòng 115), fail-closed khi thiếu secret (dòng 89-90), allowlist IP tuỳ chọn (`sepaySourceAllowed` dòng 107, TẮT mặc định), chế độ `apikey` thay thế (dòng 65). `src/app/api/payments/sepay/route.ts` dòng 41-55: 404 khi `subscriptionsEnabled()` tắt, verify trước mọi xử lý; quyết định trong một giao dịch DB `p8_payments_apply_sepay` (dòng 59), idempotent theo id giao dịch (comment dòng 10-11). TESTED: `route.test.ts`, `supabase/tests/p8_payments*.test.ts`.
8. **Apple IAP.** `src/lib/apple-iap/jws.ts`: xác minh chuỗi x5c, pin SHA-256 của Apple Root CA G3 (dòng 25-37, 123-128), kiểm cấu trúc đúng 3 chứng chỉ + OID đánh dấu leaf/intermediate (dòng 57-72). `src/app/api/iap/apple/verify/route.ts` dòng 125-127: production thiếu cấu hình Apple thì fail-closed 503. TESTED: `jws.test.ts`, `appleIapPolicy.test.ts`.
9. **Consent AI phía server.** `src/lib/ai/consent/aiConsentGuard.ts` `refuseWithoutAiConsent` (dòng 14-26): lỗi đọc = chặn. Gọi từ 6 route: chat (`chat/route.ts` dòng 561), explore/process, messaging/threads/[id]/media, scan, translate, video/uploads, viet-content (grep). IMPLEMENTED + TESTED.
10. **Xoá tài khoản.** `src/lib/account/selfDelete.ts` (`deleteOwnAccount`, `staffStatus` fail-closed khi lỗi tra cứu, dòng ~45-60); xoá theo FK/trigger + cron `account-deletion-jobs`; migrations `20260925_account_deletion_cascade_gaps.sql`; test DB `account_deletion_*.test.ts` (3 tệp). Cờ `ACCOUNT_SELF_DELETE_ENABLED` (dòng 22). IMPLEMENTED + TESTED; trạng thái cờ và migration trên production CHƯA XÁC MINH (comment dòng 19-20 ghi "NOT on production" tại thời điểm viết).
11. **Kiểm duyệt/blocks/reports.** `src/lib/safety/{userBlocks,userReports,moderationDecisions,operatorAlert}.ts`; test DB `user_blocks*.test.ts`, `user_reports*.test.ts`, `content_reports_flood_guard*.test.ts` (kể cả test đồng thời), `moderation_queue_boundary.test.ts`, `chat_honours_user_blocks.test.ts`. IMPLEMENTED + TESTED.
12. **RLS/RPC có lưới test DB thật.** `supabase/tests/` có 85 tệp test (embedded-postgres), gồm `rls_cross_user_matrix.test.ts`, `platform_hardening_phase0.test.ts`, `*_boundary*.test.ts`, `deal_click_rpc_revoke.test.ts`. Chính sách grant: `scripts/architecture/check-sql-grants.mjs` + ADR-019 (ERROR cho migration mới/sửa, INFO cho migration lịch sử); CI chạy `npm run check:sql-grants`. IMPLEMENTED + TESTED.
13. **Headers.** `next.config.mjs` dòng 77-168: CSP đầy đủ, `frame-ancestors 'self'` (dòng 118), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (dòng 166), HSTS `max-age=63072000; includeSubDomains; preload` (dòng 168), CSP Report-Only thử nghiệm bỏ `unsafe-inline` (dòng 146-154) + `/api/csp-report` (`src/lib/security/cspReport.ts`, body ≤ 20 KB, 30/min/IP theo `anonymousWriteBoundary.test.ts` EXEMPT).
14. **Bí mật (chỉ có/không):** `.gitignore` loại `.env`, `.env*.local` (dòng 26-28); `git ls-files` chỉ thấy `.env.local.example` (không thấy keystore/.jks/.p8/service-account trong danh sách tệp đã theo dõi). Có script kiểm env `scripts/check-env.mjs`, `scripts/prodEnvGuard.mjs` (chưa mở nội dung chi tiết). Không có bí mật nào được in trong tài liệu này.

### 10.2 Lỗ hổng / nợ kỹ thuật / thành phần thiếu

| # | Phát hiện | Bằng chứng | Mức | Chắc |
|---|---|---|---|---|
| S1 | **10 route tốn tiền/phát thông báo còn `known-gap`** (budget được ratchet `KNOWN_GAP_BUDGET = 10`): translate, scan (chỉ daily-per-IP, không burst, không trần toàn cục), messaging/threads/[id]/messages, stripe/checkout, stripe/portal, 4 route report (messaging, comments, users, reviews), users/[id]/block. | `src/lib/security/costRoutes/registry.ts` dòng 19, 61-73 | TRUNG BÌNH (CAO nếu SUBSCRIPTIONS_ENABLED tắt trên production: stripe/checkout, stripe/portal gọi Stripe mà không có limiter, đạt được bởi session ẩn danh theo chính ghi chú dòng 65-66) | chắc (CODE); trạng thái cờ production CHƯA XÁC MINH |
| S2 | **Giới hạn công khai chỉ theo-instance khi không có KV**; production KV được ghi "unverified" trong nhiều ghi chú registry. Nếu thiếu store trên production chỉ có log `tappyai_limiter_store_missing` (một lần/instance), không chặn. | `publicRateLimit.ts` dòng 38-47, 56-62; `registry.ts` dòng 28-33 | TRUNG BÌNH | chắc (CODE); tình trạng KV production CHƯA XÁC MINH (comment dòng 34-37 ghi từng kiểm bằng `vercel env ls`, không có bằng chứng lần này) |
| S3 | **Limiter tiêu thụ trong tiến trình cho các endpoint report/block/messages** (10 báo cáo/10 phút, 30/phút per instance) không dùng kho chung. | `registry.ts` dòng 63, 69-73 | TRUNG BÌNH | chắc |
| S4 | **CSP production còn `script-src 'self' 'unsafe-inline'`**; bản siết chặt mới chạy Report-Only. Chưa có nonce. | `next.config.mjs` dòng 107, 146-154 | TRUNG BÌNH | chắc |
| S5 | **Webhook Stripe**: `stripe-signature` đọc bằng non-null assertion `!` và `STRIPE_WEBHOOK_SECRET!` (không kiểm cấu hình trước), không kiểm cờ `subscriptionsEnabled()`, không rate limit (registry đánh `exempt`). Chữ ký sai vẫn bị `constructEvent` ném lỗi (cần đọc hết xử lý lỗi — CHƯA KIỂM TRA bao gồm idempotency theo event id). | `src/app/api/webhooks/stripe/route.ts` dòng 9, 13 | THẤP-TRUNG BÌNH | vừa |
| S6 | **Allowlist IP SePay TẮT mặc định**; cơ chế HMAC là lớp chính. Không có bằng chứng cấu hình thật. | `sepay.ts` dòng 107-113 | THẤP | chắc |
| S7 | **Middleware không chặn `/api/admin/*`**; chỉ chặn trang `/admin` khi chưa đăng nhập. Phân quyền thật dựa vào từng handler (`src/lib/controller/**`, test `adminRateLimitContract.test.ts`, `admin_role_actor_boundary.test.ts`). Quét nhanh grep ghi chú auth trong các `admin/**/route.ts` không thấy route nào thiếu dấu hiệu guard, nhưng đây là suy luận từ từ khoá, không phải chứng minh. | `middleware.ts` dòng 41-52 | THẤP-TRUNG BÌNH | thấp (kiểm tra bằng từ khoá) |
| S8 | **Dữ liệu định danh hạ tầng nằm trong mã làm giá trị mặc định** (project ID GCP, project number, tên service account Logging) — định danh, không phải bí mật. | `src/lib/observability/sink.ts` dòng 7-12 | THẤP | chắc |
| S9 | **Nhận diện anonymous**: quota khách khoá theo IP (`aiQuotaIdentity` dòng 101-105) nên có thể gom nhiều người sau NAT / né bằng đổi IP; ẩn danh theo user id Supabase (lifetime 5). | `aiQuestionQuota.ts` dòng 101-111 | THẤP-TRUNG BÌNH | vừa (SUY LUẬN) |
| S10 | **Tài liệu/comment lệch mã**: comment ở `aiDataConsent.ts` dòng 3-5 nói "the server does not … gate chat" nhưng `chat/route.ts` dòng 561 có gọi `refuseWithoutAiConsent`; comment `regression.yml` nói "97 files". Gây rủi ro đọc sai khi audit. | như trên | THẤP | chắc |
| S11 | **Trạng thái RLS/SECURITY DEFINER production CHƯA XÁC MINH.** 8 tệp migration có `SECURITY DEFINER` mà không có `search_path` trong chính tệp (20260704_backfill_review_counters, 20260807_platform_hardening_phase0, 20260807_platform_owner_revoke_public_execute, 20260807b_sync_last_login_revoke_public_execute, 20260901_marketing_governance_foundation, 20260925_account_deletion_cascade_gaps, 20260927_owner_update_column_privileges, add_gatea_db_hardening). Ít nhất 4/8 chỉ nhắc cụm từ trong comment (đã xem), chưa kiểm hàm nào thực sự thiếu `SET search_path`; có thể được sửa ở migration khác. | grep `SECURITY DEFINER` vs `search_path` trên `supabase/migrations/*.sql` | THẤP-TRUNG BÌNH | thấp |
| S12 | **108/213 route.ts không có tệp test cùng thư mục** (đếm theo file tên chứa "test" trong cùng thư mục). Có thể được phủ bởi test tập trung (`publicBoundary`, `anonymousWriteBoundary`, `costRouteCoverage`) — CHƯA XÁC MINH từng route. | find/ls trên `src/app/api` | TRUNG BÌNH | thấp |
| S13 | **Không có bằng chứng quét bí mật / SAST / `npm audit` / CodeQL trong CI** (xem 12.3). Chỉ có Dependabot (`.github/dependabot.yml`) và test kiểm byte điều khiển. | grep workflows | TRUNG BÌNH | chắc (về việc vắng mặt trong repo) |

### 10.3 CHƯA KIỂM TRA (mục 10)
- Chạy thực tế bộ test bảo mật/RLS (db project) và `check:sql-grants`.
- Chính sách RLS từng bảng thực tế trên DB production/UAT; quyền EXECUTE hiện hành của RPC SECURITY DEFINER.
- Cấu hình thực của KV (Upstash) và các biến môi trường production (cờ SUBSCRIPTIONS_ENABLED, ACCOUNT_SELF_DELETE_ENABLED, CRON_SECRET, SEPAY_*, MCP_GATEWAY).
- Xử lý lỗi và idempotency của `webhooks/stripe` và `iap/apple/notifications` (chỉ đọc đầu tệp).
- Phạm vi guard từng route trong `src/app/api/admin/**` (chỉ kiểm theo từ khoá).
- Tuân thủ xoá tài khoản end-to-end (xoá file GCS, thu hồi Google) trên môi trường thật.
- Kết quả chạy `injectionCheck.mjs` gần nhất.

---

## 11. Quota, budget controller, cost tracking (chỉ đường code chặn/đo)

### 11.1 Các lớp chặn (CODE)

| Lớp | File:symbol:dòng | Trạng thái |
|---|---|---|
| Rate limit công khai (IP) | `publicRateLimit` (`src/lib/security/publicRateLimit.ts` dòng 56); gọi trong chat tại `chat/route.ts` dòng 259 (`chat:ip:`) | IMPLEMENTED + TESTED |
| Burst theo tài khoản | `chat/route.ts` dòng 1255 (`chat:user:`) | IMPLEMENTED |
| Hạn mức câu hỏi AI (khách/ẩn danh = trọn đời, đăng ký = theo ngày VN) | `consumeAiQuestion` (`src/lib/ai/quota/aiQuestionQuota.ts` dòng 183), `bucket` (dòng 107-113), `refundAiQuestion` (dòng 216, hoàn lượt khi trả lời lỗi) | IMPLEMENTED + TESTED (`aiQuestionQuota.test.ts`, `planQuota.test.ts`, `quotaWeights.test.ts`, `quotaAccountStable.test.ts`) |
| Trần toàn cục Deep Research/ngày | `withinGlobalDeepCeiling` (`globalCeiling.ts` dòng 17-19), mặc định 300 (dòng 10), env `AI_GLOBAL_DEEP_DAILY` | IMPLEMENTED + TESTED (`globalCeiling.test.ts`) |
| Hạn mức Deep Research theo gói | `consumeDeepResearch` (dòng 243) gọi tại `chat/route.ts` dòng 3743-3767 | IMPLEMENTED |
| Cost gate trần ngày USD theo tài khoản (trần ẩn) | `src/lib/ai/cost/costGate.ts`: `costGateOn` (dòng 33), `TURN_RESERVE_USD` (dòng 38), `DEFAULT_DAILY_CAP_USD` free 0.4 / pro 1.5 / promax 3.0 (dòng 40), reserve → settle → release, fail-closed khi kho lỗi (header dòng 17-19) | IMPLEMENTED + TESTED (`costGate.test.ts`); **MẶC ĐỊNH TẮT** (`AI_COST_GATE=1` mới bật) và **khoá tắt trong runtime production** trừ khi liệt kê trong `CONSULT_PRODUCTION_ALLOW` (dòng 19, 33) |
| Spend gate (đo/benchmark) | `src/lib/ai/budget/spendGate.ts` `reserveSpend`; `BENCH_SPEND_GATE` mặc định TẮT (dòng 5-10); hằng số trần 0.10 USD/turn, 0.65 USD/run (dòng 29-30) | IMPLEMENTED; dùng cho harness đo, KHÔNG phải kiểm soát production |
| Trần chi tiêu tiến trình LLM (Responses API) | `reserveBudget` (`src/lib/ai/llm/providers/openai.ts` dòng 225-233): bắt buộc `LLM_RESPONSES_PROCESS_BUDGET_USD > 0` nếu không ném `ResponsesBudgetError`; `procSpendUsd` là biến module (dòng 220-222) | IMPLEMENTED + TESTED; xem ghi chú Q3 |
| Trần Serper | `serperClient.ts` trần tín dụng chung; `serperRequestCap.ts`, `serperToolBudget.ts`; `chat/route.ts` dòng 57-58, 68, 2737-2740 | IMPLEMENTED |
| Ledger chi phí | `recordAiUsage` (`src/lib/ai/usage/usageLedger.ts` dòng 96), bảng `ai_usage_events` (migration `20261101_ai_usage_events.sql`); header ghi rõ "COST REPORTING ONLY: no limit reads it"; cờ `AI_USAGE_LEDGER=1` | IMPLEMENTED; kích hoạt trên production CHƯA XÁC MINH |
| Phân biệt gói, miễn trừ | `accountQuotaFor` (`aiQuestionQuota.ts` dòng 267-276), `resolveAccountQuota` (dòng 279); `subscriptionsEnabled` (`src/lib/payments/flags.ts` dòng 8-11); `chat/route.ts` dòng 1246-1248 | IMPLEMENTED + TESTED |

### 11.2 Lỗ hổng / nợ kỹ thuật

| # | Phát hiện | Bằng chứng | Mức | Chắc |
|---|---|---|---|---|
| Q1 | **Khi `SUBSCRIPTIONS_ENABLED` tắt (trạng thái phát hành được nêu), mọi người dùng có subscription hoạt động bị `exempt` khỏi hạn mức câu hỏi** (`accountQuotaFor` dòng 273); chỉ còn burst/phút và các trần Serper/Deep. Cost gate (trần ngày USD) lại TẮT mặc định và bị khoá ở production. Tức là không có trần ngày theo tài khoản cho người dùng "Pro" nếu cả hai điều kiện đúng trên production. | `aiQuestionQuota.ts` 267-276; `costGate.ts` 33; `chat/route.ts` 1244-1248 | TRUNG BÌNH (CAO nếu có người dùng trả phí thực) | chắc về logic (CODE); giá trị cờ production CHƯA XÁC MINH |
| Q2 | **Cost gate chưa bật cho production** — lưới an toàn cuối cùng (trần ngày USD) không hoạt động theo mặc định. | `costGate.ts` dòng 19, 33 | TRUNG BÌNH | chắc |
| Q3 | **Trần tiến trình `procSpendUsd` nằm trong bộ nhớ từng instance** (dòng 220): không chia sẻ giữa lambda, mất khi cold start; vì vậy là "trần theo instance", không phải trần toàn hệ thống. Comment tự mô tả "in-process". | `openai.ts` dòng 218-233 | TRUNG BÌNH | chắc (CODE) |
| Q4 | **Phụ thuộc kho đếm chung (KV/Upstash) cho mọi trần phân tán**; không KV thì quota rơi về `localSpend` theo instance (`aiQuestionQuota.ts` dòng 185-193, 117-135). Tình trạng KV production CHƯA XÁC MINH. | như trên | TRUNG BÌNH | chắc về cơ chế |
| Q5 | **Ledger không giới hạn gì** (chỉ báo cáo) và chỉ ghi lượt của tài khoản đăng nhập (`userId: string | null` nhưng "one row per AI turn of a signed-in account"); lượt ẩn danh/khách không có số liệu chi phí bền vững ngoài log console. | `usageLedger.ts` dòng 1-6 | THẤP | vừa |
| Q6 | **Hoàn lượt (refund) best-effort**: nếu kho lỗi thì lượt giữ nguyên bị tính (an toàn hơn), nhưng có nhiều điểm hoàn (`chat/route.ts` dòng 1287, 1309, 3715, 3772, 3782) — độ phức tạp cao trong một tệp 4.682 dòng. | `chat/route.ts` | THẤP-TRUNG BÌNH | vừa (SUY LUẬN) |
| Q7 | **Tệp `src/app/api/chat/route.ts` dài 4.682 dòng** chứa phần lớn logic quota/gate/tool — rủi ro bảo trì và rà soát. | `wc -l` | THẤP-TRUNG BÌNH | chắc |
| Q8 | Có hai bộ giá/trần chi phí không nối nhau: `costGate.ts` (TURN_RESERVE_USD, DEFAULT_DAILY_CAP_USD) và `spendGate.ts` (benchmark), cộng `LLM_RESPONSES_FORECAST_USD` mặc định 0.02 (`openai.ts` dòng 218, 229). Không có nơi duy nhất định nghĩa chi phí — CHƯA KIỂM TRA mức độ lệch số. | các tệp trên | THẤP | thấp |

### 11.3 CHƯA KIỂM TRA (mục 11)
- Giá trị `LLM_RESPONSES_PROCESS_BUDGET_USD`, `AI_COST_GATE`, `AI_USAGE_LEDGER`, `AI_GLOBAL_DEEP_DAILY`, `SUBSCRIPTIONS_ENABLED` trên production.
- Tính đúng của `TURN_RESERVE_USD` so với chi phí thực (thuộc tác tử chi phí).
- Hành vi dưới tải song song (race trên `consumeAiQuestion` + `distributedCountInWindow` hai bước riêng: `aiQuestionQuota.ts` dòng 195-196 đọc số đếm sau khi tăng — `used` có thể lệch khi đồng thời; CHƯA KIỂM TRA bằng test).
- Quota Android/iOS (ngoài phạm vi này).

---

## 12. Observability, logging, benchmark, test infrastructure

### 12.1 Điểm mạnh (CODE)

1. **Sink Cloud Logging có từ vựng sự kiện đóng**: `src/lib/observability/events.ts` (`ObservabilityEvent` union dòng 363+, 16 biến thể kiểu với trường số/boolean/chuỗi từ vựng đóng; header dòng 1-20: không prompt, không nội dung người dùng, không định danh quy về người). `cloudLogging.ts`, `sink.ts` (xác thực WIF/OIDC, scope chỉ ghi log), kill switch `loggingEnabled`. Test: `cloudLogging.test.ts`, `privacy.test.ts`, `pending.test.ts`. IMPLEMENTED + TESTED.
2. **Log vận hành dạng JSON `tappyai_*`**: 182 giá trị `type:` khác nhau xuất hiện dưới `src/` (đếm bằng grep, gồm cả test); ví dụ `tappyai_usage`, `tappyai_rate_limit`, `tappyai_llm_call`, `tappyai_limiter_store_missing` (`publicRateLimit.ts` dòng 33), `tappyai_usage_ledger` (`usageLedger.ts` dòng 100). Dùng cho đo benchmark (xem memory: log đo có sẵn thời gian + chi phí từng chặng) — nguồn bằng chứng LOG, CHƯA đọc log thật.
3. **Ledger** `ai_usage_events` (11.1) + `src/lib/ai/turnCost`, `serperMeter` (`chat/route.ts` dòng 6, 232, 2637) → đo chi phí từng lượt.
4. **Phân tích**: PostHog (`src/components/PostHogProvider.tsx`, `src/app/layout.tsx`), `connect-src` cho PostHog/GA4 trong CSP (`next.config.mjs` dòng 139); test DB `user_events_ga4_event_types_boundary.test.ts`; thư mục `src/lib/analytics` (8 tệp test). CSP report: `/api/csp-report`.
5. **Hạ tầng test (vitest projects)** — `vitest.config.ts`: project `app` (`src/**/*.test.{ts,tsx}`, `scripts/**/*.test.{ts,mjs}`) song song đầy đủ; project `db` (`supabase/tests/**/*.test.ts`, PostgreSQL nhúng thật, `fileParallelism: false`, hookTimeout 180 s). `npm test` = `vitest run` + JSON report + `scripts/requiredSuites.mjs` (package.json dòng 16) để biến "suite không chạy (skipped)" thành thất bại — khắc phục đúng lỗi ghi trong header `vitest.config.ts` (đo được 5796 pass exit 0 mà bỏ ~300 test DB).
6. **Số tệp test (đếm bằng find `*.test.*`, KHÔNG chạy):** `src/lib` 1.230, `src/app` 321, `src/components` 147, `scripts` 84, `supabase/tests` 85; tổng git-tracked `*.test.*`/`supabase/tests/**` = 1.873. Theo thư mục `src/lib`: `ai` 618, `media` 60, `scam-shield` 38, `controller` 32, `admin` 32, `chat` 29, `recommendation` 25, `share` 24, `security` 24, `i18n` 23, `safety` 19, `notifications` 19, `mcp` 18, `ccp` 17, `policy` 16, `business` 15, `config` 13, `auth` 13, `account` 13, `messaging` 11, `payments` 6, `plans` 8, `tvi` 5.
7. **Test guard cấp kiến trúc** (đều tồn tại): `src/lib/ai/consultative/architectureFreeze.test.ts`; `src/app/publicBoundary.test.ts`; `src/lib/auth/anonymousWriteBoundary.test.ts`; `scripts/release/applyMigrationPolicy.test.ts`; `src/lib/security/costRoutes/costRouteCoverage.test.ts` (ratchet `KNOWN_GAP_BUDGET`); `scripts/repoHygiene.test.ts`; `scripts/controlBytes.test.mjs`; `scripts/vercelIgnore.test.ts`; `scripts/prodEnvGuard.test.mjs`; `scripts/noShebangInImportedScripts.test.mjs`; `src/lib/ai/aiContextBoundary.test.ts`.
8. **CI (.github/workflows)**: `regression.yml` (job `regression`: `npm ci` + `npm test`, timeout 25 phút; job `static`: `check:control-bytes`, `tsc --noEmit`, `npm run lint`, `check:sql-grants`), `architecture-guard.yml` (`node scripts/architecture/check.mjs`: vendor SDK ngoài lớp provider, model id cứng… + `validate:brands`), `merge-guard.yml` (merge không làm rơi thay đổi, kiểm "branch-containment" hằng ngày bằng cron), `ios*.yml` (4 workflow iOS). Action được pin SHA; `permissions: contents: read`; có `CODEOWNERS`, `dependabot.yml`. IMPLEMENTED.
9. **Script UAT/benchmark**: `scripts/uat/{uat60-run.mjs,uat-cost.mjs,liveProbe.mjs,layout-metrics.mjs,consultUat/,exploreVideo.uat.ts,vitest.uat.config.ts}`, `scripts/agent-eval/{agentEval.test.ts,latency.mjs,scenarios.json}`, `scripts/consult/{brainEval.test.ts,injection,luna,replay}`. BENCHMARK: có công cụ; kết quả CHƯA KIỂM TRA.

### 12.2 Lỗ hổng / nợ kỹ thuật / thành phần thiếu

| # | Phát hiện | Bằng chứng | Mức | Chắc |
|---|---|---|---|---|
| O1 | **Bất biến "từ vựng sự kiện đóng" chỉ áp cho đường `log()` kiểu**; ít nhất 57 tệp mã sản xuất vẫn phát `console.log/warn/error(JSON.stringify({ type: 'tappyai_…' }))` trực tiếp, ngoài union. Chỉ có 8 tệp import `@/lib/observability`. Cam kết riêng tư "không biên dịch nếu sai" do đó không bao trùm phần lớn log. Nội dung các log thô CHƯA rà để tìm PII. | grep trong `src/**/*.ts` | TRUNG BÌNH | chắc về cấu trúc; nội dung PII CHƯA KIỂM TRA |
| O2 | **Không thấy trace phân tán/correlation id/OpenTelemetry**; chỉ log JSON + `auditTrace.ts`/`cardPathTrace.ts` cục bộ cho từng tính năng. Không thấy cấu hình alert trong repo (chỉ comment "for a log alert to catch" ở `publicRateLimit.ts` dòng 28). | grep `src/lib/observability`, `.github` | TRUNG BÌNH | vừa (SUY LUẬN từ vắng mặt) |
| O3 | **CI không chạy `next build`**, không `npm audit`, không quét bí mật (gitleaks/trufflehog), không CodeQL/SAST, không CI Android (workflow chỉ có iOS). Chỉ `tsc --noEmit` + lint + test. Build chỉ chạy ở Vercel (CHƯA XÁC MINH). | grep workflows | TRUNG BÌNH | chắc (vắng trong repo) |
| O4 | **Workflow kích hoạt trên mọi `push`** cho regression/architecture (không giới hạn nhánh) — lặp chạy ~1.900 tệp test trong 25 phút timeout; không thấy cache kết quả hay phân mảnh. Rủi ro hết timeout khi suite tăng. | `regression.yml` dòng ~17-45 | THẤP | vừa |
| O5 | **Cổng release phụ thuộc vào `requiredSuites.mjs`** để phát hiện skip; nếu ai chạy `test:raw` (`vitest run`) thì vẫn có thể xanh giả (header `vitest.config.ts`). | `package.json` dòng 16, 23 | THẤP-TRUNG BÌNH | chắc |
| O6 | **Số liệu trong comment CI lỗi thời** ("97 files" so với 1.873 hiện tại) — làm sai lệch lòng tin vào mô tả. | `regression.yml` đầu tệp | THẤP | chắc |
| O7 | **Test route không đồng đều**: 108/213 route không có test cùng thư mục (S12). | find | TRUNG BÌNH | thấp |
| O8 | **Benchmark/UAT nằm ngoài CI** (cần khoá thật, tốn tiền, có cổng chi tiêu `BENCH_SPEND_GATE`): không có cổng hồi quy chất lượng bộ não tự động trong CI; `architectureFreeze.test.ts` chỉ canh cấu trúc. | `scripts/uat/*`, `spendGate.ts` | TRUNG BÌNH | chắc |
| O9 | **Ledger bật theo cờ (`AI_USAGE_LEDGER`), ghi fire-and-forget**; lỗi ghi chỉ để lại 1 dòng log `ok:false` → số liệu chi phí có thể thiếu lặng lẽ. | `usageLedger.ts` dòng 96-103 | THẤP | chắc |
| O10 | **Cron không nằm trong `vercel.json`**: `behavior-rollup`, `business-order-expiry`, `mcp-jobs`, `moderation-snapshot-purge` có route nhưng không có lịch (21 đường dẫn cron trong `vercel.json`, 25 route). `mcp-jobs` được ghi rõ là cố ý; 3 còn lại CHƯA XÁC MINH có lịch ở nơi khác hay chưa chạy. Đáng chú ý: `moderation-snapshot-purge` (liên quan lưu giữ dữ liệu). | `vercel.json`, `src/app/api/cron/` | TRUNG BÌNH | vừa |

### 12.3 CHƯA KIỂM TRA (mục 12)
- Chạy `npm test` / `tsc` / lint; tỉ lệ pass/skip thực tế của 1.873 tệp.
- Nội dung log thô `tappyai_*` (PII), cấu hình Cloud Logging/alert/sink thật (`ENABLE` kill switch trên production).
- Hoạt động thực của PostHog/GA4 và sự kiện server-side; ledger `ai_usage_events` trên DB thật.
- Kết quả UAT/benchmark gần nhất (`scripts/uat`, `scripts/agent-eval`, `injectionCheck.mjs`).
- Cron lịch ngoài `vercel.json` (4 route nêu ở O10) và cấu hình Vercel (ignoreCommand `scripts/vercel-ignore.mjs`).
- Các workflow iOS (`ios*.yml`) chỉ liệt kê, chưa đọc.
- Phần Android CI/test (ngoài phạm vi).
