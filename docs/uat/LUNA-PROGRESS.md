# PHIÊN LUNA — tiến độ (bắt đầu 2026-09-30)

## Vị trí
- Worktree: **`D:\TappyAI-wt\wtluna`** (đã dời khỏi `C:\wtluna` vì C: đầy; không có junction trên C:). Nhánh `luna/consult-2026-09-30` từ `origin/rc/web-uat` @ fbb1c3c.
- node_modules + cache npm/tmp/playwright: `D:\TappyAI-wt\.cache\`.
- Không đụng: rc/web-uat, main, production, UAT, C:\wtrel, C:\wtandroid, worktree Phase 8.

## Quyết định đã chốt (owner)
- Model `gpt-6-luna`, reasoning effort luôn đặt rõ. Lượt tư vấn: none/low (theo đo). Kế hoạch chi tiết: giữ Haiku.
- Giá (developers.openai.com, đọc 30/09): vào $0,10/M · cache đọc $0,01/M · cache ghi $0,125/M · ra $0,50/M (token suy luận tính giá ra).

## Đã làm
- [x] Adapter OpenAI `src/lib/ai/llm/providers/openai.ts` (sửa body cho model suy luận, effort bắt buộc, đọc usage thô → chi phí kể cả cache ghi + suy luận).
- [x] Vai trò mới `consult` / `intent` (mặc định = Haiku như cũ); định tuyến `LLM_<ROLE>_PROVIDER=openai`, `LLM_<ROLE>_REASONING`; tự chuyển Haiku khi lỗi/timeout (`fallback.ts`).
- [x] `AI.extract` (structured output).
- [x] `consultative/luna.ts`: cờ `CONSULT_LUNA` (mặc định TẮT), prompt tính cách Luna, lược đồ ý định + code kiểm tra (khu vực, số người, ngân sách, thời gian).
- [ ] Nối route (đang làm): role consult, prompt Luna, chi phí theo hãng.
- [ ] Harness replay: key OpenAI, TTFT, cột chi phí.
- [ ] Đo: Luna none / low, 2 lượt đủ bộ; intent none vs low.

## 🛑 Chặn
- **Không có file key** `D:\TappyAI-backups\openai-key.txt` (thư mục chỉ có APK/env/evidence). Cần anh đặt file đó để chạy replay.
