import { W_PREFERENCE, type NeedProfile } from './needProfile'
import { CONSTRAINT_REGISTRY, hasExplicitPriorityState, type ConstraintId } from './decisionState'
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
  /**
   * The same grounding as DATA, so a client can say it in its own language.
   *
   * `detail` is English prose assembled here — "rated 4.9", "1500 reviews",
   * "15900000 VND" — and it reached a Vietnamese user verbatim on the shopping
   * card, raw integer and all. Translating the finished string in React would be
   * a second, brittle authority over wording; the fix belongs at the source.
   *
   * `key` already names the reason class, so `key` + `params` is everything a
   * dictionary needs. `detail` is unchanged and stays the fallback: prompt
   * blocks, evidence records and native clients read it exactly as before, and a
   * marker persisted before this field existed still renders.
   */
  params?: Record<string, string | number>
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
  /**
   * Phase 3B (places only): where the candidate stands against a SOFT budget ("khoảng / tầm / around"): `within` = known price at or under
   * the stated amount, `unknown` = no price evidence (never a penalty), `above` = known price over it (still eligible). Absent whenever the
   * soft-budget tier does not apply. An ordering key, not a score: it carries no weight.
   */
  budgetTier?: 'within' | 'unknown' | 'above'
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
  // Transport: minutes to pickup. Weighted like distance — for a ride, waiting
  // is the same kind of cost as travelling further.
  eta: 0.5,
  // Amenity booleans: weak on their own, decisive once the user names them.
  wifi: 0.2,
  outdoor: 0.2,
  vegetarian: 0.2,
  cuisine: 0.3,
  // No base weight: "open now" and a price band only count when the request
  // is time-bound / budget-bound (a stated priority), so an unrelated attribute
  // can never make a candidate "best" on its own.
  openNow: 0,
  priceBand: 0,
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
const SCOREABLE = ['rating', 'reviewCount', 'distance', 'price', 'stars', 'eta', 'wifi', 'outdoor', 'vegetarian', 'cuisine', 'openNow', 'priceBand']

function hasEvidenceFor(attrs: CandidateAttrs, key: string): boolean {
  switch (key) {
    case 'rating': return attrs.rating !== undefined
    case 'reviewCount': return attrs.reviewCount !== undefined
    case 'distance': return attrs.distanceKm !== undefined
    case 'price': return attrs.priceVnd !== undefined
    case 'stars': return attrs.stars !== undefined
    case 'eta': return attrs.etaMinutes !== undefined
    case 'wifi': return attrs.wifi !== undefined
    case 'outdoor': return attrs.outdoorSeating !== undefined
    case 'vegetarian': return attrs.vegetarian !== undefined
    case 'cuisine': return attrs.cuisine !== undefined
    case 'openNow': return attrs.openNow !== undefined
    case 'priceBand': return attrs.priceHighVnd !== undefined
    default: return false
  }
}

/** True when a candidate carries anything at all worth ordering on. */
function isRankable(c: Candidate): boolean {
  return SCOREABLE.some(k => hasEvidenceFor(c.attrs, k)) || c.attrs.directPage === true
}

// ── Phase 3B: PLACES modes (docs/audit/PHASE-3-ARCHITECTURE-LOCK.md §3.1, owner decisions D4 / D5 / D6) ──────────────────────────
//
// `legacy` is every non-places candidate set (hotels, transport, products, mixed or empty sets): byte-for-byte the behaviour before 3B.
//
//   default   no explicit priority, no balance: rating + the existing review-count term. Price, distance and the amenity booleans are inert
//             unless the user said something about them (BM §15: nothing is invented as a default).
//   explicit  a stated priority (weight >= 2) or several: the default block is OFF, each stated priority scores with its OWN existing weight.
//   balanced  "can bang": equal weight (1) over the criteria the user stated, each min-max normalised over the hard-filter survivors.
//
// No new numeric weight exists anywhere in this block: unit weights for balance, the existing priority weights for explicit mode, the existing
// BASE weights for the default, the existing soft-preference weight for household context. The soft-budget tier is an ordering key.
type Mode = 'legacy' | 'default' | 'explicit' | 'balanced' | 'extreme'

