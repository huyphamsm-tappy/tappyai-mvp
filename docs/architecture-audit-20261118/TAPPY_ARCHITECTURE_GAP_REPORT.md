# TAPPY_ARCHITECTURE_GAP_REPORT — Điểm mạnh, điểm yếu, lỗi kiến trúc, nợ kỹ thuật, thành phần thiếu

Nguồn chuẩn: `D:/TappyAI-wt/wt-integration`, nhánh `feat/brain-r13-p1`, HEAD `b0fe4bf13ac77629a6662a6bae068c393ed767de` (18/11/2026). READ-ONLY: báo cáo này không sửa code, không đề xuất thiết kế mới (khuyến nghị nằm ở `TAPPY_AUDIT_RECOMMENDATIONS.md`).

Báo cáo này TỔNG HỢP từ bốn kiểm toán chi tiết. Mã tham chiếu: `ARCH-` = `TAPPY_CURRENT_ARCHITECTURE.md`; `BRAIN-` = `TAPPY_AI_BRAIN_AUDIT.md` (mục 12 là D1–D10, mục 14 là Q1–Q13); `COST-` = `TAPPY_COST_TOKEN_AUDIT.md` (theo số mục); `SEC-` = `_FRAGMENT_SECURITY_OBSERVABILITY_QUOTA.md` (S1–S13, Q1–Q8, O1–O10). Tôi đã tự đối chiếu lại trong code ba điểm then chốt (không có marker cache cho Claude ngoài `AGENT_MODEL=haiku55`: `src/lib/ai/llm/ai.ts` dòng 33–35; `serperRequestCap` mặc định TẮT: `serperRequestCap.ts` dòng 7; hợp đồng `urlGrants` không được `streamEnrichment.ts` import). Các điểm còn lại là kết quả của tác tử kiểm toán, tôi đã đọc nhưng chưa tự kiểm lại từng dòng.

Nhãn trạng thái dùng thống nhất: IMPLEMENTED / TESTED / VERIFIED / PRODUCTION VERIFIED. **Không có thành phần nào ở đây đạt PRODUCTION VERIFIED**: không có bằng chứng chạy production trong lần kiểm toán này (tài liệu cũ nhất quán ghi production là bản deploy 04/11, không có mã One Brain/R13). Mọi số đo là UAT cục bộ.

---

## 0. Ba điều cần Owner biết trước khi đọc tiếp

1. **Tiền đề "Tappy dùng Claude Sonnet 5.5 nhưng chi phí ngang Opus 5.5" không khớp với code.** Model chat mặc định của mọi vai trò là `gpt-6-luna` (OpenAI). Sonnet 5.5 chỉ chạy ở báo cáo nghiên cứu Advanced, Haiku 5.5 ở Standard và đọc nguồn. Không có đường gọi Opus 5.5 và repo không có bảng giá Opus 5.5 (COST-0). Điều đúng một phần: một báo cáo Advanced rất đắt. Hóa đơn thật của các nhà cung cấp và cấu hình production CHƯA KIỂM TRA, nên không loại trừ được việc production hiện tại khác UAT.
2. **Đường chạy thực tế (cấu hình UAT) là One Brain, bỏ qua phần lớn mã "tư vấn" cũ** (BRAIN-1.1). Một phần rất lớn mã vẫn nằm trong repo nhưng không chạy trên đường này (mục 5.1 dưới đây).
3. **Số liệu log là cộng dồn nhiều phiên, nhiều bộ cờ** (111 lần khởi động `next dev`, không có dấu thời gian). Các tỷ lệ phần trăm trong báo cáo chi phí không thể gán chính xác cho một bản đo riêng (COST-1).

---

## 1. Điểm mạnh (có bằng chứng)

