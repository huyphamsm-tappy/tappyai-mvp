import type { NeedProfile } from './needProfile'
import type { Candidate } from './candidate'
import type { RankedResult } from './rank'

// ── Phase A A8 — Relaxation engine ────────────────────────────────────────────
//
// When hard filtering removes every candidate, the pipeline must not silently
// re-run with a loosened budget or a broader location. The frozen product
// principle P4 says: PROPOSE a relaxation, wait for the user, then apply.
//
// This module reads `RankedResult.filtered` + `NeedProfile` + the original
// candidate universe, computes which constraint is the actual blocker, proposes
// a numeric relaxation grounded in real candidate data (never invented), and
// emits a structured proposal the route/synthesizer can render or ignore.
//
// NEVER:
//   * changes the state — the caller does that, after user confirmation
//   * invents a relaxation value (e.g. "try 20% more") when there is no
//     candidate at that new level
//   * proposes relaxing an axis that was not the cause of the zero-result

export type RelaxationAxis = 'budget' | 'mustHave' | 'avoid'

export interface RelaxationOption {
  axis: RelaxationAxis
  /** Human-summarizable label of what would change. */
  detail: string
  /**
   * The concrete new value the caller would set if the user confirms. For
   * `budget` this is the new max VND; for `mustHave`/`avoid` it names the
   * constraint to drop. Never invented — always taken from a real candidate.
   */
  newValue: number | string
  /**
   * Actual candidate that would be admitted by this relaxation. Kept as a
   * pointer so the caller can hand the same identity to synthesis without
   * ranking a second time.
   */
  admits: readonly Candidate[]
}

export interface RelaxationProposal {
  /**
   * True only when hard filter removed EVERY candidate. A partial filter (some
   * survivors, ranker just produced a Pick) is not a relaxation case.
   */
  triggered: boolean
  /** Present only when `triggered`. Empty when the filter was structural. */
  options: readonly RelaxationOption[]
}

const EMPTY: RelaxationProposal = { triggered: false, options: [] }

/**
 * Compute a RelaxationProposal from a `RankedResult` produced by
 * `rankCandidates`. Reads `filtered` (the removals) + `NeedProfile` (what the
 * user asked for) and produces zero-or-more relaxation options grounded in the
 * actual filtered candidates. The proposal is empty when the pipeline had at
 * least one survivor — relaxation is a zero-result-only mechanism.
 */
export function proposeRelaxation(
  ranked: RankedResult,
  need: NeedProfile,
): RelaxationProposal {
  // If any candidate survived the hard filter, there is no relaxation case:
  // the pipeline will proceed normally. This holds even when `pick` was null
  // (that's a "cannot decide" case, not a "cannot admit" case).
  if (ranked.ranked.length > 0) return EMPTY
  if (ranked.filtered.length === 0) return EMPTY

  const options: RelaxationOption[] = []

  const byBudget = ranked.filtered.filter(f => f.filteredBy === 'budget').map(f => f.candidate)
  const byMustHave = ranked.filtered.filter(f => f.filteredBy === 'mustHave').map(f => f.candidate)
  const byAvoid = ranked.filtered.filter(f => f.filteredBy === 'avoid').map(f => f.candidate)

  // Budget — propose the price of the CHEAPEST filtered candidate (real value).
  // "Increase by 20%" is invented; "cheapest option above the ceiling costs X"
  // is grounded. The reply then explains what the new max would be.
  if (byBudget.length > 0 && need.budget) {
    const prices = byBudget
      .map(c => c.attrs.priceVnd)
      .filter((p): p is number => typeof p === 'number' && p > need.budget!.max)
      .sort((a, b) => a - b)
    if (prices.length > 0) {
      const cheapest = prices[0]
      options.push({
        axis: 'budget',
        detail: `Nới ngân sách lên ${cheapest.toLocaleString('vi-VN')} VND (giá lựa chọn gần nhất trên trần)`,
        newValue: cheapest,
        // Preserve the FILE order of the filtered candidates — the ranker had
        // an order, and the caller may want to render 1–3 of them per Rule-of-3.
        admits: byBudget.filter(c => typeof c.attrs.priceVnd === 'number' && c.attrs.priceVnd! >= cheapest),
      })
    }
  }

  // Must-have — one option per must-have that removed candidates.
  if (byMustHave.length > 0) {
    for (const must of need.mustHave) {
      const admittedIfDropped = byMustHave.filter(c => wasFilteredBy(c, must))
      if (admittedIfDropped.length > 0) {
        options.push({
          axis: 'mustHave',
          detail: `Bỏ yêu cầu "${must}"`,
          newValue: must,
          admits: admittedIfDropped,
        })
      }
    }
  }

  // Avoid — one option per exclusion that removed candidates.
  if (byAvoid.length > 0) {
    for (const av of need.avoid) {
      const admittedIfDropped = byAvoid.filter(c => wasFilteredByAvoid(c, av))
      if (admittedIfDropped.length > 0) {
        options.push({
          axis: 'avoid',
          detail: `Bỏ loại trừ "${av}"`,
          newValue: av,
          admits: admittedIfDropped,
        })
      }
    }
  }

  return { triggered: options.length > 0, options }
}

/**
 * Apply an option to a `NeedProfile`, returning a NEW profile. The caller must
 * persist this to `ConversationState`, then rerun retrieval + rank. Applying
 * without user confirmation is a violation of principle P4 — the caller owns
 * the confirmation gate. This function is pure.
 */
export function applyRelaxation(need: NeedProfile, option: RelaxationOption): NeedProfile {
  switch (option.axis) {
    case 'budget':
      if (typeof option.newValue !== 'number') return need
      return {
        ...need,
        budget: need.budget
          ? { ...need.budget, max: option.newValue }
          : { min: 0, max: option.newValue, type: 'under' as const },
      }
    case 'mustHave':
      if (typeof option.newValue !== 'string') return need
      return { ...need, mustHave: need.mustHave.filter(m => m !== option.newValue) }
    case 'avoid':
      if (typeof option.newValue !== 'string') return need
      return { ...need, avoid: need.avoid.filter(a => a !== option.newValue) }
  }
}

// The must-have and avoid maps are already known to the ranker via
// `BOOLEAN_ATTRS` / `unverified`. Here we only need to know which candidate a
// specific must-have filtered — that maps by name.
function wasFilteredBy(c: Candidate, must: string): boolean {
  const a = c.attrs
  if (must === 'wifi') return a.wifi === false
  if (must === 'outdoor') return a.outdoorSeating === false
  if (must === 'vegetarian') return a.vegetarian === false
  return true // when we cannot narrow, admit — the ranker filtered it under this must-have
}

function wasFilteredByAvoid(c: Candidate, avoid: string): boolean {
  const a = c.attrs
  if (avoid === 'non-vegetarian') return a.vegetarian === false
  return true
}
