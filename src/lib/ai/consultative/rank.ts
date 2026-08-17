import type { NeedProfile } from './needProfile'
import type { Candidate, CandidateAttrs } from './candidate'

export type { Candidate, CandidateAttrs } from './candidate'

// ── The deterministic ranker (Phase 2 §4) ───────────────────────────────────
//
// ONE ranker for every domain. Adapters normalize, this orders. Pure: no network,
// no model, no clock, no randomness — which is exactly what makes §14 ("a user's
// priorities change the recommendation") provable in a unit test rather than
// estimated from a sampling rate.
//
// It also keeps the architecture lock intact: the route still makes exactly one
// AI.stream() call, because ranking never asks a model anything.

export interface Reason {
  /** The attribute that contributed — 'rating', 'distance', 'wifi', … */
  key: string
  /** Human-readable grounding, built only from values present in the evidence. */
  detail: string
  /** Signed contribution to the score. Negative means evidence AGAINST. */
  contribution: number
}

export interface RankedEntry {
  candidate: Candidate
  score: number
  reasons: Reason[]
  /** Attributes the user cares about for which this candidate has NO evidence. */
  missing: string[]
  /** Must-haves that could not be confirmed (absent evidence, not contradiction). */
  unverifiedMustHave: string[]
  /** Exclusions that could not be confirmed. The reply should hedge, not assert. */
  unverifiedAvoid: string[]
}

export interface RankedResult {
  ranked: RankedEntry[]
  filtered: Array<{ candidate: Candidate; filteredBy: 'budget' | 'mustHave' | 'avoid' }>
  /** False when no candidate carried a single rankable attribute — see RANK-07. */
  rankable: boolean
  /** True when candidates existed and the budget filter removed every one of them. */
  budgetFilterEmpty: boolean
}

// ── Weights ─────────────────────────────────────────────────────────────────
//
// `base` is how much an attribute matters to ANY user (a 4.8-rated place is
// better than a 3.1-rated one whether or not they said "rating"). The user's own
// priority weight is ADDED on top, so stating a priority amplifies rather than
// replaces the evidence. Bounded and small on purpose: no term can run away.

