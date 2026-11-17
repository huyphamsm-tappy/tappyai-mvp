import { createHash } from 'node:crypto'
import { normalizeVN } from '@/lib/ai/intent'

// Scam Shield · weekly sync — deterministic extraction (pure: HTML string in, plain data out).
//
// The Ministry's site (bocongan.gov.vn, a Nuxt app that is server-rendered) exposes two page shapes this module reads:
//
//   LISTING  /chuyen-muc/canh-bao-toi-pham-1750063351  ("Cảnh báo tội phạm")
//            <article class="card-large …"> <a href="/bai-viet/<slug>-<id>"> <h2>title</h2> </a> <p>lead</p> <span>dd/mm/yyyy</span> </article>
//   ARTICLE  /bai-viet/<slug>-<id>
//            <h1>title</h1> <p>lead</p> <p …gray-400>dd/mm/yyyy</p> <div class="tinymce-content"> <p>…</p> … </div>
//            plus <meta name="description">, <meta property="og:title"> and a NewsArticle JSON-LD with datePublished.
//
// Nothing here calls a model or the network. The official text (title, lead, paragraphs) is kept verbatim: entities are decoded and
// whitespace collapsed, nothing is paraphrased. Fixtures captured from the real pages live in ./__fixtures__ and are pinned by extract.test.ts.

export interface ListingItem {
  url: string
  title: string
  lead: string
  /** ISO date (YYYY-MM-DD) from the card's dd/mm/yyyy, or null when the card has none. */
  publishedAt: string | null
}

export interface ParsedArticle {
  url: string
  title: string
  lead: string
  /** ISO date (YYYY-MM-DD) or null. */
  publishedAt: string | null
  author: string | null
  /** The article body, one entry per paragraph / list item, verbatim. */
  paragraphs: string[]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g: string) => {
    if (g[0] === '#') {
      const code = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[g.toLowerCase()] ?? m
  })
}

/** Tags out, entities decoded, whitespace collapsed. */
export function textOf(html: string): string {
  return decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** dd/mm/yyyy → YYYY-MM-DD (validated: 31/02 is refused). */
export function isoFromVnDate(s: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(decodeEntities(href), base)
    u.hash = ''
    return u.toString()
  } catch { return null }
}

/** Cards of a category listing. Only /bai-viet/ links on the same host are kept; duplicates (the page links a card twice) collapse. */
export function parseListing(html: string, listingUrl: string): ListingItem[] {
  const out: ListingItem[] = []
  const seen = new Set<string>()
  const baseHost = new URL(listingUrl).host
  for (const m of html.matchAll(/<article\b[\s\S]*?<\/article>/gi)) {
    const card = m[0]
    const href = /<a\b[^>]*\bhref="([^"]*\/bai-viet\/[^"]+)"/i.exec(card)?.[1]
    if (!href) continue
    const url = absolute(href, listingUrl)
    if (!url || new URL(url).host !== baseHost || seen.has(url)) continue
    const title = textOf(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(card)?.[1] ?? '')
    if (!title) continue
    const lead = textOf(/<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(card)?.[1] ?? '')
    const date = /<span\b[^>]*>\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*<\/span>/i.exec(card)?.[1]
    seen.add(url)
    out.push({ url, title, lead, publishedAt: date ? isoFromVnDate(date) : null })
  }
  return out
}

/** The inner HTML of the first `<div class="…tinymce-content…">`, found by counting nested divs. */
function articleBodyHtml(html: string): string | null {
  const open = /<div\b[^>]*class="[^"]*\btinymce-content\b[^"]*"[^>]*>/i.exec(html)
  if (!open) return null
  const start = open.index + open[0].length
  let depth = 1
  const re = /<(\/?)div\b[^>]*>/gi
  re.lastIndex = start
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return html.slice(start, m.index)
  }
  return html.slice(start)
}

function metaContent(html: string, attr: 'name' | 'property', key: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*\\b${attr}="${key}"[^>]*\\bcontent="([^"]*)"|<meta\\b[^>]*\\bcontent="([^"]*)"[^>]*\\b${attr}="${key}"`, 'i')
  const m = re.exec(html)
  const v = m?.[1] ?? m?.[2]
  return v ? textOf(v) : null
}

function jsonLdDate(html: string): string | null {
  for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const o = JSON.parse(m[1]) as { datePublished?: unknown }
      if (typeof o.datePublished === 'string' && /^\d{4}-\d{2}-\d{2}/.test(o.datePublished)) return o.datePublished.slice(0, 10)
    } catch { /* not JSON we understand */ }
  }
  return null
}

/** One article page. Fields the page does not carry come back empty / null — `isCompleteArticle` decides whether that matters. */
export function parseArticle(html: string, url: string): ParsedArticle {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]
  const title = textOf(h1 ?? '') || metaContent(html, 'property', 'og:title') || ''
  const lead = metaContent(html, 'name', 'description') ?? ''
  // The visible date line first (what a reader sees), the JSON-LD datePublished as the fallback.
  const visible = /<p\b[^>]*>\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*<\/p>/i.exec(html)?.[1]
  const publishedAt = (visible ? isoFromVnDate(visible) : null) ?? jsonLdDate(html)
  const body = articleBodyHtml(html)
  const paragraphs: string[] = []
  if (body) {
    for (const m of body.matchAll(/<(p|li|h[2-4])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const t = textOf(m[2])
      if (t) paragraphs.push(t)
    }
  }
  return { url, title, lead, publishedAt, author: metaContent(html, 'name', 'author'), paragraphs }
}

/** Minimum for a record to be called complete: a title, a real date, and enough body to be an article and not a stub. */
export const MIN_BODY_PARAGRAPHS = 2
export const MIN_BODY_CHARS = 200

export function isCompleteArticle(a: ParsedArticle): boolean {
  return !!a.title && !!a.publishedAt && a.paragraphs.length >= MIN_BODY_PARAGRAPHS && a.paragraphs.join(' ').length >= MIN_BODY_CHARS
}

/**
 * The category "Cảnh báo tội phạm" mixes scam warnings with crime news (prosecutions, thefts, ceremonies). Only an item whose own title or lead
 * names a scam shape is read further — one request per relevant article, none for the rest.
 */
const SCAM_WORDS = /\b(lua dao|gia mao|mao danh|gia danh|thu doan|chiem doat tai san|deepfake|gia nguoi than|tin nhan gia|cuoc goi gia)\b/
export function isScamWarning(item: { title: string; lead?: string }): boolean {
  const t = normalizeVN(`${item.title} ${item.lead ?? ''}`.toLowerCase())
  return SCAM_WORDS.test(t)
}

/** Stable fingerprint of what the reader would see: unchanged page, unchanged hash. */
export function contentHash(a: Pick<ParsedArticle, 'title' | 'publishedAt' | 'paragraphs'>): string {
  return createHash('sha256').update([a.title, a.publishedAt ?? '', ...a.paragraphs].join('\n')).digest('hex')
}
