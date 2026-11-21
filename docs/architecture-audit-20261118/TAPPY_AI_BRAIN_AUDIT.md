# TAPPY_AI_BRAIN_AUDIT — Kiểm toán bộ não AI của TappyAI (chỉ đọc)

- Ngày: 18/11/2026
- Nguồn chuẩn: `D:/TappyAI-wt/wt-integration`, nhánh `feat/brain-r13-p1`, HEAD `b0fe4bf13ac77629a6662a6bae068c393ed767de` (đã xác nhận bằng `git rev-parse HEAD`).
- Phạm vi: mảng (2) AI Brain / Agent Runtime / One Brain / Auto-Chat-Think / nghiên cứu sâu; (3) nhận diện ý định, định tuyến, điều phối model; (5) prompt, ngữ cảnh, token; (6) trí nhớ, trạng thái phiên, lịch sử hội thoại; (7) công cụ, MCP, truy xuất; (8) tìm kiếm Serper, song song hoá, cache, API ngoài; (9) kiểm chứng, guard, tổng hợp câu trả lời, `present_blocks`.
- Không thuộc tài liệu này: chi phí, token, bảng giá, LLM registry chi tiết. Phần đó do `TAPPY_COST_TOKEN_AUDIT.md` (tác tử khác) viết. Ở đây chỉ ghi số bước và số lượt gọi model theo code, rồi trỏ sang đó.
- Cách làm: chỉ đọc. Đã đọc theo từng đoạn `src/app/api/chat/route.ts` (4.682 dòng), `src/lib/ai/consultative/oneBrain.ts`, `src/lib/config/consultFlags.ts`, `src/lib/ai/streamEnrichment.ts` (4.880 dòng, đọc theo điểm), các module `agent/`, `research/`, `mcp/`, `presentation/`, `tools/`, `llm/`, `memory/`. Không sửa mã, không chạy build/test/migration, không gọi mạng/API tính phí, không đọc `.env*`.

## 0. Quy ước nhãn

**Nhãn trạng thái** (gắn cho từng thành phần):

| Nhãn | Nghĩa trong tài liệu này |
|---|---|
| IMPLEMENTED | Có mã trong repo và đã đọc mã đó. |
| TESTED | Có tệp test trong repo cho thành phần đó. Audit này KHÔNG chạy test; ghi "TESTED" chỉ nghĩa là có tệp test. |
| VERIFIED | Có log hoặc benchmark của repo cho thấy nó chạy trên localhost UAT (không phải production). |
| PRODUCTION VERIFIED | KHÔNG gắn cho mục nào: không có bằng chứng production trong phạm vi được đọc. |
| CHƯA KIỂM TRA | Không đủ dữ liệu để kết luận. Danh sách ở mục 15. |

**Loại bằng chứng:** CODE (đọc mã, có `file:dòng`), LOG (số đếm từ `server-3040.log`, xem 0.1), BENCHMARK (số của tài liệu repo khác, không tự đo lại), SUY LUẬN (rút ra từ mã nhưng không có số đo), CHƯA XÁC MINH.

### 0.1 Nguồn LOG đã dùng

- Tệp: `D:/TappyAI-review-artifacts/consultative-wave3/measure30/logs/server-3040.log` (12,2 MB, ghi lần cuối 18/11 09:10). Chỉ đọc bằng đếm: 921 dòng `tappyai_one_brain_turn`, 933 dòng `tappyai_turn_cost` ngoài nghiên cứu sâu, 42 lượt `deep_research`.
- Tệp log là log tích lũy của một máy chủ `next dev` cổng 3040. Trong thư mục có nhiều biến thể `flags-uat*.json` / `flags-localhost*.json`. Log KHÔNG gắn nhãn bộ cờ cho từng lượt, nên mọi số LOG dưới đây là số mô tả của cả tệp, không phải số đo riêng của `flags-uat-blocks-plans.json`.
- Số `tappyai_chat_mode` cộng lại là 515 (chat 313, auto 93, think 67, deep 42) nhỏ hơn 921 lượt one-brain. Lý do chênh chưa xác minh (CHƯA XÁC MINH).

### 0.2 Cấu hình UAT đã đọc

`D:/TappyAI-review-artifacts/consultative-wave3/measure30/flags-uat-blocks-plans.json` (đọc tên cờ và giá trị; không có khoá/secret nào được chép). `"route": "one_brain_localhost"`. Cờ bật (`"1"`): `CONSULTATIVE_V1`, `CONSULT_V2`, `CONSULT_FINAL_SYNTHESIS`, `CONSULT_ANSWER_ATTRIBUTION`, `CONSULT_GENERAL_ASSISTANT`, `CONSULT_TRACE_DIAGNOSTICS`, `CONSULT_ABORT_ABANDONED_FIRST_PART`, `CONSULT_KNOWLEDGE_TURN_TOOLS`, `CONSULT_SEARCH_NOW_INTENT_GATE`, `CONSULT_READ_PAGE_LATE`, `CONSULT_ONE_BRAIN`, `CONSULT_ONE_BRAIN_MEDIA`, `CONSULT_PRESENT_BLOCKS`, `CONSULT_PERSON_MODEL`, `CONSULT_PLAN_V2`, `CONSULT_PARALLEL`, 16 cờ `CONSULT_UNWIND_*` (S1A–S1D, S2A–S2C, S3A–S3C, S4A, S4B, S6A–S6C), `TVI_CAPTURE`, `TVI_READ`, `RESEARCH_ADMISSION`, `RESEARCH_ADVANCED`, `RESEARCH_SOURCE_DIVERSITY`, `RESEARCH_CONSOLIDATION`, `RESEARCH_FORECAST_MODEL`, `RESEARCH_FRESHNESS`, `RESEARCH_TIGHT_WRITE`, `RESEARCH_THESIS_REPORT`, `RESEARCH_PACKAGES`, `RESEARCH_CHART_RELEVANCE`, `RESEARCH_CONTRACTS`, `RESEARCH_STREAM_VERIFY`, `ATTACHMENT_ONLY_POLICY`, `MARKET_GATE`, `SAFETY_EMERGENCY`, `HOTLINE_CLAIM_GUARD`, `VEXERE_DIRECT_AFFILIATE`, `CANONICAL_CONTEXT`, `CCP_REALTIME_AGODA_LITE`, `LEGACY_STREAM_TRACE`, `SUBSCRIPTIONS_ENABLED`, `NEXT_PUBLIC_*` (present blocks, shell ref, answer v4, one brain, report layout, v206 workspace...). Giá trị khác: `CONSULT_CAPABILITY_LEVEL=2`, `CONSULT_LUNA_FAST=0`, `LLM_RESPONSES_PROCESS_BUDGET_USD=3`.

**Không có trong tệp** (nên mặc định TẮT nếu môi trường nền cũng không đặt; môi trường nền `.env.local` KHÔNG được đọc, nên đây là CHƯA KIỂM TRA): `TAPPY_AGENT`, `CONSULT_LUNA`, `CONSULT_V3`, `DEEP_RESEARCH_V2`, `CONSULT_UNWIND_S5` (Exa), `CONSULT_REQUEST_CAP`, `TURN_WEB_TICKET`, `SERPER_CACHE_V2`, `MCP_GATEWAY`, `AI_COST_GATE`, `AI_USAGE_LEDGER`, `LLM_PROVIDER`, `CONSULT_PRODUCTION_ALLOW`, `PARALLEL_API_KEY`, khoá Anthropic.

---

## 1. Tóm tắt điều hành (các phát hiện nổi bật)

1. **Đường chạy thực tế của UAT là One Brain, và nó bỏ qua phần lớn mã "tư vấn" cũ.** `oneBrain = consultOneBrainOn() && !tappyAgentEnabled()` (`route.ts:449`); `consultOn` bắt buộc `!oneBrain` (`route.ts:538`); `lunaOn = consultOn && …` (`route.ts:574`); `presearchPlan = null` khi one-brain (`route.ts:1698`); trả lời đóng hộp (canned) bị chặn (`route.ts:877`, `route.ts:2626`). Hậu quả (CODE): router luật `consultRouter.ts` (1.256 dòng), Luna intent, `runConsultBrain`, cổng làm rõ, pre-search, evening frame, trip prefetch, prompt "lean", domain frames, CONSULT_V2/LUNA/V3 và nhiều cờ `CONSULT_UNWIND_*` không chạy trên đường này. Cờ `CONSULT_V2=1` có trong cấu hình nhưng vô hiệu.
2. **Mô hình tự quyết toàn bộ lượt**: một model (`gpt-6-luna` qua role `consult`), một prompt chung `ONE_BRAIN_CORE` (~21,4 nghìn ký tự, `oneBrain.ts:30-110`), tối đa 8 bước (`oneBrain.ts:14`), tối đa 8.000 token/bước (`oneBrain.ts:20`), 17 đến 18 công cụ. LOG: 921 lượt, trung vị 3 bước, 39 lượt (4,2%) chạm trần 8 bước, 16 lượt không viết chữ ở stream chính nhưng đều được "bước viết cuối" cứu (16 dòng `tappyai_final_write outcome=appended`).
3. **Việc kiểm chứng nội dung chữ của câu trả lời trên One Brain phần lớn là "chỉ ghi log, không sửa"**: các guard chất lượng (money, spec, hours, place claim, snippet price, budget fit...) chạy ở chế độ shadow (`streamEnrichment.ts:1974-1980`), `shieldSupported` (guard bằng chứng/trích dẫn) là no-op vì `guardEvidence` chỉ được gán trên đường agent (CODE), bộ dò lộ prompt (`leakCheck`) chỉ gắn khi `lunaOn || agentOn` (`route.ts:3953`) nên không có trên one-brain. Còn hiệu lực trên one-brain: chặn link ngoài danh sách (egress), gỡ tên chợ/cửa hàng không được cấp, gán nhãn "chưa xác minh" cho giá không có nguồn khi có sản phẩm, guard hành trình khi `travelIntent` (từ khoá), bộ kiểm khẳng định cho thẻ `present_blocks` (`factSense`), `hotlineClaimGuard` (cờ).
4. **Hợp đồng cấp URL (`urlGrants.ts`) chưa được nối vào đường phát hành link**: `TOOL_URL_CONTRACT`, `urlsFromToolResult`, `serverBuiltAllowed` chỉ được test và chính file đó dùng (CODE, grep toàn `src`). Danh sách link được phép của luồng trả lời vẫn là "mọi URL xuất hiện trong JSON thô của kết quả công cụ" (`streamEnrichment.ts:1813-1815`, `streamEnrichment.ts:4432`), đúng trạng thái "Before" mà đầu file `urlGrants.ts` nói đã thay đổi. Trường `urlGrants` của phiên (`chatSessionState.ts:93`) có chỗ lưu nhưng `route.ts:4437` không truyền giá trị nào.
5. **Từ khoá vẫn còn quyết định ở tầng công cụ trên one-brain**, trái với câu "không từ khoá" của tài liệu đóng băng: `extractBudget` lọc giá vé máy bay/khách sạn (`route.ts:411`, `route.ts:3245-3300`), `detectTravelIntent` bật guard hành trình, `deriveNeedProfile`/`deriveDecisionFrame`/`deriveSituation` vẫn chạy (`route.ts:1536-1590`) và gói trí nhớ được thu hẹp theo `decisionFrame.domains` (`route.ts:1577-1584`).
6. **Số lượt gọi model một lượt thường không chỉ là số bước.** Ngoài tối đa 8 bước của stream chính còn có: bước viết cuối (≤1), `understandTurn` (≤1), truy vấn bù S6B (≤1), trích xuất trí nhớ (≤1), kiểm chứng thẻ `factSense` (≤1) và nhóm gọi lớp ảnh (`docMedia` x2, `imageSense`). Trần lý thuyết khoảng 16 lượt gọi cho một lượt thường (mục 11).
7. **Cache Serper chung + cache prompt**: cache Serper L2 24 giờ trong Upstash (`serperCache.ts`), `SERPER_CACHE_V2` không bật trong cấu hình. LOG: tỉ lệ đọc cache của input là 66,2% và ghi cache 33,5% trên 933 lượt (`tappyai_turn_cost`), trùng với số mà `docs/handoff/AUDIT-20261118-…` đã nêu (BENCHMARK, LOG khớp).
8. **Nghiên cứu sâu**: trong log, cả 42 lượt `deep` chạy trên "engine cũ", không có một dòng `tappyai_research_admission` nào, trung bình 6 đến 7 lượt gọi model và 4 bước (mẫu `steps:4`, `report_chars:6005`). Cấu hình đặt `RESEARCH_ADMISSION=1` và `RESEARCH_ADVANCED=1` nên hai tầng Standard (Haiku) / Advanced (Sonnet) lẽ ra có thể chạy, nhưng chúng cần khoá Anthropic (`tierTurnFor` đòi `claudeAvailable`, `researchTurn.ts:25`). Có khả năng là khoá Anthropic thiếu hoặc không hợp lệ trong lần chạy đó (SUY LUẬN; CHƯA XÁC MINH vì không đọc env).
9. **Memory**: bảng `user_memory` (Postgres/Supabase), đọc bằng `getMemory` (`memoryService.ts:35`), ghi bằng `updateMemory` trong `onFinish` (`route.ts:4250`). Trạng thái phiên (`chatSessionState`) nằm ở KV/Upstash (30 ngày), được tải và lưu mỗi lượt nhưng trên one-brain chưa thấy chỗ nào đọc nó vào prompt (CODE + SUY LUẬN). Cột `behavior_summary` do cron ghi nhưng không bao giờ được đọc vào chat (CODE: `MEMORY_COLUMNS` ở `memoryService.ts:21` không có cột này).
10. **Telemetry gây hiểu nhầm**: mọi lượt one-brain bị gán `turnType:"legacy"` (`route.ts:4651`; LOG: 933 trên 933 dòng `tappyai_turn_cost`), và trường `effort` của `tappyai_one_brain_turn` lấy từ `AI.serving(role)` tĩnh (`route.ts:4153`) nên không phản ánh việc `think_deeper` chuyển lên effort medium giữa lượt.

