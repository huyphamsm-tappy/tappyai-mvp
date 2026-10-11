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

/**
 * CONSULTATIVE_IN_AGENT (default OFF): the same action, described for a consultant who asks when the missing piece would change the whole
 * answer or plan — not only when no answer is possible. The default description above is unchanged byte for byte when the flag is off.
 */
export const ASK_USER_DESCRIPTION_CONSULT = 'Hỏi lại người dùng bằng MỘT câu ngắn (có thể gộp tối đa 2 điều quan trọng nhất) khi thiếu một thông tin mà thiếu nó thì câu trả lời hoặc kế hoạch sẽ đổi hẳn (vd đặt chỗ chưa rõ nơi/giờ, cần mua nhưng chưa nói gì về loại hay nhu cầu, kế hoạch còn thiếu điểm đến hoặc khoảng thời gian, hay yêu cầu có hai cách hiểu cho ra hai kết quả hoàn toàn khác nhau mà không suy ra được từ ngữ cảnh). Khoảng thời gian chỉ cần số ngày hoặc một tháng/mùa: KHÔNG hỏi ngày cụ thể; tháng chưa nói năm thì hiểu là lần gần nhất sắp tới, KHÔNG hỏi năm; ngân sách đi kèm số người hiểu là tổng cho cả nhóm (nêu giả định). Nơi xuất phát, chi phí đi lại, phương tiện, chỗ ở cụ thể và sở thích nhỏ KHÔNG đủ để hỏi trước: dùng giả định hợp lý, nêu ngắn rồi làm. Người dùng nhờ chỉ đường tới một nơi mà không nói xuất phát: KHÔNG hỏi xuất phát hay phương tiện, tra nơi đó rồi chỉ đường từ vị trí hiện tại của họ (hệ thống tự kèm link Google Maps). Nói tự nhiên như người với người, không hỏi điều đã biết từ hội thoại hoặc trí nhớ. Gọi MỘT MÌNH, trước khi tìm kiếm hay lập kế hoạch. KHÔNG dùng khi người dùng nhờ GIẢI THÍCH / LIỆT KÊ / NÊU / SO SÁNH / CHỌN và đã nêu ưu tiên hay nhu cầu: trả lời phần đó trước (kèm giả định nêu rõ); thông tin chỉ để tinh chỉnh thì đặt MỘT câu hỏi ở cuối câu trả lời, không dùng công cụ này. Cũng không dùng khi người dùng đã nói cứ làm đi / tùy bạn, hay trả lời thiếu cho câu bạn vừa hỏi: lúc đó giả định, nêu giả định và làm. Không hỏi nếu lượt trước đã hỏi: mục "Bạn vừa hỏi người dùng" có thể không có, nên nhìn cả lịch sử cuộc trò chuyện — nếu tin nhắn ngay trước của bạn là câu hỏi làm rõ thì lượt này không hỏi nữa.'

export function askUserTool(opts: { consultative?: boolean } = {}) {
  return tool({
    description: opts.consultative ? ASK_USER_DESCRIPTION_CONSULT : 'Hỏi lại người dùng MỘT câu ngắn CHỈ khi thiếu một thông tin mà không có nó thì không thể đưa ra phần trả lời nào có ích (vd đặt chỗ chưa rõ nơi/giờ, kế hoạch du lịch chưa có điểm đến, cần mua nhưng chưa nói gì về loại hay nhu cầu). Gọi MỘT MÌNH, trước khi tìm kiếm. KHÔNG dùng khi người dùng nhờ GIẢI THÍCH / LIỆT KÊ / NÊU / SO SÁNH / CHỌN và đã nêu ưu tiên hay nhu cầu: trả lời phần đó trước (kèm giả định nêu rõ); thông tin chỉ để tinh chỉnh (hệ điều hành, hãng, ngân sách, mẫu đang cân nhắc, tên các lựa chọn) thì đặt MỘT câu hỏi ở cuối câu trả lời, không dùng công cụ này. Cũng không dùng khi có thể giả định và trả lời, khi đã nêu các lựa chọn cụ thể để so sánh, hay khi đã có điểm đến cho kế hoạch. Không hỏi nếu lượt trước đã hỏi (mục "Bạn vừa hỏi người dùng").',
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
