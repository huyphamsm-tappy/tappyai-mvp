# TAPPY_COST_TOKEN_AUDIT — Audit chi phí AI và token của TappyAI (READ-ONLY)

Nguồn chuẩn: `D:/TappyAI-wt/wt-integration`, nhánh `feat/brain-r13-p1`, HEAD `b0fe4bf13ac77629a6662a6bae068c393ed767de`. Ngày audit: 18/11/2026.
Phạm vi: chỉ đọc code, tài liệu, log UAT cục bộ. Không gọi API/mạng, không chạm database/production, không đọc `.env*`. Mọi giá "theo repo" là số ghi trong code, không đối chiếu với trang giá công khai (không được tra mạng).

Nhãn trạng thái: IMPLEMENTED (có trong code), TESTED (có test), VERIFIED (đối chiếu được bằng log đo), PRODUCTION VERIFIED (không có mục nào), CHƯA KIỂM TRA.
Nhãn bằng chứng: CODE, LOG, BENCHMARK (báo cáo đo có sẵn), SUY LUẬN, CHƯA XÁC MINH.

---

## 0. Kết luận về tiền đề của Owner

Tiền đề: "Tappy dùng Claude Sonnet 5.5 nhưng chi phí thực tế ngang Opus 5.5."

**Kết luận: tiền đề SAI về model và KHÔNG KIỂM CHỨNG ĐƯỢC về chi phí.**

1. Opus 5.5 không được gọi ở bất kỳ đường nào. (CODE) `grep -i opus` trong `src/` chỉ ra 2 chỗ: `src/lib/ai/turnCost.ts:8` (dòng giá chung `/opus/i → 15/75` USD/1M, không bao giờ được chọn cho model Claude 5.5) và `src/lib/ai/llm/providers/agentModelHaiku55.test.ts:204` (test khẳng định `claudeCallCost('claude-opus-5-5', …)` trả `null`, tức không có bảng giá Opus). Repo không có giá Opus 5.5 nên không thể so "ngang Opus" bằng số trong repo (CHƯA XÁC MINH).
2. Sonnet 5.5 không phải model chat chính. (CODE + LOG) Model mặc định mọi vai trò là `gpt-6-luna` của OpenAI (`registry.ts:54-56` mặc định `openai`; `openai.ts:24`). Sonnet 5.5 chỉ chạy trong báo cáo nghiên cứu sâu mức Advanced (`deepResearchDeps.ts:291,294,299,306`, sau cờ `RESEARCH_ADVANCED`). Haiku 5.5 chạy Standard và đọc nguồn cho Advanced.
3. Chi phí đo được (LOG): trong toàn bộ log UAT, Sonnet 5.5 là 8,91 USD trên tổng 37,26 USD (23,9%); Anthropic nói chung 12,49 USD (33,5%); Serper và Parallel 18,78 USD (50,4%); OpenAI Luna ghi nhận 3,96 USD (10,6%); phần còn lại không quy được 2,03 USD (5,4%). Một lượt chat thường trung bình 0,0167 USD, trong đó Serper 0,0119 USD.
4. Điều đúng một phần: một báo cáo Advanced đắt (0,58 USD trung bình, gấp khoảng 35 lần một lượt chat) và Sonnet chiếm ~85% chi phí model của lượt đó. Cảm giác "đắt như Opus" nếu có thì đến từ báo cáo Advanced và Serper, không phải từ model chat. Đối chiếu với hóa đơn Anthropic/OpenAI/Serper thật CHƯA KIỂM TRA (không có quyền).

---

## 1. Cấu hình của số đo — không trộn số

`D:/TappyAI-review-artifacts/consultative-wave3/measure30/logs/uat-3000.log` (76.503.145 byte, 133.212 dòng, LOG) KHÔNG phải một lần chạy. Nó nối tiếp 111 phiên khởi động `next dev` (đếm dòng "Ready in"), không có dấu thời gian, nhiều bộ cờ khác nhau. Lệnh thống kê của tôi: đọc từng dòng JSON có `"type":"tappyai_*"`.

