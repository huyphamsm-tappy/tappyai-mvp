# TAPPY_AUDIT_RECOMMENDATIONS — Phân loại REUSE / EXTEND / ADAPTER / NEW / DEFER và thứ tự ưu tiên

Nguồn chuẩn: `D:/TappyAI-wt/wt-integration`, nhánh `feat/brain-r13-p1`, HEAD `b0fe4bf13ac77629a6662a6bae068c393ed767de` (18/11/2026).

**Phạm vi và giới hạn của tài liệu này.** Đây chỉ là PHÂN LOẠI và THỨ TỰ để Owner quyết định giai đoạn tiếp theo. Không có thiết kế chi tiết, không có mã, không so sánh Anthropic, không tự triển khai. Mọi mục dưới đây là "cái gì nên làm với thành phần nào", không phải "làm thế nào". Căn cứ: `TAPPY_ARCHITECTURE_GAP_REPORT.md` (mã A1…, C1…, SEC-…, BRAIN-…, COST-…). Không có thành phần nào đạt PRODUCTION VERIFIED; mọi số là UAT cục bộ.

Ý nghĩa nhãn:
- **REUSE**: đã có, đủ dùng, chỉ cần bật/dùng đúng; không sửa mã.
- **EXTEND**: đã có một phần; mở rộng/nối thêm vào thành phần hiện hữu.
- **ADAPTER**: cần một lớp nối giữa hai thành phần hiện hữu không khớp nhau, không viết lại cả hai.
- **NEW**: chưa có; phải thêm mới.
- **DEFER**: chưa nên làm bây giờ (thiếu dữ liệu, rủi ro cao so với lợi ích, hoặc vướng đóng băng).

Ưu tiên: **P0** = làm trước, vì rủi ro tiền/an toàn hoặc vì thiếu nó thì các quyết định khác không có dữ liệu; **P1** = làm sau P0; **P2** = khi có chỗ; **P3** = theo dõi.

---

## 0. Việc phải biết TRƯỚC khi xếp ưu tiên (thiếu dữ liệu, chưa phải việc code)

Hai câu hỏi sau quyết định thứ tự của gần như mọi mục còn lại, và hiện chưa trả lời được bằng bằng chứng:

| # | Câu hỏi | Vì sao cần | Ai/cách xác minh |
|---|---|---|---|
| V1 | Production hiện tại chạy model nào, cờ nào, đã có người trả phí chưa? | Tiền đề "Sonnet 5.5 ngang Opus 5.5" không khớp code UAT; mọi số chi phí ở đây là UAT. Nếu production khác UAT thì chi phí thật khác | Owner/đội vận hành xem hóa đơn nhà cung cấp và env Vercel; audit này không có quyền |
| V2 | Phần chi phí 37,26 USD trong log thuộc cấu hình nào? | Log cộng dồn 111 phiên, không dấu thời gian: không tách được chi phí theo bản đo | Bật sổ chi phí (R1) để có dữ liệu có thời gian và tài khoản |

---

## 1. Bảng khuyến nghị theo thứ tự ưu tiên

### P0 — Tiền và dữ liệu để quyết định

