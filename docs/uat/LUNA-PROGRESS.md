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