Mốc phân kỳ quan trọng (LOG):
- Phiên 3 đến 54 (trước dòng ~30.767): không có dòng `tappyai_agent_model_cost`, tức chưa có Claude. Báo cáo nghiên cứu chạy trên Luna.
- Từ phiên 55 (dòng 30.767): có Claude (Haiku 5.5, Sonnet 5.5). Đây là "thời Claude".
- Phiên 32, 49: lỗi OpenAI `You have no credits remaining` (13 lần ở role intent/plan) và phiên 54 hai lần `Incorrect API key`. Nghĩa là OpenAI bị tính tiền thật và có lúc hết credit (LOG).

Cờ lúc UAT Promax cuối: `flags-uat-blocks-plans.json` (73 khóa, chỉ đọc tên và 0/1), sửa lần cuối 17/11 09:53. Các cờ liên quan chi phí:
- Bật (=1): `CONSULT_ONE_BRAIN`, `CONSULT_PARALLEL`, `RESEARCH_ADMISSION`, `RESEARCH_ADVANCED`, `RESEARCH_CONSOLIDATION`, `RESEARCH_FORECAST_MODEL`, `RESEARCH_THESIS_REPORT`, `RESEARCH_PACKAGES`, `TVI_CAPTURE`, `TVI_READ`, `SUBSCRIPTIONS_ENABLED`; `LLM_RESPONSES_PROCESS_BUDGET_USD` có đặt (giá trị không đọc).
- Không có trong tệp (nghĩa là mặc định tắt trừ khi `.env.local` đặt, không được đọc nên CHƯA XÁC MINH): `LLM_PROVIDER`, `AGENT_MODEL`, `HAIKU_FALLBACK`, `C2_REQUEST_BUDGET`, `C2_STREAM_ADAPTER`, `CONSULT_REQUEST_CAP`, `AI_USAGE_LEDGER`, `RESEARCH_ADVANCED_WRITER`, `ANTHROPIC_API_KEY`.
- `CONSULT_LUNA_FAST=0`.

Production: chỉ có tài liệu cũ `docs/handoff/HANDOFF-20261116-layout-anh-ke-hoach-ban-giao-tai-khoan-moi.md:40`: "Production: Vercel, deploy 04/11, KHÔNG có mã mới". Cờ và model production hiện hành CHƯA XÁC MINH. Mọi số trong tài liệu này là UAT cục bộ, không áp được cho production.

---

## 2. Model thật theo từng vai trò (CODE + LOG)

| Vai trò / đường gọi | Model thật | Bằng chứng |
|---|---|---|
| Chat thường, mọi `ModelRole` (fast, smart, planning, vision, consult, intent, plan, agent) | `gpt-6-luna` (OpenAI), nhà cung cấp mặc định `openai` | `registry.ts:54-56`, `:66-69`, `:160-167`; `openai.ts:24`; log `tappyai_one_brain_turn` 845/845 dòng `response_model=gpt-6-luna`, `provider=openai` |
| Bước trả lời ở chế độ nghĩ (auto-think / think) | `gpt-6-luna` qua Responses API, effort `medium` | log `tappyai_llm_call`: 2.632 lượt `ok` đều `medium`, 1 lượt `low`; mặc định `none` (`openai.ts:33-39`) |
| Báo cáo Standard | `claude-haiku-5-5` (đọc, lập kế hoạch, viết) | `deepResearchDeps.ts:289,294,303,306`; `claude.ts:117` |
| Báo cáo Advanced, lead (lập kế hoạch, kiểm khoảng trống, dàn ý, viết, quét chính sách) | `claude-sonnet-5-5` | `deepResearchDeps.ts:291,294,299,306`; `claude.ts:185-188` |
| Báo cáo Advanced, đọc nguồn thành ghi chú | `claude-haiku-5-5` | `deepResearchDeps.ts:303` (`notesBy`) |
| Agent runtime Haiku | không dùng trong UAT (cần `AGENT_MODEL=haiku55`) | `registry.ts:182-184`; 0 dòng nhãn `agent` trong log |
| Fallback Claude khi Luna lỗi | tắt (cần `HAIKU_FALLBACK=1`); thay bằng một lần retry trên Luna | `registry.ts:119-122,164-166`; log `tappyai_llm_fallback` đều `fallback":"luna_retry"` |
| Opus 5.5 | không có đường gọi, không có bảng giá | xem mục 0 |