| # | Phân loại | Khuyến nghị | Căn cứ | Thành phần hiện hữu | Cần Owner quyết |
|---|---|---|---|---|---|
| R1 | **REUSE** + EXTEND | Bật sổ chi phí `ai_usage_events` trên UAT (rồi production khi sẵn sàng) để có nguồn đối chiếu thứ hai với usage API và hóa đơn. Mã đã có và có test; thiếu: áp migration + bật cờ `AI_USAGE_LEDGER`. Mở rộng để ghi cả lượt ẩn danh/khách nếu cần | A3, COST-5.2 mục 9, SEC-Q5/O9 | `usageLedger.ts`, `20261101_ai_usage_events.sql` | **Có** — áp migration lên CSDL nào (quyền) |
| R2 | **EXTEND** | Làm cho trần Serper/Parallel có hiệu lực: mã đã có (`serperRequestCap`, `serperToolBudget`), tắt mặc định, không có trong cờ UAT; số đo cho thấy 317/841 lượt vượt trần 8 credit, 171 lượt > 20 credit chiếm 6,99 USD. Cần quyết giá trị trần và bật đo trước/sau | A1, C2, COST-5.2 mục 7 | `serperRequestCap.ts`, `serperToolBudget.ts`, cờ `CONSULT_REQUEST_CAP` | **Có** — giá trị trần; cam kết "không giảm chất lượng" cần đo A/B |
| R3 | **EXTEND** | Gắn marker prompt-cache cho các cuộc gọi Claude của nghiên cứu sâu. Hiện 1.681 cuộc gọi cache = 0, 16,77 triệu token vào trả giá đầy đủ (4,87 USD, 13,1%). Marker chỉ gắn khi `AGENT_MODEL=haiku55` | C3, COST-4.3 | `ai.ts:25-36` (`decoratorFor`), `claude.ts`, `registry.ts` | Không (kỹ thuật); cần đo trước/sau |
| R4 | **REUSE** | Bật cache Serper tầng 2 (`SERPER_CACHE_V2`, kho Upstash) đã có sẵn; số đo `cacheHits = 0` | C2, BRAIN-1.7 | `serperCache.ts`, Upstash | **Có** — chính sách TTL không cache vàng/tỷ giá/thời tiết (đã có trong kế hoạch) |
| R5 | **EXTEND** | Hợp nhất nguồn giá: một bảng giá cho mọi model, một hàm tính. Hiện hai bảng Claude lệch 10 lần cho Haiku 5.5; giá Luna uncached 0,125 dựa trên probe cũ | A2, COST-5.2 mục 1–2 | `claude.ts:127-131`, `turnCost.ts:6-10`, `openai.ts:88-103` | Không (kỹ thuật); **Có** xác nhận giá thật so với hóa đơn |
| R6 | **EXTEND** | Đóng khoảng trống kiểm soát chi: trần tiến trình chỉ tính OpenAI và theo instance; `worstCaseLlmCallUsd` trả `null` cho Claude. Cần quyết chính sách trần cho Anthropic và cho Serper | A1, SEC-Q2/Q3 | `pricing.ts:12-16`, `openai.ts:218-233`, `costGate.ts` | **Có** — chính sách trần ngày theo gói, bật `costGate` ở production hay không |
| R7 | **EXTEND** | Đảo logic miễn quota khi `SUBSCRIPTIONS_ENABLED` tắt: hiện mọi subscription hoạt động bị miễn hạn mức, và `costGate` tắt ở production → có thể không có trần ngày cho người dùng Pro | SEC-Q1 | `aiQuestionQuota.ts:267-276` | **Có** — trạng thái cờ production quyết định mức nghiêm trọng |
| R8 | **REUSE** (xác minh) | Xác minh nghiên cứu sâu Standard/Advanced thực sự chạy ở môi trường đo: log có 42 lượt `deep` không vào tầng nào dù cờ bật, trong khi phần log khác có 56 lượt Claude. Cần biết khóa Anthropic có hợp lệ ở phiên đo cuối | BRAIN-1.8, COST-1 | `researchTurn.ts:25` (`tierTurnFor` đòi `claudeAvailable`) | Không; việc xác minh |
| R9 | **EXTEND** | Đo token theo từng bước của vòng lặp (hiện chỉ `stepsRun`) để biết bước nào phình ngữ cảnh; làm nền cho mọi tối ưu độ trễ/chi phí sau này | A7, COST-4.1 | `turnTrace.ts`, `tappyai_trace ev:loop` | Không |
| R10 | **EXTEND** | Sửa telemetry gây hiểu nhầm (`turnType:"legacy"` cho mọi lượt One Brain; `effort` tĩnh; `retryCount` luôn `unknown`) | A9, BRAIN-1.10 | `route.ts:4651,4153`, `turnCost.ts` | Không |

### P1 — An toàn nội dung và chống lạm dụng

