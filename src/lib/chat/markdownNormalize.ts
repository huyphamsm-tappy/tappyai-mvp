// ── NO LITERAL "**" IN ANY ANSWER, ANY VERTICAL (owner UAT blocker 2026-09-28) ─────────────────
//
// Root cause, measured: nothing between the model and the screen guaranteed that a `**` has a
// partner. The model writes an unpaired `**` on its own ("**4.7⭐"), guards that cut sentences
// leave half a pair behind (only moneyGuard balanced its own cuts, c5ce0c0), and the model also
// writes markdown INSIDE card JSON strings, which every card renders as plain text. The renderers
// then disagreed: web's `formatMessage` happened to turn an orphan `**` into an empty `<em></em>`
// (invisible by accident, but `***x***` produced crossed tags and a stray `*`), Android's
// TappyMarkdown emitted any unterminated marker literally, and every card printed the raw string.
//
// One pure, isomorphic module, used by:
//   · the web prose renderer (`formatMessage`) — `balanceBold` per line before it parses bold;
//   · web cards that print model strings as plain text — `plainText`;
//   · the server's final text (`streamEnrichment`) — `normalizeReplyMarkdown`: prose lines are
//     balanced and markdown is stripped from the string VALUES inside [TAPPY_*] / [CTA_BUTTONS] /
//     [FOLLOWUPS] blocks, whose markers and JSON shape are kept.
// Android mirrors `balanceBold` / `plainText` in core/designsystem `MarkdownText.kt`.

const STAR_RUN = /\*{2,}/g

/**
 * Balance bold on ONE line: matched pairs survive (as canonical `**`), every unmatched `**` is
 * dropped. A run of 3 (`***x***`, `Lưu ý:***`) counts as one bold delimiter; a run of 4+ is an
 * empty pair and goes. Pairing is flanking-aware so an orphan at the start ("a** b **c** d") does
 * not steal the next real opener: a delimiter followed by whitespace cannot open while one is
 * pending, and one preceded by whitespace cannot close. Inner padding ("** text**") is trimmed,
 * and a pair with nothing inside is removed.
 */
export function balanceBold(line: string): string {
  if (!line.includes('**')) return line
  type Tok = { start: number; end: number; canOpen: boolean; canClose: boolean }
  const toks: Tok[] = []
  for (const m of line.matchAll(STAR_RUN)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    if (m[0].length >= 4) { toks.push({ start, end, canOpen: false, canClose: false }); continue }
    const before = start > 0 ? line[start - 1] : ''
    const after = end < line.length ? line[end] : ''
    toks.push({ start, end, canOpen: !!after && !/\s/.test(after), canClose: !!before && !/\s/.test(before) })
  }
  const pairs: Array<[Tok, Tok]> = []
  let pending: Tok | null = null
  for (const t of toks) {
    if (t.end - t.start >= 4) continue // an empty pair: dropped below (never paired)
    const neither = !t.canOpen && !t.canClose
    if (!pending) {
      if (t.canOpen || neither) pending = t
    } else if (t.canClose || neither) {
      pairs.push([pending, t]); pending = null
    } else {
      pending = t // the pending one was an orphan; this one opens
    }
  }
  let out = ''
  let at = 0
  const paired = new Map<number, 'open' | 'close'>()
  for (const [o, c] of pairs) { paired.set(o.start, 'open'); paired.set(c.start, 'close') }
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]
    const role = paired.get(t.start)
    if (role === 'open') {
      const close = pairs.find(p => p[0] === t)![1]
      const inner = line.slice(t.end, close.start).trim()
      out += line.slice(at, t.start)
      // Drop the pair's delimiters when nothing is inside; otherwise emit canonical bold. Any
      // delimiter INSIDE the pair was already dropped (it is not paired), so strip stray runs.
      const cleanInner = inner.replace(STAR_RUN, '')
      out += cleanInner.trim() ? `**${cleanInner.trim()}**` : ''
      at = close.end
      if (!cleanInner.trim() && t.start > 0 && /\s/.test(line[t.start - 1]) && line[at] === ' ') at++
      k = toks.indexOf(close)
      continue
    }
    // An unmatched delimiter is dropped; a free-standing one (" ** ") takes one space with it.
    out += line.slice(at, t.start)
    at = t.end
    if (t.start > 0 && /\s/.test(line[t.start - 1]) && line[at] === ' ') at++
  }
  out += line.slice(at)
  return out
}

/** `balanceBold` on every line (bold never spans a line break in either renderer). */
export function balanceBoldPerLine(text: string): string {
  if (!text.includes('**')) return text
  return text.split('\n').map(balanceBold).join('\n')
}