| # | Điểm mạnh | Nhãn | Nguồn |
|---|---|---|---|
| M1 | Lưới test lớn và nhiều lớp: 1.873 tệp test (`src/lib` 1.230, `src/app` 321, `src/components` 147, `scripts` 84, `supabase/tests` 85), project `db` chạy PostgreSQL nhúng thật; `requiredSuites.mjs` biến "suite bị bỏ qua" thành thất bại | TESTED (chưa chạy lại trong audit) | SEC-12.1 |
| M2 | Test guard cấp kiến trúc: `architectureFreeze`, `publicBoundary`, `anonymousWriteBoundary`, `applyMigrationPolicy`, `costRouteCoverage` (ratchet), `repoHygiene`, `controlBytes`... | TESTED | SEC-12.1 mục 7 |
| M3 | An ninh mạng nhiều lớp: SSRF có vá lỗ IP-literal ở redirect, cron auth hash + `timingSafeEqual` (25/25 route), SePay HMAC, Apple JWS pin root, CSP + HSTS + `frame-ancestors`, 85 test DB thật, 14 lớp rate limit và registry chi phí | IMPLEMENTED + TESTED | SEC-10.1 |
| M4 | Biên công khai/app được ép bằng test (đi bộ cây `src/app`, không cần danh sách tay) | TESTED | SEC-12.1; kinh nghiệm phiên này (ví dụ popup ngôn ngữ phải nằm ngoài link chia sẻ) |
| M5 | Quan sát có từ vựng sự kiện đóng, không chứa nội dung người dùng ở đường `log()` kiểu; log `tappyai_*` đủ giàu để đo thời gian/chi phí từng chặng | IMPLEMENTED + TESTED; VERIFIED qua log UAT | SEC-12.1; COST-7 |
| M6 | Chi phí được đo từng lượt (`tappyai_turn_cost`, `tappyai_usage`, `tappyai_llm_call`, `tappyai_agent_model_cost`) và công thức khớp: Sonnet tính tay 5,685 USD so với 5,6856 ghi; Luna 3,9193 USD khớp | VERIFIED (trong phạm vi giá do code ghi) | COST-5.2 |
| M7 | Vòng lặp One Brain có điểm dừng rõ (8 bước, 8.000 token/bước), có "bước viết cuối" cứu lượt không có chữ (16/16 lượt được cứu) | IMPLEMENTED + VERIFIED (LOG) | BRAIN-1.2 |
| M8 | Thanh toán và quota có nhiều chốt: HMAC webhook, idempotency theo giao dịch, per-payer advisory lock, hoàn lượt khi trả lời lỗi | IMPLEMENTED + TESTED | SEC-11.1; phiên 18/11 (SQL test trên PostgreSQL thật) |

---

## 2. Lỗi kiến trúc (khiếm khuyết cấu trúc, ảnh hưởng nhiều thành phần)