| # | Phân loại | Khuyến nghị | Căn cứ | Thành phần hiện hữu | Cần Owner quyết |
|---|---|---|---|---|---|
| R11 | **EXTEND** | Nối hợp đồng `urlGrants` vào luồng phát hành link (mã và test đã có, chưa được `streamEnrichment` dùng) | A5, BRAIN-D4 | `security/urlGrants.ts`, `streamEnrichment.ts:1813,4432` | Không |
| R12 | **EXTEND** (đánh giá từng guard) | Đánh giá từng guard chất lượng đang ở chế độ shadow trên One Brain: guard nào có số đo cho thấy nên ép (so shadow 348 với `fact_check` 21), guard nào giữ shadow. Gắn `leakCheck` cho One Brain nếu đo cho thấy cần | A4, BRAIN-Q1 | `streamEnrichment.ts:1974-1980`, `route.ts:3953` | **Có** — mức "ít bịa" mong muốn so với độ trễ/chi phí; phải đo chất lượng |
| R13 | **EXTEND** | Đóng 10 route `known-gap` trong registry chi phí (stripe checkout/portal, translate/scan, report/block/messages) và xác minh KV production | SEC-S1, S2, S3 | `costRoutes/registry.ts`, `publicRateLimit.ts` | **Có** — trạng thái cờ production quyết định mức nghiêm trọng |
| R14 | **NEW** | Thêm vào CI: `next build`, `npm audit`, quét bí mật, SAST/CodeQL, CI Android | SEC-O3 | `.github/workflows/regression.yml` | Không |
| R15 | **REUSE** (xác minh) | Xác minh lịch chạy của 4 cron không có trong `vercel.json` (đặc biệt `moderation-snapshot-purge` liên quan lưu giữ dữ liệu) | SEC-O10 | `vercel.json`, `src/app/api/cron/*` | Có thể — nếu hóa ra chưa chạy |
| R16 | **ADAPTER** | Đồng bộ cờ sản phẩm giữa web, Android, iOS: iOS có nhiều hằng cứng, Android chỉ mô hình hóa `publicShare`, trong khi `/api/config` là nguồn chung | ARCH | `ProductFlags.swift:26-52`, `ProductFlags.kt`, `/api/config` | Không (đã nằm trong kế hoạch "web trước, mobile theo sau") |

### P2 — Độ trễ và cấu trúc

| # | Phân loại | Khuyến nghị | Căn cứ | Thành phần hiện hữu | Cần Owner quyết |
|---|---|---|---|---|---|
| R17 | **EXTEND** | Giảm ngữ cảnh chở lại qua các bước (cắt tỉa kết quả công cụ giữ khối liên quan nhất; không đụng bước viết và độ sâu đọc của nghiên cứu sâu). Chỉ làm sau R9 vì cần số đo từng bước | A7, COST-6.3 | `streamEnrichment.ts`, pruning ở `route.ts` | **Có** — chỉ giữ nếu đo mù không giảm chất lượng |
| R18 | **EXTEND** | Gộp `think_deeper` vào bước tra cứu đầu để bỏ một vòng gọi (730/769 lượt có công cụ gọi nó) | C4, BRAIN-Q5 | `oneBrain.ts:156,183`, `ai.ts:45-55` | **Có** — phải đo mù, vì đổi hành vi suy luận |
| R19 | **EXTEND** | Xử lý hai nghi vấn retry: 1.504 lần timeout 8 giây ở role `intent` thời Luna; một lượt tìm vẫn đọc tới 3 trang ngoài ngân sách "1 tìm, 1 đọc" | C4, BRAIN-Q4, Q11 | `registry.ts:139`, `route.ts:3418-3491` | Không |
| R20 | **EXTEND** | Hoàn thiện CSP: bỏ `'unsafe-inline'` bằng nonce (đã có bản Report-Only) | SEC-S4 | `next.config.mjs:107,146-154` | Không; rủi ro hỏng trang, cần thử |
| R21 | **EXTEND** | Thêm cổng hồi quy chất lượng bộ não tự động vào CI ở quy mô nhỏ (bộ mẫu cố định, chạy khi có khóa) hoặc ít nhất bắt buộc chạy trước phát hành | SEC-O8 | `scripts/uat`, `scripts/agent-eval` | **Có** — ngân sách cho mỗi lần chạy |
| R22 | **EXTEND** | Chốt một nguồn sự thật cho hạn mức gói (ba giá trị trong freeze/`tiers.ts`/comment) và trần chat Pro (comment 300 so với mặc định 1000) | BRAIN-D2, ARCH | `tiers.ts`, `chatCaps.ts:28`, `route.ts:1290` | **Có** — giá trị nào là ý định |

