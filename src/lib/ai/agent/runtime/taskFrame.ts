// ── CONSULT_V3 task frame (owner 17/10: "AI phải xác nhận hành vi, tình huống của user để trả lời", not per-question patches) ──────────────────
//
// Measured (UAT 17/10, "thôi trời mưa, nấu ở nhà ăn đi, cỡ 5-6 người"): the user switched from eating out to cooking at home; the model
// called search_places("nguyên liệu lẩu bò nấu tại nhà 5-6 người"), the server attached restaurant cards, and the reply promised "công thức
// trên" without giving one. Nothing in the runtime knew what the turn's TASK was, so nothing could keep tools, cards and the answer on it.
//
// The MODEL declares the task of every turn in a machine line written with its FIRST step (next to its tool calls, or at the end of a direct
// answer) — the same pattern as [TAPPY_RANK]; no extra model round (update_task was measured to cost one, controlTools.ts). Code then:
//   · gates TOOLS by the declared kind (a recipe does not search Maps; a knowledge question does not search hotels) — refused with a note;
//   · gates CARDS by the kind (place / hotel cards only for place, trip and comparison tasks; the shopping card only for shopping / comparison);
//   · checks the DELIVERABLES of the kind in the final answer (a recipe has quantities and steps; a how-to has steps; a comparison compares)
//     and asks the model ONCE for what is missing.
// The line never reaches the user (stripped from every step, from the final text, and at the settle egress). No declaration → nothing gated
// (the former behaviour). Kind is an enum; constraints are short cleaned strings used only in the retry note. Pure.

export const TASK_KINDS = ['chat', 'knowledge', 'explain', 'news', 'live_info', 'place_find', 'place_followup', 'recipe', 'how_to', 'shopping', 'trip_plan', 'compare', 'advice'] as const
export type TaskKind = typeof TASK_KINDS[number]
/** `missing`: the ESSENTIAL information the model declared it cannot assume (turn contract: only then may a turn stop to ask). */
export interface TaskFrame { kind: TaskKind; constraints: string[]; servings: number | null; missing?: string[] }

const BLOCK = /\[\s*TAPPY_TASK\s*\]([\s\S]*?)\[\s*\/\s*TAPPY_TASK\s*\]/gi
const OPEN_TO_END = /\[\s*TAPPY_TASK\s*\][\s\S]*$/i
const STRAY = /\[\s*\/?\s*TAPPY_TASK\s*\]/gi