| # | Khiếm khuyết | Bằng chứng | Mức | Độ chắc |
|---|---|---|---|---|
| A1 | **Chi phí không có điểm kiểm soát thống nhất.** Bốn cơ chế trần tồn tại nhưng mỗi cái chỉ phủ một phần: trần tiến trình `LLM_RESPONSES_PROCESS_BUDGET_USD` chỉ tính OpenAI Responses và là biến theo instance; cổng chi tiêu `worstCaseLlmCallUsd` trả `null` cho mọi nhà cung cấp không phải OpenAI; `costGate` (trần ngày USD theo tài khoản) tắt mặc định và bị khóa ở production; `serperRequestCap` tắt mặc định. Anthropic (33,5% chi phí UAT) và Serper/Parallel (50,4%) không nằm dưới trần nào có hiệu lực trong cấu hình đo | COST-5.2 mục 4–7; SEC-11.2 Q2, Q3 | CAO | chắc (CODE + LOG); cấu hình production CHƯA KIỂM TRA |
| A2 | **Hai bảng giá Claude không khớp nhau và nhiều hằng số giá không có nguồn xác nhận độc lập.** `claude.ts` ghi Haiku 5.5 vào 0,10; `turnCost.ts` mặc định haiku 1 vào (gấp 10 lần). Đường Luna ưu tiên `tappy.cost` của adapter nên bảng chung hiện chỉ là dự phòng, nhưng một đường Claude rơi vào dự phòng sẽ đo sai. Giá Luna uncached tính 0,125 thay vì 0,10 dựa trên một probe cũ | COST-5.2 mục 1, 2 | TRUNG BÌNH | chắc về sự lệch; tác động thực CHƯA XÁC MINH |
| A3 | **Sổ chi phí không hoạt động.** `ai_usage_events` bật theo cờ `AI_USAGE_LEDGER`, migration `20261101_ai_usage_events.sql` ghi "NOT APPLIED" và báo cáo UAT 18/11 xác nhận chưa áp. Hệ quả: không có nguồn thứ hai để đối chiếu usage API, bảng giá và hóa đơn; chỉ có log console | COST-5.2 mục 9; SEC-11.2 Q5, O9 | CAO với tiêu chí "biết tiền đi đâu" | chắc |
| A4 | **Đường One Brain bỏ qua hầu hết lớp kiểm chứng nội dung chữ.** Các guard chất lượng chạy shadow (chỉ ghi log), `shieldSupported` là no-op trên đường này, `leakCheck` chỉ gắn khi `lunaOn || agentOn`. Lớp còn hiệu lực: egress link, gỡ tên chợ không được cấp, nhãn "chưa xác minh" giá, `factSense` cho thẻ, guard hành trình theo từ khóa | BRAIN-1.3, BRAIN-Q1 | CAO với tiêu chí "ít bịa" | chắc (CODE); chưa đo chất lượng đầu ra |
| A5 | **Hợp đồng cấp URL (`urlGrants`) có mã và test nhưng chưa nối vào luồng phát hành link.** Danh sách link được phép vẫn là "mọi URL trong JSON thô của kết quả công cụ" (`streamEnrichment.ts` 1813, 4432); một URL trong đoạn trích bên thứ ba có thể được cấp | BRAIN-1.4, BRAIN-D4 | TRUNG BÌNH | chắc (CODE) |
| A6 | **Bộ não kiến trúc "không từ khóa" nhưng từ khóa vẫn quyết định ở tầng công cụ/guard/telemetry trên One Brain** (`extractBudget`, `detectTravelIntent`, `deriveDecisionFrame`; trí nhớ thu hẹp theo `decisionFrame.domains`) | BRAIN-1.5, BRAIN-D1 | TRUNG BÌNH | chắc (CODE) |
| A7 | **Ngữ cảnh được chở lại nguyên vẹn qua từng bước.** Prompt mỗi cuộc gọi tăng 8,7k (1 bước) → 27k (8 bước); trung vị 57,8k token vào/lượt; độ trễ trung vị 30,8 giây (p90 64,9 giây). Log không có token theo từng bước nên không biết bước nào đóng góp | COST-4.1, COST-6.3 | TRUNG BÌNH (chi phí, thấp với Luna) → CAO (độ trễ) | chắc (LOG); phần phân bổ theo bước CHƯA XÁC MINH |
| A8 | **Tệp `/api/chat/route.ts` 4.682 dòng chứa gần như toàn bộ quota/gate/tool/guard/telemetry**, import adapter của vendor (`responsesConfigured`, `claudeWriterAvailable`) trái với mô tả "route không biết vendor" | ARCH; SEC-11.2 Q7; BRAIN-Q12 | TRUNG BÌNH (bảo trì, rà soát) | chắc |
| A9 | **Telemetry gây hiểu nhầm**: mọi lượt One Brain ghi `turnType:"legacy"` (933/933), `effort` ghi từ `AI.serving(role)` tĩnh nên không thấy `think_deeper` chuyển lên effort medium giữa lượt; `retryCount` luôn `"unknown"`. Các báo cáo đo vì thế phải suy luận thay vì đọc thẳng | BRAIN-1.10, COST-4.1 | TRUNG BÌNH | chắc (LOG + CODE) |

---

## 3. Điểm yếu vận hành và an ninh (theo mảng)

### 3.1 Chi phí và model (xem `TAPPY_COST_TOKEN_AUDIT.md` mục 6 để có số)

