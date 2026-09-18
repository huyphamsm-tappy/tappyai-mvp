// ── VnExpress Travel — a LIMITED, query-time editorial supplement ────────────
//
// Audit (2026-09-15, read-only) of vnexpress.net/du-lich decided what this is
// and, just as firmly, what it is not:
//
//   · It is an ADDITIVE evidence source for TRAVEL turns: destination
//     character, what to do / eat / when to go, travel advice, and — within a
//     short window — tourism incidents. Attached to the tool result the model
//     already reads, in the same reasoning pass. No second pipeline, no extra
//     model call, no summariser.
//   · It never authors a current fact. Prices, fees, schedules, availability,
//     hours, weather, visa rules stay with the live providers; every item here
//     is classified REVIEW_SUPPORTED (`evidenceProvenance`), so the guards that
//     redact unsupported dynamic claims (travelGuard, snippetPriceGuard,
//     planPriceGuard) keep working — they read structured fields, and this
//     payload carries none.
//   · Source policy, exactly as the publisher's robots.txt draws it: no
//     crawling, no sitemap, no archive ingestion. The syndicated RSS, one or
//     two on-site search pages (the second only for cẩm nang / ăn gì), then at
//     most THREE article fetches — six publisher requests at the very most.
//     Nothing is persisted: the in-process tool cache holds parsed metadata and
//     a ≤1,500-char extract for the TTLs below and nothing reaches Postgres.
//
// Freshness (from the audit): JSON-LD `dateModified` is the update signal —
// the `lastmod` meta was stale on updated guides. Tourism NEWS is evidence for
// ≤14 days; editorial knowledge for ≤3 years, always dated when cited.

import { getCache, setCache, serperSearch } from './common'
import { cacheKeyPart } from './cacheKeys'
import { normalizeVN } from '@/lib/ai/intent'
import { cityForName, cityInText, type VietnamCity } from './vietnamCities'
import { classifyEvidence, type EvidenceType } from '@/lib/ai/consultative/evidenceProvenance'

// ── Contract ──────────────────────────────────────────────────────────────────

export type EditorialIntent = 'cam_nang' | 'kinh_nghiem' | 'an_gi' | 'choi_dau' | 'general'
export type FreshnessClass = 'stable' | 'time_sensitive' | 'historical'

export interface TravelEditorialItem {
  source: 'VnExpress'
  article_id: string
  title: string
  url: string
  publishedAt: string
  modifiedAt: string | null
  /** The publisher's own taxonomy path below "Du lịch", e.g. "Điểm đến > Việt Nam > Đà Lạt". */
  section: string
  /** The syndicated one-line description (RSS / OG). */
  summary: string
  /** ≤ EXTRACT_MAX_CHARS of the body, the paragraphs closest to the intent first. */
  extract: string
  freshness: FreshnessClass
  provenance: EvidenceType
  /** The one sentence the prompt asks the model to attach — "(MM/YYYY)" of the newest date. */
  dated: string
}

export interface TravelEditorialResult {
  travel_editorial: TravelEditorialItem[]
}

export const MAX_ARTICLES = 3
export const EXTRACT_MAX_CHARS = 1500
export const TOTAL_BUDGET_MS = 4000
export const RSS_TTL_MS = 15 * 60 * 1000
export const SEARCH_TTL_MS = 15 * 60 * 1000
export const ARTICLE_TTL_MS = 24 * 60 * 60 * 1000
/** Tourism news is timely evidence for this long; older news is not current. */
export const TIME_SENSITIVE_WINDOW_DAYS = 14
/** Destination / advice / food editorial stays usable, dated, for this long. */
export const STABLE_WINDOW_DAYS = 3 * 365

const RSS_URL = 'https://vnexpress.net/rss/du-lich.rss'
const SEARCH_URL = 'https://timkiem.vnexpress.net/'
const HOST = 'vnexpress.net'
/** The identity the app already uses for the publisher's RSS (see getNews in food.ts). */
const USER_AGENT = 'TappyAI/1.0 (huypham.sm@gmail.com)'
/** Article URLs are `<slug>-<7-digit id>.html` on the apex host — the one shape we fetch. */
const ARTICLE_URL_RE = /^https:\/\/vnexpress\.net\/[a-z0-9-]+-(\d{7})\.html$/

