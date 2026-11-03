// ── CONSULTATIVE_IN_AGENT — one extra model call when a multi-day plan came back as plain text instead of the [TAPPY_PLAN] card (Round 23) ──────
//
// Measured live (Round 22, 2026-10-11): after `get_trip_data` the model sometimes wrote "Ngày 1 … Ngày 2 …" as prose and no [TAPPY_PLAN] block: no card, no day
// tabs, no budget table. The prompt asks for the card; a prompt alone does not hold every time. This is the code backstop, in the agent loop (loop.ts):
//   · when ALL hold — the turn ran `get_trip_data` successfully, the final answer has no [TAPPY_PLAN] block, and it is a multi-day plan (the user named ≥ 2
//     days, or the text itself lays out Ngày 1 / Ngày 2) — the loop makes exactly ONE more model call, WITHOUT tools, asking for the card;
//   · tool calls in that reply are ignored, `get_trip_data` is never called again, the step never repeats;
//   · a reply with no valid card (no block, JSON that cannot be repaired, fewer than 2 days) or a failed / timed-out call → the text answer stays as it was
//     (safe fallback) and the outcome is logged (`tappyai_card_retry`).

import type { CoreMessage } from 'ai'
import { repairJson } from '../../planJsonRepair'

const OPEN = '[TAPPY_PLAN]'
const CLOSE = '[/TAPPY_PLAN]'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

export function lastUserText(messages: readonly CoreMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    return typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? (m.content as Array<{ text?: string }>).map(p => p.text ?? '').join(' ') : ''
  }
  return ''
}

/** The user named at least two days ("3 ngày 2 đêm", "4 days"), or the text itself lays out Ngày 1 … Ngày 2. */
export function wantsMultiDay(userText: string, answer: string): boolean {
  const n = Number(/(?:^|[^0-9])(\d{1,2}) ?(?:ngay|dem|days?|nights?)(?![a-z])/.exec(fold(userText))?.[1] ?? 0)
  if (n >= 2) return true
  return /Ngày\s*1[\s\S]{0,6000}Ngày\s*2/i.test(answer)
}

export interface CardRetryFacts { userText: string; toolEvents: ReadonlyArray<{ name: string; outcome?: string }>; text: string }

export function needsCard(f: CardRetryFacts): boolean {
  return !f.text.includes(OPEN)
    && f.toolEvents.some(e => e.name === 'get_trip_data' && e.outcome === 'ok')
    && wantsMultiDay(f.userText, f.text)
}

/** A usable card: a [TAPPY_PLAN] block whose JSON parses (after the bracket repair) and carries ≥ 2 days with an items array. */
export function validCard(text: string): boolean {
  const a = text.indexOf(OPEN), b = text.indexOf(CLOSE)
  if (a < 0 || b < a) return false
  const plan = repairJson(text.slice(a + OPEN.length, b).trim(), { balance: true }) as { days?: Array<{ items?: unknown }> } | undefined
  return !!plan && Array.isArray(plan.days) && plan.days.length >= 2 && plan.days.every(d => Array.isArray(d?.items))
}

export function cardRetryNote(lang: string): string {
  return lang === 'en'
    ? '\n\nThe plan above was written as plain text. Now write it again as the itinerary CARD: ONE [TAPPY_PLAN]…[/TAPPY_PLAN] block in the exact format described in the instructions (day tabs, items with time / category / name, budget_lines, local_tips), preceded by one or two short lead sentences. Use ONLY the places and facts already in the tool results above. Do NOT call any tool.'
    : '\n\nLịch trình ở trên bạn vừa viết bằng chữ. Bây giờ viết lại thành THẺ lịch trình: MỘT khối [TAPPY_PLAN]…[/TAPPY_PLAN] đúng định dạng đã nêu trong hướng dẫn (tab theo ngày, mục có time / category / name, budget_lines, local_tips), kèm một hoặc hai câu dẫn ngắn đứng trước. CHỈ dùng địa điểm và dữ kiện đã có trong kết quả công cụ ở trên. KHÔNG gọi công cụ nào.'
}