Số model gọi theo log (LOG, công thức: đếm dòng theo `model`): `tappyai_agent_model_cost` 1.681 dòng = Haiku intent 1.432 (ghi chú nguồn), Haiku plan 86, Haiku consult 29, Sonnet plan 115, Sonnet consult 19. Ghi chú: nhãn `intent` của Haiku là bước đọc nguồn của nghiên cứu sâu (`deepResearchDeps.ts:368`), không phải đọc ý định của chat.

---

## 3. Nhà cung cấp thực sự bị tính tiền (LOG, toàn log 996 lượt, 37,2597 USD)

| Nhà cung cấp | USD | Tỷ trọng | Nguồn thống kê |
|---|---:|---:|---|
| Serper + Parallel (tìm kiếm) | 18,782 | 50,4% | tổng `serperUsd` của `tappyai_turn_cost` (chat 10,036 + nghiên cứu 8,746) |
| Anthropic (Haiku 5.5 + Sonnet 5.5) | 12,487 | 33,5% | tổng `usd` của `tappyai_agent_model_cost`: Sonnet 8,911; Haiku 3,575 |
| OpenAI Luna (ghi nhận từng cuộc gọi) | 3,960 | 10,6% | tổng `usd` của `tappyai_llm_call` |
| Không quy được | 2,030 | 5,4% | phần dư = tổng - ba dòng trên; gồm các cuộc gọi Luna có cấu trúc (intent/plan) không ghi từng dòng và các lượt nghiên cứu thời Luna |

Tách theo loại lượt (LOG): chat (`turnType` khác `deep_research`) 841 lượt, 14,059 USD (37,7%); nghiên cứu sâu 155 lượt, 23,201 USD (62,3%). Nghiên cứu sâu là 15,6% số lượt nhưng 62,3% chi phí.

Phép đo Serper: 18,78 USD gồm cả Parallel (mỗi tìm kiếm 0,001 USD, `parallelClient.ts:31`). `serperUsdPerCredit` mặc định 0,001 USD/credit (`turnCost.ts:22-25`, có thể ghi đè bằng `SERPER_USD_PER_CREDIT`); giá Serper thực tế của tài khoản CHƯA XÁC MINH.

---

## 4. Số lần gọi, token, thinking, cache

### 4.1 Chat thường (841 lượt, thời Luna; LOG)