export const EDITORIAL_SOURCE = 'VnExpress' as const

// ── Destination ───────────────────────────────────────────────────────────────

/**
 * The city table's canonical strings are geocoder queries ("Thua Thien Hue",
 * "Hong Gai", "Ho Chi Minh City") — not what a travel desk writes. This maps
 * each known city to the term the on-site search is asked for and the folded
 * spellings a headline may use for it. Only these destinations activate the
 * supplement; an unknown place yields nothing rather than a guess.
 */
const DESTINATIONS: Record<string, { term: string; aliases: string[] }> = {
  'Ha Noi, Vietnam': { term: 'Hà Nội', aliases: ['ha noi', 'hanoi'] },
  'Ho Chi Minh City, Vietnam': { term: 'TP HCM', aliases: ['tp hcm', 'tphcm', 'ho chi minh', 'sai gon', 'saigon'] },
  'Da Nang, Vietnam': { term: 'Đà Nẵng', aliases: ['da nang', 'danang'] },
  'Thua Thien Hue, Vietnam': { term: 'Huế', aliases: ['hue'] },
  'Hong Gai, Vietnam': { term: 'Hạ Long', aliases: ['ha long', 'halong', 'quang ninh'] },
  'Can Tho, Vietnam': { term: 'Cần Thơ', aliases: ['can tho'] },
  'Hai Phong, Vietnam': { term: 'Hải Phòng', aliases: ['hai phong', 'cat ba'] },
  'Nha Trang, Vietnam': { term: 'Nha Trang', aliases: ['nha trang', 'khanh hoa'] },
  'Da Lat, Vietnam': { term: 'Đà Lạt', aliases: ['da lat', 'dalat', 'lam dong'] },
  'Vung Tau, Vietnam': { term: 'Vũng Tàu', aliases: ['vung tau'] },
  'Hoi An, Vietnam': { term: 'Hội An', aliases: ['hoi an'] },
  'Phu Quoc, Vietnam': { term: 'Phú Quốc', aliases: ['phu quoc'] },
  'Quy Nhon, Vietnam': { term: 'Quy Nhơn', aliases: ['quy nhon', 'binh dinh'] },
  'Sa Pa, Vietnam': { term: 'Sa Pa', aliases: ['sa pa', 'sapa', 'lao cai'] },
  'Ninh Binh, Vietnam': { term: 'Ninh Bình', aliases: ['ninh binh', 'trang an', 'tam coc'] },
}

export interface EditorialDestination { term: string; aliases: string[] }

function destinationOf(city: VietnamCity | null): EditorialDestination | null {
  if (!city) return null
  const d = DESTINATIONS[city.query]
  return d ? { term: d.term, aliases: [...d.aliases] } : null
}

/**
 * Resolve the destination for this turn: the tool's own `location` argument
 * when it names a known city, else the user's text. Null means "no supplement".
 */
export function editorialDestination(toolLocation: string | null | undefined, text: string): EditorialDestination | null {
  const loc = (toolLocation ?? '').trim()
  if (loc) {
    const fromTool = destinationOf(cityForName(loc) ?? cityInText(loc))
    if (fromTool) return fromTool
  }
  return destinationOf(cityInText(text))
}

/** The folded spellings to match a candidate against — the term itself plus the table's aliases. */
export function destinationAliases(destination: string): string[] {
  const folded = normalizeVN(destination.toLowerCase()).trim()
  const known = Object.values(DESTINATIONS).find(d => normalizeVN(d.term.toLowerCase()) === folded || d.aliases.includes(folded))
  return [...new Set([folded, ...(known?.aliases ?? [])].filter(Boolean))]
}

// ── Gate ──────────────────────────────────────────────────────────────────────

/** The two frame fields the gate reads. Structural, so the route's DecisionFrame satisfies it as-is. */
export interface EditorialFrame {
  domains: readonly string[]
  goal: 'inform' | 'recommend' | 'compare' | 'decide' | 'plan'
}

