// ── Phase 8 agent runtime — the instructions ───────────────────────────────────────────────────────────────────────────────
//
// AGENT_SYSTEM_V2 = the Phase 7 AGENT_SYSTEM (voice, facts, tips, presentation and plan contract unchanged — the output contracts
// depend on it) with the three passages that described the Phase 7 limits rewritten for the Phase 8 runtime:
//   · research is a loop the model controls ("đủ chưa?"), bounded by the runtime ceilings — not "at most 3 calls";
//   · a material clarification goes through the ask_user action (Luna's decision), not free prose;
//   · a trip with no destination is asked through ask_user too (the Phase 7 regex gate does not run under TAPPY_AGENT=2).
// Byte-stable across turns (cached prefix). Each rewrite is asserted at module load: if AGENT_SYSTEM changes so a passage no longer
// matches, this throws in tests instead of silently shipping the old rule.

import { AGENT_SYSTEM } from '../prompt'

const REWRITES: Array<[string, string]> = [
  [
    '- Tối đa 3 lần gọi công cụ mỗi lượt, mỗi lần một công cụ. Chọn công cụ trúng nhất; chỉ gọi thêm khi kết quả trước chưa đủ để trả lời. Không gọi lại cùng công cụ với cùng tham số.',
    '- Tra cứu theo vòng: gọi công cụ trúng nhất → đọc kết quả → tự hỏi "đủ để trả lời tốt chưa?". Chưa đủ thì tra tiếp đúng phần còn thiếu (truy vấn khác, nguồn khác, công cụ khác); đủ rồi thì DỪNG và trả lời. Câu đơn giản: 0–1 lần. Quyết định phức tạp (so sánh, mua bán, chuyến đi, thủ tục): có thể nhiều lần. Mỗi lượt tối đa 8 lần gọi công cụ và 6 bước — đó là trần an toàn, không phải mục tiêu. Các tra cứu độc lập có thể gọi cùng một bước. Không gọi lại cùng công cụ với cùng tham số.',
  ],
  [
    '- Chỉ hỏi lại khi thiếu thông tin làm ĐỔI HẲN kết quả và không suy ra được từ ngữ cảnh.',
    '- Hỏi lại bằng ask_user (MỘT câu, kèm 2–4 lựa chọn bấm nhanh nếu hợp) CHỈ khi thiếu thông tin làm ĐỔI HẲN kết quả và không suy ra hay giả định hợp lý được — vd mua đồ đắt tiền mà chưa biết nhu cầu/ngân sách, đặt chỗ chưa biết nơi/giờ/số người, kế hoạch du lịch chưa có điểm đến. Gọi ask_user MỘT MÌNH, trước khi tìm kiếm. KHÔNG hỏi khi đã đủ để trả lời có ích: so sánh hai sản phẩm/lựa chọn cụ thể → so sánh và nói ai hợp với cái nào; đã có điểm đến → lập lịch trình ngay (nơi đi mặc định = thành phố theo GPS, ngày chưa biết thì để Ngày 1/2/3); câu hỏi kiến thức, mẹo, cách làm → trả lời. Còn lại thì giả định hợp lý, nói ngắn giả định đó, rồi trả lời; có thể kết bằng MỘT câu tinh chỉnh.',
  ],
  [
    'Thiếu điểm đến thì hỏi MỘT câu ngắn, không gọi công cụ.',
    'Thiếu điểm đến thì gọi ask_user (một câu ngắn, có thể gợi ý vài điểm làm lựa chọn), không tìm kiếm.',
  ],
]

function rewrite(base: string): string {
  let out = base
  for (const [from, to] of REWRITES) {
    if (!out.includes(from)) throw new Error(`AGENT_SYSTEM_V2: passage not found — ${from.slice(0, 60)}`)
    out = out.replace(from, to)
  }
  return out
}

export const AGENT_SYSTEM_V2 = rewrite(AGENT_SYSTEM)
