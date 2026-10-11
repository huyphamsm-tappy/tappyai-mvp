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
    ? `\n\nPRE-LOOKUP CHECK. You just chose to look something up (${what}) without writing anything to the user. If the request has a part that stable knowledge and the priorities the user already stated answer RIGHT NOW (e.g. explaining the selection criteria and the trade-offs between them, how to weigh options, what to check), write exactly that part now, in Tappy's voice. Do NOT name specific products or places, prices, specs or dates: those wait for the lookup. Do not say you will look things up. Do not repeat what you said in earlier turns. Do NOT ask the user anything in this text: a refinement question, if any, goes at the very end of the answer after the lookup. If nothing can be answered yet (a purely current-data question), reply with exactly one word: ${NOTHING_YET}.`
    : `\n\nBƯỚC KIỂM TRA TRƯỚC KHI TRA CỨU. Bạn vừa chọn tra cứu (${what}) mà chưa viết gì cho người dùng. Nếu yêu cầu có một phần trả lời được NGAY bằng kiến thức ổn định và những ưu tiên người dùng đã nêu — ví dụ giải thích tiêu chí chọn và đánh đổi giữa chúng, cách cân nhắc, những điều cần kiểm tra — thì viết đúng phần đó bây giờ, đúng giọng Tappy. TUYỆT ĐỐI không nêu tên sản phẩm / địa điểm cụ thể, giá, thông số hay ngày tháng: những thứ đó chờ kết quả tra cứu. Không viết "mình sẽ tra cứu". Không lặp lại điều bạn đã nói ở các lượt trước. KHÔNG đặt câu hỏi nào trong phần này: câu hỏi tinh chỉnh (nếu cần) chỉ nằm ở cuối câu trả lời sau tra cứu. Nếu chưa có phần nào trả lời được (câu hỏi thuần dữ liệu hiện hành), trả lời đúng một từ: ${NOTHING_YET}.`
}

/** Appended on every later step once a preface exists: it is kept and shown first, so the answer after the lookup must not restate it. */
export function prefaceNote(lang: string, shown: readonly string[] = []): string {
  const quoted = shown.map(s => s.trim()).filter(Boolean).join('\n\n').slice(0, 1800)
  const tail = quoted
    ? (lang === 'en' ? `\n\nAlready shown to the user, verbatim:\n"""\n${quoted}\n"""` : `\n\nĐã hiển thị cho người dùng, nguyên văn:\n"""\n${quoted}\n"""`)
    : ''
  return prefaceCore(lang) + tail
}

