// ── POST-UAT B6 — a news / editorial item the reply restates keeps its source link (TAPPY_AGENT=2) ──────────────────────────────
//
// Measured UAT-13 (2026-10-09): get_trip_data carried a VnExpress `travel_editorial` item (Sơn Trà closed from 08/10, with its URL and
// publish time). Luna used it — correctly, as a proactive warning — but wrote "dữ liệu mới nhất mình có cho biết…" with no source: the
// M3 citation path only knows pages the agent READ (read_page / web_search read), never an article a tool returned whole.
//
// This step is deterministic and conservative: an article is attached to the ONE reply sentence that restates it (≥ 3 of the article's
// own title/summary word pairs, at least one of them a proper-name pair from the title), as an [S#] marker the existing citation step
// turns into the article's real link. No match → nothing is added. Never a URL the tool did not return, never a source for a sentence
// it does not support, never more than one marker per article.

import { hostOf, classifySource, sourceClassOf } from './sourceType'
import type { SourceLink } from './evidence'

export interface EditorialItem { url: string; title: string; summary: string; source: string; publishedAt?: string; image?: string }

const KEYS = new Set(['travel_editorial', 'articles', 'news', 'news_results', 'editorial'])

/** Articles (url + title) found anywhere in this turn's tool results, under an editorial / news key. */
export function editorialItemsIn(results: readonly unknown[]): EditorialItem[] {
  const out: EditorialItem[] = []
  const seen = new Set<string>()
  const walk = (v: unknown, depth: number, underKey: boolean) => {
    if (depth > 6 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v.slice(0, 40)) walk(x, depth + 1, underKey); return }
    const r = v as Record<string, unknown>
    const url = typeof r.url === 'string' ? r.url : typeof r.link === 'string' ? r.link : ''
    if (underKey && /^https?:\/\//i.test(url) && typeof r.title === 'string' && r.title.trim() && !seen.has(url)) {
      seen.add(url)
      out.push({ url, title: r.title, summary: [r.summary, r.snippet, r.description].find(x => typeof x === 'string') as string ?? '', source: typeof r.source === 'string' ? r.source : hostOf(url), ...(typeof r.publishedAt === 'string' ? { publishedAt: r.publishedAt } : {}) })
    }
    for (const [k, x] of Object.entries(r)) if (x && typeof x === 'object') walk(x, depth + 1, underKey || KEYS.has(k))
  }
  for (const r of results) walk(r, 0, false)
  return out
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
const words = (s: string) => fold(s).split(/[^A-Za-z0-9]+/).filter(Boolean)
const pairs = (s: string): Set<string> => {
  const w = words(s).map(x => x.toLowerCase())
  const out = new Set<string>()
  for (let i = 0; i + 1 < w.length; i++) out.add(`${w[i]} ${w[i + 1]}`)
  return out
}
/** Proper-name pairs of a title ("Sơn Trà", "Đà Nẵng"): both words capitalised in the original. */
const namePairs = (title: string): Set<string> => {
  const w = words(title)
  const out = new Set<string>()
  for (let i = 0; i + 1 < w.length; i++) if (/^[A-Z]/.test(w[i]) && /^[A-Z]/.test(w[i + 1]) && i > 0) out.add(`${w[i].toLowerCase()} ${w[i + 1].toLowerCase()}`)
  return out
}

/**
 * Adds an [S#] marker to the sentence restating each article and returns the SourceLinks for the citation step.
 * `nextId` = the first free S number (after the pages the ledger already cites).
 */
