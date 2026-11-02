// ── Phase 8 M3 — bounded page extraction (pure, no DOM library, never throws) ────────────────────────────────────────────────
//
// Turns a fetched page into the few things research needs, capped: canonical URL, title, site name, description, publish date,
// headings, structured facts from JSON-LD (Product / Offer / AggregateRating / LocalBusiness / Event…), and the passages most
// relevant to what the agent is looking for. The whole page never reaches the model.
//
// All of it is UNTRUSTED: text is stripped of markup, instruction-like sentences are removed (guards.isInstructionLike — "ignore all
// previous instructions…" in visible text, meta tags, JSON-LD or link text is DATA and never survives as an instruction), URLs in free
// text are dropped, and everything is size-capped. Relevance ranking of passages is plain term overlap (retrieval, not judgement).

import { isInstructionLike } from '../guards'

export type ExtractionStatus = 'ok' | 'thin' | 'empty' | 'not_html'

export interface StructuredFact { type: string; name?: string; brand?: string; price?: string; currency?: string; availability?: string; rating?: number; ratingCount?: number; openingHours?: string; address?: string; telephone?: string; startDate?: string; description?: string }

export interface PageDoc {
  url: string
  canonicalUrl: string
  host: string
  title: string
  siteName: string
  description: string
  publishedAt: string | null
  lang: string | null
  headings: string[]
  structured: StructuredFact[]
  passages: string[]
  /** Characters of readable text found (before selection). */
  textChars: number
  status: ExtractionStatus
  /** Instruction-like sentences dropped from this page (prompt-injection attempts). */
  injectionDropped: number
}

export const EXTRACT_CAPS = { title: 200, description: 300, headings: 12, heading: 140, passages: 8, passage: 420, passagesTotal: 2_600, structured: 6 } as const

/**
 * TAPPY_ANSWER_V4 lookup part 1 (owner 19/10 night): the STRUCTURE-PRESERVING reader. Measured on the V4 UAT round: on the vexere train page the
 * reader kept 2,378 of 255,759 characters and not one departure time — the timetable is an HTML table whose cells hold <div>s, every </div>
 * became a line break, the row "SE10 | 08:59 | Ga Đà Nẵng | 92.000đ" fell apart into word-poor fragments and none of them was ranked; and a
 * <script> the 800 KB fetch cap cut open leaked its JSON as a "passage". Here a table stays ONE block (one row per line, cells joined by " | ",
 * under the heading that introduces it), a list stays one block (one item per line), an unclosed script/style is dropped, and blocks are
 * ranked by overlap with what the agent is looking for PLUS their density of concrete facts (clock times, amounts, percentages, dates,
 * numbers with units) — signals that do not depend on the page's language. Caps below are per page.
 */
export const BLOCK_CAPS = { blocks: 14, total: 7_000, paragraph: 700, table: 3_500, tableRows: 60, list: 2_500, listItems: 40, cell: 120 } as const

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', copy: '©', reg: '®' }
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ' }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const URL_IN_TEXT = /https?:\/\/\S+|\bwww\.\S+/gi

/** Text safe to show the model: entities decoded, URLs and control chars removed, whitespace collapsed, instruction-like sentences dropped. */
function cleanText(s: string, stats: { dropped: number }): string {
  const t = squash(decodeEntities(s).replace(URL_IN_TEXT, ' ').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' '))
  if (!t) return ''
  if (!isInstructionLike(t)) return t
  const kept = t.split(/(?<=[.!?…])\s+/).filter(x => { const bad = isInstructionLike(x); if (bad) stats.dropped++; return !bad })
  return squash(kept.join(' '))
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null
}

function meta(html: string, keys: string[]): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const k = (attr(tag, 'property') ?? attr(tag, 'name') ?? attr(tag, 'itemprop') ?? '').toLowerCase()
    if (keys.includes(k)) { const c = attr(tag, 'content'); if (c) return c }
  }
  return ''
}

function absolute(href: string | null, base: string): string | null {
  if (!href) return null
  try { const u = new URL(decodeEntities(href), base); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null } catch { return null }
}