/**
 * Whether this turn gets the supplement, and for what — decided from the
 * DecisionFrame the route already derived, never from a model:
 *   travel domain · goal inform / recommend / plan · a known destination.
 * Anything else — shopping, a spa, a meal at home, a hotel PRICE lookup with no
 * city, an unknown place — returns null and VnExpress is asked for nothing.
 */
export function editorialGate(frame: EditorialFrame, toolLocation: string | null | undefined, text: string): { destination: EditorialDestination; intent: EditorialIntent } | null {
  if (!frame.domains.includes('travel')) return null
  if (frame.goal !== 'inform' && frame.goal !== 'recommend' && frame.goal !== 'plan') return null
  const destination = editorialDestination(toolLocation, text)
  if (!destination) return null
  return { destination, intent: editorialIntentFor(text, frame.goal) }
}

// ── Intent ────────────────────────────────────────────────────────────────────

/**
 * Which editorial angle the turn wants. Deterministic, from the user's own words
 * and the frame's goal — no model. Folded (`normalizeVN`) so spelling with or
 * without diacritics reads the same.
 */
export function editorialIntentFor(text: string, goal: 'inform' | 'recommend' | 'compare' | 'decide' | 'plan'): EditorialIntent {
  const t = normalizeVN((text || '').toLowerCase())
  if (/\bcam nang\b|\bhuong dan\b|tu a\b|\ba-z\b|\ba den z\b/.test(t)) return 'cam_nang'
  if (/kinh nghiem|\bmeo\b|luu y|\btips?\b|can chuan bi|chuan bi gi/.test(t)) return 'kinh_nghiem'
  if (/\ban gi\b|\bmon gi\b|dac san|\bquan an\b|am thuc|\bfood\b|\beat\b/.test(t)) return 'an_gi'
  if (/choi dau|choi gi|co gi choi|choi o dau|tham quan|diem den|\bdi dau\b|check-?in|\bvisit\b|things to do/.test(t)) return 'choi_dau'
  if (goal === 'plan') return 'cam_nang'
  return 'general'
}

/** Folded keywords that mark each intent in a title / summary / taxonomy path. */
const INTENT_MARKERS: Record<EditorialIntent, RegExp> = {
  cam_nang: /cam nang|huong dan|tu a den z|lich trinh|mua nao dep|di chuyen/,
  kinh_nghiem: /kinh nghiem|\bmeo\b|luu y|tu van|bi kip|nen biet|can biet/,
  an_gi: /am thuc|\ban gi\b|dac san|mon ngon|\bquan\b|\bmon\b|nha hang|ca phe|\bcafe\b/,
  choi_dau: /diem den|choi dau|tham quan|check-?in|diem du lich|bai bien|\bnui\b|\bthac\b|\bdao\b|\bchua\b|lang\b/,
  general: /./,
}

// ── Fetching (deadline-bounded, host-pinned) ──────────────────────────────────

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface VnExpressDeps {
  fetchImpl?: FetchLike
  now?: () => number
  /** The existing Serper search, used only as the fallback when both publisher reads fail. */
  fallbackSearch?: (query: string) => Promise<Array<{ title: string; link: string; snippet: string }> | null>
}

async function fetchText(fetchImpl: FetchLike, url: string, timeoutMs: number, accept: string): Promise<string | null> {
  const u = new URL(url)
  if (u.protocol !== 'https:' || !(u.hostname === HOST || u.hostname === `timkiem.${HOST}`)) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, timeoutMs))
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'vi,en;q=0.8' }, signal: ctrl.signal, redirect: 'follow' })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Parsers (pure) ────────────────────────────────────────────────────────────

export interface Candidate {
  article_id: string
  url: string
  title: string
  summary: string
  /** Unix ms of the publication moment when the listing carried one. */
  publishedMs: number | null
  /** Where the candidate came from — for dedupe preference and the fallback test. */
  origin: 'rss' | 'search' | 'fallback'
}

const decodeEntities = (s: string): string =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
const stripTags = (s: string): string => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/** The 7-digit id an article URL carries, or null when the URL is not an article on the apex host. */
export function articleIdOf(url: string): string | null {
  const m = ARTICLE_URL_RE.exec(url.trim())
  return m ? m[1] : null
}

