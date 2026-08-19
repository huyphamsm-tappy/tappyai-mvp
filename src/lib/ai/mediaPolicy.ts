import type { DecisionStage } from './intent'

/**
 * How much supporting media a turn is allowed to produce.
 *
 * WHY THIS EXISTS. Measured shape of a place consultation: every turn that
 * named places resolved up to THREE photos per place and rendered all of them,
 * so a three-place reply cost nine image fetches and nine rendered images — and
 * then did it again on the follow-up, for places the user was already looking
 * at. The conversation already carries the subject; re-rendering it is spend
 * without information.
 *
 * This governs PRESENTATION only. Nothing here touches which candidates are
 * found, kept, ranked or shown to the model — evidence, provenance and
 * anti-fabrication are unaffected. The model still sees every candidate; the
 * user simply stops being shown the same photograph twice.
 */

export type ResponseMode =
  | 'initial'       // first turn that puts evidence on the table
  | 'more-options'  // "cho mình thêm vài quán khác" — reuse what we already hold
  | 'decision'      // "nếu là bạn thì chọn cái nào?"
  | 'comparison'
  | 'refinement'
  | 'rejection'
  | 'confirmation'
  | 'followup'      // any other turn over evidence already presented

export interface MediaBudget {
  /** Hard ceiling on images rendered this turn. */
  maxImages: number
  /** Photos resolved per place — the provider call is skipped beyond this. */
  photosPerPlace: number
  /** How many places may get a photo at all. */
  maxPlaces: number
}

/**
 * INITIAL is the only turn that earns images: it is the one where the user has
 * not yet seen the options. One photo each for at most three places — never
 * three photos each, which is where "9 images" came from.
 */
const INITIAL_BUDGET: MediaBudget = { maxImages: 3, photosPerPlace: 1, maxPlaces: 3 }
const TEXT_ONLY: MediaBudget = { maxImages: 0, photosPerPlace: 0, maxPlaces: 0 }

/**
 * What KIND of turn this is.
 *
 * `hadCandidatesBefore` is the deciding signal for "initial": a turn is only
 * the first presentation if nothing was on the table when it started. It is
 * read from state, not from the turn counter, so a consultation that searched
 * late still gets its one illustrated turn.
 */
export function decideResponseMode(opts: {
  stage: DecisionStage
  moreOptions: boolean
  hadCandidatesBefore: boolean
}): ResponseMode {
  const { stage, moreOptions, hadCandidatesBefore } = opts
  if (moreOptions && hadCandidatesBefore) return 'more-options'
  if (stage === 'decision') return 'decision'
  if (stage === 'comparison') return 'comparison'
  if (stage === 'rejection') return 'rejection'
  if (stage === 'confirmation') return 'confirmation'
  if (stage === 'refinement') return 'refinement'
  return hadCandidatesBefore ? 'followup' : 'initial'
}

/** Text-first everywhere except the one turn that introduces the options. */
export function mediaBudgetFor(mode: ResponseMode): MediaBudget {
  return mode === 'initial' ? { ...INITIAL_BUDGET } : { ...TEXT_ONLY }
}

/**
 * Trim the places that will have photos resolved.
 *
 * Applied BEFORE the provider is called, so an image that would not be rendered
 * is never paid for. Order is preserved: the filter hands over the places the
 * finished reply named, in the order it named them, so "the first three" is
 * "the three the assistant led with".
 */
export function placesWithinBudget<T>(places: T[], budget: MediaBudget): T[] {
  if (budget.maxPlaces <= 0 || budget.photosPerPlace <= 0) return []
  return places.slice(0, budget.maxPlaces)
}