- `llmCalls` mỗi lượt (`tappyai_usage`): trung bình 3,98; trung vị 4; p90 6; tối đa 8. Phân bố: 1 lần 78, 2 lần 73, 3 lần 149, 4 lần 243, 5 lần 162, 6 lần 75, 7 lần 28, 8 lần 31. 296 lượt (35,2%) gọi từ 5 lần trở lên.
- Bước trong vòng lặp (`tappyai_one_brain_turn`): tổng 3.383 bước cho 845 lượt (4,00 bước/lượt); 33 lượt (3,9%) chạm trần 8 bước (`step_cap_hit`).
- Token vào mỗi lượt: trung bình 73.145; trung vị 57.770; p90 151.912; tối đa 534.904. 10% lượt lớn nhất chiếm 27,2% tổng token vào. Token ra trung bình 1.419.
- Ngữ cảnh lặp lại: prompt trung bình mỗi cuộc gọi tăng theo số bước: lượt 1 cuộc gọi 8.680 token, 2: 19.937, 3: 36.299, 4: 61.904, 5: 103.032, 6: 136.367, 7: 183.921, 8: 216.647 (tổng token vào của cả lượt, chia số lượt cùng số `llmCalls`). Nghĩa là mỗi bước thêm chở lại toàn bộ kết quả công cụ của các bước trước. Log không có token theo từng bước (`tappyai_trace ev:loop` chỉ có `stepsRun`), nên trọng số từng bước CHƯA XÁC MINH.
- Cuộc gọi Luna ghi riêng (`tappyai_llm_call`, 2.632 `ok`): vào trung bình 21.319, cache 13.656 (64,1%), ra 789, trong đó thinking 263; USD trung bình 0,00149 mỗi cuộc gọi. 8 cuộc gọi `error` (217 giây cộng dồn).
- `think_deeper`: gọi trong 730 trên 769 lượt có công cụ (94,9%) và 730/845 lượt one-brain (86,4%); `tappyai_auto_think on:true` 730 lần. Cơ chế: `oneBrain.ts:156,183` ("call think_deeper first, alone; the rest of the answer then reasons"). Lượt dùng medium: 720 lượt, thinking 451.613 token; toàn chat: thinking 464.190 token trên 1.193.446 token ra (38,9%), tương đương 0,232 USD ở giá 0,50/1M (1,6% chi phí chat). Chi phí bước `think_deeper` riêng (thêm một cuộc gọi chở lại ngữ cảnh) ước tính 730 × 0,00149 ≈ 1,09 USD (SUY LUẬN: giả định đúng một cuộc gọi thêm, chưa đo).
- Công cụ gọi (`tappyai_trace ev:tool state:requested`, 3.792 lần): `web_search` 1.416, `think_deeper` 730, `search_places` 700, `present_blocks` 261, `search_products` 147, `present_plan` 93, `read_page` 88, `get_weather_forecast` 82, `calculate` 76, `get_hotel_prices` 71, `get_transport_options` 44, còn lại < 30 mỗi loại. Tối đa 24 công cụ một lượt.
- Đọc trang: 4.934 sự kiện `page_read`, trung bình 237.310 byte thô mỗi trang (HTML đã tải, KHÔNG phải token đưa vào model); chỉ 235 lần trúng cache (4,8%). Phần thật sự vào prompt CHƯA XÁC MINH.
- Retry và dự phòng (LOG): 1.588 dòng `tappyai_llm_fallback`, tất cả là `luna_retry`. 1.519 dòng trước phiên 55 (1.504 do `first_part_timeout_8000ms` ở role `intent`), 69 dòng sau phiên 55 (63 do timeout). Cuộc gọi bị bỏ rồi thử lại có bị tính tiền hay không CHƯA XÁC MINH. `retryCount` luôn là `unknown` ở cả 841 dòng `tappyai_usage`: số retry không đo được từ log lượt.
- Dự phòng ở lượt: chỉ 1 trên 841 lượt có `fellBack=true`.

### 4.2 Cache Luna (LOG)

- Từ `tappyai_turn_cost` (chat): token vào 61.428.128; cache đọc 36.899.915 (60,1%); "cache write" 24.468.396 (39,8%).
- Từ `tappyai_llm_call`: cache 35.941.211 trên 56.112.622 (64,1%). Khớp con số "trúng khoảng 64%" trong `docs/uat/AUDIT-REPORT-20261118.md` mục 7.
- "Cache write" ở Luna là giá trị suy ra, không phải số API trả: adapter coi mọi token vào không trúng cache là cache write và tính 0,125 USD/1M thay vì 0,10 (`openai.ts:88-103`, `:308-309`; lý do ghi ở `openai.ts:20-22` dựa trên probe 30/09). Xem mục 5.

### 4.3 Cache Anthropic (LOG + CODE)

- 1.681 cuộc gọi Claude: `cache_read` = 0 và `cache_write` = 0 ở TẤT CẢ dòng `tappyai_agent_model_cost`. Trường `promptCacheRead/Write` trong `tappyai_turn_cost` cũng bằng 0 ở mọi lượt.
- Nguyên nhân trong code (CODE): `ai.ts:25-36` chỉ gắn `cacheControl` qua `decoratorFor` khi `usesAnthropicAgentModel` (cần `AGENT_MODEL=haiku55`), còn lại dùng `provider.decorateMessages` của nhà cung cấp mặc định; adapter OpenAI không có `decorateMessages` (grep `openai.ts` không có). Cuộc gọi Claude của nghiên cứu sâu (`claudeModel: 'sonnet55'|'haiku55'`, `registry.ts:153-154`) vì vậy không mang điểm cache. (SUY LUẬN: nguyên nhân gốc là sự vắng mặt của marker, đã khớp với số 0; chưa thử gửi thật.)
- Đầu vào Claude trả theo giá không cache: tổng 16,77 triệu token vào (Sonnet 1,68M, Haiku 15,09M), tương ứng 3,365 USD (Sonnet, 2 USD/1M) + 1,509 USD (Haiku, 0,10 USD/1M) = 4,87 USD, tức 13,1% tổng chi phí. Tỷ lệ phần lặp lại của đầu vào này CHƯA XÁC MINH.

