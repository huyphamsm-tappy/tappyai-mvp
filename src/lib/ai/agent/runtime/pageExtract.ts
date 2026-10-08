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

/**
 * Extracts a bounded document. `focus` = what the agent is looking for (its own words): passages are ranked by overlap with it, then by
 * position. Never throws.
 */
export function extractPage(html: string, o: { url: string; contentType: string; focus?: string }): PageDoc {
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
    const src = html.slice(0, 1_500_000)
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