const num = (v: unknown): number | undefined => { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN; return Number.isFinite(n) ? n : undefined }
const str = (v: unknown, max = 160): string | undefined => typeof v === 'string' && v.trim() ? squash(decodeEntities(v)).slice(0, max) : typeof v === 'number' ? String(v) : undefined

/** JSON-LD blocks → a few structured facts (types we can use as evidence). Malformed JSON is skipped. */
export function structuredFacts(html: string, stats: { dropped: number }): StructuredFact[] {
  const out: StructuredFact[] = []
  const visit = (n: unknown, depth: number) => {
    if (!n || typeof n !== 'object' || depth > 5 || out.length >= EXTRACT_CAPS.structured) return
    if (Array.isArray(n)) { for (const x of n) visit(x, depth + 1); return }
    const o = n as Record<string, unknown>
    if (Array.isArray(o['@graph'])) visit(o['@graph'], depth + 1)
    const type = ([] as unknown[]).concat(o['@type'] ?? []).map(String).join(',')
    if (/Product|Offer|LocalBusiness|Restaurant|Store|Hotel|TouristAttraction|Event|Organization|Place|MedicalBusiness|LodgingBusiness|FoodEstablishment/i.test(type)) {
      const offers = ([] as unknown[]).concat(o.offers ?? [])[0] as Record<string, unknown> | undefined
      const rating = o.aggregateRating as Record<string, unknown> | undefined
      const address = o.address as Record<string, unknown> | string | undefined
      const brand = o.brand as Record<string, unknown> | string | undefined
      const f: StructuredFact = { type: type.slice(0, 60) }
      const name = str(o.name, 140); if (name && !isInstructionLike(name)) f.name = name
      const b = typeof brand === 'string' ? str(brand) : str(brand?.name); if (b) f.brand = b
      const price = str(offers?.price ?? offers?.lowPrice, 40); if (price) f.price = price
      const cur = str(offers?.priceCurrency, 8); if (cur) f.currency = cur
      const av = str(offers?.availability, 60); if (av) f.availability = av.replace(/^https?:\/\/schema\.org\//i, '')
      const rv = num(rating?.ratingValue); if (rv !== undefined) f.rating = rv
      const rc = num(rating?.reviewCount ?? rating?.ratingCount); if (rc !== undefined) f.ratingCount = rc
      const oh = Array.isArray(o.openingHours) ? o.openingHours.map(String).join('; ') : str(o.openingHours, 200); if (oh) f.openingHours = oh.slice(0, 200)
      const ad = typeof address === 'string' ? str(address, 200) : address ? str([address.streetAddress, address.addressLocality, address.addressRegion].filter(Boolean).join(', '), 200) : undefined; if (ad) f.address = ad
      const tel = str(o.telephone, 40); if (tel) f.telephone = tel
      const sd = str(o.startDate, 40); if (sd) f.startDate = sd
      const d = str(o.description, 240); if (d) { const c = cleanText(d, stats); if (c) f.description = c }
      if (Object.keys(f).length > 1) out.push(f)
    }
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1].trim()), 0) } catch { /* malformed JSON-LD: skipped */ }
  }
  return out
}

/** Readable text of the page body, block-separated (paragraph boundaries become newlines). */
export function readableText(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, ' ')
  h = h.replace(/<(script|style|noscript|svg|template|iframe|canvas|object|head|nav|footer|form|button|select)\b[\s\S]*?<\/\1\s*>/gi, ' ')
  const main = /<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(h)
  const scope = main && main[2].replace(/<[^>]+>/g, '').trim().length > 400 ? main[2] : (/<body\b[^>]*>([\s\S]*)/i.exec(h)?.[1] ?? h)
  return scope
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|section|article|h[1-6]|dd|dt|blockquote|figcaption|table|ul|ol)\s*>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
}

// ── TAPPY_ANSWER_V4 · the structure-preserving reader (see BLOCK_CAPS) ─────────────────────────────────────────────────────────────

export interface PageBlock { kind: 'paragraph' | 'table' | 'list'; text: string; pos: number }

