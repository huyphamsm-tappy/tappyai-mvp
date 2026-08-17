/**
 * The shared constitutive machinery for per-policy detection.
 *
 * ============================================================================
 * WHAT THIS IS
 * ============================================================================
 * Every policy in the corpus is written the same way: a `Governs` sentence
 * naming ONE constitutive element, and a `Does not govern` list of situations
 * the policy simply does not reach. This module turns that shape into code once,
 * so each policy file contains only its own corpus-derived content and no logic.
 *
 * 🚨 PRODUCT CONTENT, NOT CORPUS CONTENT. The corpus holds no predicates — the
 * word `predicate` appears zero times in `02_POLICY_TAXONOMY.md`. Nothing here
 * is authoritative over the corpus, and placement resolves no governance
 * question: `G02-D-11` remains OPEN and ownership of predicate content remains
 * unassigned.
 *
 * ============================================================================
 * WHY ONE FIELD PER POLICY
 * ============================================================================
 * Measured on 2026-08-17, not assumed: the engine tests faults BEFORE truth, so
 * one absent field anywhere in a conjunction yields `INSUFFICIENT_EVIDENCE` even
 * where another branch has definitely established `FALSE`. A predicate with one
 * branch per `Does not govern` item scored 2/8 against the existing UAT bed —
 * it could not even say "a restaurant's own phone number is not governed".
 * Resolving the carve-outs HERE, in the signal layer, and handing the engine a
 * single settled field scored 6/8 on identical signals.
 *
 * The carve-outs are also NOT modelled as `defeatingContext`. A defeating
 * context produces `APPLICABLE_NO_VIOLATION`; the corpus produces
 * `NOT_APPLICABLE` — "there is no exception to grant because nothing was
 * constituted" (§2.1). WF-6 agrees: all eighteen records declare
 * `defeating_contexts: none`.
 *
 * ============================================================================
 * THE CONSERVATIVE RULE, ENFORCED STRUCTURALLY
 * ============================================================================
 * `undefined` means "could not be established" and is never interchangeable
 * with `false`. `false` is a finding — that the policy is not constituted.
 * A detector that writes `false` for something it merely did not check
 * manufactures findings silently.
 *
 * {@link constitutedFrom} has exactly ONE path that returns `true`, and it
 * requires the decisive element to be positively established. No accumulation of
 * carve-out absences, no volume of topic signals and no failure mode can reach
 * it. `constitution.test.ts` proves this exhaustively for every policy.
 */

import { evaluatePolicy, type PolicyDecision } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import type { PolicyProbe } from '../explore/observation';
import { defaultPolicyProvider } from '../provider';
import type { PolicyRecord } from '../types';
import { gateConstitution, type GateInput, type GateState } from './evidenceGate';

// ---------------------------------------------------------------------------
// Three-valued signals
// ---------------------------------------------------------------------------

/** `true` established · `false` established · `undefined` could not be established. */
export type Tri = boolean | undefined;

/** A detector's answers, keyed by signal name. Absent keys are `undefined`. */
export type Signals = Readonly<Record<string, Tri>>;

// ---------------------------------------------------------------------------
// Evidence sufficiency — transcribed from the corpus, §7 (lines 1569–1571)
// ---------------------------------------------------------------------------

/**
 * What each `evidence_sensitivity` marker requires before a violation may be
 * concluded. Transcribed verbatim; this table invents nothing.
 *
 *   `ORDINARY`       Standard decision record suffices
 *   `CORROBORATED`   More than one independent basis required before a
 *                    violation may be concluded
 *   `HUMAN_REQUIRED` No violation may be concluded without human review,
 *                    regardless of confidence
 *
 * Only `ORDINARY` policies are implemented today. The other two markers name
 * inputs this architecture cannot supply — a second independent basis, and a
 * human reviewer's conclusion — and fabricating either would be inventing the
 * evidence the corpus requires. The blocked policies are listed in
 * {@link BLOCKED_POLICIES} rather than half-built.
 */
export const EVIDENCE_REQUIREMENT: Readonly<Record<string, string>> = Object.freeze({
  ORDINARY: 'Standard decision record suffices',
  CORROBORATED: 'More than one independent basis required before a violation may be concluded',
  HUMAN_REQUIRED: 'No violation may be concluded without human review, regardless of confidence',
});

/** Markers whose evidence this architecture cannot supply, so no detector is written. */
export const UNSUPPLIABLE_EVIDENCE_MARKERS: readonly string[] = Object.freeze([
  'CORROBORATED',
  'HUMAN_REQUIRED',
]);

// ---------------------------------------------------------------------------
// A policy's constitutive shape
// ---------------------------------------------------------------------------