/**
 * Final fix B. ONE stated priority that is a superlative on a rankable axis ("rẻ nhất", "gần nhất", "đánh giá cao nhất"): the answer is the extreme
 * candidate on that axis, so the key is scored by min–max over the hard-filter survivors — the machinery balanced mode already uses (unit weight, missing
 * evidence = 0 and listed in `missing`, no new weight, no new threshold). A linear 0–10 km / band-fits term cannot do this: it ties beyond 10 km and
 * under a budget, and the default rating + review baseline outweighed a weight-1 price or distance term (benchmark A02-1, A03-1, A03-2, A04-2).
 */
const EXTREME_KEYS = ['price', 'distance', 'rating']
function extremeKey(need: NeedProfile): string | null {
  const live = need.priorities.filter(p => p.source !== 'preference')
  if (live.length !== 1) return null
  const p = live[0]
  return p.extreme === true && EXTREME_KEYS.includes(p.key) ? p.key : null
}

function modeFor(set: Candidate[], need: NeedProfile): Mode {
  if (set.length === 0 || !set.every(c => c.domain === 'places')) return 'legacy'
  if (need.tradeoff) return 'balanced'
  if (extremeKey(need)) return 'extreme'
  if (hasExplicitPriorityState(need)) return 'explicit'
  return 'default'
}

interface Ctx {
  mode: Mode
  /** Highest KNOWN price band among the hard-filter survivors (the set-relative scale for a price priority without a budget). */
  bandCeiling: number | null
  /** Keys the user said do NOT matter: their default contribution is off. */
  dismissed: ReadonlySet<string>
}

/** The weight a key carries in this mode. Legacy: BASE + priority (unchanged). */
function weightFor(ctx: Ctx, need: NeedProfile, key: string): number {
  const prio = priorityWeight(need, key)
  if (ctx.mode === 'legacy') return (BASE[key] ?? 0) + prio
  if (ctx.mode === 'explicit') return prio
  const block = key === 'rating' || key === 'reviewCount'
  const base = block ? (ctx.dismissed.has(key) ? 0 : BASE[key]) : (prio > 0 ? (BASE[key] ?? 0) : 0)
  return base + prio
}

/** The limit a place price is measured against: the amount the user said (the `around` +20 % is our tolerance, not their words). */
const budgetLimit = (need: NeedProfile): number | null => need.budget ? (need.budgetStated ?? need.budget.max) : null

/** Registry ids that live in `constraints[]` only (the ones with a legacy key are already handled by `mustHave` / `avoid`). */
const CONSTRAINT_ATTR: Partial<Record<ConstraintId, keyof CandidateAttrs>> = {
  helmet_included: 'helmetIncluded',
  spicy: 'spicy',
  family_friendly: 'familyFriendly',
}
const newConstraints = (need: NeedProfile) =>
  (need.constraints ?? []).filter(k => k.kind !== 'soft_pref' && k.strength === 'stated' && CONSTRAINT_REGISTRY[k.id].legacyKey === null && CONSTRAINT_ATTR[k.id])

/** Is price carried by a scoring path in this request? If so the soft-budget tier is absent (price is never counted twice). */
function priceScored(ctx: Ctx, need: NeedProfile): boolean {
  if (ctx.mode === 'balanced') return balancedKeys(need).includes('price')
  return priorityWeight(need, 'price') > 0
}

/** The criteria that take part in balanced mode: exactly what the user stated (a stated budget is a stated price criterion). */
function balancedKeys(need: NeedProfile): string[] {
  const keys = [...(need.tradeoff?.keys ?? [])]
  const dismissedPrice = (need.dismissed ?? []).some(d => d.key === 'price')
  if (need.budget && !keys.includes('price') && !dismissedPrice) keys.push('price')
  return keys
}