### 4.4 Báo cáo nghiên cứu sâu (LOG, phân theo `tappyai_turn_cost` có `turnType=deep_research`)

| Nhóm | Số lượt | USD/lượt | Phần model | Phần tìm kiếm | Cuộc gọi model/lượt |
|---|---:|---:|---:|---:|---:|
| Thời Luna (phiên < 55) | 99 | 0,086 | 0,031 | 0,055 | 31,0 |
| Thời Claude, kiểu Advanced (usd ≥ 0,30; phân loại theo ngưỡng, SUY LUẬN) | 18 | 0,581 | 0,491 | 0,090 | 39,3 |
| Thời Claude, kiểu Standard (usd < 0,30; SUY LUẬN) | 38 | 0,111 | 0,067 | 0,044 | 28,7 |

Khớp BENCHMARK: `docs/uat/UAT-FINAL-REPORT-20261118.md` dòng 4 ghi Advanced 0,57 và 0,64 USD, Standard 0,09–0,11 USD.
Chi tiết Sonnet (LOG, `tappyai_agent_model_cost`): nhãn `plan` 115 cuộc gọi, vào trung bình 11.206, ra 2.703, 0,0494 USD/cuộc gọi, tổng 5,686 USD; nhãn `consult` (viết báo cáo) 19 cuộc gọi, vào 20.739, ra 12.830, 0,1698 USD/cuộc gọi, tổng 3,226 USD. Token ra là 62% chi phí Sonnet (554.590 token × 10 USD/1M = 5,55 USD).
Haiku 5.5: 1.432 cuộc gọi đọc nguồn, vào 9.553, ra 2.707 trung bình, tổng 3,306 USD; ra chiếm 1,94 USD trên 3,31.

---

## 5. Đối chiếu bảng giá, usage API và sổ chi phí

### 5.1 Hằng số giá theo repo (không đối chiếu được web)

| Hằng số | Giá trị (USD/1M) | Vị trí | Nguồn ghi trong code |
|---|---|---|---|
| Luna `gpt-6-luna` | vào 0,10; cache 0,01; cache write 0,125; ra 0,50 | `openai.ts:27-29` | developers.openai.com, đọc 30/09/2026 |
| Haiku 5.5 ≤100k | vào 0,10; write 0,125; read 0,01; ra 0,50 | `claude.ts:128` | platform.claude.com, đọc 11/10/2026 |
| Haiku 5.5 >100k | vào 0,50; write 0,625; read 0,05; ra 2,50 | `claude.ts:128` | như trên |
| Sonnet 5.5 (một bậc) | vào 2; write 2,5; read 0,1; ra 10 | `claude.ts:130` | "đọc 10/11/2026 qua fetch agent" (gián tiếp) |
| Opus 5.5 | không có | `agentModelHaiku55.test.ts:204` | `null` |
| Bảng chung | sonnet 3/15; opus 15/75; haiku 1/5; cache read 0,1×; write 1,25× | `turnCost.ts:6-10,27-33` | không ghi nguồn |
| Serper | 0,001/credit | `turnCost.ts:22-25` | mặc định, ghi đè bằng env |
| Parallel | 0,001/tìm kiếm, 0,001/URL | `parallelClient.ts:31` | đọc 30/10/2026 |
| Tìm web OpenAI hosted | 0,01/lần | `openai.ts:398` | "pricing page" |

### 5.2 Sai lệch và điểm đáng chú ý