function prefaceCore(lang: string): string {
  return lang === 'en'
    ? '\n\nThe user has ALREADY read the advice you wrote before the lookup (criteria, trade-offs). Do not explain or list those criteria again, not even in other words: start from what the lookup found — names, prices, specs and sources that are verified, compared by the names of the criteria — state what could not be verified, then conclude. Name only products that appear in the results. At most ONE question, only at the very end, only if it is needed.'
    : '\n\nNgười dùng ĐÃ đọc phần tư vấn bạn viết trước khi tra cứu (tiêu chí, đánh đổi). Đừng giải thích hay liệt kê lại các tiêu chí đó, kể cả bằng lời khác: bắt đầu từ điều tra cứu tìm được — tên, giá, thông số, nguồn đã xác minh, so sánh theo tên các tiêu chí — nói rõ phần chưa xác minh được, rồi kết luận. Chỉ nêu tên sản phẩm có trong kết quả. Tối đa MỘT câu hỏi, chỉ ở cuối cùng, chỉ khi thật cần.'
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const STRUCTURAL = /^\s*(?:\[|\||#|```)/
const splitSentences = (line: string): string[] => line.split(/(?<=[.!?…])\s+/).filter(s => s.length > 0)
const endsWithQuestion = (s: string) => /[?？]["')\]*_]*\s*$/.test(s.replace(/\*+/g, '').trim())

/**
 * A preface never carries a question: the single closing question belongs to the end of the answer. A question sentence is dropped; a
 * sentence of the form "statement; question?" keeps its statement. (Nothing else is touched.)
 */
export function withoutQuestions(text: string): string {
  return text.split('\n').map(line => {
    if (STRUCTURAL.test(line)) return line
    const kept: string[] = []
    for (const s of splitSentences(line)) {
      if (!endsWithQuestion(s)) { kept.push(s); continue }
      const semi = s.lastIndexOf(';')
      if (semi > 0) { const head = s.slice(0, semi).trim(); if (head.length >= 12) kept.push(`${head}.`) }
    }
    return kept.join(' ')
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const contentTokens = (s: string) => new Set(norm(s).split(' ').filter(t => t.length > 2))
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i || 1) }

/** Sentences of the final text that merely echo (near-verbatim: token overlap ≥ 0.75, ≥ 6 words) a sentence the preface already said. */
function withoutEchoes(final: string, prefaces: readonly string[]): string {
  const seen = prefaces.flatMap(p => p.split('\n').flatMap(l => (STRUCTURAL.test(l) ? [] : splitSentences(l)))).map(contentTokens).filter(t => t.size >= 6)
  if (!seen.length) return final
  return final.split('\n').map(line => {
    if (STRUCTURAL.test(line)) return line
    const lead = line.match(/^\s*(?:[-*•+]|\d{1,2}[.)])?\s*/)?.[0] ?? ''
    const kept = splitSentences(line.slice(lead.length)).filter(s => { const t = contentTokens(s); return t.size < 6 || !seen.some(p => jaccard(t, p) >= 0.75) })
    return kept.length ? lead + kept.join(' ') : ''
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * The text of the turn: the prefaces (text written before/next to a lookup or an ask) WITHOUT questions, then the final text with
 * near-verbatim echoes of the prefaces removed. A preface the final text already contains (the model repeated itself) is not shown
 * twice. A PARAPHRASE of the same advice is not detected here (no deterministic test exists); that is the instruction's job.
 */
/**
 * CONSULTATIVE_IN_AGENT (`dedupeParaphrase`): a preface PARAGRAPH whose content the research answer restates in other words is dropped, so the
 * reader gets the researched version once. Measured live (passport, 2026-10-11): the pre-lookup advice said "nộp tại cấp tỉnh … 8 ngày làm
 * việc" and the answer after the lookup said the same in new words (and then called the 8 days unverified). Deliberately narrow: a preface
 * paragraph of ≥ 12 content words, ≥ 60 % of whose words occur in ONE paragraph of the final text that is ≥ 12 words and either cites a source
 * ([S#]) or says it could not verify. Preface text is never dropped because of an unsourced, unrelated or short final paragraph.
 */
export function withoutParaphrasedPrefaceParagraphs(prefaces: readonly string[], final: string): string[] {
  const finals = final.split(/\n{2,}/).map(p => p.trim()).filter(p => p && (/\[S\d/.test(p) || /chưa (?:được )?(?:xác minh|kiểm)/i.test(p))).map(p => contentTokens(p)).filter(t => t.size >= 12)
  if (!finals.length) return [...prefaces]
  return prefaces.map(pref => pref.split(/\n{2,}/).filter(par => {
    if (STRUCTURAL.test(par)) return true
    const t = contentTokens(par)
    if (t.size < 12) return true
    return !finals.some(f => { let hit = 0; for (const w of t) if (f.has(w)) hit++; return hit / t.size >= 0.6 })
  }).join('\n\n')).filter(p => p.trim())
}

export function composeFinal(prefaces: readonly string[], final: string, o: { dedupeParaphrase?: boolean } = {}): string {
  const cleaned = (o.dedupeParaphrase ? withoutParaphrasedPrefaceParagraphs(prefaces, final ?? '') : [...prefaces]).map(p => withoutQuestions(p)).filter(Boolean)
  const body0 = (final ?? '').trim()
  const nBody = norm(body0)
  const keep = cleaned.filter(p => {
    const key = norm(p).slice(0, 80)
    return !(key.length >= 24 && nBody.includes(key))
  })
  const body = withoutEchoes(body0, keep)
  return [...keep, body].filter(Boolean).join('\n\n')
}