const BALANCED_VALUE: Record<string, { get: (a: CandidateAttrs) => number | undefined; higherBetter: boolean; label: string }> = {
  rating: { get: a => a.rating, higherBetter: true, label: 'rating' },
  price: { get: a => a.priceHighVnd, higherBetter: false, label: 'price band' },
  distance: { get: a => a.distanceKm, higherBetter: false, label: 'distance' },
  wifi: { get: a => (a.wifi === undefined ? undefined : a.wifi ? 1 : 0), higherBetter: true, label: 'wifi' },
  outdoor: { get: a => (a.outdoorSeating === undefined ? undefined : a.outdoorSeating ? 1 : 0), higherBetter: true, label: 'outdoor seating' },
}

/**
 * Balanced mode. Per participating criterion: min-max over the KNOWN values of the hard-filter survivors; a candidate without evidence for it
 * contributes exactly 0 and is listed in `missing` (never a penalty, never an inferred value); fewer than two known values, or no spread,
 * means no scaling and a contribution of 0. The score is the equal-weight (unit) sum.
 */
function scoreBalanced(kept: Candidate[], need: NeedProfile, keys: string[] = balancedKeys(need)): Map<Candidate, { score: number; reasons: Reason[]; missing: string[] }> {
  const out = new Map<Candidate, { score: number; reasons: Reason[]; missing: string[] }>()
  for (const c of kept) out.set(c, { score: 0, reasons: [], missing: [] })
  for (const key of keys) {
    const spec = BALANCED_VALUE[key]
    const values = kept.map(c => (spec ? spec.get(c.attrs) : undefined))
    const known = values.filter((v): v is number => typeof v === 'number')
    const lo = known.length ? Math.min(...known) : 0
    const hi = known.length ? Math.max(...known) : 0
    kept.forEach((c, i) => {
      const o = out.get(c)!
      const v = values[i]
      if (v === undefined) { o.missing.push(key); return }
      if (known.length < 2 || hi === lo) return
      const norm = spec.higherBetter ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)
      if (norm === 0) return
      o.score += norm
      o.reasons.push({ key, detail: `${spec.label} ${v}, relative to the other candidates`, contribution: norm, params: { value: v } })
    })
  }
  return out
}