export interface PolicyConstitution {
  /** `ts.<family>.<policy>@<n>` — VER-T1: decisions cite the version. */
  readonly ref: string;
  /** The single signal the corpus names as the constitutive element. */
  readonly decisive: string;
  /**
   * `Does not govern` items that independently settle non-constitution.
   *
   * ⚠ Not every policy has any. Where the corpus makes non-constitution
   * *relative to* the decisive element — animal welfare's "gratuitousness
   * relative to purpose" — the list is EMPTY on purpose, because a recognised
   * legitimate purpose does not settle the question: the corpus says slaughter
   * with suffering materially beyond the purpose can still constitute it.
   * Short-circuiting on such a purpose would acquit exactly the case the corpus
   * says is real.
   */
  readonly carveOuts: readonly string[];
  /**
   * Phrases quoted verbatim from `02_POLICY_TAXONOMY.md`.
   *
   * `constitution.test.ts` asserts each one is still literally present in the
   * corpus file, so a detector cannot quietly drift away from the text it claims
   * to implement.
   */
  readonly corpusPhrases: readonly string[];
  /**
   * What must supply the decisive signal, when nothing in the product can yet.
   * Recorded so "we chose not to" and "nobody has decided" stay distinguishable.
   */
  readonly decisiveSource: string;
}

// ---------------------------------------------------------------------------
// The constitutive question
// ---------------------------------------------------------------------------

/**
 * Is this policy constituted for this content?
 *
 * 🔒 THE ONLY PATH TO `true` is a positively established decisive element with
 * no established carve-out. Order matters and each step cites its ground:
 *
 *   1. an established carve-out  → `false`      §2.1 nothing was constituted
 *   2. decisive established false → `false`     the policy is simply not reached
 *   3. decisive not established   → `undefined` GA-9 uncertainty never becomes a finding
 *   4. otherwise                  → `true`
 */
export function constitutedFrom(policy: PolicyConstitution, signals: Signals): Tri {
  for (const carveOut of policy.carveOuts) {
    if (signals[carveOut] === true) return false;
  }
  const decisive = signals[policy.decisive];
  if (decisive === false) return false;
  if (decisive !== true) return undefined;
  return true;
}

// ---------------------------------------------------------------------------
// The predicate — pure data, one field, shared by every policy
// ---------------------------------------------------------------------------

export const CONSTITUTED_PATH = 'constitution.established' as const;

export const CONSTITUTIVE_PREDICATE: Expression = Object.freeze({
  op: 'eq',
  left: { ref: CONSTITUTED_PATH },
  right: { value: true },
}) as Expression;

/**
 * The evaluation subject.
 *
 * When the question cannot be answered the field is OMITTED rather than set to
 * `false`: the engine reads an absent field as a fault and reports
 * `INSUFFICIENT_EVIDENCE`, whereas `false` would report `NOT_APPLICABLE`, an
 * affirmative finding of no violation.
 */
export function subjectFrom(constituted: Tri): Record<string, unknown> {
  return constituted === undefined
    ? { constitution: {} }
    : { constitution: { established: constituted } };
}

// ---------------------------------------------------------------------------
// Composition with the engine
// ---------------------------------------------------------------------------

/**
 * The registry record for a policy, through the sanctioned provider seam.
 *
 * The provider deliberately refuses to resolve a bare identity to "the latest"
 * (VER-T1), so every `ref` here carries its version and a corpus version bump
 * fails loudly instead of silently re-pointing a detector at a different rule.
 */
export function recordFor(policy: PolicyConstitution): PolicyRecord {
  const found = defaultPolicyProvider.getById(policy.ref);
  if (found.state !== 'FOUND') {
    throw new Error(`detector: ${policy.ref} not available from the provider (${found.state})`);
  }
  return found.record;
}

/** The probe for the Explore observation seam: policy and predicate, nothing else. */
export function probeFor(policy: PolicyConstitution): PolicyProbe {
  return { policy: policy.ref, predicate: CONSTITUTIVE_PREDICATE };
}

/**
 * One decision for one piece of content.
 *
 * Returns a `PolicyDecision` and nothing else — no action, no severity, no
 * visibility, no ordering. `asOf` is the caller's; nothing here reads a clock.
 */
export function evaluateConstitution(
  policy: PolicyConstitution,
  signals: Signals,
  asOf: string,
  extra: ConstitutionEvaluationExtras = {},
): PolicyDecision {
  return evaluatePolicy(recordFor(policy), {
    subject: subjectFrom(constitutedFrom(policy, signals)),
    predicate: CONSTITUTIVE_PREDICATE,
    asOf,
    ...(extra.defeatingContext === undefined ? {} : { defeatingContext: extra.defeatingContext }),
    ...(extra.responseWarranted === undefined ? {} : { responseWarranted: extra.responseWarranted }),
  });
}

/**
 * The two engine inputs a policy may need beyond its predicate.
 *
 * Used by exactly one policy today: `ts.selfharm.promotion`, whose corpus text
 * assigns support-seeking the outcome `APPLICABLE_NO_VIOLATION`,
 * response-warranted (OUT-3). Everything else leaves both absent, so the shared
 * behaviour is unchanged.
 *
 * 🚨 `responseWarranted` is an attribute of the classification. OUT-3: "what the
 * response is belongs to Group 09, and it must never be an enforcement action."
 * Nothing in this module reads it to decide anything.
 */