const BLOCK_MARK = /^§§B(\d+)§§$/
/** Text of an HTML fragment as ONE line: every tag is a space (a cell's inner <div>s no longer split it). */
const fragText = (s: string, stats: { dropped: number }) => cleanText(s.replace(/<[^>]+>/g, ' '), stats)

/** The last heading (h1–h4) or table caption before `at` in `h` — what introduces a table / list. */
function headingBefore(h: string, at: number, stats: { dropped: number }): string {
  const before = h.slice(Math.max(0, at - 4_000), at)
  const hs = [...before.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)]
  return hs.length ? fragText(hs[hs.length - 1][2], stats).slice(0, EXTRACT_CAPS.heading) : ''
}

/**
 * The page body as blocks, in page order: tables (one row per line, cells " | "), lists (one item per line) and paragraphs. Scripts and
 * styles are removed whether or not the fetch cap cut them open; comments too. Pure, never throws (the caller catches).
 */
export function structuredBlocks(html: string, stats: { dropped: number }, o: { v5?: boolean } = {}): PageBlock[] {
  let h = html.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
  // a <script>/<style> the fetch cap cut open runs to the end of the input: dropped all the same (measured: __NEXT_DATA__ JSON leaked)
  h = h.replace(SCRIPT_BODIES, ' ')
  // A <form> is NOT dropped whole: ASP.NET pages wrap the entire body in one (measured: giotaugiave.dsvn.vn, vanban.chinhphu.vn read as empty).
  // Its controls with text (buttons, selects, text areas) go; an <input> carries no text once tags are stripped; its content stays.
  h = h.replace(/<(svg|iframe|canvas|object|head|nav|footer|button|select|textarea)\b[\s\S]*?<\/\1\s*>/gi, ' ')
  h = o.v5 ? contentScope(h) : (() => {
    const main = /<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(h)
    return main && main[2].replace(/<[^>]+>/g, '').trim().length > 400 ? main[2] : (/<body\b[^>]*>([\s\S]*)/i.exec(h)?.[1] ?? h)
  })()
  const blocks: PageBlock[] = []
  const put = (b: Omit<PageBlock, 'pos'>): string => { blocks.push({ ...b, pos: blocks.length }); return `\n§§B${blocks.length - 1}§§\n` }
  // innermost tables first (a layout table holding a data table is unwrapped after its inner one became a block)
  for (let guard = 0; guard < 60; guard++) {
    const m = /<table\b[^>]*>((?:(?!<table\b)[\s\S])*?)<\/table\s*>/i.exec(h)
    if (!m) break
    const caption = fragText(/<caption\b[^>]*>([\s\S]*?)<\/caption\s*>/i.exec(m[1])?.[1] ?? '', stats)
    const head = caption || headingBefore(h, m.index, stats)
    const rows = m[1].split(/<tr\b[^>]*>/i).slice(1).map(seg => [...seg.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)(?=<t[dh]\b|<\/tr\s*>|$)/gi)].map(c => fragText(c[1], stats).slice(0, BLOCK_CAPS.cell)).filter(Boolean)).filter(r => r.length > 0)
    const isData = rows.some(r => r.length >= 2)
    const text = isData
      ? [head ? `## ${head}` : '', ...rows.slice(0, BLOCK_CAPS.tableRows).map(r => r.join(' | '))].filter(Boolean).join('\n').slice(0, BLOCK_CAPS.table)
      : ''
    h = h.slice(0, m.index) + (text ? put({ kind: 'table', text }) : ` ${rows.flat().join(' ')} `) + h.slice(m.index + m[0].length)
  }
  for (let guard = 0; guard < 200; guard++) {
    const m = /<(ul|ol)\b[^>]*>((?:(?!<(?:ul|ol)\b)[\s\S])*?)<\/\1\s*>/i.exec(h)
    if (!m) break
    const items = m[2].split(/<li\b[^>]*>/i).slice(1).map(seg => fragText(seg, stats)).filter(Boolean)
    const head = headingBefore(h, m.index, stats)
    const text = items.length >= 2
      ? [head ? `## ${head}` : '', ...items.slice(0, BLOCK_CAPS.listItems).map(t => `- ${t.slice(0, 300)}`)].filter(Boolean).join('\n').slice(0, BLOCK_CAPS.list)
      : ''
    h = h.slice(0, m.index) + (text ? put({ kind: 'list', text }) : `\n${items.join(' ')}\n`) + h.slice(m.index + m[0].length)
  }
  const lines = h
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|section|article|h[1-6]|dd|dt|blockquote|figcaption|table|ul|ol)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\n+/)
  const out: PageBlock[] = []
  // RETRIEVAL_V5: a run of SHORT lines (a product card, a contact box, a price / hours panel — one field per <div>) becomes ONE block, its
  // lines joined by " · " (measured 20/10: "2.290.000đ", "Email · sqvnberlin@t-online.de" were single short lines, dropped one by one).
  let run: string[] = []
  const flush = () => {
    const t = run.join(' · ')
    if (run.length && (t.length >= 40 || (/[\d@]/.test(t) && t.length >= 8))) out.push({ kind: 'paragraph', text: t.slice(0, BLOCK_CAPS.paragraph), pos: out.length })
    run = []
  }
  for (const raw of lines) {
    const mark = BLOCK_MARK.exec(raw.trim())
    if (mark) { if (o.v5) flush(); const b = blocks[Number(mark[1])]; if (b) out.push({ ...b, pos: out.length }); continue }
    const p = cleanText(raw, stats)
    if (o.v5 && p) {
      if (p.length < V5_SHORT_LINE) { if (run.join(' · ').length + p.length + 3 > BLOCK_CAPS.paragraph) flush(); run.push(p); continue }
      flush()
    }
    if (p.length >= 40 || (/\d/.test(p) && p.length >= 15)) out.push({ kind: 'paragraph', text: p.slice(0, BLOCK_CAPS.paragraph), pos: out.length })
  }
  flush()
  return out
}