---

## 2. Cờ UAT và hiệu lực thực tế trên đường One Brain

Công thức then chốt: một cờ `CONSULT_*` chỉ bật khi giá trị đúng `"1"` và không bị khoá production (`consultFlags.ts:58-76`, `unwindOn` ở `consultFlags.ts:209`). Khoá production: `lockedInProduction` (`consultFlags.ts:76`) trừ khi tên cờ nằm trong `CONSULT_PRODUCTION_ALLOW` (`consultFlags.ts:69`); riêng `CONSULT_PARALLEL` không bao giờ được mở bằng cách đó.

| Cờ (UAT) | Tác dụng trên đường one-brain | Bằng chứng |
|---|---|---|
| `CONSULT_ONE_BRAIN=1` | Bật one-brain (nếu `TAPPY_AGENT` không là `1`/`2`) | CODE `route.ts:449`, `consultFlags.ts:255` |
| `CONSULT_V2=1` | Vô hiệu: `consultOn` đòi `!oneBrain` | CODE `route.ts:538` |
| `CONSULT_FINAL_SYNTHESIS=1` | Bật bước viết cuối và `consultFinalWriteOn` | CODE `consultFlags.ts:78-80`, `route.ts:4305` |
| `CONSULT_SEARCH_NOW_INTENT_GATE=1`, `CONSULT_KNOWLEDGE_TURN_TOOLS=1` | Vô hiệu: `searchGate` đòi `!oneBrain` | CODE `route.ts:1637` |
| `CONSULT_CAPABILITY_LEVEL=2` | Chỉ ảnh hưởng nhóm cờ Wave 3 (lean/knowledge/pick) vốn vô hiệu; còn lại tham gia `maxReads` của bộ đọc: `Math.max(S6_MAX_READS, levelLimits.researchMaxReads)` | CODE `route.ts:2774`, `consultFlags.ts:108-125` |
| `CONSULT_READ_PAGE_LATE=1` | `read_page` được chạy tới bước áp chót thay vì dừng sớm 2 bước | CODE `consultFlags.ts:145-149`, `route.ts:4019-4030` |
| `CONSULT_ONE_BRAIN_MEDIA=1` | Bật `understandTurn` và luồng ảnh sau câu trả lời | CODE `route.ts:2473`, `route.ts:4663` |
| `CONSULT_PRESENT_BLOCKS=1` | Đăng ký công cụ `present_blocks` | CODE `route.ts:3218`, `consultFlags.ts:264` |
| `CONSULT_PERSON_MODEL=1` | Trích xuất trí nhớ chạy trên hầu hết lượt đăng nhập (xem mục 7) | CODE `memoryGate.ts:105-128`, `route.ts:470` |
| `CONSULT_PLAN_V2=1` | `present_plan` có thêm trường bắt buộc (planV2Shape) | CODE `route.ts:3162-3190` |
| `CONSULT_PARALLEL=1` | Chỉ hiệu lực nếu có `PARALLEL_API_KEY` (không đọc) | CODE `consultFlags.ts:279`, `route.ts:2755` |
| `CONSULT_UNWIND_S6A/S6B/S6C=1` | `web_search` tự đọc 3 trang đầu, ≤1 truy vấn bù, bộ đọc kiểu RETRIEVAL_V5 | CODE `route.ts:3418-3465`, `route.ts:2774` |
| `CONSULT_UNWIND_S1C=1` | Gỡ marker trích dẫn khỏi câu trả lời | CODE `streamEnrichment.ts` (1 lần gọi `consultUnwindS1cOn`) |
| `CONSULT_UNWIND_S1D=1` | Kiểm vị trí cho `get_hotel_prices` | CODE `route.ts:3285-3291` |
| `CONSULT_UNWIND_S4A=1` | `forcedToolDecides = null` | CODE `route.ts:460` |
| `CONSULT_UNWIND_S1A/S1B/S2A–S2C/S3A–S3C/S4B=1` | Gắn vào `consult`, pre-search, trần token cũ: trên one-brain không có tác dụng đã tìm thấy | CODE các điểm gọi nằm sau `consult`/`presearchPlan` (null) |
| `CONSULT_LUNA_FAST=0` | Vô hiệu (không có Luna) | CODE `route.ts:574-586` |
| `CONSULTATIVE_V1=1` | Vẫn bật `situation`, thu hẹp trí nhớ theo domain, `shouldExtractMemory({consultative})`; `bufferMode` không bị ép trên one-brain | CODE `route.ts:1545-1586`, `streamEnrichment.ts:1956` |
| `CONSULT_ANSWER_ATTRIBUTION`, `CONSULT_GENERAL_ASSISTANT` | Chưa tìm thấy chỗ tiêu thụ trên đường one-brain | CHƯA XÁC MINH hoàn toàn |
| `MARKET_GATE=1` | Bọc mọi công cụ bằng `wrapToolsWithMarketGate` | CODE `route.ts:3414` |
| `SAFETY_EMERGENCY=1`, `ATTACHMENT_ONLY_POLICY=1`, `CANONICAL_CONTEXT=1`, `HOTLINE_CLAIM_GUARD=1` | Bật tại `route.ts:390`, `398`, `canonicalCtx`, `route.ts:4671` | CODE |
| `RESEARCH_*` | Chỉ tác động trong chế độ `deep` (mục 2.5) | CODE `deepResearchState.ts` |
| `SUBSCRIPTIONS_ENABLED=1` | Ép hạng gói: Free không có công cụ, mode bị hạ | CODE `route.ts:2453-2460` |
| `TVI_CAPTURE=1`, `TVI_READ=1` | Lưu và đọc fact địa điểm từ kho tri thức khi `search_places` | CODE `src/lib/tvi/readPlaces.ts:21` |

---

## 3. Luồng một lượt chat (`POST /api/chat`), từ trên xuống

Một hàm `POST` duy nhất (`route.ts:229`, 4.450 dòng). Hằng số: `maxDuration = 300` (`route.ts:222`), `TURN_DEADLINE_MS = 110_000` (`route.ts:223`). Bảng dưới là thứ tự thực thi của một lượt one-brain (mọi mục IMPLEMENTED; TESTED qua 64 tệp `src/app/api/chat/*.test.ts` và `architectureFreeze.test.ts`).

| # | Pha | Hành động (không dùng model nếu không ghi) | Vị trí |
|---|---|---|---|
| 1 | Giới hạn IP | `publicRateLimit('chat:ip:…')` (KV phân tán nếu có cấu hình) | `route.ts:259` |
| 2 | Chặn thân yêu cầu | `readCappedBody`, JSON parse | `route.ts:284` |
| 3 | Thu gọn lịch sử client | `compactRequestMessages` (ngân sách 20.000 ký tự) | `route.ts:312`, `requestHistory.ts:17,96` |
| 4 | Ranh giới tin cậy đầu vào | `validateClientInput` dựng lại từng tin từ allowlist | `route.ts:315` |
| 5 | PDF thành chữ | `pdfPartsToText`, chữ gõ riêng giữ ở `typedMessages` | `route.ts:333` |
| 6 | Đọc chế độ | `readChatMode`: `web`/`think`/`deep`/`auto`, còn lại là `chat` | `route.ts:347`, `clientInput.ts:361` |
| 7 | An toàn khẩn cấp (không model) | `classifyEmergency` trả luồng hotline, thoát sớm | `route.ts:390` |
| 8 | Chính sách chỉ-đính-kèm | `attachmentOnlyTask` | `route.ts:398` |
| 9 | Các bộ đọc từ khoá | `classifyIntent`, `extractBudget`, `detectLocationIntent`, `detectMovieRecommendationIntent`, `resolveReplyLanguage`, `canonicalTurn`, `detectForcedTool`, `detectTravelIntent` | `route.ts:406-470` |
| 10 | Cờ nhánh | `oneBrain` (449), `agentOn` (527), `consultOn` (538), `lunaOn` (574) | xem mục 1 |
| 11 | Đồng ý dữ liệu AI | `refuseWithoutAiConsent` cho tài khoản đăng nhập | `route.ts:561` |
| 12 | Cổng tuổi / hạn chế tài khoản / hạn mức | `consumeAiQuestion` TRƯỚC khi gọi model; `reserveTurnCost` nếu `AI_COST_GATE` | `route.ts:1272`, `route.ts:1305` |
| 13 | Nạp ngữ cảnh người dùng (song song) | `buildChatPromptContext` + lịch Google + dòng `subscriptions`; `buildMemoryBlock` + khối nhận dạng | `route.ts:1187-1217` |
| 14 | Khôi phục bằng chứng lượt trước | RPC `decision_evidence_load` + `loadChatSessionState` (KV) | `route.ts:1349-1411` |
| 15 | Khung nhu cầu/quyết định/tình huống | `deriveNeedProfile`, `deriveDecisionFrame`, `deriveSituation` (không model) | `route.ts:1536-1590` |
| 16 | Không pre-search | `if (oneBrain) presearchPlan = null` | `route.ts:1698` |
| 17 | Chọn role và cắt lịch sử | `role = 'consult'`; `trimmedMessages` = 10 tin cuối; `compactHistoryToBudget` | `route.ts:2134`, `2171`, `2195` |
| 18 | Hạ chế độ theo hạng gói | `modeForTier`; `planHasTools` | `route.ts:2453-2460` |
| 19 | Ráp prompt | `systemShared = ONE_BRAIN_CORE`; `system = oneBrainDynamic(...)` | `route.ts:2469-2477` |
| 20 | Lớp hiểu câu cho ảnh (model, role `intent`) | `understandTurn` chạy song song với câu trả lời | `route.ts:2473` |
| 21 | Dựng công cụ và bọc | tools 2783-3410; bọc `wrapToolsWithoutAiSources`, `…TurnWebTicket`, `…RequestCap`, `…MarketGate`; nhánh S6A, ngân sách Chat | `route.ts:2783-3491` |
| 22 | Nhánh `deep` (trả về sớm) | `deepResearchResponse` | `route.ts:3719-3790` |
| 23 | Bước viết dự trữ | `finalSynthesisGuard` | `route.ts:4019` |
| 24 | Gọi stream | `AI.stream(streamOpts)`, `maxSteps = 8`, `maxTokens = 8000`, `parallelTools` | `route.ts:4061-4115`, `4279` |
| 25 | Sau stream, trong `onFinish` | log, trích xuất trí nhớ, ghi bộ nhớ | `route.ts:4151-4270` |
| 26 | Bước viết cuối (model, nếu không có chữ) | `finalWriteStream` + `AI.generate` không công cụ | `route.ts:4305-4375` |
| 27 | Bộ lọc luồng ra | `applyPlaceEnrichmentStreamFilter` (ảnh, link, guard, thẻ) | `route.ts:4378` |
| 28 | Lưu trạng thái phiên | `saveChatSessionState` + RPC `decision_evidence_save` | `route.ts:4437-4470` |
| 29 | Luồng ảnh sau câu | `oneBrainMediaStream` | `route.ts:4663` |
| 30 | Guard hotline | `hotlineClaimGuardStream` | `route.ts:4671` |