export function attributeEditorial(text: string, items: readonly EditorialItem[], nextId: number): { text: string; links: SourceLink[] } {
  const links: SourceLink[] = []
  let out = text
  let id = nextId
  for (const it of items.slice(0, 5)) {
    if (out.includes(it.url)) continue
    const evidence = pairs(`${it.title} ${it.summary}`)
    const names = namePairs(it.title)
    // sentences of the CURRENT text (markers added for earlier articles move offsets)
    const spans: Array<[number, number]> = []
    for (const m of out.matchAll(/[^.!?…\n]+[.!?…]*/g)) spans.push([m.index!, m.index! + m[0].length])
    let best: { span: [number, number]; score: number } | null = null
    for (const sp of spans) {
      const s = out.slice(sp[0], sp[1])
      if (/\[S\d|\[\/?(?:TAPPY_|FOLLOWUPS|CTA_BUTTONS)/.test(s)) continue
      const p = pairs(s)
      let score = 0, named = false
      for (const x of p) if (evidence.has(x)) { score++; if (names.has(x)) named = true }
      if (named && score >= 3 && (!best || score > best.score)) best = { span: sp, score }
    }
    if (!best) continue
    const sid = `S${id++}`
    const sentence = out.slice(best.span[0], best.span[1])
    const punct = /[.!?…]+\s*$/.exec(sentence)
    const at = punct ? best.span[0] + punct.index : best.span[1]
    out = `${out.slice(0, at).replace(/\s+$/, '')} [${sid}]${out.slice(at)}`
    const cls = sourceClassOf(classifySource(it.url), it.url)
    links.push({ id: sid, url: it.url, label: it.source || hostOf(it.url), title: it.title.slice(0, 160), source_type: cls, action_type: 'SOURCE', host: hostOf(it.url) })
  }
  return { text: out, links }
}

// ── CONSULT_V3 (owner 17/10, UAT đợt A: "tin tức không dẫn nguồn") — the model cites a news article by a short id ───────────────
//
// Measured UAT đợt A (3030, 17/10): get_news returned 5 articles, the reply restated 4 of them in its own words, and the word-pair match
// above attached none (`editorial_attribution cited:0`; the old build did the same). Under CONSULT_V3 each article a news tool returns
// carries `cite: "N1"…` in the result the model reads; the model writes "[N2]" after the sentence that uses article 2, and the runtime
// turns that marker into an [S#] the existing citation step links (the seventh markdown site: URL from this turn's tool result and its
// grant, label = host). The URL never travels through the model; an id naming no article is removed. Off the flag nothing is tagged.

const NEWS_KEYS = ['articles', 'news', 'news_results'] as const

/** Tags each article of a news tool result with `cite: "N#"` (continuing `book`'s numbering) and records it in `book`. Returns a copy. */
export function tagNewsArticles(value: unknown, book: EditorialItem[]): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const r = value as Record<string, unknown>
  let changed = false
  const out: Record<string, unknown> = { ...r }
  for (const k of NEWS_KEYS) {
    const list = r[k]
    if (!Array.isArray(list)) continue
    out[k] = list.map(a => {
      if (!a || typeof a !== 'object') return a
      const o = a as Record<string, unknown>
      const url = typeof o.url === 'string' ? o.url : typeof o.link === 'string' ? o.link : ''
      if (!/^https?:\/\//i.test(url) || typeof o.title !== 'string' || !o.title.trim() || book.length >= 20) return a
      const known = book.findIndex(b => b.url === url)
      const n = known >= 0 ? known + 1 : book.push({ url, title: o.title, summary: [o.summary, o.snippet, o.description].find(x => typeof x === 'string') as string ?? '', source: typeof o.source === 'string' ? o.source : hostOf(url), ...(typeof o.publishedAt === 'string' ? { publishedAt: o.publishedAt } : typeof o.published === 'string' ? { publishedAt: o.published } : {}), ...(typeof o.image === 'string' ? { image: o.image } : {}) })
      changed = true
      // the article's picture stays server-side (the news layout uses it); the model reads the article without it
      const { image: _image, ...shown } = o
      return { ...shown, cite: `N${n}` }
    })
  }
  return changed ? out : value
}

/**
 * Turns the model's [N#] markers into [S#] markers (from `nextId`) with the article's SourceLink; one S id per article, an unknown id is
 * removed. Pure.
 */
export function resolveNewsMarkers(text: string, book: readonly EditorialItem[], nextId: number): { text: string; links: SourceLink[] } {
  const links: SourceLink[] = []
  const idOf = new Map<number, string>()
  let id = nextId
  const out = text.replace(/\s?\[(N\d{1,2}(?:\s*,\s*N\d{1,2})*)\]/g, (_m, ids: string) => {
    const keep: string[] = []
    for (const raw of ids.split(/\s*,\s*/)) {
      const n = Number(raw.slice(1))
      const it = book[n - 1]
      if (!it || id > 99) continue
      let sid = idOf.get(n)
      if (!sid) {
        sid = `S${id++}`
        idOf.set(n, sid)
        const cls = sourceClassOf(classifySource(it.url), it.url)
        links.push({ id: sid, url: it.url, label: it.source || hostOf(it.url), title: it.title.slice(0, 160), source_type: cls, action_type: 'SOURCE', host: hostOf(it.url) })
      }
      if (!keep.includes(sid)) keep.push(sid)
    }
    return keep.length ? ` [${keep.join(', ')}]` : ''
  })
  return { text: out, links }
}

/**
 * CONSULT_V3 news layout: the pictures of the articles the reply CITED (in citation order), each with its own article link and outlet name.
 * Only an article that is cited and carries a picture from its outlet's CDN (checked again by sanitizeMediaBlock) is shown. Pure.
 */
export function citedNewsMedia(book: readonly EditorialItem[], cited: readonly SourceLink[]): Array<{ src: string; href: string; label: string; title: string }> {
  const out: Array<{ src: string; href: string; label: string; title: string }> = []
  for (const l of cited) {
    const it = book.find(b => b.url === l.url)
    if (it?.image && !out.some(o => o.src === it.image)) out.push({ src: it.image, href: it.url, label: it.source || hostOf(it.url), title: it.title.slice(0, 160) })
  }
  return out.slice(0, 6)
}