function scoreOne(
  c: Candidate,
  need: NeedProfile,
  ctx: Ctx,
  /**
   * What a price is measured against.
   *
   * The stated budget when there is one; otherwise the highest KNOWN price in
   * this candidate set. Without the fallback the price term never fired unless
   * the user named a number — so "đi xe giá rẻ" / "a cheap ride", the ordinary
   * way a price preference is expressed, ranked as if price had not been
   * mentioned. The fallback invents nothing: it compares real prices against
   * the most expensive real option actually offered.
   */
  priceCeiling: number | null,
): { score: number; reasons: Reason[]; missing: string[] } {
  const a = c.attrs
  const reasons: Reason[] = []
  const missing: string[] = []
  let score = 0

  const addWith = (key: string, w: number, norm: number, detail: string, params?: Record<string, string | number>) => {
    const contribution = w * norm
    if (contribution === 0) return
    score += contribution
    reasons.push({ key, detail, contribution, ...(params ? { params } : {}) })
  }
  const add = (key: string, norm: number, detail: string, params?: Record<string, string | number>) => addWith(key, weightFor(ctx, need, key), norm, detail, params)

  // ── Rating: 3.0 is the floor of "worth mentioning", 5.0 the ceiling ────────
  if (a.rating !== undefined) {
    add('rating', clamp01((a.rating - 3) / 2), `rated ${a.rating}`, { value: a.rating })
  } else if (priorityWeight(need, 'rating') > 0) missing.push('rating')

  // ── Review count: confidence in the rating, log-scaled (10k ⇒ full) ───────
  if (a.reviewCount !== undefined) {
    add('reviewCount', clamp01(Math.log10(Math.max(1, a.reviewCount)) / 4), `${a.reviewCount} reviews`, { count: a.reviewCount })
  }

  // ── Distance: linear to 10km, beyond which further is simply "far" ────────
  if (a.distanceKm !== undefined) {
    add('distance', clamp01(1 - a.distanceKm / 10), `${a.distanceKm}km away`, { km: a.distanceKm })
  } else if (priorityWeight(need, 'distance') > 0) missing.push('distance')

  // ── Price: measured against the budget, or against the set's own top price ─
  if (ctx.mode === 'legacy') {
    if (a.priceVnd !== undefined && priceCeiling !== null && priceCeiling > 0) {
      add('price', clamp01((priceCeiling - a.priceVnd) / priceCeiling), `${a.priceVnd} VND`, { priceVnd: a.priceVnd })
    } else if (a.priceVnd === undefined && priorityWeight(need, 'price') > 0) missing.push('price')

    // ── Place price band: the bound fits the budget, or it does not ───────────
    // Only against a STATED budget (there is no set-wide ceiling for bands) and
    // only when price is a priority; a band under budget is evidence FOR, one
    // over it is evidence AGAINST, and no band is simply unknown.
    if (a.priceHighVnd !== undefined && need.budget && need.budget.max > 0 && priorityWeight(need, 'price') > 0) {
      const fits = a.priceHighVnd <= need.budget.max
      add('priceBand', fits ? 1 : -1, fits ? `price band up to ${a.priceHighVnd} VND fits the budget` : `price band up to ${a.priceHighVnd} VND is over the budget`, { priceHighVnd: a.priceHighVnd })
    }
  } else if (priorityWeight(need, 'price') > 0) {
    // ── Places, price priority stated: the ONE price path (3B.2). The existing `priceBand` term, on its two scales ──────────────
    //   with a stated budget  -> the band bound fits the amount the user said, or it does not (the existing term);
    //   without a budget      -> the band bound relative to the dearest KNOWN band in the surviving set (the same idea the point price uses).
    // A band is a bound, not a price; no band is UNKNOWN (recorded, never a penalty).
    if (a.priceHighVnd === undefined) missing.push('price')
    else if (need.budget && need.budget.max > 0) {
      const limit = budgetLimit(need) ?? need.budget.max
      const fits = a.priceHighVnd <= limit
      addWith('priceBand', priorityWeight(need, 'price'), fits ? 1 : -1, fits ? `price band up to ${a.priceHighVnd} VND fits the budget` : `price band up to ${a.priceHighVnd} VND is over the budget`, { priceHighVnd: a.priceHighVnd })
    } else if (ctx.bandCeiling !== null && ctx.bandCeiling > 0) {
      addWith('priceBand', priorityWeight(need, 'price'), clamp01((ctx.bandCeiling - a.priceHighVnd) / ctx.bandCeiling), `price band up to ${a.priceHighVnd} VND`, { priceHighVnd: a.priceHighVnd })
    }
  }

  // ── Open now: only for a time-bound request ("trưa nay", "đang mở") ───────
  if (a.openNow !== undefined) {
    if (priorityWeight(need, 'openNow') > 0) add('openNow', a.openNow ? 1 : -1, a.openNow ? 'open now' : 'closed now')
  } else if (priorityWeight(need, 'openNow') > 0) missing.push('openNow')

  // ── Hotel stars ───────────────────────────────────────────────────────────
  if (a.stars !== undefined) add('stars', clamp01((a.stars - 1) / 4), `${a.stars}-star`, { stars: a.stars })

  // ── Transport: minutes to PICKUP (not journey time) ──────────────────────
  // Linear to 20 minutes, beyond which a wait is simply "long".
  if (a.etaMinutes !== undefined) {
    add('eta', clamp01(1 - a.etaMinutes / 20), `${a.etaMinutes} min to pickup`, { minutes: a.etaMinutes })
  } else if (priorityWeight(need, 'eta') > 0) missing.push('eta')

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
    add(key, v ? 1 : -1, v ? `has ${key}` : `no ${key}`, { attribute: key })
  }

  // ── Cuisine: matches a "cuisine:x" priority the user stated ───────────────
  if (a.cuisine !== undefined) {
    for (const p of need.priorities) {
      if (!p.key.startsWith('cuisine:')) continue
      const want = p.key.slice('cuisine:'.length)
      if (a.cuisine.some(x => x.includes(want))) {
        const w = BASE.cuisine + p.weight
        score += w
        reasons.push({ key: p.key, detail: `serves ${want}`, contribution: w, params: { cuisine: want } })
      }
    }
  } else if (need.priorities.some(p => p.key.startsWith('cuisine:'))) {
    missing.push('cuisine')
  }

  // ── Household context (places, D8): a SOFT preference that counts ONLY where the row supplied the evidence ──────────────────────
  // Uses the existing soft-preference weight (no new weight). true => for, false => against (below "missing"), absent => UNKNOWN, recorded.
  // Never an elimination (that needs the user's mandatory wording, see hardFilter), and never invented from the user's own mention.
  if (ctx.mode === 'default' || ctx.mode === 'explicit') {
    if (need.household?.kids) {
      if (a.familyFriendly === undefined) missing.push('family_friendly')
      else {
        const w = a.familyFriendly ? W_PREFERENCE : -W_PREFERENCE
        score += w
        reasons.push({ key: 'family_friendly', detail: a.familyFriendly ? 'supplied as suitable for children' : 'supplied as not suited to children', contribution: w })
      }
    }
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
  // Phase 3B (places): the price evidence of a place is its band bound, and ONLY a hard budget (dưới / không quá / tối đa / a range)
  // eliminates. A soft budget ("around": khoảng / tầm) NEVER does — it is the ordering tier in rankCandidates. Other domains: unchanged.
  if (need.budget) {
    if (c.domain === 'places') {
      if (need.budget.type !== 'around') {
        const over = (c.attrs.priceHighVnd !== undefined && c.attrs.priceHighVnd > need.budget.max)
          || (c.attrs.priceVnd !== undefined && c.attrs.priceVnd > need.budget.max) // a structured point price, when a row carries one
        if (over) return 'budget'
      }
    } else if (c.attrs.priceVnd !== undefined && c.attrs.priceVnd > need.budget.max) return 'budget'
  }

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

  // Phase 3B.4: registry constraints the user worded as mandatory / avoid. Same policy: only CONTRADICTING supplied evidence eliminates;
  // an absent attribute is UNKNOWN and never does. (Ids with a legacy key are handled by the two checks above.)
  for (const k of newConstraints(need)) {
    const v = c.attrs[CONSTRAINT_ATTR[k.id]!]
    if (k.kind === 'must_have' && v === false) return 'mustHave'
    if (k.kind === 'avoid' && v === true) return 'avoid'
  }

  return null
}