Thứ tự bọc luồng cuối (từ trong ra ngoài): `AI.stream` → `finalWriteStream` → `applyPlaceEnrichmentStreamFilter` → `turnCostStream(areaAskStream(emptyResultStream(askAfterStream(...))))` → `timeClientEmit` → `traceTailStream` → `oneBrainMediaStream` → `hotlineClaimGuardStream` (`route.ts:4631-4671`).

---

## 4. Mảng (2): AI Brain, Agent Runtime, One Brain, Auto/Chat/Think, nghiên cứu sâu

### 4.1 One Brain (`oneBrain.ts`)

**Thành phần (IMPLEMENTED, TESTED: `oneBrain*.test.ts` x10, `architectureFreeze.test.ts`):**
- Hằng số: `ONE_BRAIN_MAX_STEPS = 8` (`oneBrain.ts:14`), `ONE_BRAIN_MAX_TOKENS = 8000` (`oneBrain.ts:20`), `FINAL_SYNTHESIS_RESERVED_STEPS = 2` (`consultFlags.ts:128`).
- Prompt cố định `ONE_BRAIN_CORE` (`oneBrain.ts:30-110`, ~21,4 nghìn ký tự, 66 dòng gạch đầu dòng, 6 mục: Understand, Look things up, Be useful, Sources and dates, Lay the answer out, Voice, Before you send). Phần theo lượt `oneBrainDynamic` (`oneBrain.ts:202`) gồm giờ Việt Nam, vị trí, `PLACE_RULE` (mặc định người dùng ở Việt Nam, `oneBrain.ts:199`), ngôn ngữ, dòng chế độ `ONE_BRAIN_MODE_LINES` (`oneBrain.ts:179`) hoặc `ONE_BRAIN_NO_TOOLS_LINE` (Free, `oneBrain.ts:177`), các khối trí nhớ/sở thích/phong cách/clip, rồi `ONE_BRAIN_SHAPE_REMINDER` (`oneBrain.ts:113`).
- Một model: role `consult` (`route.ts:2134`) → `gpt-6-luna` (mặc định `openai.ts:24`, mặc định nhà cung cấp là `openai` nếu `LLM_PROVIDER` không đặt: `registry.ts:54-56`). LOG: `response_model=gpt-6-luna`, `provider=openai` ở cả 921 dòng.

**Đường chạy thực tế:** mô hình đọc cả hội thoại (≤10 tin cuối, nén theo ngân sách), có toàn bộ công cụ của hạng gói, tự quyết số lượt tra. Tối đa 8 bước; hai bước cuối giữ để viết (xem 4.4).

**Số bước / lượt gọi model:** xem mục 11 (bảng). LOG: `steps_run` trên 921 lượt = {1:118, 2:251, 3:201, 4:167, 5:81, 6:44, 7:20, 8:39}; `step_cap_hit=39`; `finish_reason` = stop 905, tool-calls 15, length 1; `tool_calls` p50 = 2, p90 = 7, max = 34; 118 lượt không gọi công cụ nào.

**Lệch thiết kế–code:** xem mục 12 (D1, D6).

### 4.2 Auto / Chat / Web / Think / Deep

IMPLEMENTED; TESTED (`architectureFreeze.test.ts`, `capabilityLevel.route.test.ts`...). Web mặc định `auto` (`ChatInterface.tsx:957`).

| Chế độ | Hành vi server | Vị trí |
|---|---|---|
| `chat` | Mô hình tự chọn độ sâu qua tham số `depth` của `web_search`: `quick` = 1 tìm + 1 đọc; `thorough` = 3 tìm + 3 đọc + truy vấn bù. Lượt vượt ngân sách nhận `{error:'chat_mode_budget_used'}` | `oneBrain.ts:148`, `route.ts:3467-3491` |
| `web` | Dòng prompt "Web search"; không có ngân sách Chat; ghi `turnSearch.depth='thorough'` | `oneBrain.ts:179`, `route.ts:3459-3464` |
| `think` | `thinkEffort:'medium'` ngay từ bước 1 (Responses API) | `route.ts:4102` |
| `auto` | Bắt đầu như Chat. Công cụ `think_deeper` chỉ đăng ký khi `chatMode==='auto'`; khi mô hình gọi, `autoThink.on=true` và các bước SAU đó đổi sang `api:'responses'`, effort `medium` (getter theo từng bước) | `route.ts:3144-3153`, `ai.ts:45-55` |
| `deep` | Nhánh nghiên cứu sâu, trả về sớm (mục 4.5) | `route.ts:3719` |

Hạng gói quyết định chế độ thực chạy khi `SUBSCRIPTIONS_ENABLED=1`: `modeForTier` (`tiers.ts`): free chỉ `chat`; pro và promax có `chat, web, think, deep, auto`. Free không có công cụ (`TIER_HAS_TOOLS`, `gateTools` trả `{}` ở `route.ts:2530`).

**LOG về `think_deeper`:** 83 lần gọi công cụ `think_deeper` trên 921 lượt, so với 93 dòng `tappyai_chat_mode` = auto (phép so này không chính xác vì 0.1: số dòng chế độ ít hơn số lượt). Mỗi lần gọi tốn một bước của mô hình. Trường `effort` trong `tappyai_one_brain_turn` là `AI.serving(role)` (`route.ts:4153`), nên không thể đếm từ log có bao nhiêu lượt thực sự chạy ở medium (SUY LUẬN từ CODE).

### 4.3 Agent Runtime (`src/lib/ai/agent/**`)

IMPLEMENTED; TESTED (65 tệp test trong thư mục, tổng 8.103 dòng mã không test). Hai phiên bản: Phase 7 (`TAPPY_AGENT=1`, `agent/loop.ts`, `AGENT_LIMITS.maxToolCalls=3`) và Phase 8 (`TAPPY_AGENT=2`, `agent/runtime/*`).

- Bật bằng `tappyAgentEnabled` (`agent/index.ts:24`) và `agentRuntimeV2Enabled` (`runtime/index.ts:68`). Cấu hình UAT KHÔNG đặt `TAPPY_AGENT`; và `oneBrain` đòi `!tappyAgentEnabled()` (`route.ts:449`). Hai đường loại trừ nhau. Vì vậy mã agent KHÔNG chạy trên đường UAT đã đọc (CODE; môi trường nền CHƯA KIỂM TRA).
- Trần runtime Phase 8 (`runtime/limits.ts`): 6 vòng model, 8 lần gọi công cụ, 8 credit Serper (10 khi du lịch), hạn 85 giây, bước 45 giây, công cụ 15 giây, đọc tối đa 4 trang (6 khi `consultative`).
- Công cụ agent (`runtime/toolRegistry.ts:47-60`): lõi `web_search`, `read_page`, `search_places`; hoãn `search_products`, `get_hotel_prices`, `get_flight_prices`, `get_transport_options`, `get_trip_data`, `get_weather`, `get_gold_price`, `get_news`, `get_now_showing`, `get_movie_showtimes`, `request_action`; điều khiển `ask_user`, `update_task`, `use_tool`. Tập này khác tập one-brain: agent không có `get_market_rate`, `get_weather_forecast`, `calculate`, `present_*`, `think_deeper` (so `route.ts:3099-3260`).
- Lệnh gọi model của agent: role `agent`; `AGENT_MODEL=haiku55` đổi sang Claude Haiku 5.5 (`registry.ts`, `agentModelChoice`).

**Mã chết / cờ tắt:** toàn bộ đường agent trên cấu hình UAT.

### 4.4 Bước viết dự trữ và bước viết cuối

IMPLEMENTED; TESTED (`finalWrite.route.test.ts`, `finalWrite.test.ts`); VERIFIED bằng LOG.

- `finalSynthesisGuard` (`route.ts:4019`): khi `consultFinalSynthesisOn() || research` (trên one-brain `research` luôn khác null vì `researchReader` luôn được dựng, `route.ts:3984`), một công cụ được gọi khi đã xong `≥ maxSteps-2` bước nhận `{error:'search_budget_used'}` và KHÔNG chạy. `present_plan`/`present_options` và (với `CONSULT_READ_PAGE_LATE`) `read_page` chỉ bị giữ ở bước cuối (`consultFlags.ts:145-149`).
- Bước viết cuối (`route.ts:4305-4375`, `finalWrite.ts`): khi stream không phát chữ nào nhưng có kết quả công cụ, gọi thêm 1 lần `AI.generate` KHÔNG công cụ rồi stream thành chữ thường trước frame kết thúc. Chỉ bật khi `consultFinalWriteOn()` (= `CONSULT_FINAL_SYNTHESIS=1` và không khoá production, `consultFlags.ts:80`).
- LOG: 16 lượt `wrote_text:false` trong `tappyai_one_brain_turn`, và đúng 16 dòng `tappyai_final_write outcome=appended`. Tức là dòng `wrote_text:false` phản ánh stream chính trước bước cứu, không phải kết quả người dùng thấy. (Tài liệu `docs/handoff/AUDIT-20261118-…` nói "KHÔNG có bước viết dành riêng"; điều đó chỉ đúng khi cờ `CONSULT_FINAL_SYNTHESIS` tắt hoặc ở production bị khoá, xem D6.)

### 4.5 Nghiên cứu sâu Standard / Advanced (`src/lib/ai/research/**`)

IMPLEMENTED (4.772 dòng không test, 50 tệp test); TESTED. VERIFIED một phần bằng LOG (engine cũ).

**Đường chạy:** `chatMode==='deep'` sau trần toàn cục `withinGlobalDeepCeiling` (`route.ts:3719-3727`). Hạn mức tháng: `standardResearchMonthlyLimit` / `advancedResearchMonthlyLimit` (`tiers.ts`): pro 5 + 5, promax 10 + 15. Tầng do `tierTurnFor` quyết (`researchTurn.ts:23-33`): cần `RESEARCH_ADMISSION=1`, khoá Anthropic có sẵn (`claudeWriterAvailable`, `registry.ts:236`), tín hiệu không mơ hồ (`signalsFromRequest`); `admitResearch` (`researchAdmission.ts`) quyết bằng luật, không model: có "hard trigger" hoặc điểm ≥4 là Advanced, còn lại Standard. Advanced cần thêm `RESEARCH_ADVANCED=1` và hạn mức Advanced còn.