const BASE: Record<string, number> = {
  rating: 1.0,
  reviewCount: 0.3,
  distance: 0.5,
  price: 0.5,
  stars: 0.4,
  directPage: 0.4,
  // Amenity booleans: weak on their own, decisive once the user names them.
  wifi: 0.2,
  outdoor: 0.2,
  vegetarian: 0.2,
  cuisine: 0.3,
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** How much the user asked for this attribute. Absent priority ⇒ 0. */
function priorityWeight(need: NeedProfile, key: string): number {
  return need.priorities.find(p => p.key === key)?.weight ?? 0
}

/** Amenity priorities that map onto a boolean attribute. */
const BOOLEAN_ATTRS: ReadonlyArray<[string, keyof CandidateAttrs]> = [
  ['wifi', 'wifi'],
  ['outdoor', 'outdoorSeating'],
  ['vegetarian', 'vegetarian'],
]

/** Every attribute the ranker can score, for missing-evidence bookkeeping. */
const SCOREABLE = ['rating', 'reviewCount', 'distance', 'price', 'stars', 'wifi', 'outdoor', 'vegetarian', 'cuisine']

function hasEvidenceFor(attrs: CandidateAttrs, key: string): boolean {
  switch (key) {
    case 'rating': return attrs.rating !== undefined
    case 'reviewCount': return attrs.reviewCount !== undefined
    case 'distance': return attrs.distanceKm !== undefined
    case 'price': return attrs.priceVnd !== undefined
    case 'stars': return attrs.stars !== undefined
    case 'wifi': return attrs.wifi !== undefined
    case 'outdoor': return attrs.outdoorSeating !== undefined
    case 'vegetarian': return attrs.vegetarian !== undefined
    case 'cuisine': return attrs.cuisine !== undefined
    default: return false
  }
}

/** True when a candidate carries anything at all worth ordering on. */
function isRankable(c: Candidate): boolean {
  return SCOREABLE.some(k => hasEvidenceFor(c.attrs, k)) || c.attrs.directPage === true
}

function scoreOne(c: Candidate, need: NeedProfile): { score: number; reasons: Reason[]; missing: string[] } {
  const a = c.attrs
  const reasons: Reason[] = []
  const missing: string[] = []
  let score = 0

  const add = (key: string, norm: number, detail: string) => {
    const w = (BASE[key] ?? 0) + priorityWeight(need, key)
    const contribution = w * norm
    if (contribution === 0) return
    score += contribution
    reasons.push({ key, detail, contribution })
  }

  // ── Rating: 3.0 is the floor of "worth mentioning", 5.0 the ceiling ────────
  if (a.rating !== undefined) {
    add('rating', clamp01((a.rating - 3) / 2), `rated ${a.rating}`)
  } else if (priorityWeight(need, 'rating') > 0) missing.push('rating')

  // ── Review count: confidence in the rating, log-scaled (10k ⇒ full) ───────
  if (a.reviewCount !== undefined) {
    add('reviewCount', clamp01(Math.log10(Math.max(1, a.reviewCount)) / 4), `${a.reviewCount} reviews`)
  }

  // ── Distance: linear to 10km, beyond which further is simply "far" ────────
  if (a.distanceKm !== undefined) {
    add('distance', clamp01(1 - a.distanceKm / 10), `${a.distanceKm}km away`)
  } else if (priorityWeight(need, 'distance') > 0) missing.push('distance')

  // ── Price: only meaningful against a budget the user actually stated ──────
  if (a.priceVnd !== undefined && need.budget && need.budget.max > 0) {
    add('price', clamp01((need.budget.max - a.priceVnd) / need.budget.max), `${a.priceVnd} VND`)
  } else if (a.priceVnd === undefined && priorityWeight(need, 'price') > 0) missing.push('price')

  // ── Hotel stars ───────────────────────────────────────────────────────────
  if (a.stars !== undefined) add('stars', clamp01((a.stars - 1) / 4), `${a.stars}-star`)

  // ── Source trust: a bookable hotel page beats a search-results page ───────
  if (a.directPage === true) add('directPage', 1, 'direct booking page')

  // ── Amenity booleans ──────────────────────────────────────────────────────
  //
  // true  ⇒ +w  (evidence FOR)
  // false ⇒ −w  (evidence AGAINST — the tag exists and says no)
  // absent⇒  0  (no evidence; recorded, never penalised)
  //
  // That ordering — matching > missing > contradicting — is the whole
  // missing-data policy expressed as arithmetic.
  for (const [key, attr] of BOOLEAN_ATTRS) {
    const v = a[attr] as boolean | undefined
    if (v === undefined) {
      if (priorityWeight(need, key) > 0) missing.push(key)
      continue
    }
    add(key, v ? 1 : -1, v ? `has ${key}` : `no ${key}`)
  }

  // ── Cuisine: matches a "cuisine:x" priority the user stated ───────────────
  if (a.cuisine !== undefined) {
    for (const p of need.priorities) {
      if (!p.key.startsWith('cuisine:')) continue
      const want = p.key.slice('cuisine:'.length)
      if (a.cuisine.some(x => x.includes(want))) {
        const w = BASE.cuisine + p.weight
        score += w
        reasons.push({ key: p.key, detail: `serves ${want}`, contribution: w })
      }
    }
  } else if (need.priorities.some(p => p.key.startsWith('cuisine:'))) {
    missing.push('cuisine')
  }

  return { score, reasons, missing }
}

/**
 * Hard filters. A candidate is eliminated ONLY on evidence that contradicts a
 * stated requirement — never on the absence of evidence.
 */
function hardFilter(c: Candidate, need: NeedProfile): 'budget' | 'mustHave' | 'avoid' | null {
  // Budget (owner Decision 3: FILTER, never demote). Requires a KNOWN price:
  // an unpriced candidate is not over budget, it is unmeasured.
  if (need.budget && c.attrs.priceVnd !== undefined && c.attrs.priceVnd > need.budget.max) return 'budget'

  // Must-have: eliminate only when the attribute is present AND false.
  for (const key of need.mustHave) {
    const pair = BOOLEAN_ATTRS.find(([k]) => k === key)
    if (!pair) continue
    if (c.attrs[pair[1]] === false) return 'mustHave'
  }

  // Exclusions. `non-vegetarian` is the dietary case: prompt rule R20 makes it a
  // hard constraint, so explicit evidence of "not vegetarian" eliminates. Absent
  // diet data does NOT — OSM carries the tag on a small minority of venues, so
  // filtering on absence would eliminate nearly every real restaurant, and R20
  // itself says to state uncertainty rather than assert.
  if (need.avoid.includes('non-vegetarian') && c.attrs.vegetarian === false) return 'avoid'

  return null
}

function unverified(c: Candidate, keys: string[]): string[] {
  const out: string[] = []
  for (const key of keys) {
    const pair = BOOLEAN_ATTRS.find(([k]) => k === key)
    if (pair && c.attrs[pair[1]] === undefined) out.push(key)
  }
  return out
}

/**
 * Rank candidates against a structured need.
 *
 * Deterministic: the same (candidates, need) always produces byte-identical
 * output. Ties break on a documented chain — score, then review count, then name
 * — so input order never decides an outcome.
 */
export function rankCandidates(candidates: Candidate[], need: NeedProfile): RankedResult {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : []

  const kept: Candidate[] = []
  const filtered: RankedResult['filtered'] = []
  for (const c of list) {
    const why = hardFilter(c, need)
    if (why) filtered.push({ candidate: c, filteredBy: why })
    else kept.push(c)
  }

  const budgetFilterEmpty =
    list.length > 0 && kept.length === 0 && filtered.every(f => f.filteredBy === 'budget')

  const scored: RankedEntry[] = kept.map(c => {
    const { score, reasons, missing } = scoreOne(c, need)
    return {
      candidate: c,
      score,
      // Strongest contribution first, so the explanation leads with what decided it.
      reasons: [...reasons].sort((x, y) => y.contribution - x.contribution || x.key.localeCompare(y.key)),
      missing,
      unverifiedMustHave: unverified(c, need.mustHave),
      unverifiedAvoid: need.avoid.includes('non-vegetarian') && c.attrs.vegetarian === undefined ? ['non-vegetarian'] : [],
    }
  })

  // RANK-07: with no rankable evidence anywhere, sorting would dress the
  // provider's own order up as a score. Report that honestly and hand the
  // provider order back untouched — this is today's Shopping shape, and ranking
  // it is precisely the "provider default order as consultative ranking" §14
  // forbids. The per-candidate bookkeeping (what is missing, what could not be
  // verified) is still produced: it is what lets the reply hedge correctly.
  const rankable = kept.some(isRankable)
  if (rankable) {
    scored.sort((a, b) =>
      b.score - a.score
      || (b.candidate.attrs.reviewCount ?? 0) - (a.candidate.attrs.reviewCount ?? 0)
      || a.candidate.name.localeCompare(b.candidate.name))
  }

  return { ranked: scored, filtered, rankable, budgetFilterEmpty }
}
