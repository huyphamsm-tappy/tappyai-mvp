import type { CanonicalEntity } from './entity'
import type { Action } from './actions'
import type { ConfigMatch } from '@/lib/ai/consultative/synthesis'

// ── THE RECOMMENDATION LAYER ─────────────────────────────────────────────────
//
// The entity describes a THING. The recommendation describes *this thing, for
// this request* — which is why rank, match and reasons live here and not on the
// entity, and why an entity stays reusable across turns while a recommendation
// does not.
//
// 🔑 EXACTLY ONE FIELD IS AI-DERIVED: `summary`. Everything else is computed by
// the shipped consultative pipeline — `rankCandidates`, `shortlistCandidates`
// (Rule of 1–3) and `derivePick`. That ratio is the design's main safety
// property, and no new ranking system is introduced here: this module reads
// what those functions already produced.

/** A reason the ranker gave, with the evidence it rests on. Shape reused from the shopping synthesis. */
export interface RecommendationReason {
  attribute: string
  evidence: string
}

export interface Recommendation {
  entity: CanonicalEntity
  /** 0-based position in the ranked list. */
  rank: number
  /** 1–3, from the Rule-of-1–3 shortlist. `null` when this entry is not shortlisted. */
  shortlistPosition: number | null
  /** The shortlist role the existing engine assigned ('best_overall', 'cheapest', …). */
  role: string | null
  /** True for at most one entry per turn — `derivePick`'s choice. */
  recommended: boolean
  /** The MatchBadge contract, unchanged: 'khop' | 'khac' | 'chua_ro'. */
  matchVerdict: ConfigMatch | null
  reasons: RecommendationReason[]
  tradeOff: RecommendationReason | null
  /**
   * The one sentence the model writes.
   *
   * 🚨 Never populated server-side. It exists in the type so the frontend
   * contract is complete, and it is filled — if ever — by prose the model
   * produced, never by a value copied out of the entity.
   */
  summary?: string
  /** The subset of the entity's actions relevant to this recommendation, in priority order. */
  contextualActions: Action[]
}

/**
 * 🚨 `matchScore` IS NOT ON THE RECOMMENDATION, DELIBERATELY.
 *
 * The ranker computes a score and it stays inside the ranker. A number on screen
 * invites arithmetic the user cannot check and we cannot defend, and it would
 * need an explanation a card has no room for. `matchVerdict` is the exposed
 * form and it already has a shipped component (`MatchBadge`).
 */
export type InternalScore = never

/** One shortlist entry as the existing engine emits it into `_tappy_shortlist`. */
export interface ShortlistEntry {
  rank: number
  id: string
  name: string
  role: string
}

/**
 * Assemble recommendations from entities plus what the shipped pipeline already decided.
 *
 * Pure: no ranking, no scoring, no selection. It joins by candidate id, which is
 * why `buildPlaceEntity` and the ranker must agree on identity — a join by index
 * would shift the moment a normalizer skipped a nameless row, which is the exact
 * bug `_tappy_shortlist`'s id-based mapping was introduced to avoid.
 */
export function buildRecommendations(
  entities: CanonicalEntity[],
  ctx: {
    /** Candidate ids in ranked order, as `rankCandidates` produced them. */
    rankedIds?: string[]
    shortlist?: ShortlistEntry[]
    /** The candidate id `derivePick` chose, if it chose one. */
    pickedId?: string | null
    matchVerdicts?: Record<string, ConfigMatch>
    reasons?: Record<string, RecommendationReason[]>
    tradeOffs?: Record<string, RecommendationReason>
    /** Maps a canonical entity id to the candidate id the ranker used. */
    candidateIdOf?: (e: CanonicalEntity) => string
  } = {},
): Recommendation[] {
  const idOf = ctx.candidateIdOf ?? ((e: CanonicalEntity) => e.id)
  const rankOf = new Map((ctx.rankedIds ?? []).map((id, i) => [id, i]))
  const slOf = new Map((ctx.shortlist ?? []).map(s => [s.id, s]))

  return entities.map((entity, i) => {
    const cid = idOf(entity)
    const sl = slOf.get(cid)
    return {
      entity,
      // Falls back to input order when the ranker declined (RANK-07) — the
      // provider order is still an order, and pretending otherwise would drop
      // every recommendation on an unrankable turn.
      rank: rankOf.get(cid) ?? i,
      shortlistPosition: sl ? sl.rank + 1 : null,
      role: sl?.role ?? null,
      recommended: ctx.pickedId != null && ctx.pickedId === cid,
      matchVerdict: ctx.matchVerdicts?.[cid] ?? null,
      reasons: ctx.reasons?.[cid] ?? [],
      tradeOff: ctx.tradeOffs?.[cid] ?? null,
      contextualActions: entity.actions,
    }
  }).sort((a, b) => a.rank - b.rank)
}