const cleanText = (s: unknown, max: number): string => (typeof s === 'string'
  ? s.replace(/\[[A-Z_]{3,}\]/g, '').replace(/[\u0000-\u001f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '')

/** Removes every [TAPPY_TASK] block from `text` (an unclosed one to the end) and returns the LAST valid frame. Never throws. */
export function parseTaskFrame(text: string): { text: string; frame: TaskFrame | null } {
  if (!text || !/tappy_task/i.test(text)) return { text, frame: null }
  let frame: TaskFrame | null = null
  let out = text.replace(BLOCK, (_m, body: string) => {
    try {
      const j = JSON.parse(body) as Record<string, unknown>
      const kind = typeof j.kind === 'string' ? j.kind.trim().toLowerCase() : ''
      if ((TASK_KINDS as readonly string[]).includes(kind)) {
        const constraints = (Array.isArray(j.constraints) ? j.constraints : []).map(c => cleanText(c, 60)).filter(Boolean).slice(0, 6)
        const n = typeof j.servings === 'number' ? j.servings : typeof j.servings === 'string' ? Number.parseInt(j.servings, 10) : NaN
        const missing = (Array.isArray(j.missing) ? j.missing : []).map(c => cleanText(c, 60)).filter(Boolean).slice(0, 4)
        frame = { kind: kind as TaskKind, constraints, servings: Number.isFinite(n) && n >= 1 && n <= 100 ? Math.round(n) : null, ...(missing.length ? { missing } : {}) }
      }
    } catch { /* malformed: removed, not used */ }
    return ''
  })
  out = out.replace(OPEN_TO_END, '').replace(STRAY, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text: out, frame }
}

/**
 * Eval 17/10 (sw-1, kn-6, rc-3): the model wrote a full answer, then the [TAPPY_TASK] line, then the answer AGAIN in the same step — the line
 * read as a boundary. When the first block sits between two substantial parts (≥ 25 words each), only the longer part is kept.
 * Returns null when the text has no such split.
 */
export function dedupeAroundTaskFrame(text: string, o: { keepBefore?: boolean } = {}): string | null {
  const m = /\[\s*TAPPY_TASK\s*\][\s\S]*?\[\s*\/\s*TAPPY_TASK\s*\]/i.exec(text ?? '')
  if (!m) return null
  const before = text.slice(0, m.index), after = text.slice(m.index + m[0].length)
  // words the user would read (planning notes do not count — they are removed anyway)
  const wc = (s: string) => (dropMetaNotes(stripTaskFrame(s), 'vi').text.match(/[\p{L}\p{N}]+/gu) ?? []).length
  if (wc(before) < 25 || wc(after) < 25) return null
  // C2 P2 (streaming): the part before the line already streamed to the user — it is the one kept (text that left is never replaced)
  if (o.keepBefore) return before
  return wc(after) >= wc(before) ? after : before
}

// English planning notes that leaked into a Vietnamese reply (eval 17/10, rc-3: "(Oops don't use weird code; ask optional? No need. Need final
// exactly task line at end …)"). A line or a parenthesis with ≥ 6 words, no Vietnamese diacritic, and ≥ 3 English function / planning words is
// not addressed to the user. Only for a Vietnamese reply; product names and short English phrases are untouched.
// planning / instruction words only — generic English ("is", "the", "it") would also match a legitimate English quotation
const EN_NOTE_WORDS = new Set(['need', 'needs', 'dont', "don't", 'should', 'final', 'line', 'remove', 'answer', 'question', 'already', 'oops', 'task', 'tool', 'user', 'must', 'maybe', 'ok', 'output', 'format', 'instruction', 'instructions', 'system', 'prompt', 'exactly', 'optional'])
const VI_MARK = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
function isEnglishNote(s: string): boolean {
  const w = s.toLowerCase().match(/[a-z']+/g) ?? []
  if (w.length < 6 || VI_MARK.test(s)) return false
  return w.filter(x => EN_NOTE_WORDS.has(x)).length >= 3
}
export function dropMetaNotes(text: string, lang: string): { text: string; removed: number } {
  if (lang === 'en' || !text) return { text, removed: 0 }
  let removed = 0
  let out = text.replace(/\(([^()\n]{20,400})\)/g, (m, inner: string) => (isEnglishNote(inner) ? (removed++, '') : m))
  out = out.split('\n').filter(l => { const drop = isEnglishNote(l.replace(/[*_`#>-]/g, ' ')); if (drop) removed++; return !drop }).join('\n')
  return { text: removed ? out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : text, removed }
}

/**
 * Eval 17/10 — degenerate output from the model, shown as is: 274 × "[END]" after a good answer (kn-2, uat-5), the raw tool-call JSON and a
 * Malayalam word at the top of a plan (tp-2), the whole answer written twice with no task line between (kn-6, rc-1, ht-2). Removed:
 *   · end-of-text tokens ([END], [DONE], <|endoftext|>, <|im_end|>);
 *   · a line that is a raw tool-call object ({"name": …, "arguments": …}), or a tool call written as text — "[functions.use_tool(tool=…)]"
 *     (nw-3), "search_places(…)", an <invoke> tag, a whole-line placeholder "[tool call omitted]" (A/B smoke 17/10) — outside a ``` code
 *     block (a coding answer may call its own get_…() functions);
 *   · letters of scripts a Vietnamese answer never uses (Indic, Thai, Arabic, Hebrew) — Han stays (a Chinese term may be the subject);
 *   · a second copy of the answer: when the opening 8 words occur again later, the longer of the two copies is kept.
 */
const TOOL_CALL_TEXT = /^\s*(?:\[\s*)?(?:<\/?(?:invoke|function_calls|tool_call)\b|functions\.\w+\s*\(|(?:use_tool|ask_user|update_task|new_task|search_places|search_products|get_hotel_prices|get_flight_prices|get_transport_options|get_trip_data|get_weather|get_gold_price|get_news|get_now_showing|get_movie_showtimes)\s*\()/

// one or more brackets: "[tool call omitted]", "[[tool call?]]" (A/B arm A 17/10, tp-2)
const TOOL_CALL_PLACEHOLDER = /^\s*\[+\s*(?:tool|function)[ _-]?(?:calls?|use|results?)\b[^\]\n]*\]+\s*$/i
// a line OPENED by a tool tag: "[TOOL_CALL]{…}[/TOOL_CALL] [TOOL_ERROR] tool use unavailable in this environment" (rerun 3, sw-10)
const TOOL_TAG_LINE = /^\s*\[\/?\s*(?:TOOL|FUNCTION)[ _-]?(?:CALLS?|ERROR|RESULTS?|USE|OUTPUT)\s*\]/i

// Stray-script letters removed from a non-English reply (eval 17/10: "қәр" in a Vietnamese plan) — each ONLY when the user's own message does not use
// that script: a question asked in Thai is answered in Thai (UAT round 19/10, u03: a Thai weather answer kept nothing but its numbers).
const STRAY_SCRIPTS: ReadonlyArray<{ strip: RegExp; seen: RegExp }> = [
  { strip: /[֐-׿]+/g, seen: /[֐-׿]/ },
  { strip: /[؀-ۿ]+/g, seen: /[؀-ۿ]/ },
  { strip: /[ऀ-෿]+/g, seen: /[ऀ-෿]/ },
  { strip: /[฀-๿]+/g, seen: /[฀-๿]/ },
  { strip: / ?\p{Script=Cyrillic}+/gu, seen: /\p{Script=Cyrillic}/u },
]

export function scrubDegenerate(text: string, lang: string, o: { keepFirstCopy?: boolean; userText?: string } = {}): { text: string; fixes: string[] } {
  const fixes: string[] = []
  let out = text
  // A/B eval 17/10 (tp-1 arm B): "<|im_start|assistant|final> (ignore)" — a role token with extra fields, and its "(ignore)" note
  const tokens = out.replace(/\[(?:END|DONE|EOS|STOP)\]|<\|(?:endoftext|im_end|im_start|eot_id)\|>|<\|[a-z_]{2,20}\|[a-z_|]{0,40}>(?:\s*\((?:ignore|ignored)\))?/gi, '')
  if (tokens !== out) { fixes.push('end_tokens'); out = tokens }
  let inFence = false
  const noCalls = out.split('\n').filter(l => {
    if (/^\s*```/.test(l)) { inFence = !inFence; return true }
    if (inFence) return true
    return !/^\s*\{\s*"(?:name|tool|function|arguments|tool_calls|recipient_name)"\s*:/.test(l) && !/"arguments"\s*:\s*\{/.test(l) && !TOOL_CALL_TEXT.test(l) && !TOOL_CALL_PLACEHOLDER.test(l) && !TOOL_TAG_LINE.test(l)
  }).join('\n')
  if (noCalls !== out) { fixes.push('tool_call_json'); out = noCalls }
  if (lang !== 'en') {
    // A/B eval 17/10 (tp-2 arm B): "қәр" — Cyrillic letters in a Vietnamese plan; a script the user writes in is not stray (UAT 19/10, u03)
    let noScripts = out
    for (const s of STRAY_SCRIPTS) if (!(o.userText && s.seen.test(o.userText))) noScripts = noScripts.replace(s.strip, '')
    if (noScripts !== out) { fixes.push('foreign_script'); out = noScripts }
  }
  const words = out.split(/\s+/).filter(Boolean)
  if (words.length >= 40) {
    const head = words.slice(0, 8).join(' ')
    const first = out.indexOf(head)
    const second = first >= 0 ? out.indexOf(head, first + head.length) : -1
    if (second > 0) {
      const a = out.slice(0, second), b = out.slice(second)
      // C2 P2 (streaming): the first copy already streamed to the user — it is the one kept
      out = o.keepFirstCopy ? a : (b.length > a.length ? b : a)
      fixes.push('second_copy')
    }
  }
  if (fixes.length) out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text: out, fixes }
}

/** Strip only (final text, settle egress). */
export function stripTaskFrame(text: string): string {
  return parseTaskFrame(text).text
}

// ── tools ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PLACE_TOOLS = new Set(['search_places', 'get_hotel_prices', 'get_trip_data', 'get_transport_options', 'get_flight_prices', 'get_now_showing', 'get_movie_showtimes'])
export const PLACE_TOOL_NAMES: ReadonlySet<string> = PLACE_TOOLS
const SHOPPING_TOOLS = new Set(['search_products'])
const PLACE_KINDS = new Set<TaskKind>(['place_find', 'place_followup', 'trip_plan', 'compare'])
const SHOPPING_KINDS = new Set<TaskKind>(['shopping', 'compare'])

/** The note a refused tool call gets, or null when the declared task may use the tool. */
export function taskToolGate(kind: TaskKind, tool: string, lang: string): string | null {
  const en = lang === 'en'
  if (PLACE_TOOLS.has(tool) && !PLACE_KINDS.has(kind)) {
    return en
      ? `Not for this task (${kind}): you declared it does not need places, venues, hotels or trips. Answer the task itself (e.g. the recipe or explanation) from knowledge or a web search.`
      : `Không hợp nhiệm vụ này (${kind}): bạn đã khai nhiệm vụ không cần tìm quán, địa điểm, khách sạn hay chuyến đi. Hãy làm đúng nhiệm vụ (vd đưa công thức, lời giải thích) từ hiểu biết hoặc tra web.`
  }
  if (SHOPPING_TOOLS.has(tool) && !SHOPPING_KINDS.has(kind)) {
    return en ? `Not for this task (${kind}): no product search. Answer the task itself.` : `Không hợp nhiệm vụ này (${kind}): không tìm sản phẩm. Hãy làm đúng nhiệm vụ.`
  }
  return null
}

/** Which cards a turn of this kind may show. */
export function cardsAllowed(kind: TaskKind): { places: boolean; shopping: boolean } {
  return { places: PLACE_KINDS.has(kind), shopping: SHOPPING_KINDS.has(kind) }
}

// ── deliverables ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// (a JS \b is ASCII-only, so the unit's end is a "no letter follows" lookahead — "2 bó", "1 lạng" end in non-ASCII letters)
const QTY = /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|gr|gram|gam|lạng|l|lít|ml|muỗng|thìa|chén|bát|cốc|tách|quả|trái|củ|cây|bó|nhánh|tép|lát|miếng|con|gói|hộp|lon|chai|phần|cup|tbsp|tsp|oz|lb)(?![\p{L}])/giu
const STEP_LINE = /^\s*(?:\d{1,2}[.)]\s+|bước\s*\d+|step\s*\d+)/gimu
const LIST_LINE = /^\s*(?:[-*•]\s+|\d{1,2}[.)]\s+)\S/gmu

/** What the final answer still lacks for its declared task (empty = complete). Labels are what the retry note asks for. */
export function missingDeliverables(frame: TaskFrame, text: string, lang = 'vi'): string[] {
  const en = lang === 'en'
  const t = text.replace(/\[(?:FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\][\s\S]*?\[\/(?:FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\]/g, '')
  const qty = (t.match(QTY) ?? []).length
  const steps = (t.match(STEP_LINE) ?? []).length
  const items = (t.match(LIST_LINE) ?? []).length
  const out: string[] = []
  if (frame.kind === 'recipe') {
    if (qty < 3) out.push(en ? `ingredient quantities${frame.servings ? ` for ${frame.servings} people` : ''}` : `định lượng nguyên liệu${frame.servings ? ` cho ${frame.servings} người` : ''}`)
    if (steps < 3) out.push(en ? 'numbered cooking steps' : 'các bước nấu đánh số')
  } else if (frame.kind === 'how_to') {
    if (steps < 3) out.push(en ? 'numbered steps' : 'các bước làm đánh số')
  } else if (frame.kind === 'compare') {
    const table = /^\s*\|.+\|\s*$/m.test(t) && /^\s*\|?\s*:?-{2,}/m.test(t)
    if (!table && items < 3) out.push(en ? 'a side-by-side comparison (table or 3+ criteria)' : 'phần so sánh cạnh nhau (bảng hoặc từ 3 tiêu chí)')
  } else if (frame.kind === 'trip_plan') {
    if (!/\[TAPPY_PLAN\]/.test(text) && steps + items < 4) out.push(en ? 'the day-by-day plan' : 'lịch trình từng ngày')
  }
  // Promised but not given (any kind): "công thức ở trên / dưới đây" with no steps, "bảng dưới" with no table.
  if (/(?:công thức|cách nấu|cách làm|recipe)\s*(?:ở|phía)?\s*(?:trên|dưới)|(?:recipe|steps)\s+(?:above|below)/iu.test(t) && steps < 3 && !out.some(x => /bước|steps/.test(x))) out.push(en ? 'the recipe steps you referred to' : 'các bước công thức mà câu trả lời nhắc tới')
  if (/(?:bảng|table)\s*(?:ở|phía)?\s*(?:trên|dưới|below|above)/iu.test(t) && !/^\s*\|.+\|\s*$/m.test(t)) out.push(en ? 'the table you referred to' : 'cái bảng mà câu trả lời nhắc tới')
  const short = promisedCountShortfall(t)
  // the retry has no tools: it may complete the list from what it already has, or correct the announced number — never invent an item
  if (short) out.push(en ? `all ${short.n} ${short.what} you announced (only ${short.given} given) — or correct the number to what you really have; never invent one` : `đủ ${short.n} ${short.what} đã nói (mới có ${short.given}) — hoặc sửa con số cho khớp với số thật có, không bịa thêm`)
  return out
}

// Eval 17/10 (sw-1 "gợi ý 3 kiểu" with none listed, pf-4 "3 chỗ" with 2, sh-6 "hai lựa chọn" with 1): an announced count the answer does
// not deliver. Items = list lines, bold-led lines and headings AFTER the announcement; an announcement inside a question is an offer.
const COUNT_WORDS: Record<string, number> = { hai: 2, ba: 3, 'bốn': 4, 'năm': 5, two: 2, three: 3, four: 4, five: 5 }
const PROMISE = /(?<![\p{L}\p{N}])([2-5]|hai|ba|bốn|năm|two|three|four|five)\s+(món|lựa chọn|gợi ý|mẫu|kèo|cách|phương án|chỗ|quán|địa điểm|kiểu|ý tưởng|options?|ideas?|places?|picks?)(?![\p{L}])/giu
const ITEM_LINE = /^\s*(?:[-*•]\s+\S|\d{1,2}[.)]\s+\S|\*\*\S|#{1,4}\s+\S)/gmu

export function promisedCountShortfall(text: string): { n: number; what: string; given: number } | null {
  for (const m of text.matchAll(PROMISE)) {
    const at = m.index ?? 0
    const end = text.slice(at).search(/[.?!:\n]/)
    if (end >= 0 && text[at + end] === '?') continue
    if (/(?:xe|ô tô|oto)\s*$/iu.test(text.slice(Math.max(0, at - 8), at))) continue // "xe 7 chỗ" = seats
    const n = COUNT_WORDS[m[1].toLowerCase()] ?? Number(m[1])
    const given = (text.slice(at).match(ITEM_LINE) ?? []).length
    if (given < n) return { n, what: m[2], given }
    return null
  }
  return null
}

export function deliverablesRetryNote(frame: TaskFrame, missing: readonly string[], lang: string): string {
  const cons = frame.constraints.length ? (lang === 'en' ? ` Keep the user's constraints: ${frame.constraints.join('; ')}.` : ` Giữ đúng ràng buộc của người dùng: ${frame.constraints.join('; ')}.`) : ''
  return lang === 'en'
    ? `\n\nYour answer does not complete the task (${frame.kind}). Rewrite it in full and include: ${missing.join('; ')}.${cons} Keep what was right; no new figures from nowhere (quantities and times may be typical home-cooking estimates).`
    : `\n\nCâu trả lời chưa hoàn thành nhiệm vụ (${frame.kind}). Viết lại đầy đủ và có: ${missing.join('; ')}.${cons} Giữ phần đã đúng; định lượng và thời gian được dùng mức nấu nhà thông thường.`
}
