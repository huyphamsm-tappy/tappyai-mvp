// ── Phase 8 M5 — the candidate set the agent ranks: hard constraints by code, semantic order by Luna ─────────────────────────────
//
// Before M5 every place / hotel / product result passed through the Consultative ranker on its way to the model (route.ts
// `rankForModel`): a weighted score (rating 1.0, reviews 0.3, distance 0.5, price 0.5, …) reordered the rows, `derivePick` named a
// winner (`_tappy_ranking`), shopping was trimmed to the score's top six and its card's "recommended" was that winner. Under
// TAPPY_AGENT=2 none of that runs. What runs instead is only the deterministic part:
//
//   · the ranker's HARD filter (rank.ts `hardFilter`): a known price over a HARD budget ("dưới / tối đa"; an "around" budget never
//     filters), a must-have the row's own evidence contradicts, an exclusion it contradicts — the row is REMOVED from what Luna reads
//     (before M5 it only left the ranked set and stayed in the rows);
//   · nothing left → the constraint is said to be unmet (Luna says so and offers to widen it; nothing is relaxed silently);
//   · shopping keeps a SIZE cap in PROVIDER order (no score decides which products Luna may see);
//   · an explicit note: the order is the provider's, not a ranking — Luna ranks.
//
// No score, no winner, no weights. The earlier gates (place type, activity, shopping validity, constraint filter, hard-constraint
// gate) are unchanged and run before this.

import { hardFilter } from '@/lib/ai/consultative/rank'
import type { Candidate } from '@/lib/ai/consultative/candidate'
import type { NeedProfile } from '@/lib/ai/consultative/needProfile'
import { MODEL_ROWS_MAX } from '@/lib/ai/consultative/modelPayload'
import { parsePriceBand } from '@/lib/ai/placeConstraintFilter'

export type RankTool = 'search_places' | 'get_hotel_prices' | 'search_products'

const ROW_KEYS: Record<RankTool, string[]> = {
  search_places: ['results'],
  get_hotel_prices: ['hotel_list', 'search_results'],
  search_products: ['search_results', 'shopping_results'],
}

export const ORDER_NOTE_VI = 'Thứ tự các ứng viên là thứ tự của nhà cung cấp, KHÔNG phải xếp hạng của hệ thống. Bạn tự cân nhắc và xếp theo đúng nhu cầu, ngữ cảnh và bằng chứng; không ứng viên nào phù hợp thì nói thẳng.'
export const ORDER_NOTE_EN = 'The candidates are in the provider\'s order, NOT a system ranking. Weigh and rank them yourself for this user\'s need, context and evidence; if none fits, say so.'

export interface CandidateSetOutcome {
  result: Record<string, unknown>
  /** Products Luna reads (provider order, size-capped) — the shopping card is built from exactly these. null for places / hotels. */
  shortlisted: Candidate[] | null
  removed: Array<{ name: string; why: 'budget' | 'mustHave' | 'avoid' }>
}

/**
 * The hard verdict for one candidate. Products: the ranker's `hardFilter` unchanged (a structured point price over a hard budget, a
 * contradicted must-have / exclusion). Places and hotels carry a price BAND: over a hard budget only when the band lies ENTIRELY above
 * it (lower bound > budget, the placeConstraintFilter rule, +5 %) or a point price exceeds it — a band that overlaps the budget is
 * ambiguous, so it stays for Luna to weigh (the ranker's upper-bound test would remove it, and misses an open band "Trên 1 Tr").
 */
function verdict(tool: RankTool, c: Candidate, need: NeedProfile): 'budget' | 'mustHave' | 'avoid' | null {
  const why = hardFilter(c, need)
  if (tool === 'search_products') return why
  if (why && why !== 'budget') return why
  const b = need.budget
  if (!b || b.type === 'around' || !(b.max > 0)) return null
  if (typeof c.attrs.priceVnd === 'number' && c.attrs.priceVnd > b.max) return 'budget'
  const raw = (c.raw ?? {}) as Record<string, unknown>
  const band = parsePriceBand(raw.price_range_text ?? raw.price_range)
  return band && band.lo > b.max * 1.05 ? 'budget' : null
}

/** Pure: the valid candidate set for the agent (hard constraints applied, provider order kept, no score). Mutates and returns `r`. */
export function agentCandidateSet(tool: RankTool, r: Record<string, unknown>, candidates: readonly Candidate[], need: NeedProfile, lang: string): CandidateSetOutcome {
  const removed: CandidateSetOutcome['removed'] = []
  const gone = new Set<unknown>()
  for (const c of candidates) {
    const why = verdict(tool, c, need)
    if (!why) continue
    removed.push({ name: c.name ?? '', why })
    gone.add(c.raw)
  }
  if (gone.size) for (const key of ROW_KEYS[tool]) if (Array.isArray(r[key])) r[key] = (r[key] as unknown[]).filter(row => !gone.has(row))
  const valid = candidates.filter(c => !gone.has(c.raw))
  if (candidates.length > 0 && valid.length === 0 && !r._tappy_constraint_unmet) {
    r._tappy_constraint_unmet = {
      excluded_by: removed.reduce<Record<string, number>>((a, x) => ({ ...a, [x.why]: (a[x.why] ?? 0) + 1 }), {}),
      note: lang === 'en'
        ? 'NO candidate meets the user\'s hard constraints. Say so plainly and offer to widen the constraint; do not present an excluded candidate.'
        : 'KHÔNG có ứng viên nào đáp ứng ràng buộc bắt buộc của người dùng. Nói thẳng điều đó và đề nghị nới ràng buộc; không đưa ứng viên vi phạm.',
    }
  }
  let shortlisted: Candidate[] | null = null
  if (tool === 'search_products') {
    const byRaw = new Map(valid.map(c => [c.raw, c]))
    for (const key of ROW_KEYS[tool]) {
      if (!Array.isArray(r[key])) continue
      const rows = r[key] as unknown[]
      if (rows.length > MODEL_ROWS_MAX) { r._tappy_total_found = rows.length; r[key] = rows.slice(0, MODEL_ROWS_MAX) }
      const mine = (r[key] as unknown[]).map(row => byRaw.get(row)).filter((c): c is Candidate => !!c)
      if (mine.length) shortlisted = [...(shortlisted ?? []), ...mine]
    }
  }
  r._tappy_order_note = lang === 'en' ? ORDER_NOTE_EN : ORDER_NOTE_VI
  return { result: r, shortlisted, removed }
}
