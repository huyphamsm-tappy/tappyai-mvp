// ── Phase 8 — ANSWER BEFORE LOOKUP (UAT-10) ───────────────────────────────────────────────────────────────────────────────
//
// Measured (model-only probe, 15 calls, model-probe/REPORT.md): with every prompt wording tried, Luna either asks first (c497dd8: 5/5) or
// goes straight to a lookup with NO text in the same response (de8710d: 5/5, attempt 2: 5/5). The instruction "write the part you can
// already answer, then look up" is not followed on the tool-calling step, and the runtime used to throw away any text that did come with
// a tool call (the final answer was the LAST step's text only). Two bounded, code-owned pieces fix the contract without a second agent:
//
//   1. PRESERVE — text a step writes next to a tool call (or next to ask_user) is kept and shown BEFORE the rest of the answer.
//   2. CHECK    — one extra Luna call, only when the first step of a turn is a lookup-only step with no text, and only for the research
//                 tools (web_search / search_products / read_page — advice-type lookups; place, travel, news, price-of-the-day tools are
//                 pure data and never asked): "you chose to look up X before writing anything; write the part of the request that
//                 stable knowledge and the user's stated priorities already answer, or say NOTHING_YET". Luna decides; code only
//                 carries the text. No keyword rule, no classifier, no second agent.
// Both go through the same settle path (guards, No-Fabrication Gate) as any answer text.

import type { AgentToolCall } from '../loop'

/** Lookups whose result feeds advice. Data tools (places, hotels, flights, weather, gold, news, showtimes…) never trigger the check. */
export const ANSWER_FIRST_TOOLS: ReadonlySet<string> = new Set(['web_search', 'search_products', 'read_page'])

export const NOTHING_YET = 'NOTHING_YET'

/** True when EVERY (resolved) lookup of the step is an advice-type research tool. */
export function checkApplies(names: readonly string[]): boolean {
  return names.length > 0 && names.every(n => ANSWER_FIRST_TOOLS.has(n))
}

/** Luna's reply to the check → the text to keep, or null when it said it has nothing to write yet (or wrote nothing). */
export function parseCheck(text: string): string | null {
  const t = (text ?? '').trim()
  if (!t) return null
  if (/^\W*NOTHING[_ ]YET\W*$/i.test(t) || /^\W*NOTHING[_ ]YET\b/i.test(t)) return null
  return t.replace(/\bNOTHING[_ ]YET\b/gi, '').trim() || null
}

const brief = (calls: ReadonlyArray<Pick<AgentToolCall, 'toolName' | 'args'>>): string => calls.map(c => {
  const a = c.args ?? {}
  const q = Array.isArray(a.queries) ? (a.queries as unknown[]).filter(x => typeof x === 'string').join(' | ') : typeof a.query === 'string' ? a.query : ''
  return `${c.toolName}${q ? `("${q.slice(0, 160)}")` : ''}`
}).join('; ')

/** Appended to the system text of the check call (the call carries no tools). */
export function checkNote(calls: ReadonlyArray<Pick<AgentToolCall, 'toolName' | 'args'>>, lang: string): string {
  const what = brief(calls)
  return lang === 'en'
    ? `\n\nPRE-LOOKUP CHECK. You just chose to look something up (${what}) without writing anything to the user. If the request has a part that stable knowledge and the priorities the user already stated answer RIGHT NOW (e.g. explaining the selection criteria and the trade-offs between them, how to weigh options, what to check), write exactly that part now, in Tappy's voice. Do NOT name specific products or places, prices, specs or dates: those wait for the lookup. Do not say you will look things up. Do not repeat what you said in earlier turns. If nothing can be answered yet (a purely current-data question), reply with exactly one word: ${NOTHING_YET}.`
    : `\n\nBƯỚC KIỂM TRA TRƯỚC KHI TRA CỨU. Bạn vừa chọn tra cứu (${what}) mà chưa viết gì cho người dùng. Nếu yêu cầu có một phần trả lời được NGAY bằng kiến thức ổn định và những ưu tiên người dùng đã nêu — ví dụ giải thích tiêu chí chọn và đánh đổi giữa chúng, cách cân nhắc, những điều cần kiểm tra — thì viết đúng phần đó bây giờ, đúng giọng Tappy. TUYỆT ĐỐI không nêu tên sản phẩm / địa điểm cụ thể, giá, thông số hay ngày tháng: những thứ đó chờ kết quả tra cứu. Không viết "mình sẽ tra cứu". Không lặp lại điều bạn đã nói ở các lượt trước. Nếu chưa có phần nào trả lời được (câu hỏi thuần dữ liệu hiện hành), trả lời đúng một từ: ${NOTHING_YET}.`
}

/** Appended on every later step once a preface exists: it is kept and shown first, so the answer after the lookup must not restate it. */
export function prefaceNote(lang: string): string {
  return lang === 'en'
    ? '\n\nThe advice you already wrote before the lookup is kept and shown to the user first. Do not repeat it: add only what the lookup verified (names, prices, specs, sources, limits) and the conclusion.'
    : '\n\nPhần tư vấn bạn đã viết trước khi tra cứu được giữ nguyên và hiển thị trước. Đừng lặp lại nó: chỉ bổ sung điều tra cứu đã xác minh (tên, giá, thông số, nguồn, giới hạn) và kết luận.'
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * The text of the turn: the prefaces (text written before/next to a lookup or an ask), then the final text. A preface the final text
 * already contains (the model repeated itself) is not shown twice. Nothing is dropped otherwise.
 */
export function composeFinal(prefaces: readonly string[], final: string): string {
  const body = (final ?? '').trim()
  const nBody = norm(body)
  const keep = prefaces.map(p => p.trim()).filter(p => {
    if (!p) return false
    const key = norm(p).slice(0, 80)
    return !(key.length >= 24 && nBody.includes(key))
  })
  return [...keep, body].filter(Boolean).join('\n\n')
}
