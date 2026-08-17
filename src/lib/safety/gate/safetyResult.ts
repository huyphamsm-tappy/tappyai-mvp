/**
 * Safety result and the publication state machine.
 *
 * ============================================================================
 * SIX STATES, NEVER COLLAPSED
 * ============================================================================
 *   `SAFE`                   every policy was evaluated and none was constituted
 *   `VIOLATION`              a policy was constituted
 *   `UNDETERMINED`           evidence was insufficient somewhere
 *   `HUMAN_REVIEW_REQUIRED`  the corpus reserves the conclusion to a human
 *   `LEGAL_REVIEW_REQUIRED`  a Legal dependency is open
 *   `ENGINE_ERROR`           evaluation itself failed
 *
 * The two collapses that would matter most, and are structurally impossible
 * here: `ENGINE_ERROR` is never `SAFE` and never `VIOLATION`; `UNDETERMINED` is
 * never `SAFE` and never `VIOLATION`.
 *
 * ============================================================================
 * WHAT THIS IS NOT
 * ============================================================================
 * Not enforcement. `RESTRICTED` here means "was never published", not "was taken
 * down" — the difference is the whole point, because the corpus requires notice
 * and appeal before an adverse action against published content, and neither
 * exists. Nothing here bans an account, penalises ranking, touches
 * recommendation, or creates an appeal.
 */

import {
  POLICY_TECHNICAL_STATUS,
  evaluateGated,
  type PolicyConstitution,
} from '@/lib/policy/detect/constitution';
import { GATED_POLICIES } from '@/lib/policy/detect/gatedPolicies';
import { IMPLEMENTED_POLICIES } from '@/lib/policy/detect/policies';
import { evaluatePrivacy, P1_POLICY } from '@/lib/policy/detect/privacyPersonalInformation';
import type { PolicyDecision } from '@/lib/policy/engine/evaluator';

import { hasFailure, type EvidenceBundle } from '../evidence/types';
import { signalsFor } from '../mapping/policySignals';
import {
  aggregatePublication,
  storedStateFor,
  type GateOutcome,
  type PublicationDecision,
} from './publicationGate';

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export const SAFETY_STATES = [
  'SAFE',
  'VIOLATION',
  'UNDETERMINED',
  'HUMAN_REVIEW_REQUIRED',
  'LEGAL_REVIEW_REQUIRED',
  'ENGINE_ERROR',
] as const;
export type SafetyState = (typeof SAFETY_STATES)[number];

export const PUBLICATION_STATES = ['PUBLISHED', 'UNDER_REVIEW', 'RESTRICTED'] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];

/** One policy's contribution. Metadata only — no content, no identity. */
export interface PolicyOutcomeLine {
  readonly policy: string;
  readonly outcome: string;
  readonly gate?: string;
}