1. Hai bảng giá Claude không khớp nhau (CODE): `claude.ts:127-131` (Haiku 5.5 0,10/0,50; Sonnet 5.5 2/10) và `turnCost.ts:6-10` (haiku 1/5; sonnet 3/15). `turnUsd` (dùng ở `route.ts:4650,4656,4658,4184`) khi không truyền `model` tự lấy dòng haiku 1/5 (`turnCost.ts:28`), tức gấp 10 lần giá Haiku 5.5 thật. Trong đường Luna của UAT, `route.ts:4177-4187` ưu tiên `tappy.cost` của adapter nên bảng chung chỉ chạy như dự phòng; tác động đo được ở UAT: 2 dòng `model:"haiku-4.5"` với `usd=0`, tức không đo được. Tác động nếu một đường Claude rơi vào nhánh dự phòng CHƯA XÁC MINH.
2. Luna: tính thừa có chủ đích. Uncached input tính 0,125 thay vì 0,10 (`openai.ts:88-103`, `:308-309`). Từ 2.632 cuộc gọi: uncached 20,17M token × 0,025 = 0,50 USD, tức 12,9% chi phí Luna ghi nhận (3,92 USD) hoặc 0,6 USD ≈ 4,3% chi phí chat (14,06 USD) theo số từ `tappyai_turn_cost` (24,47M token "cache write"). Tính lại bằng tay từ token cho đúng 3,9193 USD đã ghi (cache 35,94M × 0,01 + uncached 20,17M × 0,125 + ra 2,077M × 0,5), nên công thức khớp. Việc Luna thật sự tính uncached ở mức 0,125 là kết luận của probe cũ (`scripts/consult/luna/probe.mjs`, BENCHMARK, không chạy lại) và CHƯA XÁC MINH bằng hóa đơn.
3. Sonnet và Haiku: số trong log khớp công thức (kiểm: 1.288.687×2 + 310.824×10 = 5,685 USD so với 5,6856 ghi). Giá do code ghi, không do hóa đơn xác nhận.
4. Cổng chi tiêu chỉ biết OpenAI (CODE): `pricing.ts:12-16` `worstCaseLlmCallUsd` trả `null` cho mọi nhà cung cấp không bắt đầu bằng `openai`. Cuộc gọi Claude không có chặn trên trong cổng này.
5. Trần USD theo tiến trình chỉ tính OpenAI Responses (CODE): `procSpendUsd` được cộng chỉ trong `openai.ts` (`:371,387,462,468,527`); không có nơi nào khác đọc. `LLM_RESPONSES_PROCESS_BUDGET_USD` do đó không giới hạn chi tiêu Anthropic (33,5% chi phí UAT) hay Serper (50,4%).
6. Ngân sách một yêu cầu `C2_REQUEST_BUDGET` (`requestBudget.ts:26-39`): 20.000 token vào chưa cache + ra, tối đa 4.000 ra mỗi cuộc gọi, 45 giây. Mặc định tắt; không có trong tệp cờ UAT; số đo cho thấy trung vị 57.770 token vào mỗi lượt, tức không áp dụng ở UAT (SUY LUẬN từ số đo).
7. Trần Serper (CODE): `serperToolBudget.ts:5` ghi 8 credit mỗi lượt (10 với kế hoạch du lịch); `CONSULT_REQUEST_CAP` không có trong cờ UAT và log có 0 dòng `tappyai_serper_request_cap_turn`. Trong log (LOG): 317/841 lượt chat > 8 credit, 171 lượt > 20 credit, tối đa 171 credit/lượt. Credit tính từ `serperUsd` (10.036 credit) lớn hơn số cuộc gọi `serperCalls` (7.627): một số cuộc gọi tốn hơn 1 credit; nguyên nhân CHƯA XÁC MINH.
8. Cache Serper không trúng (LOG): `cacheHits` = 0 trên 841 lượt chat. `AUDIT-REPORT-20261118.md` mục 7 cũng ghi cache V2 và Upstash chưa bật ở UAT.
9. Sổ ai_usage_events (CODE + BENCHMARK): ghi sau lượt, chỉ khi `AI_USAGE_LEDGER=1` (`usageLedger.ts:59,96-97`), không có trong cờ UAT; migration `supabase/migrations/20261101_ai_usage_events.sql:8` ghi "NOT APPLIED"; `AUDIT-REPORT-20261118.md` mục 7 xác nhận "chưa áp migration sổ cái". Hệ quả: sổ chi phí không có số liệu nào để đối chiếu (CHƯA KIỂM TRA bảng thật). Phần khác biệt giữa usage API, sổ và hóa đơn không đo được.
10. Lượt nghiên cứu không được ghi chi phí (LOG): 3 lượt `deep_research` có `usd=0`, `modelCalls=0`, `serperCalls=0` ở thời Claude; có thể là lượt hỏng nhưng chi phí cuộc gọi đã phát sinh ở `tappyai_agent_model_cost`. Tổng `answerUsd` của các lượt nghiên cứu thời Claude là 11,38 USD, trong khi tổng `tappyai_agent_model_cost` là 12,49 USD: chênh 1,11 USD (9%), SUY LUẬN là chi phí của lượt hỏng/hủy không vào dòng tổng hợp, chưa truy vết từng lượt.
11. Chưa gán được dòng `tappyai_agent_model_cost` cho từng lượt (dòng không có traceId): tách Claude theo lượt chat hay nghiên cứu dựa vào đường gọi trong code (`claudeModel` chỉ được truyền từ `deepResearchDeps.ts`), SUY LUẬN.