**Giới hạn thực thi** (`deepResearch.ts:37`): `planSteps:10, steps:17, queriesPerStep:3, findingsPerStep:90, researchDeadlineMs:120_000, runDeadlineMs:270_000`. Standard (`STANDARD_RUN_BOUNDS`, `researchAdmission.ts:148`): 13 bước, 2 truy vấn/bước, 1 vòng bù. Advanced (`ADVANCED_RUN_BOUNDS`, `researchController.ts:19`): 13 bước, 3 truy vấn/bước, 3 vòng bù, sửa phần thiếu.

**Chuỗi lượt gọi model** (`runDeepResearch`, `deepResearch.ts:577` trở đi; `deepResearchDeps.ts`): lập kế hoạch 1 (cộng 1 lần quét chính sách ở Advanced, `deepResearchDeps.ts:299`), ghi chú theo bước (role `intent`, `:368`), kiểm khoảng trống theo vòng (`:387`), mô hình dự báo (nếu `RESEARCH_FORECAST_MODEL`, `:405`), nhà phân tích luận điểm (nếu `RESEARCH_THESIS_REPORT`, `:419`), viết báo cáo (stream `consult`, tối đa 16.000 token trên đường Luna, `:471`; 40.000 trên đường Claude, `:225`), người phê bình (`:480`), sửa (`:491`). Thứ tự thật có điều kiện thời gian (`deepResearch.ts:732-806`).

**Trạng thái trong log (LOG):** 42 lượt `tappyai_deep_research`, `ok:true` cả 42, mẫu `steps:4, findings:18, sources:42, report_chars:6005, ms:30236`; `tappyai_turn_cost` (deep) 6 đến 7 `modelCalls`, `serperCalls` 8 đến 10, giá ~0,012 đến 0,016 USD mỗi lượt (mẫu). KHÔNG có dòng `tappyai_research_admission` nào. Hệ quả: các lượt đó chạy engine Luna cũ, không vào Standard/Advanced (CODE: `route.ts:3739-3790` chỉ ghi dòng admission khi `tierPlan` khác null).

**Mã chết:** `validateTaskGraph`, `reportStatusOf` (`researchController.ts`) và `promoteAfterEvidence` (`researchAdmission.ts`) không có nơi gọi nào ngoài test (CODE, grep). `decideGap` được dùng trong `contractsRun.ts`/`researchContracts.ts`. Hai đầu file (`researchAdmission.ts:9`, `researchController.ts:6`) vẫn ghi "Not wired into the chat route yet" trong khi route đã gọi `tierTurnFor` (`route.ts:3739`).

---

## 5. Mảng (3): nhận diện ý định, định tuyến, điều phối model

### 5.1 Thành phần có thật

| Thành phần | File | Trạng thái |
|---|---|---|
| `classifyIntent` (chỉ `'chitchat' | 'tool'`, regex, ≤40 ký tự) | `intent.ts:25-31` | IMPLEMENTED, TESTED |
| `routeConsult`, `catalogueAsk`, `isAnswerToAsk` (router luật, ~180 kiểm tra mẫu, 1.256 dòng) | `consultative/consultRouter.ts` | IMPLEMENTED, TESTED; KHÔNG chạy trên one-brain |
| `runLunaIntent`, `mergeIntentWithRules` (đọc ý định bằng 1 lượt `AI.extract`) | `consultative/luna.ts` (529 dòng) | IMPLEMENTED, TESTED; cần `lunaOn` nên KHÔNG chạy trên one-brain |
| `runConsultBrain` (Haiku "rút ý" khi luật không chắc) | `consultative/consultBrain.ts` | IMPLEMENTED, TESTED; KHÔNG chạy trên one-brain |
| `classifyTurnIntent` (Phase A2 turn-intent gate) | `consultative/intentGate.ts` | Chạy (log `tappyai_intent_gate`) nhưng kết quả không điều khiển gì trên one-brain (`route.ts:775-785`) |
| `understandTurn` (đọc ý định cho ẢNH, không cho câu trả lời) | `answerV4/understand.ts:108` | IMPLEMENTED, VERIFIED (log), chạy song song |
| Trả lời đóng hộp (canned) | `cannedReply.ts`; `route.ts:876-880`, `2626` | KHÔNG chạy trên one-brain (`route.ts:877` trả `null`; `2626` `oneBrain ? null`) |
| Cổng khẩn cấp | `safety/emergencyClassifier.ts`; `route.ts:390` | IMPLEMENTED, TESTED; chạy trước mọi thứ, không model |
| Chọn role/model | `route.ts:2134`; `llm/registry.ts` | xem 5.2 |

### 5.2 Điều phối model

- Roles trong code: `fast, smart, planning, vision, consult, intent, plan, agent` (`registry.ts:45`). Tài liệu luật nền tảng `docs/architecture/AI_PLATFORM.md` chỉ ghi bốn role `fast|smart|planning|vision` (D5).
- One-brain chỉ chọn role `consult` (`route.ts:2134`). Các role `intent` dùng cho: `understandTurn`, `factSense`, `imageSense`, `docMedia` (x2), truy vấn bù S6B (`route.ts:3441`), ghi chú nghiên cứu. Role `fast` dùng cho trích xuất trí nhớ (`memoryService.ts`, `AI.generate({role:'fast', maxTokens:500})`).
- Định tuyến role → nhà cung cấp: `routedTo` (`registry.ts:97`): khi `defaultProviderId()==='openai'` (mặc định), mọi role đi `openai`/Luna nếu adapter đã cấu hình. `defaultModelForRole` bọc `withFallback(primary, retry|claude)` (`registry.ts:160-170`) với chờ phần đầu 8 giây cho `consult`/`intent` (`registry.ts:139`): im lặng 8 giây thì gọi lại một lần trên Luna (hoặc Haiku khi `HAIKU_FALLBACK=1`). LOG: `fellBack:true` ở 7 trong 933 dòng `tappyai_turn_cost` (0,75%).
- Mặc định effort `none` cho mọi role trừ `plan` (`low`) (`openai.ts:reasoningEffortFor`). LOG: `effort` của lượt: none 898, low 12, medium 11.
- Claude xuất hiện ở: role `agent` khi `AGENT_MODEL=haiku55`; nghiên cứu sâu (`claudeModel:'sonnet55'|'haiku55'`, `deepResearchDeps.ts:294-299`); fallback khi `HAIKU_FALLBACK=1`. Trên đường chat one-brain thường: không.

**Quan sát (điều phối):** `route.ts:192` import trực tiếp `responsesConfigured` từ `llm/providers/openai`, ngược với luật "adapter là nơi duy nhất biết vendor" của `AI_PLATFORM.md`; route cũng gọi `claudeWriterAvailable()` để quyết tầng nghiên cứu (`route.ts:3739`). Không ảnh hưởng chạy; là điểm lệch kiến trúc.

---

## 6. Mảng (5): prompt, ngữ cảnh, quản lý token

### 6.1 Cách ráp

- Hai thông điệp `system` liền nhau: `systemShared` (cố định, `ONE_BRAIN_CORE`) rồi `system` (động, `oneBrainDynamic`), do `buildMessages` (`ai.ts:25-35`) đặt `systemShared` trước, nhằm dành phần tiền tố ổn định cho cache của nhà cung cấp (CODE). Khối động có thứ tự cố định: giờ/vị trí/`PLACE_RULE`/ngôn ngữ → dòng chế độ (hoặc `no tools`) → `no blocks` nếu tắt `present_blocks` → các khối của người dùng (clip, trí nhớ, sở thích, phong cách, trang chia sẻ) → `ONE_BRAIN_SHAPE_REMINDER` (`oneBrain.ts:202-223`).
- Thêm một dòng sự kiện `canonicalCtx.systemLine` khi `CANONICAL_CONTEXT=1` (`route.ts:2479`).
- Khối bước viết cuối nối `finalWriteSystemNote` vào system của riêng lần gọi đó (`finalWrite.ts`).
- Các lịch sử cũ: `sanitizePriorAssistantContent` bỏ marker/ảnh/link hệ thống của lượt trước (`sanitizePriorAssistantContent.ts`) trước khi đưa lại cho model.

### 6.2 Ngân sách ngữ cảnh

| Lớp | Giá trị | Vị trí |
|---|---|---|
| Tổng đầu vào client | ngân sách chung của `validateClientInput`; 413 khi vượt | `clientInput.ts`, `route.ts:315` |
| Thu gọn lịch sử phía vào | 20.000 ký tự (`REQUEST_HISTORY_BUDGET`); tin assistant cũ nhất bị rút trước | `requestHistory.ts:17,96` |
| Cắt lịch sử đưa cho model | 10 tin cuối (`messages.slice(-10)`) | `route.ts:2171` |
| Nén theo ngân sách (one-brain) | `compactHistoryToBudget`: giữ nguyên tin nếu tổng ≤ 20.000; vượt thì rút tin assistant cũ nhất trước, KHÔNG đụng tin assistant cuối và mọi tin user | `historyCompaction.ts:78-92` |
| Hộp công cụ | `ONE_BRAIN_MAX_TOKENS = 8000` mỗi bước ra | `oneBrain.ts:20`, `route.ts:4099` |
| Số dòng kết quả địa điểm đưa model | `MODEL_ROWS_MAX = 10` | `modelPayload.ts:44` |
| Số trang bộ đọc | `max(S6_MAX_READS=10, levelLimits.researchMaxReads)` khi S6A; Chat quick 1 / thorough 3 cho `read_page` model gọi | `route.ts:2774`, `searchReads.ts:30`, `oneBrain.ts:148` |

### 6.3 Cắt tỉa kết quả công cụ

- Tách kết quả "cho model" và "cho hệ thống" (`toolResultSplit.ts`): ảnh, link đặt chỗ, `photo_names`, `tiktok_review_url` không đi vào model; hệ thống chèn lại sau (ghi trong đầu file, IMPLEMENTED, TESTED).
- `trimPlacesForModel` (`modelPayload.ts:69`) cắt còn tối đa 10 dòng; đường one-brain chưa xác nhận việc gọi hàm này cho mọi công cụ (CHƯA KIỂM TRA từng công cụ).
- Mọi kết quả công cụ qua `wrapToolResultAsData` (rào dữ liệu `_tappy_data` / `_tappy_data_end`, trung hoà dấu rào bên trong, `toolResultFence.ts`) ở `gateTools` (`route.ts:2529`).
- Nguồn từ sản phẩm AI khác bị loại ở trong cùng: `wrapToolsWithoutAiSources` (`route.ts:3410`, `aiSourcePolicy.ts`).
- Không tìm thấy cơ chế dọn kết quả công cụ cũ giữa các bước của một lượt (mỗi bước đọc lại toàn bộ kết quả trước, đúng với cách `streamText` nhiều bước chạy). LOG: `prompt_tokens` (tổng qua các bước, `route.ts:4157` ghi chú) p50 = 32.198, p90 = 104.889, max = 369.559. Số này, tiền và token chi tiết: xem `TAPPY_COST_TOKEN_AUDIT.md`.

### 6.4 Prompt caching ở tầng prompt