| # | Phát hiện | Định lượng (UAT, log cộng dồn) | Độ chắc |
|---|---|---|---|
| C1 | Báo cáo Advanced (Sonnet 5.5 lead) | 18 lượt, trung bình 0,581 USD (≈39 cuộc gọi model, ≈90 tìm kiếm); ≈10,5 USD = 28% toàn log từ 1,8% số lượt; ước Promax dùng hết hạn mức 10,07 USD so với doanh thu ròng 8,82 USD/tháng (biên −14%, BENCHMARK, chưa kiểm lại độc lập) | LOG + BENCHMARK |
| C2 | Serper/Parallel không bị chặn, cache không trúng | 18,78 USD (50,4% toàn log; 71% chi phí chat). 317/841 lượt vượt trần 8 credit ghi trong code; 171 lượt > 20 credit chiếm 6,99 USD; `cacheHits` = 0; `serperUsd`-credit (10.036) > số cuộc gọi (7.627), nguyên nhân CHƯA XÁC MINH | LOG |
| C3 | Claude gọi không có prompt cache | 1.681 cuộc gọi, cache đọc/ghi = 0; 16,77 triệu token vào tính giá đầy đủ = 4,87 USD (13,1%) | LOG + CODE |
| C4 | `think_deeper` và retry timeout intent | 730/769 lượt có công cụ gọi `think_deeper` (thêm ước 1,09 USD; thinking chỉ 0,23 USD); 1.504 lần `first_part_timeout_8000ms` ở role `intent` thời Luna (chi phí cuộc gọi bị bỏ CHƯA XÁC MINH) | LOG; ước tính là SUY LUẬN |
| C5 | Cache Luna: ghi cache 33–40% input | cache đọc 60–66%, "ghi" 33–40% (giá trị suy ra, không phải số API trả) | LOG |
| C6 | Số cuộc gọi model/lượt cao | trung bình 3,98, p90 6, tối đa 8; 35,2% lượt gọi từ 5 lần; trần lý thuyết ≈16 (8 bước + các lượt phụ) | LOG + CODE |

### 3.2 An ninh và an toàn (SEC; mức theo báo cáo gốc)

| Mã | Phát hiện | Mức |
|---|---|---|
| SEC-S1 | 10 route tốn tiền/phát thông báo còn `known-gap` (translate, scan, messages, stripe checkout/portal, 4 route report, block). `stripe/checkout`, `stripe/portal` không có limiter, đạt được bởi phiên ẩn danh theo ghi chú registry nếu cờ tắt | TRUNG BÌNH (CAO nếu `SUBSCRIPTIONS_ENABLED` tắt ở production) |
| SEC-S2/Q4 | Giới hạn công khai và quota chỉ theo instance nếu thiếu KV; trạng thái KV production CHƯA XÁC MINH | TRUNG BÌNH |
| SEC-S3 | Limiter in-process cho report/block/messages | TRUNG BÌNH |
| SEC-S4 | CSP production còn `'unsafe-inline'` (bản siết chỉ Report-Only) | TRUNG BÌNH |
| SEC-Q1 | Khi `SUBSCRIPTIONS_ENABLED` tắt, mọi subscription hoạt động bị miễn hạn mức câu hỏi; `costGate` tắt và khóa ở production, nên có thể không có trần ngày cho người dùng Pro | TRUNG BÌNH (CAO nếu có người trả phí thật) |
| SEC-S9 | Quota khách khóa theo IP: gom người sau NAT hoặc né bằng đổi IP | THẤP–TRUNG BÌNH |
| SEC-S5, S6, S7, S11 | Webhook Stripe thiếu kiểm cờ và idempotency chưa xác minh; allowlist IP SePay tắt mặc định; `/api/admin/*` không bị middleware chặn (phụ thuộc từng handler); 8 migration có `SECURITY DEFINER` chưa kiểm `search_path` | THẤP–TRUNG BÌNH |
| ARCH | Cổng đồng ý AI chỉ áp cho người dùng đã đăng nhập (`route.ts` 559–562); trần chat Pro lệch giữa comment (300, `route.ts:1290`) và mặc định trong mã (1000, `chatCaps.ts:28`) | cần Owner xác nhận ý định |