export interface ConstitutionEvaluationExtras {
  readonly defeatingContext?: Expression;
  readonly responseWarranted?: boolean;
}

/**
 * Evaluate with the policy's own evidence markers applied.
 *
 * Returns the decision AND the gate state beside it, so the system can say
 * "human review required" or "insufficient corroboration" without inventing a
 * §4 outcome class to carry it.
 */
export function evaluateGated(
  policy: PolicyConstitution,
  signals: Signals,
  asOf: string,
  gateInput: GateInput = {},
  extra: ConstitutionEvaluationExtras = {},
): { readonly decision: PolicyDecision; readonly gate: GateState } {
  const record = recordFor(policy);
  const markers = record.evidence_sensitivity.value?.markers ?? [];
  const gated = gateConstitution(markers, constitutedFrom(policy, signals), gateInput);

  return {
    decision: evaluatePolicy(record, {
      subject: subjectFrom(gated.constituted),
      predicate: CONSTITUTIVE_PREDICATE,
      asOf,
      ...(extra.defeatingContext === undefined ? {} : { defeatingContext: extra.defeatingContext }),
      ...(extra.responseWarranted === undefined
        ? {}
        : { responseWarranted: extra.responseWarranted }),
    }),
    gate: gated.gate,
  };
}

// ---------------------------------------------------------------------------
// Policies deliberately NOT given a detector
// ---------------------------------------------------------------------------

/**
 * Every policy ends in exactly one of three technical states.
 *
 *   `IMPLEMENTED`     a constitutive predicate exists and the machine may reach
 *                     a finding once its decisive signal is supplied
 *   `EVIDENCE_GATED`  a constitutive predicate AND an evidence contract exist,
 *                     and the gate holds back any finding until the corpus's
 *                     evidence requirement is met — see `evidenceGate.ts`
 *   `LEGAL_BLOCKED`   no constitutive semantics are implemented, because doing
 *                     so would require answering a Legal question
 *
 * "Not started" is deliberately not a state. Every one of the eighteen is
 * accounted for, and `constitution.test.ts` proves the matrix is exactly the
 * registry — no policy missing, none duplicated, none invented.
 */
export const TECHNICAL_STATUSES = ['IMPLEMENTED', 'EVIDENCE_GATED', 'LEGAL_BLOCKED'] as const;
export type TechnicalStatus = (typeof TECHNICAL_STATUSES)[number];

export interface PolicyTechnicalStatus {
  readonly identity: string;
  readonly status: TechnicalStatus;
  /** What still has to arrive before the machine could reach a finding. */
  readonly awaiting: string;
  /** Who or what would supply it. Never guessed. */
  readonly suppliedBy: string;
}

const gated = (
  identities: readonly string[],
  awaiting: string,
  suppliedBy: string,
): PolicyTechnicalStatus[] =>
  identities.map((identity) => ({ identity, status: 'EVIDENCE_GATED' as const, awaiting, suppliedBy }));

export const POLICY_TECHNICAL_STATUS: readonly PolicyTechnicalStatus[] = Object.freeze([
  ...(
    [
      'ts.violence.graphic-harm',
      'ts.danger.harmful-activity',
      'ts.graphic.presentation',
      'ts.sexual.adult-content',
      'ts.animal.cruelty',
      'ts.privacy.personal-information',
    ] as const
  ).map((identity) => ({
    identity,
    status: 'IMPLEMENTED' as const,
    awaiting: 'a signal source for the decisive element',
    suppliedBy: 'a future detector or product surface; none exists today, so the answer is UNDETERMINED',
  })),

  ...gated(
    [
      'ts.child.sexual-exploitation',
      'ts.child.sexualization',
      'ts.child.grooming',
      'ts.child.abuse-harm',
      'ts.selfharm.promotion',
    ],
    `HUMAN_REQUIRED — "${EVIDENCE_REQUIREMENT.HUMAN_REQUIRED}"`,
    'a human reviewer. The machine may establish non-constitution, and may never conclude a violation.',
  ),

  ...gated(
    [
      'ts.violence.incitement-threats',
      'ts.sexual.exploitation-nonconsent',
      'ts.harassment.targeted',
      'ts.deception.harmful',
      'ts.fraud.scam',
      'ts.platform.abuse-manipulation',
    ],
    `CORROBORATED — "${EVIDENCE_REQUIREMENT.CORROBORATED}"`,
    'a second independent evidence source. One source, or one source counted twice, is never enough.',
  ),

  {
    identity: 'ts.hate.protected-target-abuse',
    status: 'LEGAL_BLOCKED',
    awaiting: 'PROTECTED_TARGET_SET, which is BLOCKED; severity_envelope is OPEN and the policy is not ratifiable',
    suppliedBy: 'LEGAL DECISION REQUIRED — G02-D-07b. No protected-target definition is written here.',
  },
]);
