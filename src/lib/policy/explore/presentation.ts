/**
 * Explore safety adapter — classification → presentation state.
 *
 * ============================================================================
 * WHAT THIS DOES, IN ONE SENTENCE
 * ============================================================================
 * Translates a `PolicyDecision` that has ALREADY been made into a name Explore
 * can hold. It decides nothing, writes nothing, and acts on nothing.
 *
 * Shaped after `src/lib/media/servableMedia.ts`, the established Explore-side
 * pattern in this repository: a pure function over a value, no I/O, no
 * mutation, no side effect.
 *
 * ============================================================================
 * WHAT IT MUST NEVER BECOME
 * ============================================================================
 * A presentation STATE is not an ACTION. `PRESENTATION_CONDITIONS` does not say
 * hide, blur, gate, age-restrict, downrank or interstitial — it says the corpus
 * recorded that conditions apply. Who applies them and how is Group 09's work
 * (§17: "Group 09 owns actions"), and Group 09 has not started.
 *
 * There is deliberately no function here that returns an action, a boolean
 * "show/don't show", a rank, or a score. Adding one would convert a
 * classification into enforcement, which no decision in the corpus authorises.
 *
 * ============================================================================
 * OWNER DECISION Q1 (2026-08-16) = A — RECORD ONLY, DISPLAY UNCHANGED
 * ============================================================================
 * For a constituted RESTRICTED policy, Explore keeps its current presentation.
 * `PRESENTATION_CONDITIONS` is recorded internally and nothing else happens: no
 * hide, no block, no warning, no age gate, no ranking penalty, no notification.
 *
 * This module already complied — it never produced an action — so the decision
 * required no change here. It is recorded because "we chose to do nothing" and
 * "nobody has decided yet" look identical in code, and only one of them is a
 * settled contract.
 *
 * ALSO SETTLED, and visible in this file's shape rather than in a comment:
 * there is no audience/viewer parameter anywhere in this module. The same
 * decision yields the same state for a creator and for a stranger. Showing a
 * creator more than a viewer would need a new input, which is a Product
 * decision, not a configuration change.
 */

import type { PolicyDecision } from '../engine/evaluator';
import type { OutcomeClass } from '../types';

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * The six states Explore can receive. Each is a rename of something the corpus
 * already establishes — no seventh state, and no new outcome class.
 */
export const EXPLORE_PRESENTATION_STATES = [
  /** §4 `NOT_APPLICABLE`, or `APPLICABLE_NO_VIOLATION` with no attribute. Ordinary content. */
  'PRESENTABLE',
  /** `APPLICABLE_NO_VIOLATION` + the Owner-approved RESTRICTED attribute (2026-08-16, option b). */
  'PRESENTATION_CONDITIONS',
  /** §4 `INSUFFICIENT_EVIDENCE`. The record cannot support a conclusion. */
  'UNDETERMINED_EVIDENCE',
  /** §4 `INDETERMINATE_CONTEXT`. Decisive context present but unreadable (CTX-1). */
  'UNDETERMINED_CONTEXT',
  /** §4 `VIOLATION`. A classification, never an instruction. */
  'POLICY_CONSTITUTED',
  /**
   * A Legal dependency is open (`G02-D-07b`). Deliberately NOT folded into
   * `UNDETERMINED_EVIDENCE`: that would hide the Legal boundary behind ordinary
   * uncertainty, and the corpus requires it to be neither an allow nor a deny.
   */
  'UNDECIDABLE_LEGAL_BLOCKED',
] as const;

export type ExplorePresentationState = (typeof EXPLORE_PRESENTATION_STATES)[number];

/** States in which nothing was constituted against the content. */
export const NON_CONSTITUTED_STATES: readonly ExplorePresentationState[] = [
  'PRESENTABLE',
  'PRESENTATION_CONDITIONS',
  'UNDETERMINED_EVIDENCE',
  'UNDETERMINED_CONTEXT',
  'UNDECIDABLE_LEGAL_BLOCKED',
] as const;

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export interface ExplorePresentation {
  readonly state: ExplorePresentationState;
  /** `ts.x.y@n` — the decision this state came from, so it stays explainable (AP-7, VER-T1). */
  readonly policy: string;
  /** True only where the corpus recorded presentation conditions. Metadata, never an action. */
  readonly presentationConditions: boolean;
  /** The blocking decision id when a Legal dependency is open; otherwise absent. */
  readonly blockedBy?: string;
}