/** RETRIEVAL_V5: a line shorter than this is a field of a card / panel, joined with its neighbours (structuredBlocks). */
export const V5_SHORT_LINE = 80

/** Script / style / template bodies, including one the fetch cap cut open (it runs to the end of the input). */
const SCRIPT_BODIES = /<(script|style|noscript|template)\b[\s\S]*?(?:<\/\1\s*>|$)/gi

/**
 * RETRIEVAL_V5: the part of the page that holds its content. <main> when it holds text; ONE <article> when the page has only one (a story);
 * otherwise the whole body — measured 20/10: pasgo.vn restaurant pages are 15 <article> sections (info, price list, rules, hours…) and the
 * first-article rule kept only the first one (≈ 100 of 30,000 characters). Pure.
 */
export function contentScope(h: string): string {
  const visible = (s: string) => s.replace(/<[^>]+>/g, '').trim().length
  const main = /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(h)
  if (main && visible(main[1]) > 400) return main[1]
  const articles = [...h.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)]
  if (articles.length === 1 && visible(articles[0][1]) > 400) return articles[0][1]
  return /<body\b[^>]*>([\s\S]*)/i.exec(h)?.[1] ?? h
}

/** Concrete facts in a text, any language: clock times, dates, numbers (with or without a unit or currency sign). */
const factCount = (s: string): number => (s.match(/\d{1,2}[:h]\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d[\d.,]*\d|\d/g) ?? []).length
/** Words of a text in any script (letters / digits runs, accents folded for Latin). */
const termsAny = (s: string) => [...new Set(fold(s).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2 && !STOP.has(w)))]

/**
 * The blocks most worth handing the model: overlap with the focus, plus their density of concrete facts (a timetable, a price list or a
 * spec table answers "when / how much / how big" even when it repeats none of the question's words), plus a bonus for a whole table or
 * list that carries facts. Capped in count and total length; page order kept. Junk-looking text (code / JSON) never ranks.
 */