export interface SafetyResult {
  readonly contentId: string;
  /** The evidence fingerprint this result belongs to. Stale results are refused. */
  readonly contentVersion: string;
  readonly evaluatedAt: string;
  /**
   * What the CONTENT's safety picture is, aggregated across policies.
   *
   * 🔑 This is NOT the publication decision. A Legal-blocked policy makes the
   * safety state `LEGAL_REVIEW_REQUIRED` whether or not that policy is
   * authorised to hold publication — the two questions are answered by
   * different layers and by different owners.
   */
  readonly state: SafetyState;
  /** The storable lifecycle value. Derived from {@link gate}, never from `state`. */
  readonly publication: PublicationState;
  /** The publication gate's own answer, including why. */
  readonly gate: GateOutcome;
  /** Every policy keeps its own result. Nothing is collapsed away. */
  readonly policies: readonly PolicyOutcomeLine[];
  /** Modalities that could not run, so the coverage gap travels with the result. */
  readonly coverageGaps: readonly string[];
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

const LEGAL_BLOCKED = POLICY_TECHNICAL_STATUS.filter((p) => p.status === 'LEGAL_BLOCKED').map(
  (p) => p.identity,
);

/**
 * Rank the states. Order matters and each step states its ground:
 *
 *  1. `ENGINE_ERROR`           an evaluation that failed tells us nothing at all
 *  2. `VIOLATION`              a constituted policy, the only adverse finding
 *  3. `LEGAL_REVIEW_REQUIRED`  a Legal dependency is open — neither allow nor deny
 *  4. `HUMAN_REVIEW_REQUIRED`  the corpus reserves this conclusion to a human
 *  5. `UNDETERMINED`           evidence insufficient somewhere
 *  6. `SAFE`                   everything was evaluated and nothing was constituted
 *
 * `ENGINE_ERROR` outranks `VIOLATION` deliberately: if the pipeline broke, a
 * finding produced alongside the breakage is not trustworthy enough to act on,
 * and the conservative reading of a broken evaluation is "we do not know".
 */
export function deriveSafetyState(
  lines: readonly PolicyOutcomeLine[],
  evidenceFailed: boolean,
): SafetyState {
  if (evidenceFailed) return 'ENGINE_ERROR';
  if (lines.some((l) => l.outcome === 'ENGINE_ERROR')) return 'ENGINE_ERROR';
  if (lines.some((l) => l.outcome === 'VIOLATION')) return 'VIOLATION';
  if (lines.some((l) => LEGAL_BLOCKED.includes(l.policy) && l.outcome !== 'NOT_APPLICABLE'))
    return 'LEGAL_REVIEW_REQUIRED';
  if (lines.some((l) => l.gate === 'HUMAN_REVIEW_REQUIRED')) return 'HUMAN_REVIEW_REQUIRED';
  if (
    lines.some(
      (l) => l.outcome === 'INSUFFICIENT_EVIDENCE' || l.outcome === 'INDETERMINATE_CONTEXT',
    )
  )
    return 'UNDETERMINED';
  return 'SAFE';
}

/**
 * The publication decision.
 *
 * Written out state by state rather than as a default, so changing one is a
 * visible edit. Only `SAFE` publishes; only `VIOLATION` restricts; everything
 * else — including every way of not knowing — waits.
 *
 * 🚨 A failure to evaluate must never publish. That is the single most important
 * line in this file.
 */
export const PUBLICATION_FOR: Readonly<Record<SafetyState, PublicationState>> = Object.freeze({
  SAFE: 'PUBLISHED',
  VIOLATION: 'RESTRICTED',
  UNDETERMINED: 'UNDER_REVIEW',
  HUMAN_REVIEW_REQUIRED: 'UNDER_REVIEW',
  LEGAL_REVIEW_REQUIRED: 'UNDER_REVIEW',
  ENGINE_ERROR: 'UNDER_REVIEW',
});

export function publicationFor(state: SafetyState): PublicationState {
  return PUBLICATION_FOR[state];
}

/**
 * The stored lifecycle value, from BOTH layers.
 *
 * The gate decides what Product authorises. This adds the one thing the gate
 * cannot know: whether the evaluation itself succeeded.
 *
 * 🚨 An `ENGINE_ERROR` holds publication whatever the gate concluded. The gate
 * reasons over policy results, and a run that broke did not produce trustworthy
 * results to reason over — so a gate saying `PUBLISHED` on top of a failed
 * evaluation must never publish. This is separated into its own function so the
 * rule is testable on its own rather than only reachable through a bundle that
 * happens to fail.
 */
export function publicationFromGate(
  state: SafetyState,
  gateDecision: PublicationDecision,
): PublicationState {
  if (state === 'ENGINE_ERROR') return 'UNDER_REVIEW';
  return storedStateFor(gateDecision);
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function lineFor(policy: PolicyConstitution, bundle: EvidenceBundle, asOf: string): PolicyOutcomeLine {
  try {
    const identity = policy.ref.replace(/@\d+$/, '');
    const { decision, gate } = evaluateGated(policy, signalsFor(identity, bundle), asOf);
    return { policy: identity, outcome: decision.outcome, gate };
  } catch {
    return { policy: policy.ref.replace(/@\d+$/, ''), outcome: 'ENGINE_ERROR' };
  }
}

function p1LineFor(bundle: EvidenceBundle, asOf: string): PolicyOutcomeLine {
  try {
    const decision: PolicyDecision = evaluatePrivacy(signalsFor(P1_POLICY, bundle), asOf);
    return { policy: P1_POLICY, outcome: decision.outcome };
  } catch {
    return { policy: P1_POLICY, outcome: 'ENGINE_ERROR' };
  }
}

/**
 * Evaluate every policy against one evidence bundle.
 *
 * Total: any policy that throws contributes `ENGINE_ERROR` rather than
 * disappearing, because a policy that silently vanished would make the result
 * look more complete than it is.
 */
export function evaluateSafety(bundle: EvidenceBundle, evaluatedAt: string): SafetyResult {
  const lines: PolicyOutcomeLine[] = [p1LineFor(bundle, evaluatedAt)];

  for (const policy of IMPLEMENTED_POLICIES) lines.push(lineFor(policy, bundle, evaluatedAt));
  for (const policy of GATED_POLICIES) lines.push(lineFor(policy, bundle, evaluatedAt));
  for (const identity of LEGAL_BLOCKED) {
    lines.push({ policy: identity, outcome: 'INSUFFICIENT_EVIDENCE', gate: 'LEGAL' });
  }

  const state = deriveSafetyState(lines, hasFailure(bundle));
  const gate = aggregatePublication(lines);
  const publication = publicationFromGate(state, gate.decision);

  return {
    contentId: bundle.contentId,
    contentVersion: bundle.contentVersion,
    evaluatedAt,
    state,
    publication,
    gate,
    policies: lines,
    coverageGaps: bundle.results
      .filter((r) => r.status === 'UNAVAILABLE')
      .map((r) => `${r.modality}: ${'reason' in r ? r.reason : ''}`),
  };
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * May this item be published, given this result and the item as it exists now?
 *
 * 🔑 A result for a different content version can never authorise publication.
 * That is the mechanism preventing "evaluate v1, publish v2": an edit changes the
 * fingerprint, and a stale result stops being an answer about this item.
 *
 * 🔑 There is no client input to this function. A caller cannot submit
 * `PUBLISHED` and have it honoured — publication is derived here from the
 * evaluation, never accepted from outside.
 */
export function mayPublish(result: SafetyResult, currentVersion: string): boolean {
  if (result.contentVersion !== currentVersion) return false;
  return result.state === 'SAFE' && result.publication === 'PUBLISHED';
}

/** The publication state to record, refusing stale evidence. */
export function publicationStateFor(
  result: SafetyResult | null,
  currentVersion: string,
): PublicationState {
  if (result === null) return 'UNDER_REVIEW';
  if (result.contentVersion !== currentVersion) return 'UNDER_REVIEW';
  return result.publication;
}