- Anthropic: cache tường minh bằng `cacheControl: ephemeral` (`providers/claude.ts:61-108`); chỉ dùng cho đường agent Haiku / fallback.
- OpenAI/Luna (đường one-brain): không thấy `prompt_cache_key` hay điều khiển tường minh nào (grep `providers/*.ts`); chỉ có cách bố trí `systemShared` đầu tiên (CODE). `openaiCallCost` tính `cachedIn`/`cacheWrite` từ usage của nhà cung cấp (`openai.ts:42-60`).
- LOG: trên 933 lượt, tổng `tokensIn` 44.606.454, `lunaCachedIn` 29.538.364 (66,2%), `lunaCacheWrite` 14.935.902 (33,5%).

### 6.5 Quan sát

- `ONE_BRAIN_CORE` là prompt dài (~21,4 nghìn ký tự) kèm 17 đến 18 schema công cụ trong mỗi bước; tài liệu đối chiếu 18/11 (`AUDIT-20261118-…`) đã nêu 58 mục luật và 34 commit chạm file. Không tự đo lại (BENCHMARK).
- Quy ước `ONE_BRAIN_CORE` cấm chữ có dấu tiếng Việt (ghi trong bàn giao 17/11): prompt chỉ tiếng Anh, còn `ONE_BRAIN_NO_TOOLS_LINE` và các `*_NOTE` cũng tiếng Anh; phần tiếng Việt trong kết quả công cụ (ví dụ mô tả `search_places`) vẫn dùng chữ không dấu (`route.ts:2788`).

---

## 7. Mảng (6): trí nhớ, trạng thái phiên, lịch sử hội thoại

### 7.1 Bốn nơi lưu và vòng đời

| Dữ liệu | Nơi lưu | Đọc | Ghi | Vị trí |
|---|---|---|---|---|
| Lịch sử hội thoại hiển thị | Bảng `conversations` (cột `messages`, Supabase) qua `/api/conversations`; client luôn gửi lại toàn bộ tin mỗi lượt (server không tự nạp lịch sử) | client | client | `src/app/api/conversations/route.ts:29,45,80` |
| Trí nhớ về người dùng | Bảng `user_memory` (Supabase): `location_base, discovery_city, preferences, budget, history, companions, timing, personality` | `getMemory` mỗi lượt đăng nhập | `updateMemory` trong `onFinish` | `memoryService.ts:21,35,83`; `contextBuilder.ts:322-382`; `route.ts:1187,4250` |
| Hồ sơ sở thích | Bảng `user_preferences` (`budget_level, cuisine_likes, dietary_restrictions, inferred_preferences`) | `buildChatPromptContext` | nơi khác (không thuộc chat) | `contextBuilder.ts:339` |
| Nhận dạng/nhân khẩu | `profiles.full_name`, `user_demographics` (cột chỉ tên, KHÔNG có ngày sinh) | `buildChatPromptContext` | nơi khác | `contextBuilder.ts:344-350` |
| Trạng thái phiên tư vấn | KV/Upstash khoá `sha256(owner+session)`, TTL 30 ngày, tối đa 64.000 byte, timeout 800 ms; nếu không có KV thì map trong tiến trình | `loadChatSessionState` | `saveChatSessionState` | `chatSessionState.ts:16-18,157,176`; `route.ts:1391,4437` |
| Bằng chứng quyết định | RPC Postgres `decision_evidence_save` / `decision_evidence_load` (+ cron `decision-evidence-sweep`) | `route.ts:1349-1370` | `route.ts:4443-4470` | ADR-024 |
| Tri thức địa điểm (TVI) | Kho `knowledge_entities` + RPC `tvi_*` | `readPlaces.ts` khi `search_places` | `capturePlaces.ts` | `src/lib/tvi/*` |

### 7.2 Trí nhớ của bạn

- Giao diện người dùng: trang `src/app/(app)/profile/tappy-knows/page.tsx` gọi `/api/memory` GET / PATCH / DELETE (`:152,174,195`). `POST /api/memory` đã khoá 404 (`memory/route.ts:36`).
- Nạp vào prompt: `buildMemoryBlock(existingMemory, forcedTool, {consultative: consultativeV1Enabled()})` (`route.ts:1210`) → `buildConsultativeMemoryBlock` (`memoryBlock.ts:74`): tối đa `PREF_CAP=4` giá trị/mục và `CAT_CAP=3` mục, giá trị cắt 40 ký tự, lệnh "dùng để CHỌN, không để HỎI". Sau đó `route.ts:1577-1584` có thể thay khối bằng bản thu hẹp theo `decisionFrame.domains` (miền suy ra bằng từ khoá). Thêm `buildIdentityBlock` (tên gọi, tuổi dạng dải, giới tính, thành phố) và khối lịch Google (nếu có).
- Ghi: `onFinish` (`route.ts:4212-4260`): nếu đã đăng nhập và `worthExtract`, gọi `extractMemoryFromConversation` (role `fast`, tối đa 500 token, `memoryService.ts:232`), lọc bằng `filterTransientMemory` (`memoryTransientFilter.ts`) khi có `situation`, rồi `updateMemory` bằng client của chính người dùng (không dùng service role; có RLS). Nếu không trích xuất nhưng có `situation`: chỉ nối chủ đề vào `history` bằng `plainRequestTopic`, không gọi model (`route.ts:4263-4274`).
- Cổng trích xuất `shouldExtractMemory` (`memoryGate.ts:105-128`): bỏ qua chitchat; tín hiệu bền (`DURABLE_SIGNAL`) luôn thắng; ở chế độ consultative thuần chỉ trích khi có `DESTINATION_SIGNAL`. Với `CONSULT_PERSON_MODEL=1` (UAT) nhánh "chỉ khi có điểm đến" bị bỏ qua, nên mọi lượt không phải chitchat, không phải tra cứu nhất thời (`get_weather/get_gold_price/get_news` hoặc `EPHEMERAL_TOPIC`) và dài ≥12 ký tự sau chuẩn hoá đều trích xuất (mặc định YES, `memoryGate.ts:126-128`). Tức là thêm 1 lượt gọi model `fast` trên đa số lượt của tài khoản đăng nhập (SUY LUẬN từ CODE; LOG riêng cho lượt này chưa tìm).
- `onFinish` bị bỏ qua nếu khách rời đi (`abortSignal` ở `route.ts:4086`), nên một lượt bị huỷ không ghi nhớ.

### 7.3 Lệch / điểm bất thường

- `behavior_summary` do cron `behavior-rollup` ghi (`cron/behavior-rollup/route.ts:84`) nhưng không có nơi đọc nào đưa vào chat: `getMemory` chọn cột theo `MEMORY_COLUMNS` (`memoryService.ts:21`) không có `behavior_summary`; `contextBuilder.ts:134` cũng không chọn. Dữ liệu ghi mà không đọc (CODE).
- Trạng thái phiên (ứng viên địa điểm, sản phẩm, lưu trú, `pick`, `evidence`) được tải (`route.ts:1391`) và lưu (`route.ts:4437-4448`) mỗi lượt, nhưng các chỗ tiêu thụ trong route (`route.ts:1394-1408`, `1693-1740`, `2272`, `2704-2725`) đều đòi `consult`/`presearchPlan`/agent, vốn null trên one-brain; chỗ duy nhất nghi ngờ còn lại là `travelMoreTurn` ở `route.ts:3298`. Vì vậy trên one-brain trạng thái phiên gần như chỉ ghi (CODE + SUY LUẬN; chưa kiểm `travelMoreTurn`).
- `urlGrants` của phiên không có nguồn ghi (D4).

---

## 8. Mảng (7): công cụ, MCP, truy xuất

### 8.1 Công cụ one-brain (tối đa 18)

Tất cả bọc: `timeTools` (đo thời gian, `route.ts:2509`) → `gateTools` (lỗi nhà cung cấp, ghi chú `fare_status`/`next_step`, cổng ràng buộc cứng, rào dữ liệu, `route.ts:2529`) → `wrapToolsWithoutAiSources` → `wrapToolsWithTurnWebTicket` (khi `TURN_WEB_TICKET`) → `wrapToolsWithRequestCap` (khi `CONSULT_REQUEST_CAP`) → `wrapToolsWithMarketGate` (khi `MARKET_GATE`) (`route.ts:3410-3414`).

| Công cụ | Điều kiện có mặt | Nguồn/ghi chú | Vị trí |
|---|---|---|---|
| `search_places` | luôn (one-brain) | Serper `/maps` → OSM Overpass khi Serper rỗng (`PLACES_PROVIDER` mặc định `serper`, `placesProvider.ts`; `food.ts:674-681`); kèm đọc TVI | `route.ts:2787` |
| `search_products` | luôn (one-brain) | Serper `/shopping` (`common.ts:712`); kèm link thương mại (CCP) | `route.ts:3013` |
| `web_search` | luôn | Serper `/search` → Parallel (nếu bật) → DuckDuckGo HTML; tham số `country`, `language`, `depth` | `route.ts:3099`, `common.ts:840-935` |
| `read_page` | luôn (one-brain) | bộ đọc `createLeanResearch` (robots.txt, fetch an toàn, ngân sách trang) | `route.ts:3128`, `researchLoop.ts:107-139` |
| `calculate` | one-brain | máy tính xác định | `route.ts:3131` |
| `get_news` | luôn | Serper news | `route.ts:3008` |
| `get_weather` | luôn | `wttr.in` | `route.ts:3137`, `weather.ts:20` |
| `get_weather_forecast` | one-brain | Open-Meteo + met.no (dự phòng) | `route.ts:3154`, `weatherForecast.ts:17-19` |
| `get_gold_price` | luôn | `www.vang.today` | `route.ts:3233`, `weather.ts:120-123` |
| `get_market_rate` | one-brain | Vietcombank (tỷ giá), Coinbase (crypto), Yahoo (dầu) | `route.ts:3239`, `marketRates.ts:55-134` |
| `get_flight_prices` | luôn | chỉ link đặt vé (Trip.com, Traveloka, hãng), KHÔNG có giá/giờ | `route.ts:3244`, `travel.ts:81` |
| `get_hotel_prices` | luôn | Serper + OSM + (cờ) Agoda Lite API | `route.ts:3269` |
| `get_transport_options` | luôn | xe khách/tàu, link Vexere (cờ), lịch tàu `railSchedule.ts` | `route.ts:3325` |
| `think_deeper` | chỉ chế độ `auto` | công tắc nội bộ, không ra ngoài | `route.ts:3144` |
| `present_plan` | one-brain | thẻ kế hoạch (`enrichment.planBlock`) | `route.ts:3162` |
| `present_options` | one-brain | thẻ tuỳ chọn (`enrichment.optionsBlock`) | `route.ts:3193` |
| `present_blocks` | `CONSULT_PRESENT_BLOCKS=1` | khối `compare`/`profiles`/`gallery`/`ask`/`booking` | `route.ts:3218`, `contract.ts:44-52` |
| `save_price_watch` | đã đăng nhập | tác vụ GHI duy nhất, qua `runAiWriteAction` (quyền, tham số, phạm vi, audit) | `route.ts:3376-3400` |

LOG (số lần gọi trên 921 lượt, từ trường `tools` của `tappyai_one_brain_turn`): `web_search` 1.493; `search_places` 471; `search_products` 205; `calculate` 131; `read_page` 119; `get_weather_forecast` 112; `present_plan` 100; `get_hotel_prices` 93; `think_deeper` 83; `get_transport_options` 55; `get_flight_prices` 54; `get_news` 37; `present_blocks` 37; `get_gold_price` 28; `get_weather` 14; `present_options` 10. Không thấy dòng nào cho `get_market_rate` và `save_price_watch` (log không ghi lần gọi nào; không kết luận vì log là tích lũy nhiều lần chạy).