### P3 — Theo dõi, hoãn

| # | Phân loại | Khuyến nghị | Lý do hoãn |
|---|---|---|---|
| R23 | **NEW** | Tracing phân tán/correlation id và cấu hình alert trong repo (SEC-O2) | Cần thiết kế riêng; không chặn việc khác |
| R24 | **DEFER** | Dọn mã chết trên One Brain (`consultative/` 18.515 dòng không test, `promptBuilder.ts`, `agent/**`, các hàm không người gọi) | Kiến trúc đang đóng băng; xóa mã có rủi ro, cần quyết sau UAT |
| R25 | **DEFER** | Tách `route.ts` 4.682 dòng thành các đơn vị nhỏ hơn | Rủi ro hồi quy cao; chưa có cổng chất lượng tự động (R21) để bảo vệ |
| R26 | **DEFER** | `behavior_summary` và trạng thái phiên chỉ ghi, không đọc: quyết nối vào prompt hay bỏ | Là quyết định sản phẩm về trí nhớ; chờ Owner |
| R27 | **DEFER** | Đánh giá lại kinh tế gói Promax (biên ước −14% khi dùng hết hạn mức, BENCHMARK) | Cần V1/V2 và hóa đơn thật trước; Owner quyết giá/hạn mức |
| R28 | **DEFER** | Thông tin chưa kiểm tra được nhưng không chặn: SECURITY DEFINER thiếu `search_path` (S11), quota khách theo IP sau NAT (S9), webhook Stripe idempotency (S5) | Cần kiểm tra có dữ liệu trước khi xếp việc |
| R29 | **ADAPTER** | Làm rõ biên giữa route chat và adapter vendor (`responsesConfigured`, `claudeWriterAvailable` lẻ trong `route.ts`) | Là phần của việc tách `route.ts`; đi cùng R25 |

---

## 2. Thứ tự xử lý đề xuất

1. **Kiểm chứng (không cần code):** V1, V2, R8. Không có chúng thì không biết chi phí thật ở production là bao nhiêu và tiền đề "Sonnet 5.5 ngang Opus 5.5" có đúng ở production không.
2. **Đo cho đúng:** R1 (sổ chi phí), R9 (token theo bước), R10 (telemetry), R5 (một bảng giá). Đây là điều kiện để mọi tối ưu sau được đo, không phải đoán.
3. **Chặn tiền mất kiểm soát:** R2, R6, R7 (phải kèm quyết định của Owner), rồi R3 và R4 (cache, tiết kiệm không đổi chất lượng).
4. **An toàn nội dung và lạm dụng:** R11, R12, R13, R14, R15.
5. **Độ trễ:** R17, R18, R19 (chỉ giữ khi đo mù không giảm chất lượng).
6. **Cấu trúc và nợ:** R20–R22, rồi P3.

Ghi chú về ràng buộc cam kết của Owner ("tối ưu chi phí nhưng không giảm chất lượng câu trả lời"): R2, R3, R4, R17, R18 đều có thể giữ nguyên chất lượng, nhưng chỉ nên giữ khi có số đo chứng minh; các mục còn lại không ảnh hưởng nội dung câu trả lời.

---

## 3. Những điều tài liệu này KHÔNG làm

- Không đề xuất kiến trúc mới, không thay model, không so sánh nhà cung cấp.
- Không ước tính tiền tiết kiệm cho từng mục: số liệu hiện có là UAT cộng dồn nhiều cấu hình và không tách được theo bản đo (V2); mọi số tiết kiệm đưa ra bây giờ là phỏng đoán.
- Không đánh giá chất lượng đầu ra của bộ não.
- Không tự triển khai: không sửa code, không áp migration, không đổi cờ. Quyết định giai đoạn tiếp theo thuộc Owner.
