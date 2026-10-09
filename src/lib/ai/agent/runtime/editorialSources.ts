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

export interface EditorialItem { url: string; title: string; summary: string; source: string; publishedAt?: string }

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
