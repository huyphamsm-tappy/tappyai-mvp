import { SHOPPING_SHORTLIST } from '@/lib/config/product'
import type { Candidate } from './candidate'
import type { RankedEntry } from './rank'

/**
 * Trim a ranked shopping result to the decision set the model should write about.
 *
 * ============================================================================
 * WHY THIS TRIMS AND NEVER GROUPS
 * ============================================================================
 * Serper `/shopping` returns up to 40 priced listings for one query, and handing every one to the
 * model made it write about every one: measured 3,646–3,803 characters of reply, ~73% of a
 * 14-second turn spent generating. The ranker has already put the decision-relevant rows first, so
 * the tail only ever made the answer longer.
 *
 * 🚨 The obvious-looking alternative — collapsing rows into "one product, many offers" — is
 * FORBIDDEN here and the reason is measured, not stylistic. On production, one MacBook query
 * returned 40 rows with 40 DISTINCT `product_id`s (the provider's id is per-listing), and those
 * rows mixed M1 Pro with M1 Max and like-new with sealed retail, at 25.8M to 57.99M VND. Merging
 * them would present the cheapest as an offer for a machine it is not — inventing a bargain that
 * does not exist. Rows that survive here are unchanged rows; nothing is merged, and no product
 * identity is inferred.
 *
 * `totalFound` travels with the trimmed array so the reply can say how many listings existed. A
 * shortlist presented as the whole market is its own kind of false claim.
 */
export interface Shortlisted<T> {
  rows: T[]
  /** Total rows before trimming, or null when nothing was trimmed. */
  totalFound: number | null
}

/**
 * @param sorted    rows the ranker ordered, best first
 * @param untouched rows the normalizer skipped — kept only when nothing is trimmed, since an
 *                  unranked row has no claim to a place in a shortlist
 */
export function shortlistShopping<T>(
  sorted: readonly T[],
  untouched: readonly T[] = [],
  limit: number = SHOPPING_SHORTLIST,
): Shortlisted<T> {
  const total = sorted.length + untouched.length
  // A cap that cannot cut anything is not applied, so `totalFound` stays null and the reply has
  // nothing to qualify — the list it received IS everything found.
  if (limit <= 0 || sorted.length <= limit) {
    return { rows: [...sorted, ...untouched], totalFound: null }
  }
  return { rows: sorted.slice(0, limit), totalFound: total }
}

// ── Phase A A5 — Generalized Rule-of-1–3 selector ─────────────────────────────
//
// A cross-domain shortlist over ranked candidates. This is orthogonal to
// `shortlistShopping` (which trims provider ROWS by index for the /shopping
// pipeline whose rows and Candidates are 1:1 but strongly typed as rows). This
// selector operates on already-ranked `RankedEntry[]` and dedupes by the
// canonical `Candidate.id` — `place_id` for places, `product_id`/link for
// shopping, `serviceID` for transport (see candidate normalizers).
//
// Contract (frozen product principle P7 — RULE OF 1–3):
//   1 rankable candidate      → 1
//   2 differentiated          → 2
//   3 differentiated          → 3
//   >3                        → best 3, deduped
//   duplicate identity        → keep first, drop rest
//   forced third              → never — MAX applies, MIN is what evidence supports
//
// The selector never invents differentiation. If rank 2 and rank 3 carry the
// same identity (same `place_id`, same product id, same normalized link), the
// second copy is dropped and the shortlist gets shorter, not filled by rank 4.
// This is the "no fake Hidden Gem" rule from the task.

export const RULE_OF_ONE_TO_THREE_MAX = 3

/**
 * Role tag on a selected candidate. Assigned only when the ranked reasons
 * actually support the tag; the caller (synthesizer / prompt block) reads the
 * tag as a hint, never as a fact about the candidate itself.
 */
export type CandidateRole = 'best_overall' | 'value_gem' | 'vibe_experience' | null

