// ── CONSULTATIVE_IN_AGENT — a price keeps the source that STATES it (Round 32, defect 1) ───────────────────────────────────────────────
//
// Live 2026-10-12 (MacBook): the reply stated two prices that only two SEARCH SNIPPETS carried (ttcenter.com.vn, zshop.vn). The model cited the page it had read
// ([S1], cellphones.com.vn); the provenance step removed that marker because the page does not state the figures; and the citation step, finding no marker left,
// printed "Nguồn: cellphones.com.vn" — a page that holds neither figure. The relation figure ↔ text that states it ↔ source ↔ URL was lost on the way.
//
// This module keeps the relation, from the data of the turn and for any host (nothing here names a shop):
//   · a PAGE source is offered for the reply's figures only if its own extracted passages state at least one of them;
//   · a figure no page states but a search result's text does gets the SEARCH RESULT's own link, labelled as a search-result price (never as a page-verified one);
//   · a figure nothing states gets no source at all — the existing guards decide what happens to the sentence, a source is never invented for it.
// Pure: no I/O, no model. URLs are only ever the ones the tools returned; the caller still requires them to be in the turn's allowed set.

import { extractMoneyClaims } from '../moneyGuard'

export interface TextRow { host: string; url: string; text: string }
export interface SourceRef { id: string; host: string; url: string }
export interface PageRef extends SourceRef { passages: readonly string[] }

/** Every VND amount a text states (both ends of a range), as integers. Units and grouping are read by the money guard's own extractor. */
export function figuresIn(text: string): number[] {
  const out = new Set<number>()
  for (const c of extractMoneyClaims(text)) {
    if (c.currency !== 'VND') continue
    if (Number.isFinite(c.lo) && c.lo > 0) out.add(Math.round(c.lo))
    if (Number.isFinite(c.hi) && c.hi > 0) out.add(Math.round(c.hi))
  }
  return [...out]
}

const statesAny = (text: string, wanted: ReadonlySet<number>): number[] => figuresIn(text).filter(f => wanted.has(f))

export interface PriceSourcePlan {
  /** The reply's money figures. */
  figures: number[]
  /** Pages (in the order given) whose passages state at least one figure. */
  pageSources: PageRef[]
  /** One search result per host whose text states a figure no page states. */
  searchRows: TextRow[]
  /** Figures stated by neither a page nor a search result. */
  unmatched: number[]
}

/** For the figures of `reply`: which page, then which search result, states them. */
export function planPriceSources(reply: string, pages: readonly PageRef[], rows: readonly TextRow[]): PriceSourcePlan {
  const figures = figuresIn(reply)
  const wanted = new Set(figures)
  const covered = new Set<number>()
  const pageSources: PageRef[] = []
  for (const p of pages) {
    const hit = new Set<number>()
    for (const passage of p.passages) for (const f of statesAny(passage, wanted)) hit.add(f)
    if (!hit.size) continue
    pageSources.push(p)
    for (const f of hit) covered.add(f)
  }
  const searchRows: TextRow[] = []
  const hosts = new Set<string>()
  for (const r of rows) {
    if (hosts.has(r.host)) continue
    const hit = statesAny(r.text, wanted).filter(f => !covered.has(f))
    if (!hit.length) continue
    hosts.add(r.host)
    searchRows.push(r)
    for (const f of hit) covered.add(f)
  }
  return { figures, pageSources, searchRows, unmatched: figures.filter(f => !covered.has(f)) }
}

const RESULT_KEYS = ['results', 'search_results', 'price_search_results', 'bus_search_results', 'train_search_results'] as const

function hostOfUrl(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, '') || null } catch { return null }
}

/** Search-result rows of one tool result (title + snippet + link), https only, bounded. Appends to `out` and returns the rows it added. */
export function collectSearchRows(result: unknown, out: TextRow[], max = 80): TextRow[] {
  const added: TextRow[] = []
  if (!result || typeof result !== 'object') return added
  for (const key of RESULT_KEYS) {
    const rows = (result as Record<string, unknown>)[key]
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (out.length >= max) return added
      if (!row || typeof row !== 'object') continue
      const r = row as { link?: unknown; url?: unknown; title?: unknown; snippet?: unknown }
      const url = typeof r.link === 'string' ? r.link : typeof r.url === 'string' ? r.url : ''
      const snippet = typeof r.snippet === 'string' ? r.snippet : ''
      if (!/^https:\/\//i.test(url) || !snippet) continue
      const host = hostOfUrl(url)
      if (!host) continue
      const text = `${typeof r.title === 'string' ? r.title : ''} ${snippet}`.trim()
      const row2 = { host, url, text }
      out.push(row2)
      added.push(row2)
    }
  }
  return added
}
