// RFC-001 section 4 (response presentation by processing stream): the PURE parts. View only; nothing here changes what the model wrote or what is saved.
//   4.1 editorial answers : where the rich embeds (place / shopping / plan cards) sit BETWEEN the paragraphs (embedAnchors)
//   4.2 document reports  : the table of contents built from the report's REAL headings (buildToc), the footnote citations (footnotesOf, linkCitations)
//   4.3 progressive       : which sections of a streaming report may be drawn (arrivalOf: only a section that is complete), which one was rewritten (amendedSections)
// Behind the build flag NEXT_PUBLIC_RESPONSE_PRESENTATION=1 (off by default: without it the chat looks exactly as before).

import { parseDoc, type DocBlock } from '@/lib/answerDoc/parse'

export const RESPONSE_PRESENTATION = process.env.NEXT_PUBLIC_RESPONSE_PRESENTATION === '1'

// ---------------------------------------------------------------------------------------------------------------------
// 4.1 embeds between paragraphs
// ---------------------------------------------------------------------------------------------------------------------

const INTRODUCES = /[:：]\s*$/

/**
 * For each of `n` embeds, the index of the top-level block it goes AFTER. The first embed follows the lead paragraph, the others are spread evenly over the
 * remaining gaps; an embed never goes right after a heading (it would sit between a title and its text) nor after a line that introduces what follows
 * ("Các quán nên thử:"). No usable gap (one short paragraph, headings only): after the last block; no blocks at all: -1 (the caller puts them first).
 * The order of the embeds is kept. Pure.
 */
export function embedAnchors(blocks: readonly DocBlock[], n: number): number[] {
  if (n <= 0) return []
  if (!blocks.length) return Array.from({ length: n }, () => -1)
  const lead = blocks.findIndex(b => b.t === 'para')
  const from = lead >= 0 ? lead : 0
  const gaps: number[] = []
  blocks.forEach((b, i) => {
    if (i < from || b.t === 'heading' || b.t === 'hr') return
    if ((b.t === 'para' || b.t === 'quote') && INTRODUCES.test(b.text)) return
    gaps.push(i)
  })
  if (!gaps.length) return Array.from({ length: n }, () => blocks.length - 1)
  return Array.from({ length: n }, (_, k) => gaps[Math.min(gaps.length - 1, Math.floor((k * gaps.length) / n))])
}

// ---------------------------------------------------------------------------------------------------------------------
// 4.2 table of contents and footnotes
// ---------------------------------------------------------------------------------------------------------------------

/** An id that is safe in an attribute and in a `#fragment`. */
export const safeId = (s: string): string => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '_') || 'x'