/** `/rss/du-lich.rss`: title · link/guid · pubDate · description (summary + image). */
export function parseRss(xml: string): Candidate[] {
  const out: Candidate[] = []
  for (const item of xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []) {
    const link = decodeEntities(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] ?? '').trim()
    const id = articleIdOf(link)
    if (!id) continue
    const title = stripTags(decodeEntities(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''))
    const summary = stripTags(decodeEntities(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? ''))
    const pub = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim()
    const publishedMs = pub ? Date.parse(pub) : NaN
    if (!title) continue
    out.push({ article_id: id, url: link, title, summary, publishedMs: Number.isFinite(publishedMs) ? publishedMs : null, origin: 'rss' })
  }
  return out
}

/** `timkiem.vnexpress.net` result page: `<article data-url data-publishtime>` with a title and a description. */
export function parseSearchResults(html: string): Candidate[] {
  const out: Candidate[] = []
  const re = /<article\b([^>]*)>([\s\S]*?)<\/article>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const attrs = m[1]
    const body = m[2]
    const url = decodeEntities(attrs.match(/data-url="([^"]+)"/)?.[1] ?? body.match(/<h3[^>]*class="[^"]*title-news[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"/)?.[1] ?? '')
    const id = articleIdOf(url)
    if (!id) continue
    const titleRaw = body.match(/<h3[^>]*class="[^"]*title-news[^"]*"[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''
    const title = stripTags(decodeEntities(titleRaw))
    const descRaw = body.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''
    // The location stamp ("Lâm Đồng") is a prefix span; keep it as part of the summary text.
    const summary = stripTags(decodeEntities(descRaw))
    const ts = Number(attrs.match(/data-publishtime="(\d+)"/)?.[1])
    if (!title) continue
    out.push({ article_id: id, url, title, summary, publishedMs: Number.isFinite(ts) && ts > 0 ? ts * 1000 : null, origin: 'search' })
  }
  return out
}

export interface ArticleMeta {
  title: string
  url: string
  publishedAt: string | null
  modifiedAt: string | null
  /** Taxonomy segments below "Du lịch" (from `tt_list_folder_name`), e.g. ["Điểm đến","Việt Nam","Đà Lạt"]. */
  taxonomy: string[]
  tags: string[]
  summary: string
  /** Body paragraphs in document order (already tag-stripped). */
  paragraphs: string[]
}

function jsonLdBlocks(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const parsed = JSON.parse(m[1].trim())
      for (const b of Array.isArray(parsed) ? parsed : [parsed]) if (b && typeof b === 'object') out.push(b as Record<string, unknown>)
    } catch { /* one malformed block must not sink the page */ }
  }
  return out
}

const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null
  const ms = Date.parse(v)
  return Number.isFinite(ms) ? v.trim() : null
}

/**
 * JSON-LD first (headline, datePublished, dateModified, description); the meta
 * tags only fill what JSON-LD lacks. `dateModified` is deliberately taken from
 * JSON-LD before `lastmod` — measured on an updated guide: JSON-LD said
 * 2026-08-17, the meta still said 2020.
 */
