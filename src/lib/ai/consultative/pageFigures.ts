// ── Wave 3 · W1 · the amounts a page the turn READ states ───────────────────────────────────────────────────────────────────────────────────────────
//
// The guards that cut a money figure no tool result backs (money, snippet-price, travel) know snippets, structured listings and fares. A page the research opened with read_page is a tool result too: the amounts
// it states are the turn's evidence, exactly as a snippet's are. This pure function lists them: every number a page's text states, and every VND amount the money extractor reads from it (so "1,2 triệu" is 1.200.000).
// It reads only the plain result object `read_page` returned.

import { extractMoneyClaims } from '../moneyGuard'
import { numbersInText } from '../tools/calculate'

const MAX_TEXT = 60_000

/**
 * The text of the pages one `read_page` result holds (the page content and each evidence quote), bounded: the evidence an hours or availability claim may trace to, like a place row's own hours.
 * [] for anything that is not such a result.
 */
export function pageTexts(result: unknown): string[] {
  const pages = (result as { pages?: unknown } | null | undefined)?.pages
  if (!Array.isArray(pages)) return []
  const out: string[] = []
  let budget = MAX_TEXT
  const take = (s: unknown): void => { if (typeof s === 'string' && s && budget > 0) { const t = s.slice(0, budget); budget -= t.length; out.push(t) } }
  for (const p of pages.slice(0, 6)) {
    if (!p || typeof p !== 'object') continue
    const page = p as { page_content?: unknown; passages?: unknown; evidence?: unknown }
    take(page.page_content)
    if (Array.isArray(page.passages)) for (const x of page.passages.slice(0, 12)) take(x)
    if (Array.isArray(page.evidence)) for (const e of page.evidence.slice(0, 60)) take((e as { quote?: unknown })?.quote)
  }
  return out
}

/** Whole numbers (>= 1.000, the size of a price) the pages of one `read_page` result state. [] for anything that is not such a result. */
export function pageFigures(result: unknown): number[] {
  const pages = (result as { pages?: unknown } | null | undefined)?.pages
  if (!Array.isArray(pages)) return []
  const out = new Set<number>()
  let budget = MAX_TEXT
  const read = (s: unknown): void => {
    if (typeof s !== 'string' || budget <= 0) return
    const text = s.slice(0, budget); budget -= text.length
    for (const n of numbersInText(text, 400)) if (n >= 1000 && Number.isFinite(n)) out.add(Math.round(n))
    for (const c of extractMoneyClaims(text)) if (c.currency === 'VND') for (const v of [c.lo, c.hi]) if (Number.isFinite(v) && v >= 1000) out.add(Math.round(v))
  }
  for (const p of pages.slice(0, 6)) {
    if (!p || typeof p !== 'object') continue
    const page = p as { page_content?: unknown; passages?: unknown; evidence?: unknown }
    read(page.page_content)
    if (Array.isArray(page.passages)) for (const x of page.passages.slice(0, 12)) read(x)
    if (Array.isArray(page.evidence)) for (const e of page.evidence.slice(0, 60)) read((e as { value?: unknown })?.value)
  }
  return [...out]
}
