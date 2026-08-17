/**
 * The two `RESTRICTED` policies, under the Owner's presentation baseline.
 *
 * The claim under test is NOT "these detect things". Neither can, today: no
 * TappyAI surface emits a presentation-initiation signal and nothing declares
 * which presentation conditions a case requires. The claim is that the machinery
 * is SAFE while it waits — specifically that content can never stand in for a
 * presentation event, which is the corpus's most emphatic prohibition.
 */

import { describe, expect, it } from 'vitest';

import {
  CONSTITUTIVE_PREDICATE,
  constitutedFrom,
  evaluateConstitution,
  recordFor,
  type Signals,
  type Tri,
} from '../detect/constitution';
import { ADULT_CONTENT, GRAPHIC_PRESENTATION } from '../detect/policies';
import {
  FORBIDDEN_CONDITION_INPUTS,
  FORBIDDEN_PRESENTATION_INPUTS,
  PRESENTATION_CONDITIONS,
  PRESENTATION_EVENT_SIGNALS,
  adultContentSignals,
  graphicPresentationSignals,
  requiredConditionsAbsentFrom,
  viewingNotInitiatedFrom,
  type PresentationCondition,
  type PresentationConditionEvidence,
} from '../detect/presentationEvidence';
import { evaluatePolicy } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import {
  FEED_TREATMENT_RENDER_UNCHANGED,
  classifyExploreContent,
  currentStates,
  feedTreatment,
} from '../explore/contentClassification';
import { explorePresentation } from '../explore/presentation';

const T = '2026-08-17T00:00:00Z';

/** A presentation event in which the viewer did NOT initiate this item. */
const NOT_INITIATED: Signals = { presentationEventObserved: true, viewerInitiatedThisItem: false };
/** A presentation event the viewer DID initiate. */
const INITIATED: Signals = { presentationEventObserved: true, viewerInitiatedThisItem: true };

const gpOutcome = (s: Signals) =>
  evaluateConstitution(GRAPHIC_PRESENTATION, graphicPresentationSignals(s), T).outcome;
const acOutcome = (e: PresentationConditionEvidence, carveOuts: Signals = {}) =>
  evaluateConstitution(ADULT_CONTENT, adultContentSignals(e, carveOuts), T).outcome;

// ---------------------------------------------------------------------------
// The baseline is a baseline — recorded, not assumed away
// ---------------------------------------------------------------------------

