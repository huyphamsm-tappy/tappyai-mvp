/**
 * The evidence gate — `CORROBORATED` and `HUMAN_REQUIRED` as executable rules.
 *
 * ============================================================================
 * WHAT THE CORPUS SAYS, AND WHAT THAT MEANS MECHANICALLY
 * ============================================================================
 * §7 (lines 1569–1571), transcribed:
 *
 *   `ORDINARY`        Standard decision record suffices
 *   `CORROBORATED`    More than one independent basis required before a
 *                     violation may be concluded
 *   `HUMAN_REQUIRED`  No violation may be concluded without human review,
 *                     regardless of confidence
 *
 * 🔑 READ THE SCOPE PRECISELY: both markers gate the CONCLUSION OF A VIOLATION.
 * Neither bars the machine from establishing that a policy is NOT constituted.
 * So this gate is deliberately one-directional — it can turn a would-be finding
 * into uncertainty, and it can never turn anything into a finding.
 *
 * ============================================================================
 * WHAT IT IS NOT
 * ============================================================================
 * Not a moderation queue, not a reviewer interface, not a notification, not an
 * appeal, not enforcement. It is a CONTRACT: a shape the system can already
 * speak, so that when a human review capability or a second evidence source
 * exists, it plugs into something rather than requiring a redesign.
 *
 * Nothing here fabricates evidence. A missing human conclusion stays missing; a
 * single source stays a single source.
 */

import type { Tri } from './constitution';

// ---------------------------------------------------------------------------
// Evidence bases
// ---------------------------------------------------------------------------

/**
 * One independent basis for a conclusion.
 *
 * 🚨 `sourceId` is an OPAQUE identifier for the source, never content and never
 * an identity. Two bases with the same `sourceId` are the SAME source observed
 * twice — the corpus requires bases to be independent, and counting a repeat as
 * corroboration is the most obvious way to fake it.
 */
export interface EvidenceBasis {
  readonly sourceId: string;
  /** Does this basis support the conclusion, or contradict it? */
  readonly supports: boolean;
  /**
   * Optional opaque reference back to the original evidence, so a future human
   * review can retrieve it. Must never carry content, a payload or PII — the
   * architecture has nowhere to put those and this field is not an exception.
   */
  readonly evidenceRef?: string;
}

export interface HumanReview {
  /** A human reviewer reached a conclusion. Absent means no review happened. */
  readonly concluded?: boolean;
}

export interface GateInput {
  readonly bases?: readonly EvidenceBasis[];
  readonly humanReview?: HumanReview;
}

// ---------------------------------------------------------------------------
// Gate states
// ---------------------------------------------------------------------------

/**
 * Why a would-be finding was held back — or that it was not held back.
 *
 * 🚨 NOT a §4 outcome class and NOT a new one. The corpus fixes seven outcome
 * classes and this invents none; these values explain the gate's own behaviour
 * and travel beside a decision, never inside it.
 */
export const GATE_STATES = [
  /** The marker's evidence requirement is met, or none applies. */
  'SUFFICIENT',
  /** `HUMAN_REQUIRED`: no human has concluded, so no violation may be concluded. */
  'HUMAN_REVIEW_REQUIRED',
  /** `CORROBORATED`: fewer than two independent supporting bases. */
  'INSUFFICIENT_CORROBORATION',
  /** Bases disagree. The corpus specifies no outcome for this, so it stays uncertain. */
  'CONFLICTING_EVIDENCE',
] as const;

export type GateState = (typeof GATE_STATES)[number];

export interface GateResult {
  /** The constitutive answer after gating. Never more certain than the input. */
  readonly constituted: Tri;
  readonly gate: GateState;
  /** Distinct supporting sources counted. Repeats of one source count once. */
  readonly independentSupport: number;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/** Distinct source ids among bases that support the conclusion. */
export function independentSupportCount(bases: readonly EvidenceBasis[] = []): number {
  return new Set(bases.filter((b) => b.supports).map((b) => b.sourceId)).size;
}

/** True when at least one basis supports and at least one contradicts. */
export function hasConflict(bases: readonly EvidenceBasis[] = []): boolean {
  return bases.some((b) => b.supports) && bases.some((b) => !b.supports);
}

/**
 * Apply a policy's `evidence_sensitivity` markers to a constitutive answer.
 *
 * Order matters:
 *
 *   1. anything other than `true` passes through untouched — the gate exists to
 *      stop findings, not to create or strengthen them;
 *   2. conflicting bases → uncertainty, because the corpus specifies no other
 *      outcome for disagreement;
 *   3. `HUMAN_REQUIRED` without a human conclusion → uncertainty;
 *   4. `CORROBORATED` with fewer than two independent supporting sources →
 *      uncertainty;
 *   5. otherwise the answer stands.
 */
export function gateConstitution(
  markers: readonly string[],
  constituted: Tri,
  input: GateInput = {},
): GateResult {
  const bases = input.bases ?? [];
  const independentSupport = independentSupportCount(bases);

  if (constituted !== true) {
    return { constituted, gate: 'SUFFICIENT', independentSupport };
  }

  if (hasConflict(bases)) {
    return { constituted: undefined, gate: 'CONFLICTING_EVIDENCE', independentSupport };
  }

  if (markers.includes('HUMAN_REQUIRED') && input.humanReview?.concluded !== true) {
    return { constituted: undefined, gate: 'HUMAN_REVIEW_REQUIRED', independentSupport };
  }

  if (markers.includes('CORROBORATED') && independentSupport < 2) {
    return { constituted: undefined, gate: 'INSUFFICIENT_CORROBORATION', independentSupport };
  }

  return { constituted: true, gate: 'SUFFICIENT', independentSupport };
}

/**
 * True when this marker set means the machine may never conclude a violation on
 * its own, whatever evidence it holds.
 *
 * `HUMAN_REQUIRED` is the only such marker: `CORROBORATED` can in principle be
 * satisfied by two independent machine sources, whereas a human conclusion can
 * only come from a human.
 */
export function machineMayNeverConclude(markers: readonly string[]): boolean {
  return markers.includes('HUMAN_REQUIRED');
}