Kiểu kết quả chung: đối tượng có một trong `results/organic/rows/products/items/articles/news` (hàm `rowsIn`, `route.ts:2541`) cộng `source`, `source_url`, `note`/`next_step`, `provider_error`; lỗi nhà cung cấp trả `{error|provider_error}` chứ không phải "không có kết quả". Bản đồ trường link: `TOOL_URL_CONTRACT` (`urlGrants.ts:143`), nhưng xem D4 về việc nó không được dùng.

### 8.2 Sổ kết quả và `present_blocks`

`withResultIds` gán `result_id` cho kết quả của công cụ (trừ `present_plan, present_options, present_blocks, think_deeper, save_price_watch`, `route.ts:457`) vào `ResultLedger` (`declare.ts:14,108`); `present_blocks` chỉ được dựng khi `validateDeclared` + `resolveBookingLinks` chấp nhận (`route.ts:3222-3231`): thẻ `booking` không bao giờ mang link do model viết, link lấy từ sổ.

### 8.3 MCP

- Có một MCP Gateway NHẬN VÀO (Tappy là server): `src/app/api/mcp/route.ts`, `src/lib/mcp/gateway.ts`. Bật bằng `MCP_GATEWAY=1` (`gatewayFlag.ts`), khoá production. Trạng thái 404 khi cờ tắt (`mcp/route.ts:20-22`).
- Cấu hình UAT KHÔNG đặt `MCP_GATEWAY`: route trả 404; ngay cả khi bật, bộ xác thực mặc định là `denyAllVerifier` (`defaultDeps.ts:21`): mọi yêu cầu bị từ chối 401 (đầu `defaultDeps.ts:3`). Danh mục công cụ của gateway: `search_places, search_restaurants, search_shopping, search_hotels, search_attractions, create_itinerary, create_itinerary_job, get_itinerary_job_status, get_itinerary_job_result, cancel_itinerary_job` (`toolCatalog.ts:157-168`). Hotel adapter chưa nối (`defaultDeps.ts:67`).
- KHÔNG có MCP client trong đường chat (grep `modelcontextprotocol|createMCPClient` trong `src` chỉ khớp `acceptance178.test.ts`). Chat không gọi công cụ MCP bên ngoài (CODE).
- Mã MCP: 1.892 dòng không test, 18 tệp test; IMPLEMENTED, TESTED; không VERIFIED (không có log gateway trong phạm vi).

### 8.4 Truy xuất (retrieval)

- Bộ đọc trang: robots.txt dùng chung (`researchLoop.ts:34`), fetch an toàn (DNS ghim, chuyển hướng kiểm lại, giới hạn kích thước/thời gian), tuỳ chọn RETRIEVAL_V5 (PDF có lớp chữ, trang tới 2,5 MB) khi `S6C`; dự phòng đọc bằng Parallel extract nếu có (`extractFallback`).
- Mọi URL một kết quả công cụ mang trở thành URL `read_page` được phép mở (`collectUrls`, `researchLoop.ts:121-130`, ≤400 URL).
- Truy xuất sâu Exa (`CONSULT_UNWIND_S5`): không bật trong cấu hình UAT; nếu bật mà thiếu `EXA_API_KEY` thì chỉ ghi log `skipped:no_key` (`route.ts:3496-3500`).

---

## 9. Mảng (8): tìm kiếm Serper, song song hoá, cache, API ngoài

### 9.1 Chuỗi `web_search`

`webSearch` (`common.ts:935`, bọc `withRetrievedAt`): cache L1 trong tiến trình (5 phút) → `serperSearchEx` (qua cache chung L2) → nếu hàng rỗng và có `CONSULT_PARALLEL` thì Parallel Search (ngân sách theo lượt `createParallelTurnBudget`, `route.ts:2755-2772`) → DuckDuckGo HTML (`common.ts:900-935`; timeout 6 giây). Nhánh DuckDuckGo có thể bị chặn bởi `SEARCH_FALLBACK_GATE`/vé web (đều tắt trong UAT).

### 9.2 Cache

| Tầng | Chi tiết | Vị trí |
|---|---|---|
| L1 trong tiến trình | `getCache/setCache` khoá theo `cacheKey`, 5 phút cho web | `common.ts:22-160`, `common.ts:845` |
| Single-flight | `withSingleFlight`, `serperFlight` gộp yêu cầu trùng | `common.ts:56-134` |
| L2 chung (Upstash) | `serper:v1:<endpoint>:<sha256(truy vấn chuẩn hoá)>:<khu vực>`; TTL 86.400 s (`SERPER_CACHE_TTL_SECONDS`); ảnh 3 ngày; chỉ lưu mảng không rỗng của lời gọi thành công; tối đa 200 KB; MỞ khi lỗi (miss); timeout 300 ms; lọc văn bản không tin cậy trước khi chia sẻ | `serperCache.ts:1-60` |
| L2 phiên bản 2 | chuẩn hoá khoá (bí danh khu vực), TTL theo loại (tức thời 1 giờ, shopping 6 giờ, maps 3 ngày, `site:` 3 ngày) — chỉ khi `SERPER_CACHE_V2=1` (KHÔNG có trong cấu hình UAT) | `serperCacheV2.ts:36,90` |
| Giới hạn tốc độ / hạn mức | `publicRateLimit` (KV phân tán nếu có), `consumeAiQuestion`, `clarifyCredit` | `route.ts:259`, `1272` |

Có thể quan sát LOG: `serperCalls` mỗi lượt p50 = 3, p90 = 16, max = 112 (933 lượt; một lượt dùng 112 lời gọi). Trên cấu hình UAT không có trần số yêu cầu Serper theo lượt (`CONSULT_REQUEST_CAP` và `TURN_WEB_TICKET` vắng), ràng buộc duy nhất là ngân sách Chat (1/3 tìm) và cách các bước. Số tiền: xem `TAPPY_COST_TOKEN_AUDIT.md`.

### 9.3 Song song hoá

- Một bước của mô hình được gọi nhiều công cụ cùng lúc: `parallelTools: oneBrain` (`route.ts:4115`) và dòng prompt "call the tools for all of them in the same step" (`oneBrain.ts:40-42`).
- `web_search` tự đọc 3 trang đầu (S6A) qua `searchWithReads`; LOG: 1.442 dòng `tappyai_search_reads` trên 1.493 lượt gọi `web_search`; 538 dòng `tappyai_follow_up_gap` (truy vấn bù S6B).
- Nghiên cứu sâu: các bước của một vòng chạy song song (`deepResearch.ts:627`).

### 9.4 API ngoài

| Dịch vụ | Dùng cho | Ghi chú |
|---|---|---|
| Serper (`google.serper.dev`: search, shopping, maps, news, images) | tìm web, địa điểm, sản phẩm, ảnh | `serperClient.ts:253` |
| Parallel (search/extract) | dự phòng khi Serper rỗng, đọc trang thất bại | chỉ khi `CONSULT_PARALLEL=1` và có khoá |
| DuckDuckGo HTML | dự phòng cuối của `web_search` | `common.ts:900` |
| `wttr.in` | thời tiết hiện tại | `weather.ts:20` |
| Open-Meteo, met.no | dự báo | `weatherForecast.ts:17-19` |
| `vang.today` | giá vàng | `weather.ts:123` |
| Vietcombank, Coinbase, Yahoo Finance | tỷ giá, crypto, dầu | `marketRates.ts` |
| Overpass (OSM) | địa điểm dự phòng | `food.ts:327` |
| Agoda Lite API | giá/đêm khách sạn + link theo dõi | `providers/realtime/agodaLite.ts`; cần `CCP_REALTIME_AGODA_LITE=1` + `AGODA_LITE_SITE_ID`/`AGODA_LITE_API_KEY` (không đọc) |
| Vexere | link vé xe/tàu (affiliate), danh sách tàu | `commerce.ts`, `partnerLinkSet.ts` |
| Wikipedia | thẻ chủ thể, ảnh | `answerV4/docMedia.ts`, `media/wikiEntity.ts` |

**Mối liên hệ cổng tới `REALTIME_ADAPTERS`:** `REALTIME_ADAPTERS = [bookingDemand, agoda, agodaLite, traveloka, vexere]` (`providers/realtime/resolve.ts:23`), được dùng qua `realtimeBooking.ts` và `/api/booking/recheck`; việc nó được gọi trong một lượt chat one-brain đi qua `attachCommerceLinks` (`commerce.ts`); chưa lần theo đầy đủ từng nhánh (CHƯA KIỂM TRA).

---

## 10. Mảng (9): kiểm chứng, guard, tổng hợp câu trả lời

### 10.1 Kiểm chứng trước khi gọi công cụ

- Chặn ranh giới đầu vào (allowlist, giới hạn kích thước): `validateClientInput`.
- Cổng thị trường `wrapToolsWithMarketGate` (`MARKET_GATE=1`).
- Không dùng nguồn từ sản phẩm AI khác: `aiSourcePolicy.ts` (danh sách host cứng, mở rộng bằng dữ liệu).
- Từ chối khi thiếu đồng ý dữ liệu AI (`route.ts:561`) và khi chưa qua cổng tuổi.

### 10.2 Guard luồng ra (`streamEnrichment.ts`)

Chế độ quyết định giữ chữ: trên one-brain, `bufferMode` không bị ép bởi V1 (`streamEnrichment.ts:1956`), mà do công cụ chạy (giá, du lịch, địa điểm, sản phẩm, kế hoạch, tuỳ chọn, `streamEnrichment.ts:4391-4412`); phần còn lại đi qua bộ lọc egress sống.

**Chạy sửa thật trên one-brain (CODE):**
- `egress` (`guardModelEgress`): ảnh không thuộc server thành chữ thay thế, link chưa được cấp thành nhãn (`streamEnrichment.ts:2554`).
- `marketplace` (`scrubUnsuppliedMarketplaces`) và bare photo URL (`:2567-2581`).
- Gán nhãn giá không có nguồn "chưa xác minh" khi có `productRecords` (`:2926-2938`).
- `guardTravelClaimsInText` khi `travelIntent` (từ khoá) và không `consultV3` (`:2962-2964`).
- `grounding gate` với `labelUngrounded` + `pickAndOrderFree` (`:3655-3670`): gắn nhãn địa điểm chưa xác minh một lần thay vì cắt câu.
- `hotlineClaimGuardStream` (`route.ts:4671`, cờ).
- Bộ kiểm cho `present_blocks`: `verifyDeclaredFacts` (xem 10.4).

**Chạy ở chế độ shadow (chỉ log `tappyai_guard_shadow`, trả chữ nguyên văn)** — `qual()` (`streamEnrichment.ts:1974-1980`, `v4Shadow` = `answerV4&&consultV3` hoặc `oneBrain`): `money` (2931), `spec` (2945), `ticket_unit` (3020), `snippet_price` (3028), `proximity` (3035), `hours` (3173), `budget_fit` (3189), `format_claim` (3198), `district_claim` (3207), `unsupported_claim` (3222), `no_fabrication` (3279), `entity_name` (3293) và, qua `oneBrainShadow`, `plan_price`, `plan_local_tips`, `plan_trip_facts` (2784-2822).
- LOG (`tappyai_guard_shadow`, 348 sự kiện): money 57, spec 55, place_claim 58, snippet_price 40, unsupported_claim 4, plan_price 25, plan_local_tips 69, plan_trip_facts 37, district_claim 1, hours 2. Tức các guard này "sẽ đã sửa" mà không sửa.
- LOG (`tappyai_guard`, chạy thật): `egress` 58, `bare_photo_url` 60, `place_claim` 234 (nhãn cuối bao gồm nhãn `labelUngrounded`; không phân loại sửa/nhãn ở đây), `plan_items` 58, `plan_local_tips` 96, `plan_trip_facts` 50, `money:labelled_unbacked` 4, `money:hedged_unverified` 4, `hotline_claim` 3, `empty_reply_neutral` 12 (xem thêm mục 13).