### 3.3 Quan sát, kiểm thử và CI

| Mã | Phát hiện | Mức |
|---|---|---|
| SEC-O1 | Ít nhất 57 tệp sản xuất phát log `tappyai_*` thô ngoài union kiểu; cam kết riêng tư "không biên dịch nếu sai" không bao trùm; nội dung chưa rà PII | TRUNG BÌNH |
| SEC-O2 | Không có tracing phân tán/correlation id; không thấy cấu hình alert trong repo | TRUNG BÌNH |
| SEC-O3 | CI không có `next build`, `npm audit`, quét bí mật, SAST/CodeQL, CI Android | TRUNG BÌNH |
| SEC-O8 | Benchmark/UAT nằm ngoài CI: không có cổng hồi quy chất lượng bộ não tự động; `architectureFreeze` chỉ canh cấu trúc | TRUNG BÌNH |
| SEC-S12/O7 | 108/213 route không có test cùng thư mục (có thể được test tập trung phủ: chưa kiểm từng route) | TRUNG BÌNH |
| SEC-O10 | 4 cron có route nhưng không có lịch trong `vercel.json`: `behavior-rollup`, `business-order-expiry`, `mcp-jobs` (cố ý), `moderation-snapshot-purge` (liên quan lưu giữ dữ liệu) | TRUNG BÌNH |

### 3.4 Bộ não và dữ liệu

| Mã | Phát hiện | Độ chắc |
|---|---|---|
| BRAIN-8 | Trong log 42 lượt `deep` không có lượt nào vào tầng Standard/Advanced (0 dòng `tappyai_research_admission`) dù cờ bật; suy luận do thiếu khóa Anthropic ở phiên đó. Cùng lúc phần log "thời Claude" của chi phí lại có 56 lượt nghiên cứu Claude. Hai nguồn log này khác phiên, chưa đối chiếu được | SUY LUẬN |
| BRAIN-7 | Trạng thái phiên (`chatSessionState`, KV 30 ngày) được tải và lưu mỗi lượt nhưng trên One Brain chưa thấy chỗ đọc vào prompt; `behavior_summary` do cron ghi và không bao giờ được đọc vào chat | CODE + SUY LUẬN |
| BRAIN-D2 | Hạn mức nghiên cứu sâu ghi ba giá trị khác nhau trong ba nơi (freeze: pro 10/promax 69; `tiers.ts` tổng 10 và 25; bình luận đầu tệp 30) | CODE |
| BRAIN-Q4 | Ngân sách Chat "1 tìm, 1 đọc" chỉ bọc lời gọi của model; lượt đọc nội bộ của `web_search` đã tách khỏi ngân sách, mỗi lần tìm vẫn đọc tới 3 trang (1.442 lượt đọc / 1.493 lần tìm) | CODE + LOG |
| ARCH | iOS có nhiều cờ hằng cứng (`ProductFlags.swift` 26–52); Android chỉ mô hình hóa `publicShare` → hai ứng dụng có thể lệch cờ so với `/api/config` | CODE |

---

## 4. Nợ kỹ thuật