---

## 6. Nguyên nhân lãng phí lớn nhất, có định lượng (không kèm khuyến nghị)

Xếp theo số tiền trong log (toàn log 37,26 USD; cấu hình lẫn nhau, xem mục 1):

1. **Báo cáo nghiên cứu Advanced (Sonnet 5.5 lead).** 18 lượt, trung bình 0,581 USD (39 cuộc gọi model, ~90 tìm kiếm), tổng ≈ 10,5 USD = 28% toàn log từ 1,8% số lượt. Sonnet 8,91 USD, trong đó token ra 5,55 USD; plan 115 cuộc gọi (5,69 USD) nhiều hơn writer 19 cuộc gọi (3,23 USD). Gói Promax 15 báo cáo Advanced + 10 Standard ước 10,07 USD "dùng hết" so với doanh thu ròng 8,82 USD/tháng (BENCHMARK, `docs/uat/uat-final-20261118/plans/economics-output.txt`, dòng `promax 1m web0`, biên -14%). Giá từng đơn vị trong tệp đó không được kiểm lại độc lập.
2. **Serper/Parallel không có trần hiệu lực trong UAT, cache không trúng.** 18,78 USD (50,4%). Trong chat: 10,04 USD là 71% chi phí chat; 171 lượt (20,3% số lượt) > 20 credit chiếm 6,99 USD (69,6% Serper chat, 18,8% toàn log); `cacheHits`=0. Trần 8 credit/lượt ghi trong code, không thấy hiệu lực trong số đo (317 lượt vượt).
3. **Ngữ cảnh chở lại qua các bước agent.** Trung vị 57.770 token vào mỗi lượt, 4 bước; prompt mỗi cuộc gọi tăng từ 8,7k (1 bước) lên 27k (8 bước, trung bình mỗi cuộc gọi). 35,2% lượt gọi ≥ 5 lần. Chi phí này nhỏ về USD với Luna (chat 4,02 USD model so với 10,04 USD Serper) nhưng là lý do độ trễ trung vị 30,8 giây (p90 64,9 giây, LOG `tappyai_usage.elapsedMs`) và là phần nhân lên nếu model đắt hơn Luna (SUY LUẬN).
4. **Claude gọi hoàn toàn không cache.** 1.681 cuộc gọi, cache đọc/ghi = 0; 16,77M token vào tính giá không cache = 4,87 USD (13,1% toàn log). Phần lặp lại chưa đo.
5. **`think_deeper` ở gần mọi lượt có công cụ (730/769) và retry timeout intent.** Thinking chỉ 0,23 USD, bước `think_deeper` thêm ước 1,09 USD (SUY LUẬN); 1.504 lần `first_part_timeout_8000ms` ở role `intent` thời Luna (mất 12,5 triệu ms chờ cộng dồn, LOG `ms` của dòng fallback; chi phí cuộc gọi bị bỏ CHƯA XÁC MINH).

