// TAPPY_ANSWER_V4 layer 2 — the answer as a DOCUMENT (owner 19/10/2026: "format & layout giống ChatGPT… như đang đọc báo").
//
// The model writes markdown; this turns it into blocks (headings, paragraphs, lists with their items, quotes, rules, and raw blocks for tables /
// code / picture runs) so the web can lay it out as an article instead of one pre-wrapped string, and so the server and the client agree on the
// answer's ITEMS (the dishes, places, films… a list answer names) — the server resolves a picture per item, the client places each picture next
// to the item it belongs to. Pure, no I/O, shared by server and client; nothing here depends on the language or script of the text.

export type DocBlock =
  | { t: 'heading'; level: number; text: string }
  | { t: 'para'; text: string }
  | { t: 'list'; ordered: boolean; start: number; items: DocListItem[] }
  | { t: 'quote'; text: string }
  | { t: 'hr' }
  /** Tables, fenced code, runs of images: rendered whole by the inline formatter. */
  | { t: 'raw'; text: string }

/** One list item: its own text, and whatever is nested under it (its own sub-document, parsed again when rendered). */
export interface DocListItem { text: string; children: string }

const FENCE = /^\s{0,3}```/
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const LIST = /^(\s*)([-*•+]|(\d{1,3})[.)])\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/
const IMAGE_LINE = /^\s*!\[[^\]]*\]\([^)\s]+\)\s*$/
/** A line that is bold and nothing else ("**1. Phở bò**", "**Day 2 — Hội An**"): a heading in all but syntax. */
const BOLD_LINE = /^\s{0,3}\*\*([^*\n]{1,90})\*\*\s*[:：]?\s*$/

export function parseDoc(md: string): DocBlock[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: DocBlock[] = []
  let para: string[] = []
  const flushPara = () => { if (para.length) { out.push({ t: 'para', text: para.join('\n') }); para = [] } }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { flushPara(); i++; continue }
    if (FENCE.test(line)) {
      flushPara()
      let j = i + 1
      while (j < lines.length && !FENCE.test(lines[j])) j++
      out.push({ t: 'raw', text: lines.slice(i, Math.min(j + 1, lines.length)).join('\n') })
      i = j + 1
      continue
    }
    if (/\|/.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flushPara()
      let j = i + 2
      while (j < lines.length && /\|/.test(lines[j]) && lines[j].trim()) j++
      out.push({ t: 'raw', text: lines.slice(i, j).join('\n') })
      i = j
      continue
    }
    if (IMAGE_LINE.test(line)) {
      flushPara()
      let j = i + 1
      while (j < lines.length && IMAGE_LINE.test(lines[j])) j++
      out.push({ t: 'raw', text: lines.slice(i, j).join('\n') })
      i = j
      continue
    }
    const h = HEADING.exec(line)
    if (h) { flushPara(); out.push({ t: 'heading', level: h[1].length, text: h[2] }); i++; continue }
    if (HR.test(line) && !LIST.exec(line)?.[4]?.trim()) { flushPara(); out.push({ t: 'hr' }); i++; continue }
    const b = BOLD_LINE.exec(line)
    if (b && !para.length) { out.push({ t: 'heading', level: 4, text: b[1].trim() }); i++; continue }
    if (QUOTE.test(line)) {
      flushPara()
      const q: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) { q.push(QUOTE.exec(lines[i])![1]); i++ }
      out.push({ t: 'quote', text: q.join('\n') })
      continue
    }
    const l = LIST.exec(line)
    // a bulleted list (or a numbered one starting at 1) may follow a paragraph line with no blank line between ("Muốn đổi vị thì:\n- **Bún bò Huế** …"),
    // as CommonMark allows; any other numbered line inside a paragraph stays text ("năm\n2026. …" is not a list)
    if (l && (!para.length || !l[3] || l[3] === '1')) {
      flushPara()
      const baseIndent = l[1].length
      const ordered = !!l[3]
      const items: DocListItem[] = []
      let cur: { text: string[]; children: string[] } | null = null
      while (i < lines.length) {
        const ln = lines[i]
        if (!ln.trim()) {
          // a blank line ends the list unless the next non-blank line continues it (a loose list) or is nested under it
          let k = i + 1
          while (k < lines.length && !lines[k].trim()) k++
          const nx = k < lines.length ? LIST.exec(lines[k]) : null
          const nested = k < lines.length && /^\s+/.test(lines[k]) && (lines[k].match(/^\s*/)![0].length > baseIndent)
          if ((nx && nx[1].length === baseIndent && !!nx[3] === ordered) || nested) { if (cur && nested && !(nx && nx[1].length === baseIndent)) cur.children.push(''); i = k; continue }
          break
        }
        const m = LIST.exec(ln)
        if (m && m[1].length <= baseIndent + 1) {
          if (!!m[3] !== ordered) break
          if (cur) items.push({ text: cur.text.join('\n'), children: cur.children.join('\n').trim() })
          cur = { text: [m[4]], children: [] }
          i++
          continue
        }
        const indent = ln.match(/^\s*/)![0].length
        if (cur && (indent > baseIndent || (!m && !HEADING.test(ln) && !FENCE.test(ln) && !BOLD_LINE.test(ln) && !cur.children.length))) {
          if (m || indent > baseIndent + 1) cur.children.push(ln.slice(Math.min(indent, baseIndent + 2)))
          else cur.text.push(ln.trim())
          i++
          continue
        }
        break
      }
      if (cur) items.push({ text: cur.text.join('\n'), children: cur.children.join('\n').trim() })
      out.push({ t: 'list', ordered, start: ordered ? Number(l[3]) : 1, items })
      continue
    }
    para.push(line)
    i++
  }
  flushPara()
  return out
}

/** A comparison key for an item title in ANY script: compatibility-normalised, accents removed, lower case, letters and digits only. */
export function titleKey(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

const LEAD_BOLD = /^\s*(?:\d{1,3}[.)]\s*)?\*\*(.+?)\*\*/
/** Leading spaces, emoji (with their variation selector / joiner) and symbols before a title. */
const LEAD_SYMBOLS = /^[\s\p{Extended_Pictographic}\p{S}\u{FE0F}\u{200D}]+/u
/** A title's own words: no leading number / emoji / symbol, cut at the first separator (": ", " – ", " — ", " - ", " (", " | "). */
export function cleanTitle(s: string): string {
  const t = s
    .replace(/\*\*/g, '')
    .replace(LEAD_SYMBOLS, '')
    .replace(/^\d{1,3}[.)]\s*/, '')
    .replace(LEAD_SYMBOLS, '')
    .split(/\s*[:：]\s+|\s+[–—-]\s+|\s+\(|\s+\|\s+|[:：]\s*$/)[0]
    .replace(/[\s.,;:!?：]+$/u, '')
    .trim()
  return t
}

const okTitle = (t: string) => t.length >= 2 && t.length <= 60 && t.split(/\s+/).length <= 8

/** The item's title: its bold lead ("**Phở bò** – nước dùng…" → "Phở bò"), else null (a plain bullet is a point, not an item). */
export function listItemTitle(text: string): string | null {
  const m = LEAD_BOLD.exec(text)
  if (!m) return null
  const t = cleanTitle(m[1])
  return okTitle(t) ? t : null
}

export function headingTitle(text: string): string | null {
  const t = cleanTitle(text)
  return okTitle(t) ? t : null
}

/**
 * The answer's ITEMS — what a picture can be attached to: the bold-lead items of its list(s), or its sub-headings when the answer is laid out
 * as one section per item. The larger group wins (lists on a tie); fewer than two → none (a single heading is a section title, not an item).
 */
export function docItemTitles(md: string, max = 8): string[] {
  return docItems(md, max).map(i => i.title)
}

/** The answer's items with their own line of text (the title is what the client matches; the text says what the item IS). */
export function docItems(md: string, max = 8): Array<{ title: string; text: string }> {
  const blocks = parseDoc(md)
  const fromLists: Array<{ title: string; text: string }> = []
  for (const b of blocks) if (b.t === 'list') for (const it of b.items) { const t = listItemTitle(it.text); if (t) fromLists.push({ title: t, text: it.text }) }
  // sub-headings of the same (deepest common) level are the items; a lone top heading is the article title. Text = the heading + the block after it.
  let fromHeadings: Array<{ title: string; text: string }> = []
  const levels = [...new Set(blocks.flatMap(b => (b.t === 'heading' && b.level >= 2 ? [b.level] : [])))]
  for (const lv of levels) {
    const ts: Array<{ title: string; text: string }> = []
    blocks.forEach((b, i) => {
      if (b.t !== 'heading' || b.level !== lv) return
      const t = headingTitle(b.text)
      const next = blocks[i + 1]
      if (t) ts.push({ title: t, text: `${b.text}${next && (next.t === 'para' || next.t === 'quote') ? ` — ${next.text}` : ''}` })
    })
    if (ts.length > fromHeadings.length) fromHeadings = ts
  }
  const pick = fromLists.length >= 2 && fromLists.length >= fromHeadings.length ? fromLists : fromHeadings.length >= 2 ? fromHeadings : []
  const seen = new Set<string>()
  return pick.filter(t => { const k = titleKey(t.title); if (!k || seen.has(k)) return false; seen.add(k); return true }).slice(0, max)
}