**Không chạy trên one-brain (CODE):**
- `evidence_citation` (`shieldSupported`, `streamEnrichment.ts:2876`, định nghĩa `guardEvidence.ts:345`): `if (!ev || …) return {text}` (`:347`); `collector.guardEvidence` chỉ được gán bởi `onGuardEvidence` của đường agent (`route.ts:3940`), nên trên one-brain đây là no-op.
- Bộ dò lộ prompt/khoá `leakCheck` (`streamEnrichment.ts:2595`): chỉ `setLeakCheck` khi `lunaOn || agentOn` (`route.ts:3953`).
- `semanticRanking`/`noFabricationGate` ở chế độ gắn với agent v2 (`route.ts:3825`).

### 10.3 Danh sách link được phép (egress allowlist)

- Dựng bằng `allowUrl` từ: URL trong các lượt assistant đã phát hành (`publishedHistory`, `streamEnrichment.ts:1815`) và MỌI URL trong JSON thô của frame `a:` (kết quả công cụ) (`:4432`).
- `urlGrants.ts` (hợp đồng theo công cụ + trường, quyền `action/turn/source`) không được dùng ở đây (D4).

### 10.4 Tổng hợp và thẻ

- `present_blocks` → `enrichment.presentation`, `verifyPresentation = p => verifyDeclaredFacts(p, resultLedger.evidence())` (`route.ts:3226-3229`). `verifyDeclaredFacts` (`factSense.ts:84`) gọi 1 lần `AI.extract` role `intent` cho tối đa 60 khẳng định (`MAX_CLAIMS`, `factSense.ts:28`): mỗi điểm phải kèm một trích dẫn nguyên văn ≤12 từ và code kiểm trích dẫn có thật trong bằng chứng (`factSense.ts:56-70`); điểm không được xác nhận bị bỏ, thẻ rỗng bị bỏ, ô bảng không được xác nhận thành "—"; lỗi kiểm thì bỏ hết thẻ `profiles`/`compare`. Chỉ kiểm thẻ, KHÔNG kiểm đoạn chữ.
- LOG: 21 lượt `tappyai_fact_check`, 164 khẳng định, 109 giữ nguyên, 21 cắt ngắn, 0 lỗi (tức 34 khẳng định bị loại).
- Khung phát hành: một chú thích `8:` `tappy.presentation.v1` sau chữ (`streamEnrichment.ts:4284-4290`), client bỏ qua nếu không biết.
- `present_plan` / `present_options` tạo `[TAPPY_PLAN]` / thẻ tuỳ chọn ghép sau chữ (`streamEnrichment.ts:2441`, `:4196`).
- Ảnh/chủ thể: `oneBrainMediaStream` giữ frame kết thúc, hạn 9 giây (`oneBrainMedia.ts:48`), thẻ chủ thể chỉ với ý định `knowledge`/`comparison` (`SUBJECT_CARD_INTENTS`, `:44`), mỗi ảnh còn qua `imageSense` (model nhìn ảnh).
- Citation: không có guard "markdown link có thật trong kết quả" riêng ngoài `egress`; `citationSupport.ts`/`citationIntegrity.ts` thuộc đường khác (xem `streamEnrichment.ts` các lần dùng; chưa lần theo từng nhánh, CHƯA KIỂM TRA).

---

## 11. Số bước và số lượt gọi model theo code (chi tiết chi phí: xem `TAPPY_COST_TOKEN_AUDIT.md`)

### 11.1 Lượt chat thường (one-brain, Pro/Promax, cấu hình UAT)

| # | Lượt gọi | Role | Số tối đa trong lượt | Điều kiện | Vị trí |
|---|---|---|---|---|---|
| 1 | Bước của stream chính | `consult` | 8 | luôn | `route.ts:4012`, `oneBrain.ts:14` |
| 2 | Bước viết cuối (không công cụ) | `consult` | 1 | stream không phát chữ nhưng có kết quả công cụ; `CONSULT_FINAL_SYNTHESIS=1` | `route.ts:4305` |
| 3 | `understandTurn` | `intent` | 1 | có công cụ (`planHasTools`) và `CONSULT_ONE_BRAIN_MEDIA=1` | `route.ts:2473` |
| 4 | Truy vấn bù S6B (`AI.extract`) | `intent` | 1 | lượt gọi `web_search` đầu tiên, không ở Chat-quick | `route.ts:3418-3440` |
| 5 | Trích xuất trí nhớ | `fast` | 1 | đã đăng nhập và `worthExtract`; không được chạy nếu huỷ | `route.ts:4212-4224` |
| 6 | `verifyDeclaredFacts` | `intent` | 1 | khi `present_blocks` có thẻ `profiles`/`compare` | `route.ts:3229` |
| 7 | Lớp ảnh: `docMedia` (đặt tên mục, đọc thẻ) | `intent` | 2 | có phần chú giải ảnh | `docMedia.ts:41,55` |
| 8 | `imageSense` (kiểm ảnh có đúng chủ thể) | `intent` | 1 | có ảnh được chọn | `imageSense.ts:32` |
| 9 | Gọi lại do im lặng 8 giây | `consult`/`intent` | +1 cho mỗi lần | `withFallback` | `registry.ts:160-170` |

Trần lý thuyết cho một lượt đầy đủ nhất khoảng 8 + 1 + 1 + 1 + 1 + 1 + 2 + 1 = 16 lượt gọi (chưa tính gọi lại do im lặng). Trên Free (`planHasTools` false) lượt 3, 4, 6 và công cụ bị bỏ, vẫn còn lượt 1 (tối đa 8 bước nhưng không có công cụ thì thực chất 1 bước), 5.

**LOG (stream chính):** `steps_run` p50 = 3; phân bố ở 4.1. Số công cụ/bước: trung vị 2 công cụ trên 3 bước.

### 11.2 Chế độ khác
- `think`: cùng khung, `thinkEffort:'medium'` toàn bộ bước (Responses API); thêm chi phí suy luận (xem file chi phí).
- `auto`: thêm 1 bước tool-call `think_deeper` (khi mô hình gọi), sau đó các bước sau ở medium.
- `deep`: mục 4.5. LOG: `modelCalls` 6 đến 7 cho lượt trên engine cũ.

### 11.3 Đường agent (không chạy ở UAT)
Tối đa 6 vòng model, 8 lần gọi công cụ, 85 giây (`runtime/limits.ts`).

---

## 12. Điểm lệch giữa thiết kế (docs) và code

| # | Thiết kế/tài liệu | Code | Bằng chứng |
|---|---|---|---|
| D1 | `docs/architecture/ONE-BRAIN-FREEZE-20261102.md` §1.1: "không có trong code: bộ định tuyến luật, từ khoá theo sản phẩm, nhánh riêng cho từng câu hỏi" | Các module vẫn có trong repo (`consultRouter.ts`, `luna.ts`, `domainFrames.ts`...) và, trên one-brain, các bộ đọc từ khoá vẫn chạy trước model và điều khiển tầng công cụ/guard (mục 1 điểm 5) | CODE `route.ts:406-470`, `1536-1590`, `3245-3300` |
| D2 | Freeze §1.3: Deep Research pro 10/tháng, promax 69/tháng | `tiers.ts`: `STANDARD_RESEARCH_MONTHLY` pro 5, promax 10; `ADVANCED_RESEARCH_MONTHLY` pro 5, promax 15 → tổng 10 và 25; bình luận đầu `tiers.ts:8` ghi 30. Ba giá trị khác nhau | CODE `tiers.ts` |
| D3 | `researchAdmission.ts:9` và `researchController.ts:6`: "Not wired into the chat route yet" | Route gọi `tierTurnFor` (`route.ts:3739`). Nhưng `validateTaskGraph`, `reportStatusOf`, `promoteAfterEvidence` thực sự không có nơi gọi sản xuất | CODE grep |
| D4 | `urlGrants.ts:5-9`: một URL chỉ được cấp từ trường mà hợp đồng công cụ nêu; "Before" (mọi URL trong JSON thô) là trạng thái cũ; `toolResultSplit.ts:159` nói `streamEnrichment` cấp link "dưới cùng `TOOL_URL_CONTRACT`" | `streamEnrichment.ts` không import `urlGrants`; allowlist vẫn quét JSON thô (`:1813-1815`, `:4432`); `TOOL_URL_CONTRACT`/`urlsFromToolResult`/`serverBuiltAllowed` chỉ có test; `route.ts:4437` không truyền `urlGrants` | CODE grep `security/urlGrants'` (chỉ `chatSessionState.ts` import `grantableUrl`, `linkFreeName`) |
| D5 | `docs/architecture/AI_PLATFORM.md`: 4 role, `claude.ts` có sẵn, `openai` "chỗ chờ", route không biết vendor | 8 role, mặc định nhà cung cấp `openai`/Luna, route import `responsesConfigured` từ adapter | CODE `registry.ts:45,54`, `route.ts:192` |
| D6 | `docs/handoff/AUDIT-20261118-…`: "KHÔNG có bước viết dành riêng; log ghi `wrote_text:false`" | Có bước dự trữ + bước viết cuối khi `CONSULT_FINAL_SYNTHESIS=1` (UAT bật); cả 16 lượt `wrote_text:false` có `tappyai_final_write outcome=appended` | CODE `route.ts:4019,4305`; LOG |
| D7 | Freeze §1.3: Free "chỉ Chat" | Từ 14/11 Free không có công cụ (`TIER_HAS_TOOLS`, `gateTools`) khi `SUBSCRIPTIONS_ENABLED=1`; tài liệu freeze chưa ghi | CODE `tiers.ts`, `route.ts:2455,2530` |
| D8 | Freeze §3: "`SUBSCRIPTIONS_ENABLED` hiện chưa bật" | UAT đặt `SUBSCRIPTIONS_ENABLED=1` (tệp cờ); production chưa kiểm tra | CODE tệp cờ; CHƯA KIỂM TRA production |
| D9 | Freeze §1.2: "`think_deeper` do mô hình tự gọi; không từ khoá nào quyết định" | Đúng với code; nhưng tốn một bước ở mỗi lần gọi và đổi effort giữa lượt (xem mục 4.2). LOG 83 lần gọi | CODE + LOG |
| D10 | Mô tả `consultFlags.ts:8` về `CONSULT_ANSWER_ATTRIBUTION`/`CONSULT_GENERAL_ASSISTANT` | Trên one-brain chưa tìm thấy nơi tiêu thụ (chỉ đường `consultOn`) | CHƯA XÁC MINH hoàn toàn |

---

## 13. Mã chết và cờ tắt (trên cấu hình UAT đã đọc)

**Không chạy vì `!oneBrain`/`consultOn`/`lunaOn` (CODE):** `routeConsult`, `consultRouter.ts`, `runLunaIntent`, `runConsultBrain`, kết quả `consult*`, cổng làm rõ `assessActionability`, `buildAskReply`, trả lời canned (`cannedChitchat`, `cannedCarriedFact`, `movieTitlesReply`), presearch (`planPresearch`, `planFlightPresearch`), trip prefetch, evening frame, `planCompletionStream`, `buildLean`, `domainFrames`, `promptBuilder.ts` (699 dòng; chỉ đường legacy), `leanConsultPrompt.ts`, `consultV3`/clarify credit, `answerInsteadOfAsk`, `searchNowIntentGate`, `moreFromSet`. Thư mục `consultative/` có 18.515 dòng không test và 149 tệp test; phần chạy trên one-brain là một tập con (`oneBrain.ts`, `oneBrainMedia.ts`, `planV2.ts`, `searchReads.ts`, `researchLoop.ts`, `turnTrace.ts`, `memoryBlock.ts`...); tỉ lệ chính xác không được tính (CHƯA KIỂM TRA; không phân tích khả đạt từng hàm).

