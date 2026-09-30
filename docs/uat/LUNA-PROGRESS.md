# PHIÊN LUNA — tiến độ (bắt đầu 2026-09-30)

## Vị trí
- Worktree: **`D:\TappyAI-wt\wtluna`** (đã dời khỏi `C:\wtluna` vì C: đầy; không có junction trên C:). Nhánh `luna/consult-2026-09-30` từ `origin/rc/web-uat` @ fbb1c3c.
- node_modules + cache npm/tmp/playwright: `D:\TappyAI-wt\.cache\`.
- Không đụng: rc/web-uat, main, production, UAT, C:\wtrel, C:\wtandroid, worktree Phase 8.

## Quyết định đã chốt (owner)
- Model `gpt-6-luna`, reasoning effort luôn đặt rõ. Lượt tư vấn: none/low (theo đo). Kế hoạch chi tiết: giữ Haiku.
- Giá (developers.openai.com, đọc 30/09): vào $0,10/M · cache đọc $0,01/M · cache ghi $0,125/M · ra $0,50/M (token suy luận tính giá ra).

## Đã làm (commit b5aae63, nhánh local — push bị chặn quyền, chờ anh)
- [x] Adapter OpenAI `src/lib/ai/llm/providers/openai.ts`: effort luôn gửi rõ (mặc định none), max_completion_tokens, định giá từng lượt gọi (vào / cache đọc / ra gồm token suy luận). Không tự mở socket (luật kiến trúc đóng băng) → SDK không báo token cache GHI; `scripts/consult/luna/probe.mjs` đọc usage thô để đo chênh lệch.
- [x] Vai trò `consult` / `intent` (mặc định Haiku = y như cũ). `LLM_<ROLE>_PROVIDER=openai`, `LLM_<ROLE>_REASONING`, `LLM_<ROLE>_TIMEOUT_MS` (8 s). Lỗi / phần đầu là lỗi / quá hạn → Haiku trả lời (`fallback.ts`, log `tappyai_llm_fallback`).
- [x] `AI.extract` (structured output). `consultative/luna.ts`: cờ `CONSULT_LUNA` (mặc định TẮT), prompt Luna (nguyên tắc 26/9, có dấu), ý định có cấu trúc (mảng/mục tiêu/ràng buộc/độ khó) + CODE kiểm từng dữ kiện với chữ user gõ (khu vực, số người, ngân sách, thời gian) — không có trong chữ → bỏ; đọc sai → sửa theo chữ. Nút bấm / chào hỏi vẫn do code.
- [x] Route: lượt tư vấn (pick/followup/compare/more/reject/hỏi trong mảng) → role consult + prompt Luna (lõi + luật công cụ của mảng ĐỨNG ĐẦU = phần dùng lại). Kế hoạch chi tiết giữ Haiku. Chi phí/lượt tách: ý định · trả lời · Serper, theo hãng, token suy luận, số lần fallback.
- [x] Harness replay: `REPLAY_LUNA=none|low[,<effort ý định>]` (hoặc `prompt` = cờ bật, model Haiku), đi thẳng api.openai.com, TTFT mỗi lượt, bảng tách chi phí.
- [x] Test: 50 test mới xanh; 4.743 test chat/AI xanh khi cờ tắt. 3 lỗi kiến trúc là vi phạm `/go/at` có sẵn trên rc/web-uat (đã sửa ở nhánh release 020ff56) — không phải do phiên này.
- [x] Mốc Haiku (dùng lại, không chạy lại): replay `C:\wtrel\scripts\consult\replay\out\scenarios-2026-09-29T17-40-46-565Z` + `T17-48-25-357Z` — 94 và 91/105 đạt tiêu chí tự động, $0,00911 / $0,00921 mỗi lượt; đọc tay: ăn uống 18,5 · mua sắm 17,5 · du lịch 17,5 · giải trí 18,5 · spa 20,5. Log có `ttftMs` / `ttuaMs` của route → so thời gian cùng trường.

## Kế hoạch đo (khi có key)
1. `node scripts/consult/luna/probe.mjs` — key, model id, none/low, usage thô (cache ghi?).
2. Replay đủ bộ 2 lượt: `REPLAY_LUNA=none` ×2, `REPLAY_LUNA=low` ×2 (ý định cùng effort). Rồi ý định none vs low: `low,none` so với `low,low`.
3. Đọc tay A/B/C/D từng lượt trượt, bảng hai cột Haiku / Luna none / Luna low: chất lượng theo mảng, tỉ lệ bịa, $ thật/lượt, TTFT.
4. Khi anh điền `docs/uat/luna-real-typing.txt`: chạy thêm + trang so sánh cạnh nhau (cột trống để dán ChatGPT Go).

## 🛑 Chặn
- **Chưa có key** `D:\TappyAI-backups\openai-key.txt`.
- **Push nhánh bị chặn quyền**: anh chạy `git -C D:\TappyAI-wt\wtluna push origin luna/consult-2026-09-30` (upstream đã gỡ khỏi rc/web-uat).

## 30/09 sáng — key có, probe + sửa thiết kế trước khi đo
- Probe (`scripts/consult/luna/probe.mjs`): key + `gpt-6-luna` chạy được ở none/low. **Usage thô CÓ `cache_write_tokens`**: lượt lạnh 2.428/2.431 token vào là cache GHI ($0,125/M), lượt ấm 2.404 cache ĐỌC ($0,01/M). SDK bỏ trường này → adapter tính toàn bộ token vào chưa cache theo giá cache ghi (không bao giờ tính thấp hơn thực tế).
- Smoke 1–3 hội thoại cho thấy 4 lỗi THIẾT KẾ (đã sửa, có test):
  1. Luna tự quyết loại lượt → bỏ lượt hỏi (SHOP-1 t1 chốt luôn). → **hỏi/chọn do CODE** (đủ thông tin chưa = kiểm dữ kiện); các loại lượt khác (hỏi thêm/so sánh/xem thêm/bác/kế hoạch) theo **Luna** (SHOP-2 t3: luật đọc "…mua ở đâu uy tín" thành yêu cầu mới, Luna đọc đúng là hỏi thêm).
  2. Kiểm tra của code **làm rơi "Quận 1"/"q1"** (từ dừng "quận" + "1" ngắn) → sửa `placeSaid`.
  3. Luna nhét số liệu vào câu "Mình chọn" → guard xoá cả câu → mất lựa chọn (FOOD-1 t6). → code **tách câu chốt** trước guard (chỉ đổi dấu câu, không thêm/bớt chữ) + luật prompt.
  4. Luna in đậm dòng "còn N" → trùng dòng đếm của server → bỏ in đậm (chỉ khi cờ Luna bật).
- Các lượt chạy thử trước khi sửa: `scripts/consult/replay/out/_void/` (không tính).
- Độ trễ: bước hiểu ý định Luna ~2,4–2,8 s/lượt, chạy TRƯỚC mọi thứ (~180–250 token JSON ra). Trả lời Luna tới token đầu ~0,7–1,4 s.
- Đo chính thức bắt đầu 02:18Z (runner `D:\TappyAI-wt\.cache\run-all.sh`): bộ gốc none×2, low×2 → bộ gõ đời thường none, low, Haiku.

## 30/09 03:00 — vòng sửa trong lúc đo (mỗi lỗi A/B → sửa gốc rồi đo lại TỪ ĐẦU; lượt cũ ở `out/_void`, `out/_prev`)
| Lỗi (replay) | Mức | Gốc | Sửa |
|---|---|---|---|
| TRAVEL-1 t2: không có chữ, chỉ còn câu backstop "quán hải sản" | C | Luna gọi 2 tool song song / nối tiếp, hết bước | Luna không gọi tool song song; lượt Luna mà code đã tìm trước → không đưa định nghĩa tool (tool choice vẫn 'auto' — khoá kiến trúc) |
| Tất cả lượt không tool rơi về Haiku | — | API từ chối `parallel_tool_calls` khi không có tool | chỉ gửi khi lượt có tool (fallback đã chạy đúng: 0 crash) |
| FOOD-2 t7 "đặt món đó luôn" → hỏi thêm | B | Luna đè lượt "kế hoạch" của code | hành động rõ (kế hoạch/xem thêm/so sánh/bác) do CODE; hỏi↔chọn do CODE; loại lượt khác theo Luna |
| FOOD-2 t4–5 ràng buộc "sân vườn/ngoài trời" | B | chữ trong TÊN quán user chép lại | lượt tham chiếu (chép tên đã hiện) không đưa vào kiểm dữ kiện / ngân sách / ràng buộc |
| SHOP-3 "Dell" + ngân sách **1.334.000đ** | A/B | "Core i5-1334U - Thái Long Computer" — bộ lọc tên in đậm Phase 7 không bắt tên dài hơn | như trên (chỉ khi cờ Luna). ⚠ **Lỗi này CÓ ở Phase 7** (Haiku chọn "cửa hàng sửa bản lề laptop") → báo anh |
| SHOP-1 t6 "không thích màu đen" → server chèn "Mình chọn: Scout (đen)" | B | 2 backstop của server lấy đề xuất của thẻ | lượt bác: backstop không đưa lại tên đã hiện (Haiku mốc cũng có B này) |
| ENT-1 t6 / TRAVEL-2 t2 "Mình chọn: chưa thể…" | B/C | — | code đưa "SỰ THẬT CỦA LƯỢT" (vừa bị bác, đã hiện, ngân sách) vào lượt bác/xem thêm; bỏ dạng "Mình chọn: chưa…" |
| FOOD-1 t4 câu chốt lặp 2 lần | D | tách câu chốt đụng phần đã phát | chỉ tách phần CHƯA phát |
