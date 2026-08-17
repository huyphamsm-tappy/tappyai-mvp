/**
 * Explore observation seam — the last piece before wiring.
 *
 * ============================================================================
 * THE FACT THAT SHAPES THIS FILE
 * ============================================================================
 * **No policy has a detector.** The corpus contains zero predicates — checked,
 * not assumed: `predicate` appears 0 times in `02_POLICY_TAXONOMY.md`, and the
 * generated registry's only mention is its own header saying it holds none.
 * Per-policy detection is Product content that has never been written.
 *
 * The engine is honest about this: evaluate a policy with no predicate and you
 * get a fault, which becomes `INSUFFICIENT_EVIDENCE`, which becomes
 * `UNDETERMINED_EVIDENCE`. Correct — and useless. Calling the classifier on a
 * live feed today would stamp "we could not tell" on 100% of rows, for 100% of
 * policies, at the cost of latency on every request.
 *
 * So this seam REFUSES to produce that. `observeExploreContent` returns
 * `observed: false` with a reason when no detector supplied a predicate, rather
 * than a page of manufactured uncertainty. An empty observation is information;
 * a fabricated one is noise that looks like coverage.
 *
 * ============================================================================
 * OBSERVATION-ONLY, ENFORCED BY SHAPE
 * ============================================================================
 * The record carries an opaque content id, a state, a policy id, a timestamp
 * and a version fingerprint — and there is no field for content, caption,
 * author, media URL or any user identifier. It cannot carry PII because there
 * is nowhere to put it.
 *
 * Nothing here writes, sends, schedules or renders.
 */

import type { PolicyDecision } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import { classifyContent, type ContentRef } from './contentClassification';
import type { ExplorePresentationState } from './presentation';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * A detector's output for one policy: the predicate it wants evaluated.
 *
 * Supplied by a future detection layer. This module authors none, exactly as
 * the engine authors none.
 */
export interface PolicyProbe {
  readonly policy: string;
  readonly predicate: Expression;
  readonly defeatingContext?: Expression;
  readonly contextUnreadable?: boolean;
}

export interface ObservationInput {
  readonly content: ContentRef;
  /** Empty means "no detector ran" — NOT "nothing was found". */
  readonly probes: readonly PolicyProbe[];
  readonly evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** One line of internal observation. No content, no author, no PII. */
export interface ObservationRecord {
  /** Opaque. Must already be an identifier, never content. */
  readonly contentId: string;
  /** The fingerprint the classification belongs to (Q3). */
  readonly contentVersion: string;
  /** `ts.x.y@n` — identity and version, so the line stays explainable. */
  readonly policy: string;
  readonly state: ExplorePresentationState;
  readonly presentationConditions: boolean;
  readonly blockedBy?: string;
  readonly evaluatedAt: string;
}

export type ObservationResult =
  | { readonly observed: true; readonly records: readonly ObservationRecord[] }
  | { readonly observed: false; readonly reason: 'NO_DETECTOR' };

/**
 * Turns detector output into observation lines.
 *
 * Returns `observed: false` when no detector ran. That is the current state of
 * the world, and saying so plainly is the point: a caller can distinguish
 * "nothing was detected" from "nothing could be detected", which a page of
 * `UNDETERMINED_EVIDENCE` rows would hide.
 *
 * The caller supplies `evaluate` — this module does not import the registry or
 * decide which policies apply, keeping it a seam rather than a second engine.
 */
export function observeExploreContent(
  input: ObservationInput,
  evaluate: (probe: PolicyProbe, asOf: string) => PolicyDecision,
): ObservationResult {
  if (input.probes.length === 0) return { observed: false, reason: 'NO_DETECTOR' };

  const decisions = input.probes.map((p) => evaluate(p, input.evaluatedAt));
  const classification = classifyContent(input.content, decisions, input.evaluatedAt);

  return {
    observed: true,
    records: classification.states.map((s) => ({
      contentId: input.content.contentId,
      contentVersion: input.content.contentVersion,
      policy: s.policy,
      state: s.state,
      presentationConditions: s.presentationConditions,
      ...(s.blockedBy === undefined ? {} : { blockedBy: s.blockedBy }),
      evaluatedAt: classification.evaluatedAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// The response guarantee
// ---------------------------------------------------------------------------

/**
 * Fields observation is allowed to contribute to a client response: none.
 *
 * Exported as an empty frozen list so the guarantee is assertable rather than
 * merely stated. Observation is server-side and stays there; the Explore
 * response contract is not touched.
 */
export const OBSERVATION_CLIENT_FIELDS: readonly string[] = Object.freeze([]);

/**
 * True when a response object carries nothing from the observation layer.
 *
 * Used by the equivalence guard: whatever else changes in the feed, this must
 * keep returning true.
 */
export function responseIsFreeOfObservation(response: Record<string, unknown>): boolean {
  const leaked = [
    'state',
    'policy',
    'policyState',
    'classification',
    'presentationConditions',
    'blockedBy',
    'observation',
  ];
  return !leaked.some((k) => k in response);
}