---

## 7. Phụ lục — công thức thống kê (LOG)

Mọi số dưới đây từ script Node đọc từng dòng, tìm `{"type":"tappyai_…` trong `uat-3000.log`:
- `tappyai_turn_cost`: 996 dòng (841 chat + 155 deep_research); tổng `usd`, `serperUsd`, `answerUsd`, `tokensIn/Out`, `reasoningTokens`, `lunaCachedIn`, `lunaCacheWrite`, `serperCalls`, `cacheHits`, `fellBack`. p50/p90/p95 `usd` toàn log: 0,0122 / 0,0903 / 0,1125; tối đa 0,6946 (một lượt deep_research).
- `tappyai_usage`: 841 dòng (839 có `promptTokens`): `llmCalls`, `elapsedMs`, `ttftMs` (trung vị 24,6 giây; p90 53,5 giây), `retryCount`.
- `tappyai_llm_call`: 2.641 dòng; `tappyai_agent_model_cost`: 1.681 dòng; `tappyai_one_brain_turn`: 845 dòng; `tappyai_trace`: 25.471 dòng (ev: tool, page_read, evidence, budget, loop...).
- Không có dòng nào chứa nội dung câu hỏi/trả lời được chép vào tài liệu này.
- Báo cáo đo đã đọc: `docs/uat/UAT-FINAL-REPORT-20261118.md` (2,37 USD cho 66 lượt, Serper 0,74 USD, bản `9d69e5d`, gói Promax), `docs/uat/AUDIT-REPORT-20261118.md` mục 7 (chat ~0,014 USD, Standard 0,09–0,11, Advanced 0,57–0,64; "mô hình trả lời chiếm khoảng 69% chi phí lượt", `think_deeper` 57/64 lượt), `docs/uat/uat-final-20261118/plans/economics-output.txt`.
- Chưa khớp: AUDIT-REPORT nói mô hình chiếm ~69% chi phí lượt; log tổng hợp cho chat Luna thì Serper chiếm 71%. Hai số này khác phạm vi (bản đo cuối gồm báo cáo Claude, log tổng không phân tách theo bản đo), đã không hợp nhất.

---

## 8. CHƯA KIỂM TRA

1. Hóa đơn thật của Anthropic, OpenAI, Serper, Parallel (không có quyền); mọi USD ở đây là số do code tự tính.
2. Giá Opus 5.5 và bảng giá công khai hiện hành của mọi model (chỉ dùng số ghi trong repo).
3. Cấu hình và giá trị cờ production; model production đang chạy (chỉ có tài liệu cũ: deploy 04/11, không có mã mới).
4. Giá trị thật của cờ trong `.env.local` không được đọc (`LLM_PROVIDER`, `AGENT_MODEL`, `HAIKU_FALLBACK`, `C2_REQUEST_BUDGET`, `CONSULT_REQUEST_CAP`, `AI_USAGE_LEDGER`, `ANTHROPIC_API_KEY`).
5. Bảng `ai_usage_events` thật (migration chưa áp, không truy cập database).
6. Số token theo từng bước của một lượt (log không ghi), phần kết quả công cụ thực sự đưa vào prompt (log chỉ có byte HTML thô).
7. Cuộc gọi Luna bị bỏ do timeout 8 giây có bị tính tiền; chi phí các cuộc gọi Luna có cấu trúc (intent/plan) không ghi từng dòng.
8. Việc Luna tính uncached input ở 0,125 thay vì 0,10 (chỉ có probe cũ).
9. Nguyên nhân Serper credit lớn hơn số cuộc gọi và vì sao vượt trần 8 credit/lượt.
10. Chi phí của lượt nghiên cứu hỏng/hủy (3 lượt `usd=0`; chênh 1,11 USD).
11. Ánh xạ chính xác từng phiên của log tới từng bản đo (log không có dấu thời gian); số 2,37 USD của UAT-FINAL không tái hiện được riêng từ log.
12. Hiệu quả thật của việc gắn `cacheControl` cho Claude trong nghiên cứu sâu (chưa thử; không gọi API).