**Không chạy vì `TAPPY_AGENT` không đặt (CODE):** toàn bộ `src/lib/ai/agent/**` (8.103 dòng không test, 65 test).

**Cờ không có trong cấu hình UAT, mặc định tắt (môi trường nền CHƯA KIỂM TRA):** `CONSULT_UNWIND_S5` (Exa), `CONSULT_REQUEST_CAP`, `TURN_WEB_TICKET`, `SEARCH_FALLBACK_GATE`, `SERPER_CACHE_V2`, `MCP_GATEWAY`, `DEEP_RESEARCH_V2`, `AI_COST_GATE`, `AI_USAGE_LEDGER`, `CONSULT_LUNA*`, `CONSULT_V3`.

**Mã được định nghĩa nhưng không có người gọi sản xuất (CODE, grep):** `validateTaskGraph`, `reportStatusOf`, `promoteAfterEvidence` (mục 4.5); `TOOL_URL_CONTRACT`, `urlsFromToolResult`, `serverBuiltAllowed` (D4); cột `behavior_summary` (mục 7.3).

**Cấu hình nhưng có thể vô hiệu theo môi trường:** `CONSULT_PARALLEL=1` cần `PARALLEL_API_KEY`; `RESEARCH_ADMISSION/ADVANCED` cần khoá Anthropic; `CCP_REALTIME_AGODA_LITE` cần khoá Agoda (mục 9.4).

---

## 14. Quan sát (hiện trạng, không đề xuất giải pháp)

| # | Quan sát | Bằng chứng |
|---|---|---|
| Q1 | Trên one-brain, đoạn chữ chính của câu trả lời không bị guard sửa (phần lớn guard chất lượng là shadow; `evidence_citation` no-op; `leakCheck` không gắn). Việc kiểm chứng sự kiện chỉ được ép ở thẻ (`factSense`), liên kết, nhãn giá/địa điểm, và guard hành trình theo từ khoá | CODE mục 10.2; LOG shadow 348 so với `tappyai_fact_check` 21 |
| Q2 | Danh sách link được phép vẫn là "mọi URL trong JSON thô của kết quả công cụ" nên một URL trong đoạn trích/snippet của bên thứ ba có thể được cấp; hợp đồng theo trường chưa nối | CODE D4 |
| Q3 | Từ khoá vẫn lọc giá vé/khách sạn (`extractBudget`) và bật guard hành trình (`detectTravelIntent`) trên one-brain; `turnType` và `domain` trong telemetry cũng đến từ các bộ đọc từ khoá (`domain: consult?.domains[0] ?? decisionFrame.domains[0]`, `route.ts:4651`) | CODE; LOG `turnType:"legacy"` 933/933 |
| Q4 | Ngân sách Chat "1 tìm, 1 đọc" chỉ bọc `web_search`/`read_page` do model gọi; lượt đọc nội bộ của `web_search` (S6A) gọi `innerRead` đã tách khỏi ngân sách đó, nên mỗi lần tìm vẫn đọc tới 3 trang (vẫn bị ràng buộc bởi ngân sách trang của bộ đọc, 10) | CODE `route.ts:3418-3465` so với `3467-3491`; LOG 1.442 `tappyai_search_reads` / 1.493 `web_search` |
| Q5 | `think_deeper` tốn một bước và đổi effort giữa lượt; log không cho biết lượt nào thực sự chạy medium | CODE `ai.ts:45-55`, `route.ts:4153`; LOG 83 lần |
| Q6 | Số lượt gọi model một lượt vượt xa số bước (mục 11); phần lớn là role `intent` cho các việc phụ (hiểu câu cho ảnh, kiểm thẻ, truy vấn bù, ảnh) | CODE; LOG `tappyai_follow_up_gap` 538, `tappyai_fact_check` 21 |
| Q7 | Trí nhớ: trích xuất chạy trên đa số lượt đăng nhập; trạng thái phiên chỉ ghi; `behavior_summary` chỉ ghi | CODE mục 7 |
| Q8 | Nghiên cứu sâu trong log không vào Standard/Advanced (0 dòng admission trên 42 lượt) dù tệp cờ bật; khả năng thiếu khoá Anthropic | LOG; SUY LUẬN |
| Q9 | Không có trần số yêu cầu Serper theo lượt trên cấu hình UAT; một lượt dùng tới 112 lời gọi | LOG `tappyai_turn_cost` |
| Q10 | Cache đọc 66,2%, ghi 33,5% của tổng input trên 933 lượt (tức một phần ba input được tính ở giá ghi cache) | LOG |
| Q11 | Lượt `think` ở role `consult` nhưng cấu hình chờ phần đầu 8 giây (`registry.ts:139`) cho `consult`/`intent`: nếu mô hình suy luận im lặng quá 8 giây thì bị gọi lại; đường Responses có hạn riêng (`LLM_RESPONSES_TIMEOUT_MS`, theo tài liệu freeze: 60 giây im lặng); chưa lần theo cách hai hạn tương tác | CODE; CHƯA KIỂM TRA tương tác |
| Q12 | `route.ts` import adapter vendor (`responsesConfigured`) và `claudeWriterAvailable` | CODE D5 |
| Q13 | Bàn giao 17/11 nêu: `vitest` 27.266 qua, 0 hỏng, 95 bỏ qua (BENCHMARK, chưa chạy lại ở audit này) | `docs/handoff/HANDOFF-20261117-…` |

---

## 15. Danh sách CHƯA KIỂM TRA

1. Giá trị cờ ở môi trường nền (`.env.local`, Vercel): đặc biệt `TAPPY_AGENT`, `LLM_PROVIDER`, `LLM_CONSULT_*`, `PARALLEL_API_KEY`, khoá Anthropic, `SERPER_CACHE_V2`, `CONSULT_REQUEST_CAP`, `AI_COST_GATE`, `CONSULT_PRODUCTION_ALLOW`. Mọi kết luận "tắt/bật" ở mục 2 và 13 chỉ dựa trên tệp `flags-uat-blocks-plans.json`.
2. Mọi thứ trên production: trạng thái triển khai, cờ, hành vi. Không mục nào được gắn PRODUCTION VERIFIED.
3. Lần theo từng nhánh còn lại của `streamEnrichment.ts` (4.880 dòng): chỉ đọc theo điểm; chế độ chính xác (sửa/nhãn/shadow) của từng stage ngoài các stage đã liệt kê ở 10.2.
4. Hành vi thật của `trimPlacesForModel` và các cách cắt tỉa kết quả công cụ cho từng công cụ trên one-brain; kích thước kết quả `web_search`/`read_page` đưa vào model.
5. Các nhánh còn lại của thương mại/đối tác (`commerce.ts`, `realtimeBooking.ts`): đường chạy từ lượt chat tới Agoda Lite, Vexere, `REALTIME_ADAPTERS`.
6. `consultAnswerAttribution`/`consultGeneralAssistant` có ảnh hưởng gì trên one-brain hay không (chưa thấy chỗ tiêu thụ).
7. `travelMoreTurn` (`route.ts:3298`) có khác null trên one-brain hay không (quyết định trạng thái phiên có thật sự chỉ ghi).
8. Lý do 515 dòng `tappyai_chat_mode` nhỏ hơn 921 lượt; bộ cờ của từng lượt trong `server-3040.log`; thời kỳ log phủ.
9. Tương tác giữa hạn chờ 8 giây của `withFallback` với chế độ `think`/`auto` ở effort medium.
10. Hoạt động thực của nghiên cứu sâu ở hai tầng Standard/Advanced (không có lượt nào trong log); `claudeWriterAvailable`.
11. Cron `behavior-rollup` có chạy ở môi trường nào; có nơi đọc `behavior_summary` ngoài chat (cấp dữ liệu cho `recommendations` hay không) hay không.
12. Client mobile (Android/iOS): chế độ gửi, `chatSessionId`; ngoài phạm vi.
13. Chất lượng đầu ra (đúng/sai sự kiện): không được đánh giá; audit này chỉ mô tả cơ chế.
14. Chi phí/token/LLM registry: thuộc `TAPPY_COST_TOKEN_AUDIT.md`; các số LOG chi phí trong tài liệu này chỉ để đối chiếu.

---

## Phụ lục A. Bản đồ tệp chính

| Vai trò | Tệp |
|---|---|
| Điểm vào một lượt chat | `src/app/api/chat/route.ts` |
| One brain | `src/lib/ai/consultative/oneBrain.ts`, `oneBrainMedia.ts`, `planV2.ts`, `searchReads.ts`, `researchLoop.ts`, `turnTrace.ts` |
| Cờ | `src/lib/config/consultFlags.ts`, `src/lib/config/r13Flags.ts` |
| Mô hình/nhà cung cấp | `src/lib/ai/llm/ai.ts`, `registry.ts`, `providers/openai.ts`, `providers/claude.ts`, `fallback.ts` |
| Trí nhớ | `src/lib/memory/memoryService.ts`, `memoryContract.ts`, `src/lib/ai/memoryGate.ts`, `src/lib/ai/consultative/memoryBlock.ts`, `memoryTransientFilter.ts`, `src/lib/ai/contextBuilder.ts` |
| Phiên | `src/lib/ai/consultative/chatSessionState.ts` |
| Công cụ | `src/lib/ai/tools/*`, `src/lib/providers/realtime/*`, `src/lib/ccp/*` |
| Guard & luồng ra | `src/lib/ai/streamEnrichment.ts`, `finalWrite.ts`, `guardEvidence.ts`, `src/lib/ai/security/*` |
| Thẻ/khối | `src/lib/presentation/*`, `src/lib/ai/answerV4/*` |
| Nghiên cứu sâu | `src/lib/ai/research/*` |
| Agent | `src/lib/ai/agent/**` |
| MCP | `src/lib/mcp/*`, `src/app/api/mcp/route.ts` |
| Gói/tier | `src/lib/plans/tiers.ts` |

## Phụ lục B. Số LOG gốc (đếm từ `server-3040.log`)

- `tappyai_one_brain_turn`: 921; `steps_run` {1:118, 2:251, 3:201, 4:167, 5:81, 6:44, 7:20, 8:39}; `step_cap_hit` 39; `wrote_text:false` 16; `length_cut` 1; `finish_reason` {stop 905, tool-calls 15, length 1}; `effort` {none 898, low 12, medium 11}; `tool_calls` p50 2, p90 7, max 34, 118 lượt bằng 0; `prompt_tokens` p50 32.198, p90 104.889, max 369.559.
- `tappyai_final_write`: 16, đều `outcome:"appended"`.
- `tappyai_final_synthesis_guard`: 43. `tappyai_chat_mode_cap`: 30. `tappyai_auto_think`: 83. `tappyai_mode_tier`: 1. `tappyai_safety_emergency`: 5. `tappyai_present_blocks`: 33. `tappyai_fact_check`: 21 (164 khẳng định, 109 giữ, 21 cắt, 0 lỗi). `tappyai_follow_up_gap`: 538. `tappyai_search_reads`: 1.442.
- `tappyai_turn_cost` (ngoài deep): 933, toàn bộ `turnType:"legacy"`; tổng `tokensIn` 44.606.454, `lunaCachedIn` 29.538.364, `lunaCacheWrite` 14.935.902; `serperCalls` p50 3, p90 16, max 112. `fellBack:true`: 7.
- `tappyai_deep_research`: 42, đều `ok:true`; `tappyai_research_admission`: 0.
