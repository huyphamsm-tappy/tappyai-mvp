/**
 * Presentation evidence — the signal layer for the two `RESTRICTED` policies.
 *
 * `ts.graphic.presentation` and `ts.sexual.adult-content` both turn on something
 * that is NOT a property of the content: whether a presentation event happened,
 * and under what conditions. This module is where that evidence enters, and it
 * is deliberately built so that content can never be mistaken for it.
 *
 * ============================================================================
 * PRODUCT BASELINE (Owner, 2026-08-17) — WHAT IT IS AND IS NOT
 * ============================================================================
 * TappyAI's initial presentation semantics are informed by the publicly
 * observable safety/presentation behaviour of major social platforms.
 *
 * It is an INITIAL BASELINE. It is **not** a copy of any platform's policy, not
 * Legal authority, not a claim that TappyAI's rules are identical to anyone
 * else's, and not permanent. It exists because TappyAI does not yet have enough
 * real-user evidence to define every surface-specific case itself, and it is
 * expected to be refined from real cases later.
 *
 * 🚨 TECHNICAL READINESS IS NOT REAL-WORLD VALIDATION. Nothing here has been
 * checked against TappyAI production data — there is barely any. These are the
 * mechanics that will hold an answer, tested for safety while they wait. The
 * distinction is asserted in `presentationEvidence.test.ts` so it cannot quietly
 * be forgotten.
 *
 * ============================================================================
 * THE ABSOLUTE RULE, MADE STRUCTURAL
 * ============================================================================
 * The corpus: the initiation state "must be established from the presentation
 * event, never inferred from subject matter, content class, intensity, or the
 * policy category under which the item was retrieved."
 *
 * The Product baseline restates it: presentation may not be inferred from topic,
 * classification, severity, graphic intensity, database existence, upload alone,
 * caption alone, or media metadata alone.
 *
 * So {@link viewingNotInitiatedFrom} reads exactly two keys and nothing else.
 * Every forbidden input in {@link FORBIDDEN_PRESENTATION_INPUTS} is proven inert
 * by a test that sets each one and asserts the answer does not move — which is
 * what turns "never infer" from a comment into a guard.
 *
 * ============================================================================
 * WHAT IT ANSWERS TODAY
 * ============================================================================
 * `undefined`, on every TappyAI surface, because no surface currently emits a
 * presentation-initiation signal. That is the Owner's instruction, not a gap
 * being papered over: "If a particular TappyAI surface does not yet expose the
 * necessary presentation signal → remain UNDETERMINED. Do not invent a new event
 * source." No analytics system, no persistence and no event source is added
 * here, and no surface-to-initiation table is invented.
 */

import type { Signals, Tri } from './constitution';

// ---------------------------------------------------------------------------
// Viewing initiation — `ts.graphic.presentation`
// ---------------------------------------------------------------------------

/**
 * The only two signals that may establish a viewing-initiation state.
 *
 * Both come from the presentation event. Neither is derivable from the item.
 */
export const PRESENTATION_EVENT_SIGNALS = Object.freeze([
  /** A presentation event was actually observed on a product surface. */
  'presentationEventObserved',
  /** Within that event, did the viewer initiate viewing of THIS item? */
  'viewerInitiatedThisItem',
] as const);

/**
 * Inputs that may never establish presentation — corpus §9.1 plus the Product
 * baseline. Exported so the prohibition is enumerable by a test rather than
 * merely described in prose.
 */
export const FORBIDDEN_PRESENTATION_INPUTS = Object.freeze([
  'topic',
  'contentClassification',
  'severity',
  'graphicIntensity',
  'intenseImagery',
  'databaseExistence',
  'uploadedAt',
  'captionText',
  'mediaMetadata',
  'policyCategoryRetrievedUnder',
] as const);

/**
 * Is this a `NOT_VIEWER_INITIATED` viewing of the assessed item?
 *
 *   no presentation event observed → `undefined`  nothing happened that could be assessed
 *   viewer initiated this item     → `false`      non-constitution, and the corpus is
 *                                                 explicit this is NOT `INDETERMINATE_CONTEXT`
 *   viewer did not initiate it     → `true`       the constitutive element
 *   event observed, initiation unreadable → `undefined`
 *
 * 🔒 Reads two keys. Anything else in `signals` is ignored by construction, so a
 * topic, an intensity score or the mere existence of a row cannot move it.
 */