export interface SelectedCandidate {
  entry: RankedEntry
  /** Assigned only when the ranked reasons actually support the role. */
  role: CandidateRole
}

export interface CandidateShortlist {
  selected: SelectedCandidate[]
  /** Total ranked entries before diversity + cap were applied. */
  totalRanked: number
  /** Identities dropped as duplicates of an earlier selection. Debug-only. */
  duplicatesDropped: number
}

/**
 * Diversity-aware selection over a RankedResult, capped at 3.
 *
 * @param ranked  RankedResult.ranked from `rankCandidates`, best-first
 * @param max     hard cap (default 3, task's Rule of 1–3)
 */
export function shortlistCandidates(
  ranked: readonly RankedEntry[],
  max: number = RULE_OF_ONE_TO_THREE_MAX,
): CandidateShortlist {
  const cap = Math.max(0, Math.min(max, RULE_OF_ONE_TO_THREE_MAX))
  const totalRanked = ranked.length
  if (cap === 0 || totalRanked === 0) {
    return { selected: [], totalRanked, duplicatesDropped: 0 }
  }

  const seen = new Set<string>()
  const kept: RankedEntry[] = []
  let duplicatesDropped = 0

  for (const entry of ranked) {
    const key = identityKey(entry.candidate)
    if (seen.has(key)) { duplicatesDropped++; continue }
    seen.add(key)
    kept.push(entry)
    if (kept.length >= cap) break
  }

  return {
    selected: kept.map((entry, idx) => ({ entry, role: assignRole(entry, idx, kept) })),
    totalRanked,
    duplicatesDropped,
  }
}

/**
 * Stable identity key for dedupe. Uses the candidate's own `id` first — that is
 * the canonical id normalizers already derive from `place_id` / `product_id` /
 * `serviceID`. Falls back to a normalized link, then to a lower-cased trimmed
 * name. "Different name" alone never counts as different identity.
 */
export function identityKey(c: Candidate): string {
  const id = (c.id || '').trim()
  if (id) return `id:${id.toLowerCase()}`
  const link = (c.link || '').trim().toLowerCase()
  if (link) return `link:${normalizeLink(link)}`
  const name = (c.name || '').trim().toLowerCase()
  return `name:${name}`
}

/** Strip query-string tracking noise so `?utm=...` variants collapse to one identity. */
function normalizeLink(raw: string): string {
  try {
    const u = new URL(raw)
    return `${u.host}${u.pathname}`
  } catch { return raw }
}

/**
 * Role assignment. Roles are only assigned when the underlying ranked reasons
 * make the label truthful — the selector never invents a "value gem" to fill a
 * slot. When no role is truthful, the candidate is selected with `role: null`.
 */
function assignRole(entry: RankedEntry, idx: number, all: readonly RankedEntry[]): CandidateRole {
  // Rank 0 with any positive reason is best_overall.
  if (idx === 0 && entry.reasons.some(r => r.contribution > 0)) return 'best_overall'
  if (idx === 0) return null

  // A "value gem" earns the label when its price beats every earlier selection
  // AND price actually contributed to its score. Never assigned when price is
  // absent — that would silently claim a price advantage that has no evidence.
  const myPrice = entry.candidate.attrs.priceVnd
  if (typeof myPrice === 'number' && entry.reasons.some(r => r.key === 'price' && r.contribution > 0)) {
    const beatenAll = all.slice(0, idx).every(e => {
      const p = e.candidate.attrs.priceVnd
      return typeof p !== 'number' || myPrice < p
    })
    if (beatenAll) return 'value_gem'
  }

  // A "vibe experience" earns the label when the entry's decisive reason is a
  // vibe/experience axis (outdoor, wifi, cuisine, tag) rather than raw score.
  const decisive = entry.reasons[0]
  if (decisive && (decisive.key === 'outdoor' || decisive.key === 'wifi' || decisive.key.startsWith('cuisine:'))) {
    return 'vibe_experience'
  }

  return null
}
