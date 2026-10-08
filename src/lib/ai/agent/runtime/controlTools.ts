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
export const CONTROL_TOOLS: ReadonlySet<string> = new Set([ASK_USER])

export function askUserTool() {
  return tool({
    description: 'Hỏi lại người dùng MỘT câu ngắn khi thiếu thông tin làm ĐỔI HẲN kết quả và không thể giả định hợp lý (vd mua đồ đắt tiền chưa rõ nhu cầu/ngân sách, đặt chỗ chưa rõ nơi/giờ, kế hoạch du lịch chưa có điểm đến). Gọi MỘT MÌNH, trước khi tìm kiếm. KHÔNG dùng khi có thể giả định và trả lời, khi người dùng đã nêu các lựa chọn cụ thể để so sánh (so sánh rồi nói ai hợp cái nào), hay khi đã có điểm đến cho kế hoạch.',
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