/**
 * Total function. Every `PolicyDecision` maps to exactly one state.
 *
 * Order matters and each step cites its ground:
 *
 *  1. A fault carrying `blockedBy` → `UNDECIDABLE_LEGAL_BLOCKED`, tested FIRST so
 *     a Legal boundary can never be mistaken for ordinary uncertainty.
 *  2. `VIOLATION` → `POLICY_CONSTITUTED`.
 *  3. `APPLICABLE_NO_VIOLATION` + `presentationConditionsApply` →
 *     `PRESENTATION_CONDITIONS` (Owner 2026-08-16, option b).
 *  4. `APPLICABLE_NO_VIOLATION` without it, and `NOT_APPLICABLE` → `PRESENTABLE`.
 *  5. `INSUFFICIENT_EVIDENCE` → `UNDETERMINED_EVIDENCE`.
 *  6. `INDETERMINATE_CONTEXT` → `UNDETERMINED_CONTEXT`.
 *  7. `DISPUTED` and `OUT_OF_SCOPE` → `UNDETERMINED_EVIDENCE`. The engine never
 *     produces either (DISPUTED is a case-level judgement, Owner-confirmed
 *     2026-08-16); if one ever arrives, the safe reading is "not decided here",
 *     never "presentable" and never "constituted".
 */
export function explorePresentation(decision: PolicyDecision): ExplorePresentation {
  const blocked = decision.faults.find((f) => f.blockedBy !== undefined);
  if (blocked) {
    return {
      state: 'UNDECIDABLE_LEGAL_BLOCKED',
      policy: decision.policy,
      presentationConditions: false,
      blockedBy: blocked.blockedBy,
    };
  }

  const base = { policy: decision.policy, presentationConditions: false } as const;
  const outcome: OutcomeClass = decision.outcome;

  if (outcome === 'VIOLATION') return { ...base, state: 'POLICY_CONSTITUTED' };
  if (outcome === 'APPLICABLE_NO_VIOLATION') {
    return decision.presentationConditionsApply
      ? { state: 'PRESENTATION_CONDITIONS', policy: decision.policy, presentationConditions: true }
      : { ...base, state: 'PRESENTABLE' };
  }
  if (outcome === 'NOT_APPLICABLE') return { ...base, state: 'PRESENTABLE' };
  if (outcome === 'INDETERMINATE_CONTEXT') return { ...base, state: 'UNDETERMINED_CONTEXT' };
  return { ...base, state: 'UNDETERMINED_EVIDENCE' };
}

// ---------------------------------------------------------------------------
// Several policies at once
// ---------------------------------------------------------------------------

export interface ExplorePresentationSet {
  readonly states: readonly ExplorePresentation[];
  /**
   * Always `null`.
   *
   * **COMP-4: "Precedence for enforcement is NOT defined here."** How several
   * applicable policies combine into one decision belongs to Group 06 (risk) and
   * Group 09 (enforcement) — §16: "The taxonomy supplies the inputs and stops."
   *
   * Returning `null` rather than omitting the field is deliberate: a consumer
   * that wants a single answer gets an explicit "not defined", not a silent
   * absence it might paper over with `states[0]`.
   */
  readonly combined: null;
  readonly reason: string;
}

/**
 * Maps each decision independently. It does NOT rank, merge, or pick a winner.
 */
export function explorePresentationSet(
  decisions: readonly PolicyDecision[],
): ExplorePresentationSet {
  return {
    states: decisions.map(explorePresentation),
    combined: null,
    reason:
      'COMP-4: precedence across multiple applicable policies is not defined by the taxonomy. ' +
      'Combining them belongs to Group 06 / Group 09, neither of which is open.',
  };
}