describe('technical readiness is not real-world validation', () => {
  it('no TappyAI surface supplies a presentation signal today, so the default is uncertainty', () => {
    // This is the honest production answer, and the Owner's instruction: a
    // surface that cannot establish presentation must remain UNDETERMINED.
    expect(viewingNotInitiatedFrom({})).toBeUndefined();
    expect(gpOutcome({})).toBe('INSUFFICIENT_EVIDENCE');
    expect(requiredConditionsAbsentFrom({})).toBeUndefined();
    expect(acOutcome({})).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('reads exactly the two event signals it declares', () => {
    expect([...PRESENTATION_EVENT_SIGNALS]).toEqual([
      'presentationEventObserved',
      'viewerInitiatedThisItem',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 7 + 8. Presentation without content, content without presentation
// ---------------------------------------------------------------------------

describe('presentation evidence is independent of content', () => {
  it('7. a presentation event decides it with no content signal present at all', () => {
    expect(viewingNotInitiatedFrom(NOT_INITIATED)).toBe(true);
    expect(viewingNotInitiatedFrom(INITIATED)).toBe(false);
  });

  it('8. content topic without a presentation event decides nothing', () => {
    for (const input of FORBIDDEN_PRESENTATION_INPUTS) {
      const signals = { [input]: true } as Signals;
      expect(viewingNotInitiatedFrom(signals), input).toBeUndefined();
      expect(gpOutcome(signals), input).toBe('INSUFFICIENT_EVIDENCE');
      expect(gpOutcome(signals), input).not.toBe('VIOLATION');
    }
  });

  it('every forbidden input is inert: it cannot move an answer in either direction', () => {
    const baselines: Array<[string, Signals, Tri]> = [
      ['no event', {}, undefined],
      ['not initiated', NOT_INITIATED, true],
      ['initiated', INITIATED, false],
    ];
    for (const [label, base, expected] of baselines) {
      for (const input of FORBIDDEN_PRESENTATION_INPUTS) {
        for (const value of [true, false]) {
          expect(
            viewingNotInitiatedFrom({ ...base, [input]: value }),
            `${label} + ${input}=${value}`,
          ).toBe(expected);
        }
      }
    }
  });

  it('the mere existence of a row, an upload or media metadata is not a presentation', () => {
    const stored: Signals = {
      databaseExistence: true,
      uploadedAt: true,
      mediaMetadata: true,
      captionText: true,
      graphicIntensity: true,
    };
    expect(viewingNotInitiatedFrom(stored)).toBeUndefined();
    expect(gpOutcome(stored)).toBe('INSUFFICIENT_EVIDENCE');
  });
});

// ---------------------------------------------------------------------------
// 1–4, 6. graphic.presentation outcomes
// ---------------------------------------------------------------------------

describe('ts.graphic.presentation', () => {
  it('1. constituted is APPLICABLE_NO_VIOLATION with presentation conditions — never a violation', () => {
    const decision = evaluateConstitution(
      GRAPHIC_PRESENTATION,
      graphicPresentationSignals(NOT_INITIATED),
      T,
    );
    expect(decision.outcome).toBe('APPLICABLE_NO_VIOLATION');
    expect(decision.presentationConditionsApply).toBe(true);
    expect(explorePresentation(decision).state).toBe('PRESENTATION_CONDITIONS');
    expect(feedTreatment(explorePresentation(decision).state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
  });

  it('2 + 6. content the viewer DID initiate is non-constitution, not INDETERMINATE_CONTEXT', () => {
    const outcome = gpOutcome(INITIATED);
    expect(outcome).toBe('NOT_APPLICABLE');
    expect(outcome).not.toBe('INDETERMINATE_CONTEXT');
    expect(outcome).not.toBe('VIOLATION');
  });

  it('3. an observed event whose initiation cannot be read stays uncertain', () => {
    expect(gpOutcome({ presentationEventObserved: true })).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('4. no event observed is uncertainty, not "not presented"', () => {
    expect(gpOutcome({ presentationEventObserved: false })).toBe('INSUFFICIENT_EVIDENCE');
    expect(gpOutcome({ viewerInitiatedThisItem: false })).toBe('INSUFFICIENT_EVIDENCE');
  });
});

// ---------------------------------------------------------------------------
// 1–5. adult-content outcomes
// ---------------------------------------------------------------------------

describe('ts.sexual.adult-content', () => {
  const both: readonly PresentationCondition[] = PRESENTATION_CONDITIONS;

  it('1. a required condition established absent constitutes the policy — as conditions, not a violation', () => {
    const decision = evaluateConstitution(
      ADULT_CONTENT,
      adultContentSignals({ required: ['audience'], applied: { audience: false } }),
      T,
    );
    expect(decision.outcome).toBe('APPLICABLE_NO_VIOLATION');
    expect(decision.presentationConditionsApply).toBe(true);
    expect(explorePresentation(decision).state).toBe('PRESENTATION_CONDITIONS');
  });

  it('2. every required condition applied is non-constitution', () => {
    expect(acOutcome({ required: both, applied: { audience: true, interstitial: true } })).toBe(
      'NOT_APPLICABLE',
    );
  });

  it('3. a partially-read required set is uncertainty — an unread condition is not an absent one', () => {
    expect(acOutcome({ required: both, applied: { audience: true } })).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
    expect(acOutcome({ required: both, applied: {} })).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('5. nothing declared required is uncertainty, not "no conditions required"', () => {
    expect(acOutcome({ applied: { audience: false, interstitial: false } })).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
    expect(acOutcome({ required: [], applied: { audience: false } })).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('a corpus carve-out settles it even where a condition is absent', () => {
    for (const carveOut of ADULT_CONTENT.carveOuts) {
      const outcome = acOutcome(
        { required: ['audience'], applied: { audience: false } },
        { [carveOut]: true },
      );
      expect(outcome, carveOut).toBe('NOT_APPLICABLE');
    }
  });

  it('explicitness, intensity and media existence cannot establish a condition', () => {
    for (const topic of ['explicit', 'nudity', 'graphicIntensity', 'databaseExistence']) {
      expect(acOutcome({}, { [topic]: true } as Signals), topic).toBe('INSUFFICIENT_EVIDENCE');
    }
  });

  it('every forbidden input is inert ON THE EVIDENCE OBJECT ITSELF', () => {
    // Passing a topic through the signal bag is not the same test as passing it
    // through the evidence object. Mutations that read a `topic` or `intensity`
    // key off `evidence` survived the suite until this guard existed — the bag
    // never reached that code path.
    const baselines: Array<[string, PresentationConditionEvidence, Tri]> = [
      ['nothing required', {}, undefined],
      ['required unread', { required: ['audience'] }, undefined],
      ['required applied', { required: ['audience'], applied: { audience: true } }, false],
      ['required absent', { required: ['audience'], applied: { audience: false } }, true],
    ];
    for (const [label, base, expected] of baselines) {
      for (const input of FORBIDDEN_CONDITION_INPUTS) {
        for (const value of [true, false]) {
          const polluted = { ...base, [input]: value } as PresentationConditionEvidence;
          expect(
            requiredConditionsAbsentFrom(polluted),
            `${label} + ${input}=${value}`,
          ).toBe(expected);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Faults
// ---------------------------------------------------------------------------

describe('9. fault cases', () => {
  it('a malformed or missing predicate is never a violation', () => {
    for (const policy of [GRAPHIC_PRESENTATION, ADULT_CONTENT]) {
      const malformed = evaluatePolicy(recordFor(policy), {
        subject: {},
        predicate: { op: 'nope', left: { value: 1 } } as unknown as Expression,
        asOf: T,
      });
      const absent = evaluatePolicy(recordFor(policy), { subject: {}, asOf: T });
      for (const decision of [malformed, absent]) {
        expect(decision.outcome, policy.ref).not.toBe('VIOLATION');
        expect(decision.outcome, policy.ref).not.toBe('APPLICABLE_NO_VIOLATION');
      }
    }
  });

  it('a fault never produces presentation conditions either', () => {
    for (const policy of [GRAPHIC_PRESENTATION, ADULT_CONTENT]) {
      const decision = evaluatePolicy(recordFor(policy), { subject: {}, asOf: T });
      expect(decision.presentationConditionsApply, policy.ref).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Staleness
// ---------------------------------------------------------------------------

describe('10. stale results', () => {
  it('a stale classification is withheld, neither softened nor hardened', () => {
    const classification = classifyExploreContent({
      contentId: 'review-1',
      contentVersion: 'v1',
      policyDecisions: [
        evaluateConstitution(GRAPHIC_PRESENTATION, graphicPresentationSignals(NOT_INITIATED), T),
      ],
      evaluatedAt: T,
    });
    expect(classification.states[0].state).toBe('PRESENTATION_CONDITIONS');
    expect(currentStates(classification, 'v2').states).toBeNull();
    expect(currentStates(classification, 'v2').stale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. Multi-policy
// ---------------------------------------------------------------------------

describe('11. multi-policy', () => {
  it('both policies keep their own state, with no precedence and no action', () => {
    const classification = classifyExploreContent({
      contentId: 'review-1',
      contentVersion: 'v1',
      policyDecisions: [
        evaluateConstitution(GRAPHIC_PRESENTATION, graphicPresentationSignals(NOT_INITIATED), T),
        evaluateConstitution(ADULT_CONTENT, adultContentSignals({}), T),
      ],
      evaluatedAt: T,
    });
    expect(classification.states.map((s) => s.state)).toEqual([
      'PRESENTATION_CONDITIONS',
      'UNDETERMINED_EVIDENCE',
    ]);
    expect(classification.combined).toBeNull();
    for (const s of classification.states) {
      expect(feedTreatment(s.state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
      for (const forbidden of ['action', 'severity', 'rank', 'hide', 'visible', 'suppress'])
        expect(Object.keys(s)).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// Exhaustive
// ---------------------------------------------------------------------------

describe('exhaustive safety', () => {
  it('graphic.presentation: only a non-initiated observed event yields the constituting state', () => {
    const tri: Tri[] = [true, false, undefined];
    let positives = 0;
    for (const presentationEventObserved of tri)
      for (const viewerInitiatedThisItem of tri)
        for (const graphicIntensity of tri)
          for (const topic of tri) {
            const signals: Signals = {
              presentationEventObserved,
              viewerInitiatedThisItem,
              graphicIntensity,
              topic,
            };
            const answer = constitutedFrom(GRAPHIC_PRESENTATION, graphicPresentationSignals(signals));
            if (answer !== true) continue;
            positives++;
            expect(presentationEventObserved).toBe(true);
            expect(viewerInitiatedThisItem).toBe(false);
          }
    // One event state × one initiation state × 3 × 3 irrelevant combinations.
    expect(positives).toBe(9);
  });

  it('adult-content: only an established absent required condition yields it', () => {
    const states: Array<boolean | undefined> = [true, false, undefined];
    const requiredSets: Array<readonly PresentationCondition[] | undefined> = [
      undefined,
      [],
      ['audience'],
      ['interstitial'],
      PRESENTATION_CONDITIONS,
    ];
    let positives = 0;
    for (const required of requiredSets)
      for (const audience of states)
        for (const interstitial of states) {
          const applied: Partial<Record<PresentationCondition, boolean>> = {};
          if (audience !== undefined) applied.audience = audience;
          if (interstitial !== undefined) applied.interstitial = interstitial;
          const answer = requiredConditionsAbsentFrom({ required, applied });
          if (answer !== true) continue;
          positives++;
          expect(required?.length ?? 0).toBeGreaterThan(0);
          // Every required condition was read, and at least one was absent.
          for (const condition of required!) expect(applied[condition]).not.toBeUndefined();
          expect(required!.some((c) => applied[c] === false)).toBe(true);
        }
    expect(positives).toBeGreaterThan(0);
  });

  it('no signal combination makes either policy a violation — both are RESTRICTED', () => {
    const tri: Tri[] = [true, false, undefined];
    for (const a of tri)
      for (const b of tri) {
        expect(gpOutcome({ presentationEventObserved: a, viewerInitiatedThisItem: b })).not.toBe(
          'VIOLATION',
        );
        expect(
          acOutcome({ required: PRESENTATION_CONDITIONS, applied: { audience: a, interstitial: b } as Partial<Record<PresentationCondition, boolean>> }),
        ).not.toBe('VIOLATION');
      }
  });

  it('the predicate is still the shared one — no policy grew its own', () => {
    for (const policy of [GRAPHIC_PRESENTATION, ADULT_CONTENT]) {
      expect(evaluateConstitution(policy, {}, T).policy).toBe(policy.ref);
    }
    expect(CONSTITUTIVE_PREDICATE).toEqual({
      op: 'eq',
      left: { ref: 'constitution.established' },
      right: { value: true },
    });
  });
});