1. **Mã chết/vô hiệu trên đường UAT**: `consultative/` có 18.515 dòng không test và 149 tệp test, phần chạy trên One Brain chỉ là một tập con; `promptBuilder.ts` (699 dòng) chỉ đường legacy; toàn bộ `src/lib/ai/agent/**` (8.103 dòng không test) chạy khi `TAPPY_AGENT` đặt, mà UAT không đặt; hàm `validateTaskGraph`, `reportStatusOf`, `promoteAfterEvidence`, `TOOL_URL_CONTRACT`, `urlsFromToolResult`, `serverBuiltAllowed` không có người gọi sản xuất (BRAIN-13).
2. **Hợp đồng đóng băng và tài liệu lệch mã**: D1–D10 (BRAIN-12): "không từ khóa", bước viết dành riêng, hạn mức gói, trạng thái cờ. Cộng bình luận lệch ở `aiDataConsent.ts`, `/api/config` ("static" nhưng `force-dynamic`), CI ("97 files" so với 1.873) (SEC-S10, O6).
3. **Cờ tích tụ**: 73 khóa trong cấu hình UAT cuối; nhiều cờ có điều kiện môi trường ngầm (`CONSULT_PARALLEL` cần khóa Parallel, `RESEARCH_ADMISSION/ADVANCED` cần khóa Anthropic, `CCP_REALTIME_AGODA_LITE` cần khóa Agoda). Cờ khác nhau giữa production và UAT; production bị khóa bởi `CONSULT_PRODUCTION_ALLOW` (ARCH).
4. **Hai bộ giá/trần không nối nhau** (`costGate`, `spendGate`, `LLM_RESPONSES_FORECAST_USD`) (SEC-Q8).
5. **Migration và production lệch**: 157 migration; production dựng tay nên schema thực không suy ra được từ repo; hai migration mới (`20261201`, `20261202`) chỉ áp lên UAT; `20261203` chỉ áp lên UAT (ARCH; phiên 18/11).

---

## 5. Thành phần thiếu

1. **Không có cổng hồi quy chất lượng bộ não trong CI** (O8): chất lượng được đo bằng UAT tay/bộ đo ngoài CI, tốn tiền.
2. **Không có đo token theo bước** trong vòng lặp (COST-4.1): không biết bước nào phình ngữ cảnh.
3. **Không có sổ chi phí đang hoạt động và không có đối chiếu hóa đơn** (A3).
4. **Không có trần chi phí thống nhất đa nhà cung cấp** (A1).
5. **Không có tracing/correlation id xuyên suốt và không có cấu hình alert trong repo** (O2).
6. **Không có quét bí mật, SAST, `npm audit`, CI Android** (O3).
7. **Không có giám sát tỷ lệ trúng prompt cache cho Anthropic** (cache không được gắn nên số đo luôn bằng 0, COST-4.3).
8. **Chưa có bằng chứng PRODUCTION VERIFIED cho bất kỳ thành phần nào** — vì không có quyền truy cập production trong lần này, không phải vì đã sai.

---

## 6. Danh sách tổng hợp những điều CHƯA KIỂM TRA

Tổng hợp từ bốn kiểm toán; đây là các khoảng trống làm giới hạn mọi kết luận ở trên.

1. Cấu hình và cờ production (Vercel/Supabase): env, `SUBSCRIPTIONS_ENABLED`, `CRON_SECRET`, KV/Upstash, cron thực chạy, model production đang phục vụ.
2. Hóa đơn thật của Anthropic, OpenAI, Serper, Parallel; giá Opus 5.5 và bảng giá công khai hiện hành.
3. Giá trị thật trong `.env.local` (không đọc): `LLM_PROVIDER`, `AGENT_MODEL`, `HAIKU_FALLBACK`, `C2_REQUEST_BUDGET`, `CONSULT_REQUEST_CAP`, `AI_USAGE_LEDGER`, `ANTHROPIC_API_KEY`, `TAPPY_AGENT`.
4. Bảng `ai_usage_events` thật (migration chưa áp).
5. Token theo từng bước của một lượt; phần kết quả công cụ thật sự vào prompt; việc cuộc gọi bị bỏ do timeout 8 giây có bị tính tiền không.
6. Ánh xạ từng phiên của log (`uat-3000.log`, `server-3040.log`, không có dấu thời gian) tới từng bản đo.
7. Kết quả chạy `npm test`, `tsc`, lint, `check:sql-grants`, RLS/ACL thực trên DB.
8. Từng handler `/api/admin/*`; idempotency webhook Stripe và Apple notifications; nội dung log thô (PII).
9. `src/components`, `src/modules`, `extensions/`, `.github` chi tiết, build Gradle, workflow iOS, pipeline video, `infra/zalo-verify`.
10. Bản sao source trên ổ C và khác biệt giữa các worktree (đã đặt ổ D làm chuẩn).
11. Chất lượng đầu ra (audit này không đánh giá chất lượng câu trả lời).