export function pickBlocks(blocks: readonly PageBlock[], focus?: string, o: { v5?: boolean } = {}): string[] {
  const q = termsAny(focus ?? '')
  const seen = new Set<string>()
  // RETRIEVAL_V5: the colon of a clock time ("08:59") is not a code sign (a joined run of departure times is a timetable, not JSON)
  const junk = (t: string) => ((o.v5 ? t.replace(/\d:\d/g, '') : t).match(/[{}[\]":\\]/g) ?? []).length > t.length * 0.08
  const scored = blocks.filter(b => !junk(b.text)).map(b => {
    const words = new Set(termsAny(b.text))
    const hits = q.filter(w => words.has(w)).length
    const facts = Math.min(factCount(b.text), 24)
    const whole = b.kind !== 'paragraph' && facts >= 3 ? 1.5 : 0
    return { b, s: hits + facts * 0.2 + whole - b.pos * 0.0005 }
  }).filter(x => { const k = fold(x.b.text).slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true })
  const best = [...scored].sort((a, b) => b.s - a.s)
  const pick: typeof best = []
  let total = 0
  for (const x of best) {
    if (pick.length >= BLOCK_CAPS.blocks || total + x.b.text.length > BLOCK_CAPS.total) continue
    pick.push(x); total += x.b.text.length
  }
  return pick.sort((a, b) => a.b.pos - b.b.pos).map(x => x.b.text)
}

/**
 * Extracts a bounded document. `focus` = what the agent is looking for (its own words): passages are ranked by overlap with it, then by
 * position. `structured` (TAPPY_ANSWER_V4): tables and lists are kept whole and ranked with their fact density (pickBlocks). Never throws.
 */
export function extractPage(html: string, o: { url: string; contentType: string; focus?: string; structured?: boolean; v5?: boolean }): PageDoc {
  const stats = { dropped: 0 }
  let host = ''
  try { host = new URL(o.url).hostname.replace(/^www\./, '') } catch { /* invalid url: empty host */ }
  const empty: PageDoc = { url: o.url, canonicalUrl: o.url, host, title: '', siteName: '', description: '', publishedAt: null, lang: null, headings: [], structured: [], passages: [], textChars: 0, status: 'empty', injectionDropped: 0 }
  try {
    if (/json/i.test(o.contentType) && !/html/i.test(o.contentType)) {
      const text = cleanText(html.slice(0, 20_000), stats)
      return { ...empty, status: text ? 'not_html' : 'empty', passages: text ? [text.slice(0, EXTRACT_CAPS.passage * 3)] : [], textChars: text.length, injectionDropped: stats.dropped }
    }
    if (/text\/plain/i.test(o.contentType)) {
      const paras = html.slice(0, 200_000).split(/\n\s*\n/).map(p => cleanText(p, stats)).filter(p => p.length > 30)
      return { ...empty, status: paras.length ? 'ok' : 'empty', passages: pickPassages(paras, o.focus), textChars: paras.join(' ').length, injectionDropped: stats.dropped }
    }
    // RETRIEVAL_V5: script / style bodies go BEFORE the text cap (a 2 MB page of inline scripts kept its text past 1.5 MB); JSON-LD is read
    // from the page as fetched, first
    const v5 = o.v5 === true && o.structured === true
    const src = v5 ? html.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ').replace(SCRIPT_BODIES, m => (/application\/ld\+json/i.test(m.slice(0, 200)) ? m : ' ')).slice(0, 1_500_000) : html.slice(0, 1_500_000)
    const head = /<head\b[\s\S]*?<\/head>/i.exec(src)?.[0] ?? src.slice(0, 20_000)
    const title = cleanText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? meta(head, ['og:title', 'twitter:title']), stats).slice(0, EXTRACT_CAPS.title)
    const canonicalTag = (head.match(/<link\b[^>]*>/gi) ?? []).find(t => /\brel\s*=\s*["']?canonical/i.test(t))
    // WS2: the page's self-declared canonical / og:url is accepted only on the host it was FETCHED from. A cross-host declaration is
    // untrusted page data (measured: a hoianheritage.danang.gov.vn page declaring hoianheritage.net was typed `other`; any page could
    // declare apple.com and be typed `official`, or plant a URL into the task's evidence for a later read).
    const declared = absolute(canonicalTag ? attr(canonicalTag, 'href') : null, o.url) ?? absolute(meta(head, ['og:url']), o.url)
    const canonicalUrl = declared && sameHost(declared, o.url) ? declared : o.url
    const siteName = cleanText(meta(head, ['og:site_name', 'application-name']), stats).slice(0, 80)
    const description = cleanText(meta(head, ['description', 'og:description', 'twitter:description']), stats).slice(0, EXTRACT_CAPS.description)
    const publishedAt = meta(head, ['article:published_time', 'article:modified_time', 'og:updated_time', 'date', 'pubdate']).slice(0, 40) || null
    const lang = attr(/<html\b[^>]*>/i.exec(src)?.[0] ?? '', 'lang')?.slice(0, 12) ?? null
    const headings = [...src.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map(m => cleanText(m[2].replace(/<[^>]+>/g, ' '), stats).slice(0, EXTRACT_CAPS.heading)).filter(h => h.length > 1)
    const uniqHeadings = [...new Set(headings)].slice(0, EXTRACT_CAPS.headings)
    const structured = structuredFacts(src, stats)
    if (o.structured) {
      const blocks = structuredBlocks(src, stats, { v5 })
      const textChars = blocks.reduce((n, b) => n + b.text.length, 0)
      const passages = pickBlocks(blocks, [o.focus, title].filter(Boolean).join(' '), { v5 })
      const status: ExtractionStatus = textChars === 0 && structured.length === 0 ? 'empty' : textChars < 300 && structured.length === 0 ? 'thin' : 'ok'
      return { url: o.url, canonicalUrl, host, title, siteName, description, publishedAt, lang, headings: uniqHeadings, structured, passages, textChars, status, injectionDropped: stats.dropped }
    }
    const paras = readableText(src).split(/\n+/).map(p => cleanText(p, stats)).filter(p => p.length >= 40 || /\d/.test(p) && p.length >= 15)
    const textChars = paras.reduce((n, p) => n + p.length, 0)
    const passages = pickPassages(paras, [o.focus, title].filter(Boolean).join(' '))
    const status: ExtractionStatus = textChars === 0 && structured.length === 0 ? 'empty' : textChars < 300 && structured.length === 0 ? 'thin' : 'ok'
    return { url: o.url, canonicalUrl, host, title, siteName, description, publishedAt, lang, headings: uniqHeadings, structured, passages, textChars, status, injectionDropped: stats.dropped }
  } catch {
    return empty
  }
}

const STOP = new Set(['va', 'cua', 'cho', 'la', 'co', 'khong', 'the', 'nao', 'bao', 'nhieu', 'gi', 'mot', 'nhung', 'cac', 'voi', 'trong', 'duoc', 've', 'theo', 'and', 'the', 'of', 'to', 'for', 'is', 'in', 'on', 'a', 'an', 'how', 'what'])
const terms = (s: string) => [...new Set(fold(s).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !STOP.has(w)))]

const sameHost = (a: string, b: string): boolean => { try { return new URL(a).hostname.replace(/^www\./, '').toLowerCase() === new URL(b).hostname.replace(/^www\./, '').toLowerCase() } catch { return false } }

/** The most relevant passages (term overlap with the focus, ties by position), capped in count and total length; original order kept. */
export function pickPassages(paras: readonly string[], focus?: string): string[] {
  const q = terms(focus ?? '')
  const seen = new Set<string>()
  const scored = paras.map((p, i) => {
    const t = new Set(terms(p))
    const hits = q.filter(w => t.has(w)).length
    const digits = /\d/.test(p) ? 0.3 : 0
    return { p: p.slice(0, EXTRACT_CAPS.passage), i, s: hits + digits - i * 0.001 }
  }).filter(x => { const k = fold(x.p).slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true })
  // Ranked, not filtered: a passage without the focus words can still be the answer ("Up to 6 hours…" under a "Battery" heading).
  const best = [...scored].sort((a, b) => b.s - a.s)
  const pick: typeof best = []
  let total = 0
  for (const x of best) {
    if (pick.length >= EXTRACT_CAPS.passages || total + x.p.length > EXTRACT_CAPS.passagesTotal) continue
    pick.push(x); total += x.p.length
  }
  return pick.sort((a, b) => a.i - b.i).map(x => x.p)
}