export function parseArticle(html: string, url: string): ArticleMeta | null {
  const canonical = decodeEntities(html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1] ?? url)
  const ld = jsonLdBlocks(html).find(b => b['@type'] === 'NewsArticle' || b['@type'] === 'Article') ?? null
  const meta = (name: string): string | null => {
    const m = html.match(new RegExp(`<meta[^>]*(?:name|property|itemprop)="${name}"[^>]*content="([^"]*)"`, 'i'))
      ?? html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*(?:name|property|itemprop)="${name}"`, 'i'))
    return m ? decodeEntities(m[1]) : null
  }
  const title = stripTags(String(ld?.headline ?? meta('og:title') ?? html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '')).replace(/\s*-\s*Báo VnExpress.*$/i, '').trim()
  if (!title) return null
  const publishedAt = isoOrNull(ld?.datePublished) ?? isoOrNull(meta('pubdate')) ?? isoOrNull(meta('article:published_time'))
  const modifiedAt = isoOrNull(ld?.dateModified) ?? isoOrNull(meta('lastmod')) ?? isoOrNull(meta('article:modified_time'))
  const folders = (meta('tt_list_folder_name') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const duLichAt = folders.findIndex(f => normalizeVN(f.toLowerCase()) === 'du lich')
  const taxonomy = duLichAt >= 0 ? folders.slice(duLichAt + 1) : folders.filter(f => !/^vnexpress$/i.test(f))
  const tags = (meta('article:tag') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const summary = stripTags(String(ld?.description ?? meta('og:description') ?? meta('description') ?? ''))
  const bodyHtml = html.match(/<article\b[^>]*class="[^"]*fck_detail[^"]*"[^>]*>([\s\S]*?)<\/article>/)?.[1] ?? ''
  const cleaned = bodyHtml.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<figure[\s\S]*?<\/figure>/g, ' ')
  const paragraphs: string[] = []
  for (const p of cleaned.matchAll(/<(p|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const text = stripTags(decodeEntities(p[2]))
    if (text.length >= 20) paragraphs.push(text)
  }
  return { title, url: canonical, publishedAt, modifiedAt, taxonomy: taxonomy.length ? taxonomy : [], tags, summary, paragraphs }
}

/**
 * The ≤1,500-char extract: paragraphs that carry the destination or the intent
 * first, then document order, cut at a sentence boundary. Never the whole body.
 */
export function buildExtract(paragraphs: string[], destination: string, intent: EditorialIntent, max = EXTRACT_MAX_CHARS): string {
  const aliases = destinationAliases(destination)
  const marker = INTENT_MARKERS[intent]
  const scored = paragraphs.map((p, i) => {
    const f = normalizeVN(p.toLowerCase())
    let s = 0
    if (mentions(p, aliases)) s += 2
    if (intent !== 'general' && marker.test(f)) s += 3
    return { p, i, s }
  }).sort((a, b) => b.s - a.s || a.i - b.i)
  const out: string[] = []
  let len = 0
  for (const { p } of scored) {
    if (len + p.length + 1 > max) {
      if (out.length === 0) {
        const cut = p.slice(0, max)
        const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
        out.push((end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim())
      }
      break
    }
    out.push(p)
    len += p.length + 1
  }
  return out.join(' ').slice(0, max).trim()
}

// ── Freshness (pure) ──────────────────────────────────────────────────────────

const NEWS_FOLDER_RE = /^tin tuc$/
const HOT_TAG_RE = /^tin nong$/
/** Wording that makes an article time-sensitive whatever folder it sits in. */
// 🚨 Folded Vietnamese is ambiguous: "cam" is also the fruit, "chay" is also
// vegetarian, "bao" is also in "bảo tàng" (museum). Only the unambiguous
// collocations count.
const TIME_SENSITIVE_RE = /dong cua|tam dung|tam ngung|dung (tham quan|hoat dong|don khach|khai thac)|da roi|cam duong|bi cam|cam bien|sat lo|tac (duong|ben|pha)|le hoi|festival|su kien|phi tham quan|tang (gia|phi)|giam (gia|phi)|\bvisa\b|thi thuc|lich (chay|bay)|con bao|bao so|mua lon|ngap lut|hoa hoan|chay rung|tai nan|canh bao|dieu chinh|thay doi/

export interface FreshnessInput {
  taxonomy: string[]
  tags: string[]
  title: string
  publishedAt: string | null
  modifiedAt: string | null
}

export interface FreshnessVerdict {
  klass: FreshnessClass
  /** False when the article is older than its class allows — the caller drops it. */
  usable: boolean
  /** The date the citation carries: modified when known, else published. */
  effectiveMs: number | null
}

export function classifyFreshness(input: FreshnessInput, nowMs: number): FreshnessVerdict {
  const folded = input.taxonomy.map(t => normalizeVN(t.toLowerCase()))
  const tags = input.tags.map(t => normalizeVN(t.toLowerCase()))
  const title = normalizeVN(input.title.toLowerCase())
  const pub = input.publishedAt ? Date.parse(input.publishedAt) : NaN
  const mod = input.modifiedAt ? Date.parse(input.modifiedAt) : NaN
  const effectiveMs = Number.isFinite(mod) ? Math.max(mod, Number.isFinite(pub) ? pub : mod) : Number.isFinite(pub) ? pub : null
  const isNews = folded.some(f => NEWS_FOLDER_RE.test(f)) || tags.some(t => HOT_TAG_RE.test(t)) || TIME_SENSITIVE_RE.test(title)
  const isStory = folded.some(f => /^dau chan$|^anh|^video/.test(f))
  const klass: FreshnessClass = isNews ? 'time_sensitive' : isStory ? 'historical' : 'stable'
  if (effectiveMs === null) return { klass, usable: false, effectiveMs }
  const ageDays = (nowMs - effectiveMs) / 86_400_000
  const limit = klass === 'time_sensitive' ? TIME_SENSITIVE_WINDOW_DAYS : STABLE_WINDOW_DAYS
  return { klass, usable: ageDays <= limit && ageDays >= -1, effectiveMs }
}

/** "(MM/YYYY)" — the qualifier the prompt asks the model to attach to every citation. */
export function datedLabel(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

// ── Relevance + dedupe (pure) ─────────────────────────────────────────────────

/** True when any folded spelling of the destination appears in the text. Whole words for short ones ("hue"). */
function mentions(text: string, aliases: string[]): boolean {
  const f = normalizeVN(text.toLowerCase())
  return aliases.some(a => a.length >= 5 ? f.includes(a) : new RegExp(`\\b${a}\\b`).test(f))
}

export function relevanceScore(c: Pick<Candidate, 'title' | 'summary' | 'url'>, destination: string, intent: EditorialIntent, taxonomy: string[] = []): number {
  const aliases = destinationAliases(destination)
  if (aliases.length === 0) return 0
  const slug = c.url.replace(/^https?:\/\/[^/]+\//, '').replace(/-\d{7}\.html$/, '').replace(/-/g, ' ')
  const inTaxonomy = taxonomy.some(t => mentions(t, aliases))
  const inTitle = mentions(c.title, aliases) || mentions(slug, aliases)
  const inSummary = mentions(c.summary, aliases)
  if (!inTaxonomy && !inTitle && !inSummary) return 0
  let s = (inTaxonomy ? 5 : 0) + (inTitle ? 4 : 0) + (inSummary ? 2 : 0)
  if (intent !== 'general') {
    const marker = INTENT_MARKERS[intent]
    const hay = normalizeVN(`${c.title} ${c.summary} ${taxonomy.join(' ')}`.toLowerCase())
    if (marker.test(hay)) s += 3
  }
  return s
}

/** One row per article: canonical id wins; RSS (which carries a summary) is preferred over a duplicate search hit. */
export function dedupeCandidates(list: Candidate[]): Candidate[] {
  const byId = new Map<string, Candidate>()
  for (const c of list) {
    const prev = byId.get(c.article_id)
    if (!prev || (prev.origin !== 'rss' && c.origin === 'rss')) byId.set(c.article_id, c)
  }
  return [...byId.values()]
}

// ── The supplement ────────────────────────────────────────────────────────────

const rssKey = () => 'vnx:rss:du-lich'
const searchKey = (destination: string, intent?: EditorialIntent) => `vnx:search:${cacheKeyPart(destination)}${intent ? `:${intent}` : ''}`

/**
 * The second on-site query, for the two angles where it was MEASURED to matter
 * (2026-09-17): the destination-only page is the newest ~24 hits, and the
 * evergreen "Cẩm nang du lịch X" guides sat outside it ("nha trang" → 0 guides,
 * "nha trang cẩm nang" → 2); "nha trang ăn gì" → 4 food pieces the plain page
 * missed. The other angles measured 0–2 results and stay destination-only.
 */
export const INTENT_QUERY_TERM: Partial<Record<EditorialIntent, string>> = {
  cam_nang: 'cẩm nang',
  an_gi: 'ăn gì',
}
const articleKey = (id: string) => `vnx:article:${id}`

async function loadRss(fetchImpl: FetchLike, timeoutMs: number): Promise<Candidate[]> {
  const hit = getCache(rssKey()) as Candidate[] | null
  if (hit) return hit
  const xml = await fetchText(fetchImpl, RSS_URL, timeoutMs, 'application/rss+xml, application/xml;q=0.9, */*;q=0.5')
  if (!xml) return []
  const parsed = parseRss(xml)
  if (parsed.length) setCache(rssKey(), parsed, RSS_TTL_MS)
  return parsed
}

/**
 * One on-site search page. `intent` undefined = the destination alone (the
 * site ANDs every word, so the plain page is the broad read); `intent` set =
 * `<destination> <INTENT_QUERY_TERM>`, cached under its own key.
 */
async function loadSearch(fetchImpl: FetchLike, destination: string, timeoutMs: number, intent?: EditorialIntent): Promise<Candidate[]> {
  const term = intent ? INTENT_QUERY_TERM[intent] : undefined
  if (intent && !term) return []
  const key = searchKey(destination, intent)
  const hit = getCache(key) as Candidate[] | null
  if (hit) return hit
  const q = term ? `${destination} ${term}` : destination
  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&cate_code=du-lich`
  const html = await fetchText(fetchImpl, url, timeoutMs, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8')
  if (!html) return []
  const parsed = parseSearchResults(html)
  if (parsed.length) setCache(key, parsed, SEARCH_TTL_MS)
  return parsed
}

async function loadArticle(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<ArticleMeta | null> {
  const id = articleIdOf(url)
  if (!id) return null
  const hit = getCache(articleKey(id)) as ArticleMeta | null
  if (hit) return hit
  const html = await fetchText(fetchImpl, url, timeoutMs, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8')
  if (!html) return null
  const meta = parseArticle(html, url)
  if (meta) setCache(articleKey(id), meta, ARTICLE_TTL_MS)
  return meta
}

/**
 * The supplement for one travel turn.
 *
 *   RSS + on-site search (parallel, cached 15 min)
 *     → dedupe by article id → relevance ≥ 1 → best MAX_ARTICLES
 *     → article fetch (parallel, cached 24 h) → freshness verdict → extract
 *
 * Bounded by TOTAL_BUDGET_MS end to end; whatever has not arrived when the
 * budget runs out is simply not in the answer. Every failure path resolves to
 * `{ travel_editorial: [] }` — this must never fail the chat turn.
 */
export async function searchVnExpressTravel(destination: string, intent: EditorialIntent, lang: string, deps: VnExpressDeps = {}): Promise<TravelEditorialResult> {
  void lang // the source is Vietnamese-only; the model writes the reply language
  const empty: TravelEditorialResult = { travel_editorial: [] }
  const dest = destination.trim()
  if (!dest) return empty
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((input, init) => fetch(input, init))
  const now = deps.now ?? (() => Date.now())
  const started = now()
  const remaining = () => TOTAL_BUDGET_MS - (now() - started)
  try {
    // RSS + the destination page + (cam_nang / an_gi only) the intent page, in
    // parallel under ONE deadline — the same logical retrieval, the same 4 s.
    const listBudget = Math.min(2500, remaining())
    const [rss, search, byIntent] = await Promise.all([
      loadRss(fetchImpl, listBudget),
      loadSearch(fetchImpl, dest, listBudget),
      INTENT_QUERY_TERM[intent] ? loadSearch(fetchImpl, dest, listBudget, intent) : Promise.resolve([] as Candidate[]),
    ])
    let candidates = dedupeCandidates([...rss, ...search, ...byIntent])
    // Fallback — only when BOTH publisher reads produced nothing: the existing
    // Serper search, site-scoped. Same provider the web_search tool uses.
    if (candidates.length === 0 && remaining() > 800) {
      const fallback = deps.fallbackSearch ?? serperSearch
      const rows = await fallback(`site:vnexpress.net/du-lich ${dest}`).catch(() => null)
      candidates = dedupeCandidates((rows ?? []).flatMap(r => {
        const id = articleIdOf(r.link)
        return id ? [{ article_id: id, url: r.link, title: r.title, summary: r.snippet, publishedMs: null, origin: 'fallback' as const }] : []
      }))
    }
    // A listing date past the stable window costs rank but not the slot: a guide
    // published in 2020 may carry a 2026 `dateModified` only the article reveals.
    const stale = (c: Candidate) => c.publishedMs !== null && now() - c.publishedMs > STABLE_WINDOW_DAYS * 86_400_000
    const ranked = candidates
      .map(c => ({ c, score: relevanceScore(c, dest, intent) - (stale(c) ? 3 : 0) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.c.publishedMs ?? 0) - (a.c.publishedMs ?? 0))
    if (ranked.length === 0) return empty
    const articleBudget = remaining()
    if (articleBudget < 300) return empty
    const items: TravelEditorialItem[] = []
    // At most MAX_ARTICLES fetches per turn — the source policy, not a tuning knob.
    const fetched = await Promise.all(ranked.slice(0, MAX_ARTICLES).map(async ({ c }) => ({ c, meta: await loadArticle(fetchImpl, c.url, articleBudget) })))
    for (const { c, meta } of fetched) {
      if (!meta) continue
      const verdict = classifyFreshness({ taxonomy: meta.taxonomy, tags: meta.tags, title: meta.title, publishedAt: meta.publishedAt, modifiedAt: meta.modifiedAt }, now())
      if (!verdict.usable) continue
      const score = relevanceScore({ title: meta.title, summary: meta.summary || c.summary, url: meta.url }, dest, intent, meta.taxonomy)
      if (score === 0) continue
      items.push({
        source: EDITORIAL_SOURCE,
        article_id: c.article_id,
        title: meta.title,
        url: meta.url,
        publishedAt: meta.publishedAt ?? new Date(c.publishedMs ?? verdict.effectiveMs ?? 0).toISOString(),
        modifiedAt: meta.modifiedAt,
        section: meta.taxonomy.join(' > '),
        summary: (meta.summary || c.summary).slice(0, 300),
        extract: buildExtract(meta.paragraphs, dest, intent),
        freshness: verdict.klass,
        // Editorial prose is REVIEW_SUPPORTED — the same grade as a search
        // snippet — and can never be promoted to FACT by this module.
        provenance: classifyEvidence('review'),
        dated: datedLabel(verdict.effectiveMs),
      })
    }
    // Stable and timely first; historical stories last. Then the relevance the ranking already used.
    const order: Record<FreshnessClass, number> = { time_sensitive: 0, stable: 0, historical: 1 }
    items.sort((a, b) => order[a.freshness] - order[b.freshness])
    return { travel_editorial: items.slice(0, MAX_ARTICLES) }
  } catch {
    return empty
  }
}

// ── Attaching to a tool result ────────────────────────────────────────────────

/**
 * The supplement rides on the tool result the model already reads — the same
 * seam `price_search_results` uses — under one key, `travel_editorial`. A
 * result that is not an object (an error string, null) is returned untouched,
 * and an empty supplement adds nothing: the model never sees an empty array it
 * could remark on.
 */
export function withTravelEditorial(result: unknown, editorial: TravelEditorialItem[]): unknown {
  if (editorial.length === 0) return result
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result
  return { ...(result as Record<string, unknown>), travel_editorial: editorial }
}

// ── One retrieval per destination per chat turn ───────────────────────────────
//
// 🚨 MEASURED IN THE SDK, NOT ASSUMED: ai@4.3.19 executes every tool call of a
// step with `Promise.all` (dist/index.js, `toolResults = await Promise.all(...)`),
// and a planning turn may run up to 8 steps. So one Travel turn can enter the
// supplement several times — a hotel search and a transport lookup in the same
// step, a place search in the next. The tool cache only helps AFTER a retrieval
// has completed; two concurrent misses would each hit the publisher, and each
// could trigger the Serper fallback. This memo is request-scoped: the first
// caller starts the retrieval, every later caller for the same destination and
// angle shares the same promise. Different destinations in one turn (a hotel in
// Hội An, transport to Đà Nẵng) are genuinely different questions and keep
// their own retrieval — the RSS read is still shared through the tool cache.
export type TurnEditorial = (destination: string, intent: EditorialIntent, lang: string) => Promise<TravelEditorialItem[]>

export function createTurnEditorial(retrieve: typeof searchVnExpressTravel = searchVnExpressTravel): TurnEditorial {
  const inFlight = new Map<string, Promise<TravelEditorialItem[]>>()
  return (destination, intent, lang) => {
    const key = `${normalizeVN(destination.toLowerCase()).trim()}|${intent}`
    let p = inFlight.get(key)
    if (!p) {
      p = retrieve(destination, intent, lang).then(r => r.travel_editorial, () => [])
      inFlight.set(key, p)
    }
    return p
  }
}
