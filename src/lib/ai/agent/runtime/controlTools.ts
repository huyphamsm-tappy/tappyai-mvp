// ── Phase 8 agent runtime — control actions ────────────────────────────────────────────────────────────────────────────────
//
// A control action is a SCHEMA-ONLY tool the runtime intercepts: it is never executed and never reaches a provider. M1 has one:
//
//   ask_user — Luna decides that a missing piece of information materially changes the decision and asks ONE question (optionally
//              2–4 quick choices). The turn ends with that question as the reply; the choices travel in the existing
//              [FOLLOWUPS]a|b[/FOLLOWUPS] contract (quick-reply chips on web), so no new output contract is introduced.
//
// No toolChoice is used (the architecture lock forbids forcing a tool): Luna chooses between answering, asking and searching.

import { tool } from 'ai'
import { z } from 'zod'
import { cutSecrets } from '../guards'

export const ASK_USER = 'ask_user'
/**
 * M2: Luna's task delta as an in-loop control action. NOT offered to the model by default: measured, it always cost an extra round, so
 * the task tracker (taskTracker.ts) does this job in parallel. Kept as a generic control-action path (loop interception + tests) for the
 * M6 registry, which may offer it where a round is free.
 */
export const UPDATE_TASK = 'update_task'
export const CONTROL_TOOLS: ReadonlySet<string> = new Set([ASK_USER, UPDATE_TASK])

const KV = z.object({ key: z.string().describe('khoá ngắn, vd ngan_sach, khu_vuc, so_nguoi, ngay_di, muc_dich'), value: z.string().describe('giá trị theo lời người dùng; rỗng = bỏ') })

export function updateTaskTool() {
  return tool({
    description: 'Cập nhật NHIỆM VỤ đang làm (trạng thái qua nhiều lượt). Gọi khi: lượt đầu của một việc cần nhiều bước (đặt goal, task_type, ràng buộc); người dùng thêm / đổi / bỏ ràng buộc hay ưu tiên; người dùng chọn một lựa chọn; xong việc (status completed); chuyển sang việc khác hẳn (new_task true). Tối đa một lần mỗi lượt, ở BƯỚC ĐẦU, CÙNG BƯỚC với công cụ tra cứu hoặc ask_user, hoặc kèm câu trả lời. Không gọi khi không có gì đổi.',
    parameters: z.object({
      new_task: z.boolean().optional().describe('true = việc mới khác hẳn việc đang làm'),
      task_type: z.enum(['local_discovery', 'shopping', 'travel_planning', 'comparison', 'troubleshooting', 'how_to', 'question', 'planning', 'other']).optional(),
      goal: z.string().optional().describe('mục tiêu ngắn của người dùng, một câu'),
      set_constraints: z.array(KV.extend({ hard: z.boolean().optional().describe('true = bắt buộc') })).optional(),
      remove_constraints: z.array(z.string()).optional().describe('khoá ràng buộc bỏ đi'),
      set_preferences: z.array(KV).optional(),
      add_entities: z.array(z.object({ name: z.string(), kind: z.string().optional() })).optional().describe('sản phẩm / địa điểm / điểm đến đang bàn'),
      selected_items: z.array(z.object({ name: z.string(), note: z.string().optional() })).optional().describe('lựa chọn người dùng đã chốt (thay danh sách cũ)'),
      add_findings: z.array(z.string()).optional().describe('điều quan trọng đã tìm ra, mỗi ý ≤ 1 câu'),
      status: z.enum(['active', 'completed', 'abandoned']).optional(),
    }),
  })
}

export function askUserTool() {
  return tool({
    description: 'Hỏi lại người dùng MỘT câu ngắn khi thiếu thông tin làm ĐỔI HẲN kết quả và không thể giả định hợp lý (vd mua đồ đắt tiền chưa rõ dùng để làm gì — đã nêu nhu cầu mà chỉ thiếu ngân sách thì không hỏi trước, đặt chỗ chưa rõ nơi/giờ, kế hoạch du lịch chưa có điểm đến). Gọi MỘT MÌNH, trước khi tìm kiếm. KHÔNG dùng khi có thể giả định và trả lời, khi người dùng đã nêu các lựa chọn cụ thể để so sánh (so sánh rồi nói ai hợp cái nào), khi người dùng nhờ so sánh / chọn N lựa chọn mà chưa nêu tên (đừng hỏi tên; chỉ hỏi khi thiếu thứ làm đổi hẳn cách chọn, còn lại tư vấn tiêu chí và chỉ tra cứu khi cần xác minh một dữ kiện cụ thể), khi đã có điểm đến cho kế hoạch, hay khi người dùng nhờ GIẢI THÍCH / LIỆT KÊ / NÊU (tiêu chí chọn, các khoản chi phí, thông tin cần biết, các bước) — điều đó trả lời được ngay với giả định nêu rõ, câu hỏi tinh chỉnh để cuối câu trả lời. Không hỏi nếu lượt trước đã hỏi (mục "Bạn vừa hỏi người dùng").',
    parameters: z.object({
      question: z.string().describe('Câu hỏi, đúng giọng Tappy (xưng mình, gọi bạn), một câu'),
      choices: z.array(z.string()).optional().describe('2–4 lựa chọn bấm nhanh, mỗi lựa chọn ≤ 6 từ (tuỳ chọn)'),
    }),
  })
}

export interface AskUser { question: string; choices: string[] }

const clean = (s: string, max: number) => cutSecrets(s.replace(/https?:\/\/\S+|www\.\S+/gi, ' ').replace(/\[\/?[A-Z_]+\]/g, ' ')).text.replace(/\s+/g, ' ').trim().slice(0, max)

/** Validates and normalises the model's ask_user arguments (deterministic). null = not a usable question. */
export function parseAskUser(args: Record<string, unknown> | undefined): AskUser | null {
  const q = typeof args?.question === 'string' ? clean(args.question, 300) : ''
  if (q.length < 3) return null
  const raw = Array.isArray(args?.choices) ? args!.choices : []
  const choices = [...new Set(raw.filter((c): c is string => typeof c === 'string').map(c => clean(c.replace(/[|]/g, ' '), 60)).filter(c => c.length > 0))].slice(0, 4)
  return { question: /[?？]$/.test(q) ? q : `${q}?`, choices: choices.length >= 2 ? choices : [] }
}

/** The reply text of an ask turn: the question, then the choices as quick-reply chips (existing FOLLOWUPS contract). */
export function renderAsk(a: AskUser): string {
  return a.choices.length ? `${a.question}\n\n[FOLLOWUPS]${a.choices.join('|')}[/FOLLOWUPS]` : a.question
}