const MD_LINK = /!?\[([^\]\n]*)\]\((?:[^)\s]*)\)/g

/**
 * Markdown-free text for a card field that renders a model string as PLAIN text (plan items,
 * shopping names/reasons, place reasons, follow-up chips). Removes bold/underline delimiters,
 * inline code ticks, heading hashes, word-flanking single `*`/`_` emphasis, and reduces a
 * markdown link to its label. Never touches a `*` between two non-spaces ("2*3").
 */
export function plainText(s: string): string {
  if (typeof s !== 'string' || !s) return s
  if (!/[*_`#[]/.test(s)) return s
  return s
    .replace(MD_LINK, '$1')
    .replace(/\*{2,}/g, '')
    .replace(/(^|[\s(])__(?=\S)|(?<=\S)__(?=[\s).,;:!?]|$)/g, '$1')
    .replace(/`+/g, '')
    .replace(/(^|\n)\s*#{1,6}\s+/g, '$1')
    .replace(/(^|[\s(])\*(?=\S)|(?<=\S)\*(?=[\s).,;:!?]|$)/g, '$1')
    .replace(/(^|[\s(])_(?=[^\s_])([^_\n]+?)_(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Keys whose values are addresses, ids or enums — never prose, never rewritten. */
const NON_PROSE_KEY = /((^|_)(url|urls|link|links|href|uri|image|images|photo|photos|id|ids|key|type|kind|category|icon|currency|basis)$)|([a-z](Url|Urls|Link|Links|Id|Ids|Key|Type|Kind)$)/i

function stripJsonStrings(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    if (NON_PROSE_KEY.test(key) || /^(https?:|mailto:|tel:)/i.test(value)) return value
    return plainText(value)
  }
  if (Array.isArray(value)) return value.map(v => stripJsonStrings(v, key))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    // A key is only rewritten when it carries bold/code markup ("**Ăn uống**" in cost_breakdown).
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[/[*`]/.test(k) ? plainText(k) : k] = stripJsonStrings(v, k)
    return out
  }
  return value
}

/**
 * `plainText` applied to every prose string of a parsed card payload (plan, shopping view, …);
 * URL / id / enum fields are left as they are. Returns the same reference when nothing changed.
 */
export function plainTextDeep<T>(value: T): T {
  const next = stripJsonStrings(value)
  return JSON.stringify(next) === JSON.stringify(value) ? value : (next as T)
}

const BLOCK = /\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]([\s\S]*?)\[\/\1\]/g

function normalizeBlockBody(name: string, body: string): string {
  if (name === 'FOLLOWUPS') {
    const next = body.split('|').map(c => plainText(c)).join('|')
    return next
  }
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { return body } // not JSON: never string surgery on it
  const stripped = stripJsonStrings(parsed)
  // Byte-identical when nothing changed, so a server-rendered marker is never re-serialised.
  return JSON.stringify(stripped) === JSON.stringify(parsed) ? body : JSON.stringify(stripped)
}

/**
 * Owner 2026-09-28 (B4): the model wrote "ngan sách" — half accented. No code or prompt emits it;
 * the system prompt is mostly unaccented Vietnamese ("ngan sach") and the model blends the two.
 * Only a HALF-accented pair is fixed: "ngan" alone is a real word (wild goose), "ngan sach" may be
 * deliberate unaccented text. Same length in and out.
 */
const HALF_ACCENTED: Array<[RegExp, string]> = [
  [/(?<!\p{L})([Nn])gan(\s+)(sách)(?!\p{L})/gu, '$1gân$2$3'],
  [/(?<!\p{L})([Nn])gân(\s+)sach(?!\p{L})/gu, '$1gân$2sách'],
  // c40 O8: "chưa có gia cụ thể". "gia" next to an ACCENTED price word is always "giá" ("gia đình" untouched).
  [/(?<!\p{L})([Gg])ia(\s+)(cụ thể|vé|phòng|tiền|rẻ|niêm yết)(?!\p{L})/gu, '$1iá$2$3'],
]
export function fixHalfAccented(text: string): string {
  return HALF_ACCENTED.reduce((t, [re, to]) => t.replace(re, to), text)
}

// ── LINE BREAKS THE MODEL FORGOT (UAT 18/11: a list of four items printed as one bullet, two rows of a table lost) ────────────────
//
// The model sometimes writes the items of a list, or the rows of a table, with no line break between them. The renderers then print one
// long bullet, or a table that holds only the rows that happened to be on their own line. Fixed here, once, for every answer and every
// renderer (the server's final text goes through `normalizeReplyMarkdown`), never by asking the model to be careful.

const FENCE = /^\s*```/
const isSeparatorRow = (cells: string[]): boolean => cells.length > 0 && cells.every(c => /^:?-{3,}:?$/.test(c))
const tableCells = (l: string): string[] => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

/**
 * A table row line that holds several rows: after a header and its separator row fix the number of columns, so a line with a whole number
 * (two or more) of that many cells is split back into rows. Anything else is untouched. Pure; code fences are skipped.
 */
export function repairGluedTables(text: string): string {
  if (typeof text !== 'string' || !text.includes('|')) return text
  let cols = 0
  let fenced = false
  const out: string[] = []
  for (const l of text.split('\n')) {
    if (FENCE.test(l)) { fenced = !fenced; out.push(l); continue }
    if (fenced) { out.push(l); continue }
    if (!/^\s*\|/.test(l)) { cols = 0; out.push(l); continue }
    const cells = tableCells(l)
    if (isSeparatorRow(cells)) { cols = cells.length; out.push(l); continue }
    if (cols >= 2 && /\|\s*$/.test(l) && cells.length > cols && cells.length % cols === 0) {
      for (let i = 0; i < cells.length; i += cols) out.push(`| ${cells.slice(i, i + cols).join(' | ')} |`)
      continue
    }
    out.push(l)
  }
  return out.join('\n')
}

/** Items of a list written on one line ("- **A:** text - **B:** text"): a bullet line holding " - **label**" more than once is split into one bullet per item. Pure; code fences are skipped. */
const GLUED_BULLET = /(?<=\S)[ \t]+-[ \t]+(?=\*\*[^*\n]+\*\*)/g
export function splitGluedBullets(text: string): string {
  if (typeof text !== 'string' || !text.includes('**')) return text
  let fenced = false
  return text.split('\n').map(l => {
    if (FENCE.test(l)) { fenced = !fenced; return l }
    if (fenced || !/^\s*(?:[-*•]|\d+[.)])\s/.test(l)) return l
    const parts = l.split(GLUED_BULLET)
    if (parts.length < 2) return l
    const indent = /^\s*/.exec(l)?.[0] ?? ''
    return parts.map((p, i) => (i === 0 ? p : `${indent}- ${p}`)).join('\n')
  }).join('\n')
}

/**
 * Both repairs in one call, for a renderer: the text the SERVER sends can be fixed only where the client has not already received it (a streamed prefix cannot be rewritten),
 * so every renderer (the chat, the public page of a shared answer) repairs what it is about to draw as well. Idempotent. Pure.
 */
export function repairGluedMarkdown(text: string): string {
  return splitGluedQuote(splitGluedBullets(repairGluedTables(text)))
}

/** A quote written glued to the end of a sentence ("... a basket. > In short: ..."): its "> " starts a paragraph of its own, so it renders as a quote and not as a stray character. Fences, table rows and quote lines are skipped. Pure. */
const GLUED_QUOTE = /(?<=[.!?:…])[ \t]+>[ \t]+(?=\S)/
export function splitGluedQuote(text: string): string {
  if (typeof text !== 'string' || !text.includes('>')) return text
  let fenced = false
  return text.split('\n').map(l => {
    if (FENCE.test(l)) { fenced = !fenced; return l }
    if (fenced || /^\s*[>|]/.test(l)) return l
    return l.replace(GLUED_QUOTE, '\n\n> ')
  }).join('\n')
}

const proseOf = (s: string): string => balanceBoldPerLine(repairGluedMarkdown(s))

/**
 * The reply as the user must see it: prose bold balanced per line, marker blocks kept in place
 * with markdown stripped from their string values. An UNCLOSED block (truncated reply) and
 * everything after it is left exactly as it is — never guess at a half block.
 */
export function normalizeReplyMarkdown(text: string): string {
  if (typeof text !== 'string' || !text) return text
  text = fixHalfAccented(text)
  if (!/[*_`#[|]/.test(text)) return text
  let out = ''
  let at = 0
  for (const m of text.matchAll(BLOCK)) {
    const start = m.index ?? 0
    out += proseOf(text.slice(at, start))
    out += `[${m[1]}]${normalizeBlockBody(m[1], m[2])}[/${m[1]}]`
    at = start + m[0].length
  }
  const rest = text.slice(at)
  const openAt = rest.search(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]/)
  out += openAt === -1 ? proseOf(rest) : proseOf(rest.slice(0, openAt)) + rest.slice(openAt)
  return out
}