/** A heading as plain text: no emphasis marks, no code ticks, a link is its label. */
export function plainHeading(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface TocEntry { id: string; level: 2 | 3; title: string }

/**
 * The report's own headings (level 2 and 3, as written; the title line and the bold pseudo headings are not part of it) with the id the page gives each:
 * `${prefix}-h${ordinal}`, the ordinal counting those headings in document order. ArticleAnswer numbers its headings the same way. Pure.
 */
export function buildToc(text: string, prefix: string): TocEntry[] {
  const out: TocEntry[] = []
  for (const b of parseDoc(text)) {
    if (b.t !== 'heading' || (b.level !== 2 && b.level !== 3)) continue
    const title = plainHeading(b.text)
    if (title) out.push({ id: `${safeId(prefix)}-h${out.length}`, level: b.level, title })
  }
  return out
}

export interface DocSection { title: string; text: string }
export interface SectionSplit { head: string; sections: DocSection[] }

const H2 = /^ {0,3}##(?!#)[ \t]+\S/
const FENCE = /^\s{0,3}```/

/** head = what comes before the first level-2 heading; one section per level-2 heading (fenced code is not scanned). head + sections joined is the text. Pure. */
export function splitSections(text: string): SectionSplit {
  const lines = String(text ?? '').split('\n')
  const starts: number[] = []
  let fenced = false
  lines.forEach((l, i) => {
    if (FENCE.test(l)) { fenced = !fenced; return }
    if (!fenced && H2.test(l)) starts.push(i)
  })
  if (!starts.length) return { head: text, sections: [] }
  const cut = (a: number, b: number) => lines.slice(a, b).join('\n') + (b < lines.length ? '\n' : '')
  const sections = starts.map((s, k) => {
    const body = cut(s, k + 1 < starts.length ? starts[k + 1] : lines.length)
    return { title: plainHeading(lines[s].replace(/^\s*##\s+/, '').replace(/\s*#*\s*$/, '')), text: body }
  })
  return { head: cut(0, starts[0]), sections }
}

export interface Arrival {
  /** the report's title and scope line: drawn once the first section has begun (they are complete by then) */
  head: string | null
  /** the sections that may be drawn, in order */
  complete: DocSection[]
  /** the section being written now: its title (when its heading line is complete), never its text */
  pending: { title: string | null } | null
}

/**
 * 4.3: what may be drawn of a report that is still arriving. A section is complete when the next one begins (or when the stream is over); the section being
 * written is never drawn, so an unfinished claim is not shown as fact and the page never rearranges what was already shown. Not streaming: everything. Pure.
 */
export function arrivalOf(text: string, streaming: boolean): Arrival {
  const { head, sections } = splitSections(text)
  if (!streaming) return { head, complete: sections, pending: null }
  if (!sections.length) return { head: null, complete: [], pending: null }
  const last = sections[sections.length - 1]
  return { head, complete: sections.slice(0, -1), pending: { title: last.text.includes('\n') ? last.title : null } }
}

/** The indexes of sections that were already drawn and whose text is no longer the same (a section the engine re-sent after checking it again). Pure. */
export function amendedSections(prev: readonly string[], next: readonly string[]): number[] {
  const out: number[] = []
  for (let i = 0; i < Math.min(prev.length, next.length); i++) if (prev[i] !== next[i]) out.push(i)
  return out
}

export interface Footnote { n: number; title: string; site: string; href?: string }

const SOURCE_LINE = /^\s{0,3}(\d{1,3})\.\s+(.+)\s—\s(\S[^—]*)$/

/** The numbered "n. title — site" lines of the text's last section (the list the server builds), with each source's link when `links` knows it (https only). Pure. */
export function footnotesOf(text: string, links: ReadonlyArray<{ id: number; url: string }> = []): Footnote[] {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  let last = -1
  lines.forEach((l, i) => { if (/^\s{0,3}#{1,6}\s/.test(l)) last = i })
  const byId = new Map(links.filter(l => /^https:\/\//i.test(l.url)).map(l => [l.id, l.url]))
  const out: Footnote[] = []
  const tail = lines.slice(last + 1)
  // a source line that lost its " — site" part is still a source of the list (final UAT 19/11: two such lines dropped out of the list, their numbers [9] and [24] stayed in the text, and the text list was drawn a second time) - read loosely when the list is mostly well-formed
  const loose = isMostlySourceLines(tail)
  for (const l of tail) {
    const m = SOURCE_LINE.exec(l)
    if (m) { const n = Number(m[1]); out.push({ n, title: plainHeading(m[2]), site: m[3].trim(), ...(byId.has(n) ? { href: byId.get(n) } : {}) }); continue }
    const lm = loose ? NUMBERED_LINE.exec(l) : null
    if (lm) { const n = Number(lm[1]); out.push({ n, title: plainHeading(lm[2]), site: '', ...(byId.has(n) ? { href: byId.get(n) } : {}) }) }
  }
  return out
}

const NUMBERED_LINE = /^\s{0,3}(\d{1,3})\.\s+(\S.*)$/
/** Two or more non-empty lines, every one numbered "n. ...", at least four fifths of them in the full "n. title — site" shape: the sources list, even with a line or two that lost its site. Pure. */
function isMostlySourceLines(lines: readonly string[]): boolean {
  const body = lines.filter(l => l.trim())
  if (body.length < 2 || !body.every(l => NUMBERED_LINE.test(l))) return false
  return body.filter(l => SOURCE_LINE.test(l)).length >= Math.ceil(body.length * 0.8)
}

/**
 * A section that ENDS with its own small heading and the numbered source lines under it ("### Nguồn tham khảo" + "1. title — site"…): the section's text without that heading and those lines, so the
 * canvas can draw the list itself, each source a link. Null when the section does not end that way. Pure.
 */
export function withoutTrailingSources(sectionText: string): string | null {
  const lines = String(sectionText ?? '').replace(/\r\n?/g, '\n').split('\n')
  let last = -1
  lines.forEach((l, i) => { if (/^\s{0,3}#{1,6}\s/.test(l)) last = i })
  if (last <= 0) return null
  const tail = lines.slice(last + 1).filter(l => l.trim())
  if (!isMostlySourceLines(tail)) return null
  return lines.slice(0, last).join('\n').replace(/\s+$/, '') + '\n'
}

/** Is this whole section the sources list (two or more numbered "n. title — site" lines and nothing else but its heading)? Pure. */
export function isSourcesSection(sectionText: string): boolean {
  return isMostlySourceLines(sectionText.split('\n').filter(l => !/^\s{0,3}#{1,6}\s/.test(l)))
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * In the formatted HTML of a paragraph, turn each "[n]" that names a known source into a small linked mark pointing at that source's line in the list.
 * Text between tags only (never inside a tag or inside a link); a number that is not a source stays as written. Pure.
 */
export function linkCitations(html: string, prefix: string, known: ReadonlyMap<number, string>, linked = true): string {
  if (!known.size || !html.includes('[')) return html
  return html.replace(/(<a\b[^>]*>[\s\S]*?<\/a>)|(<[^>]*>)|\[(\d{1,3})\]/g, (m, anchor: string | undefined, tag: string | undefined, d: string | undefined) => {
    if (anchor || tag || d === undefined) return m
    const n = Number(d)
    const name = known.get(n)
    // a mark that names no source of the list that has arrived is dropped (it pointed at nothing: "[9]" in the text, no 9 in the list); while the list is still being written it stays as written
    if (name === undefined) return linked ? '' : m
    // the list the mark points at has not arrived yet (a report still being written): the mark is drawn, not linked
    if (!linked) return `<span class="tappy-cite">${n}</span>`
    return `<a href="#${safeId(prefix)}-fn${n}" data-cite="${n}" class="tappy-cite" title="${escAttr(name)}">${n}</a>`
  })
}

/** The id of source n's line in the list. */
export const footnoteId = (prefix: string, n: number): string => `${safeId(prefix)}-fn${n}`
/** The id of a section's wrapper. */
export const sectionId = (prefix: string, index: number): string => `${safeId(prefix)}-s${index}`

/** The text without its first level-1 line (the cover shows the title); anything else is untouched. Pure. */
export function stripTitleLine(head: string): string {
  const lines = head.split('\n')
  const i = lines.findIndex(l => /^ {0,3}#(?!#)\s+\S/.test(l))
  if (i < 0) return head
  lines.splice(i, 1)
  return lines.join('\n').replace(/^\n+/, '')
}