/** Constraint ids a candidate carries no evidence for (UNKNOWN), by kind. */
function unverifiedConstraints(c: Candidate, need: NeedProfile, kind: 'must_have' | 'avoid'): string[] {
  return newConstraints(need).filter(k => k.kind === kind && c.attrs[CONSTRAINT_ATTR[k.id]!] === undefined).map(k => k.id)
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

  // A stated budget wins; otherwise the dearest KNOWN price in the surviving set
  // gives the price term a real scale to work against. Null when no candidate
  // carries a price, in which case the term simply does not fire.
  const knownPrices = kept.map(c => c.attrs.priceVnd).filter((p): p is number => typeof p === 'number')
  const priceCeiling = (need.budget && need.budget.max > 0)
    ? need.budget.max
    : (knownPrices.length > 0 ? Math.max(...knownPrices) : null)

  // Phase 3B: the places mode and its inputs. Everything below is computed over the hard-filter SURVIVORS only: an eliminated candidate can
  // not set a min, a max or a price ceiling, and can not take part in the soft-budget tier.
  const mode = modeFor(kept.length > 0 ? kept : list, need)
  const bands = kept.map(c => c.attrs.priceHighVnd).filter((p): p is number => typeof p === 'number')
  const ctx: Ctx = {
    mode,
    bandCeiling: bands.length > 0 ? Math.max(...bands) : null,
    dismissed: new Set((need.dismissed ?? []).map(d => d.key)),
  }
  const balanced = mode === 'balanced' ? scoreBalanced(kept, need) : mode === 'extreme' ? scoreBalanced(kept, need, [extremeKey(need) as string]) : null

  // Soft-budget tier (places, "around"): within the amount the user said / unknown price / above. Absent when price is already scored.
  const limit = budgetLimit(need)
  const tierApplies = mode !== 'legacy' && mode !== 'balanced' && need.budget?.type === 'around' && limit !== null
    && !ctx.dismissed.has('price') && !priceScored(ctx, need)
  const tierRank = { within: 0, unknown: 1, above: 2 } as const
  const tierOf = (c: Candidate): RankedEntry['budgetTier'] => {
    const p = c.attrs.priceHighVnd
    return p === undefined ? 'unknown' : p <= (limit as number) ? 'within' : 'above'
  }

  const scored: RankedEntry[] = kept.map(c => {
    const { score, reasons, missing } = balanced ? balanced.get(c)! : scoreOne(c, need, ctx, priceCeiling)
    const tier = tierApplies ? tierOf(c) : undefined
    return {
      candidate: c,
      score,
      // Strongest contribution first, so the explanation leads with what decided it.
      reasons: [...reasons].sort((x, y) => y.contribution - x.contribution || x.key.localeCompare(y.key)),
      missing: tier === 'unknown' ? [...missing, 'price'] : missing,
      unverifiedMustHave: [...unverified(c, need.mustHave), ...unverifiedConstraints(c, need, 'must_have')],
      unverifiedAvoid: [...(need.avoid.includes('non-vegetarian') && c.attrs.vegetarian === undefined ? ['non-vegetarian'] : []), ...unverifiedConstraints(c, need, 'avoid')],
      ...(tier ? { budgetTier: tier } : {}),
    }
  })

  // RANK-07: with no rankable evidence anywhere, sorting would dress the
  // provider's own order up as a score. Report that honestly and hand the
  // provider order back untouched — this is today's Shopping shape, and ranking
  // it is precisely the "provider default order as consultative ranking" §14
  // forbids. The per-candidate bookkeeping (what is missing, what could not be
  // verified) is still produced: it is what lets the reply hedge correctly.
  const rankable = kept.some(isRankable)
  if (rankable && mode === 'legacy') {
    scored.sort((a, b) =>
      b.score - a.score
      || (b.candidate.attrs.reviewCount ?? 0) - (a.candidate.attrs.reviewCount ?? 0)
      || a.candidate.name.localeCompare(b.candidate.name)
      // Final fix F: the stable id closes the chain here too, so two same-named candidates (a hotel chain's branches, a product listed by two
      // sellers) with an equal score and equal reviews are ordered by identity, never by the provider's input order.
      || a.candidate.id.localeCompare(b.candidate.id))
  } else if (rankable) {
    // Places. The chain is score -> reviews -> name (D6), with two precisions: the soft-budget tier sorts BEFORE the score when no explicit
    // priority applies (default mode) and only AFTER it under an explicit priority; and the reviews key is used only when review count is
    // not already inside the score (it is, in the default mode, so an exact tie there falls to the name). Input order never decides:
    // the last key is the stable id.
    const pre = mode === 'default'
    const reviewsInScore = mode === 'default'
    const tier = (e: RankedEntry) => (e.budgetTier ? tierRank[e.budgetTier] : 0)
    scored.sort((a, b) =>
      (pre ? tier(a) - tier(b) : 0)
      || b.score - a.score
      || (pre ? 0 : tier(a) - tier(b))
      || (reviewsInScore ? 0 : (b.candidate.attrs.reviewCount ?? 0) - (a.candidate.attrs.reviewCount ?? 0))
      || a.candidate.name.localeCompare(b.candidate.name)
      || a.candidate.id.localeCompare(b.candidate.id))
  }

  return { ranked: scored, filtered, rankable, budgetFilterEmpty }
}