export function viewingNotInitiatedFrom(signals: Signals): Tri {
  if (signals.presentationEventObserved !== true) return undefined;
  const initiated = signals.viewerInitiatedThisItem;
  if (initiated === true) return false;
  if (initiated === false) return true;
  return undefined;
}

/** Signals for `ts.graphic.presentation`, ready to hand to the shared framework. */
export function graphicPresentationSignals(signals: Signals): Signals {
  return { viewingNotInitiatedByViewer: viewingNotInitiatedFrom(signals) };
}

// ---------------------------------------------------------------------------
// Presentation conditions — `ts.sexual.adult-content`
// ---------------------------------------------------------------------------

/**
 * The presentation conditions the corpus names, verbatim: "(audience or
 * interstitial)".
 *
 * 🚨 That enumeration appears in §9.1 under `ts.graphic.presentation`.
 * `ts.sexual.adult-content` says only that "presentation conditions apply" and
 * does **not** enumerate its own, and the corpus records that "Presentation
 * conditions, warnings and age-appropriate access are implementation work, not
 * settled here."
 *
 * So this module does NOT decide which conditions a given case requires, and
 * does not assume #5's list applies to #11. The required set is supplied per
 * case by the caller — see {@link PresentationConditionEvidence}. Deciding it
 * globally would be inventing the threshold the corpus left open.
 */
export const PRESENTATION_CONDITIONS = Object.freeze(['audience', 'interstitial'] as const);
export type PresentationCondition = (typeof PRESENTATION_CONDITIONS)[number];

/**
 * Inputs that may never establish a presentation condition.
 *
 * The same prohibition as {@link FORBIDDEN_PRESENTATION_INPUTS}, restated for
 * the condition side because it is a separate function with a separate input
 * object — and mutation testing proved that mattered: a mutation reading a
 * `topic` key off the evidence object survived until this list, and the guard
 * that walks it, existed.
 */
export const FORBIDDEN_CONDITION_INPUTS = Object.freeze([
  'topic',
  'sexualClassification',
  'explicit',
  'nudity',
  'intensity',
  'graphicIntensity',
  'severity',
  'mediaExists',
  'databaseExistence',
] as const);

export interface PresentationConditionEvidence {
  /**
   * Which conditions this case requires. Supplied, never guessed. An empty or
   * absent list means nobody has established what is required, which is not the
   * same as "none are required".
   */
  readonly required?: readonly PresentationCondition[];
  /**
   * Whether each condition was actually applied. A condition missing from this
   * map is unknown, not unapplied.
   */
  readonly applied?: Readonly<Partial<Record<PresentationCondition, boolean>>>;
}

/**
 * Are the required presentation conditions absent?
 *
 *   nothing declared required          → `undefined`  the question is not yet answerable
 *   any required condition unknown     → `undefined`  an unread condition is not an absent one
 *   any required condition not applied → `true`       the constitutive element
 *   every required condition applied   → `false`      not constituted
 *
 * 🔒 Never reads the content. Explicitness is a topic and cannot constitute this
 * policy; nor can intensity, nor the existence of a media row.
 */
export function requiredConditionsAbsentFrom(evidence: PresentationConditionEvidence): Tri {
  const required = evidence.required ?? [];
  if (required.length === 0) return undefined;

  const applied = evidence.applied ?? {};
  let anyAbsent = false;
  for (const condition of required) {
    const state = applied[condition];
    if (state === undefined) return undefined;
    if (state === false) anyAbsent = true;
  }
  return anyAbsent;
}

/** Signals for `ts.sexual.adult-content`, ready to hand to the shared framework. */
export function adultContentSignals(
  evidence: PresentationConditionEvidence,
  carveOuts: Signals = {},
): Signals {
  return {
    ...carveOuts,
    requiredPresentationConditionsAbsent: requiredConditionsAbsentFrom(evidence),
  };
}
