// ── One brain · the cards follow the answer (29/10/2026) ──────────────────────────────────────────────────────────────────────────────
//
// Measured on localhost (25-question run): the cards under an answer were the engine's, not the answer's — the text recommended Philips and the crowned
// card was Joyoung (or an air-purifier FILTER, or a 5 L fryer at 499.000đ), the text named three bún chả places and the cards showed others. ChatGPT puts
// the card of each recommended item where the text names it; a listing the text does not name has no card.
// The one-brain model already names what it recommends (bold, as the instruction asks). This reads those names out of the finished answer and hands the
// cards the same contract the agent's ranking line gives (rankingContract.ts): the named items, in the order named, the first one crowned. No model call,
// no word list: a name is matched to the candidates the tools returned by folding, token overlap, a model code (NA231, SHD4030) and, when the answer states
// a price beside the name, that price; a name that stays ambiguous matches nothing. Pure.

import type { RankingContract } from '@/lib/ai/agent/runtime/rankingContract'
import { extractMoneyClaims } from '@/lib/ai/moneyGuard'

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const tokens = (s: string): string[] => fold(s).split(' ').filter(t => t.length >= 2 || /\d/.test(t))
/** A model code: letters and digits together ("na231", "shd4030", "ac0650"). */
/** A capacity, size or power ("256gb", "6l", "1000w", "13inch", "9000btu") says WHICH VARIANT, never WHICH MODEL. */
const MEASURE = /^\d+(?:gb|tb|mb|kb|mah|hz|ghz|mhz|kg|g|ml|l|w|v|inch|in|mm|cm|m|k|p|hp|btu)$/
const isCode = (t: string): boolean => t.length >= 3 && /[a-z]/.test(t) && /\d/.test(t) && !MEASURE.test(t)

export interface RankCandidate { name: string; /** VND, when the listing states one (a product). */ price?: number | null }

/** Bold spans of the answer prose (machine blocks and links removed), with their offsets and the prose right after them. */
function boldSpans(text: string): Array<{ s: string; at: number; after: string; said: string | null }> {
  const prose = text
    .replace(/\[TAPPY_[A-Z_]+\][\s\S]*?(?:\[\/TAPPY_[A-Z_]+\]|$)/g, m => ' '.repeat(m.length))
    .replace(/\]\([^)\n]*\)/g, m => ' '.repeat(m.length))
  return [...prose.matchAll(/\*\*([^*\n]{2,120})\*\*/g)]
    .map(m => {
      const at = m.index ?? 0, end = at + m[0].length
      return { s: m[1].trim(), at, after: prose.slice(end, end + 160), said: saidAfter(text, at, end) }
    })
}

const SAID_MAX = 220

/**
 * What the answer says about a name that heads its own line ("- **Name**: …", "1. **Name** – …"): the rest of that line, in the
 * model's words - figures kept (it is the guarded prose itself), links and markup removed, cut at a word near SAID_MAX. A name
 * mentioned inside a sentence heads nothing: null.
 */
function saidAfter(text: string, at: number, end: number): string | null {
  const lineStart = text.lastIndexOf('\n', at - 1) + 1
  if (!/^\s*(?:[-*+•]|\d{1,2}[.)]|#{1,6})?\s*$/.test(text.slice(lineStart, at))) return null
  const lineEnd = text.indexOf('\n', end)
  const said = text.slice(end, lineEnd < 0 ? text.length : lineEnd)
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, ' ')
    .replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:：–—-]+/, '')
    .replace(/[\s·|,;–—-]+$/, '')
    .trim()
  if (said.length < 3) return null
  if (said.length <= SAID_MAX) return said
  const cut = said.slice(0, SAID_MAX)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), SAID_MAX / 2)).trimEnd()}…`
}

/** Is the span a name of this candidate? The share of the span's tokens the candidate has, or null. */
function overlap(span: string, name: string): number | null {
  const f = fold(span), n = fold(name)
  if (f.length < 3) return null
  if (f === n) return 1
  const st = tokens(span), nt = new Set(tokens(name))
  if (st.length === 0 || nt.size === 0) return null
  const shared = st.filter(t => nt.has(t))
  // a model code the span and the listing share names the listing, even inside a long bold sentence
  if (shared.some(isCode)) return 1
  const a = shared.length / st.length
  const identifying = st.length >= 3 || (st.length >= 2 && a === 1)
  return identifying && a >= 0.8 ? a : null
}

/**
 * The candidates the answer names, in the order it names them, as a ranking contract — or null when it names none (the cards then stay as they were).
 * `candidates` are the titles (and prices) of what the tools returned this turn: places and products.
 */
export function rankingFromProse(text: string, candidates: readonly RankCandidate[]): RankingContract | null {
  const tokenCount = new Map<string, number>()
  for (const c of candidates) for (const t of new Set(tokens(c.name))) tokenCount.set(t, (tokenCount.get(t) ?? 0) + 1)
  const first = new Map<number, number>()
  const said = new Map<number, string>()
  // The answer's first pick names a model code that no single listing could be matched to: a LATER pick that did match is not the answer's pick, so nothing is crowned.
  let firstPickUnresolved = false
  for (const { s, at, after, said: words } of boldSpans(text)) {
    let pool = candidates.map((c, i) => ({ i, a: overlap(s, c.name) })).filter((x): x is { i: number; a: number } => x.a !== null).map(x => x.i)
    if (pool.length === 0) { if (first.size === 0 && tokens(s).some(isCode)) firstPickUnresolved = true; continue }
    if (pool.length > 1) {
      // the price stated beside the name says which listing it is
      const stated = extractMoneyClaims(`${s} ${after}`).flatMap(c => [c.lo, c.hi])
      const byPrice = pool.filter(i => { const p = candidates[i].price; return typeof p === 'number' && stated.some(v => Math.abs(v - p) <= Math.max(1000, p * 0.005)) })
      if (byPrice.length >= 1) pool = byPrice
    }
    if (pool.length > 1) {
      // a token only one candidate has points at that candidate; a token every one of them has points at none
      const st = new Set(tokens(s))
      const hits = pool.map(i => ({ i, n: tokens(candidates[i].name).filter(t => st.has(t) && tokenCount.get(t) === 1).length }))
      const top = Math.max(...hits.map(h => h.n))
      const best = hits.filter(h => h.n === top)
      pool = top > 0 && best.length === 1 ? [best[0].i] : []
    }
    if (pool.length !== 1) { if (first.size === 0 && tokens(s).some(isCode)) firstPickUnresolved = true; continue }
    if (!first.has(pool[0])) first.set(pool[0], at)
    if (words && !said.has(pool[0])) said.set(pool[0], words)
  }
  if (first.size === 0) return null
  const picks = [...first.entries()].sort((x, y) => x[1] - y[1]).map(([i]) => ({ name: candidates[i].name, why: null, tradeoff: null, fits: null, refs: [] as string[], said: said.get(i) ?? null }))
  return { picks, none: false, confidence: firstPickUnresolved ? 'low' : 'medium' }
}
