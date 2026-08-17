/**
 * The five detectors added beside P1, and the twelve policies deliberately left
 * without one.
 *
 * WHAT THIS SUITE IS FOR. Not "the detectors work" — none of them can establish
 * its decisive element today, so all of them answer UNDETERMINED for real
 * content. It exists to prove the machinery is SAFE while it waits: that no
 * absence, no topic, no failure and no accumulation of carve-outs can produce a
 * finding, and that each detector still matches the corpus text it claims to
 * implement.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  POLICY_TECHNICAL_STATUS,
  CONSTITUTED_PATH,
  CONSTITUTIVE_PREDICATE,
  EVIDENCE_REQUIREMENT,
  UNSUPPLIABLE_EVIDENCE_MARKERS,
  constitutedFrom,
  evaluateConstitution,
  probeFor,
  recordFor,
  subjectFrom,
  type PolicyConstitution,
  type Signals,
  type Tri,
} from '../detect/constitution';
import {
  ADULT_CONTENT,
  ANIMAL_CRUELTY,
  GRAPHIC_HARM,
  GRAPHIC_PRESENTATION,
  HARMFUL_ACTIVITY,
  IMPLEMENTED_POLICIES,
} from '../detect/policies';
import { P1_POLICY } from '../detect/privacyPersonalInformation';
import { evaluatePolicy } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import {
  FEED_TREATMENT_RENDER_UNCHANGED,
  classifyExploreContent,
  currentStates,
  feedTreatment,
} from '../explore/contentClassification';
import { explorePresentation } from '../explore/presentation';
import { POLICY_REGISTRY } from '../source/registry';

const T = '2026-08-17T00:00:00Z';
const CORPUS = readFileSync(
  path.resolve(__dirname, '../../../../docs/policy/02_POLICY_TAXONOMY.md'),
  'utf8',
);

const outcome = (p: PolicyConstitution, s: Signals) => evaluateConstitution(p, s, T).outcome;
const state = (p: PolicyConstitution, s: Signals) =>
  explorePresentation(evaluateConstitution(p, s, T)).state;
const constituted = (p: PolicyConstitution) => ({ [p.decisive]: true }) as Signals;

// ---------------------------------------------------------------------------
// The detectors still match the corpus they claim to implement
// ---------------------------------------------------------------------------

describe('corpus traceability', () => {
  for (const policy of IMPLEMENTED_POLICIES) {
    it(`${policy.ref} quotes the corpus verbatim`, () => {
      expect(policy.corpusPhrases.length).toBeGreaterThan(0);
      for (const phrase of policy.corpusPhrases) {
        expect(CORPUS, `${policy.ref}: ${phrase}`).toContain(phrase);
      }
    });
  }

  it('every carve-out name is answerable from a phrase the corpus actually lists', () => {
    // Not a spelling check — a count check. A detector that grew a carve-out the
    // corpus never granted would break the pairing between the two.
    expect(GRAPHIC_HARM.carveOuts).toHaveLength(8);
    expect(HARMFUL_ACTIVITY.carveOuts).toHaveLength(6);
    expect(ADULT_CONTENT.carveOuts).toHaveLength(5);
    // Both of these are empty deliberately; see the module docs.
    expect(GRAPHIC_PRESENTATION.carveOuts).toEqual([]);
    expect(ANIMAL_CRUELTY.carveOuts).toEqual([]);
  });

  it('the evidence table is the corpus table, word for word', () => {
    for (const requirement of Object.values(EVIDENCE_REQUIREMENT)) {
      expect(CORPUS).toContain(requirement);
    }
  });
});

// ---------------------------------------------------------------------------
// Coverage — 6 implemented, 12 blocked, 18 total, no overlap, no invention
// ---------------------------------------------------------------------------

/**
 * ⚠ RE-PINNED 2026-08-17. This block used to assert "6 implemented, 12 blocked"
 * against a `BLOCKED_POLICIES` list. The remaining twelve now have technical
 * contracts rather than a blocked marker, so that list was replaced by the
 * three-category `POLICY_TECHNICAL_STATUS` matrix — and the full 18/18 coverage
 * assertions moved to `evidenceGate.test.ts`, where they are stricter: each
 * category is checked against the code that actually implements it, not against
 * a hand-written count. What stays here is the claim specific to this file.
 */
describe('coverage of the eighteen', () => {
  const implementedIds = [
    ...IMPLEMENTED_POLICIES.map((p) => p.ref.replace(/@\d+$/, '')),
    P1_POLICY,
  ];

  it('the ungated detectors are exactly the ORDINARY-evidence, ratifiable policies', () => {
    for (const identity of implementedIds) {
      const record = POLICY_REGISTRY.find((r) => r.identity === identity)!;
      expect(record.evidence_sensitivity.value?.markers, identity).toEqual(['ORDINARY']);
      expect(record.severity_envelope.status, identity).toBe('DECLARED');
      for (const marker of record.evidence_sensitivity.value?.markers ?? []) {
        expect(UNSUPPLIABLE_EVIDENCE_MARKERS, identity).not.toContain(marker);
      }
    }
    expect(implementedIds).toHaveLength(6);
  });

  it('the Legal-blocked policy is not among them', () => {
    expect(implementedIds).not.toContain('ts.hate.protected-target-abuse');
    const legal = POLICY_TECHNICAL_STATUS.find(
      (p) => p.identity === 'ts.hate.protected-target-abuse',
    )!;
    expect(legal.status).toBe('LEGAL_BLOCKED');
    expect(legal.suppliedBy).toContain('G02-D-07b');
  });

  it('cites a version for every detector, and it is the one the registry carries', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      const record = recordFor(policy);
      expect(policy.ref).toBe(`${record.identity}${record.version.value}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 1. Positive — the constitutive element, established
// ---------------------------------------------------------------------------

describe('1. positive cases', () => {
  it('a PROHIBITED policy constituted is a violation, and nothing more', () => {
    for (const policy of [GRAPHIC_HARM, HARMFUL_ACTIVITY, ANIMAL_CRUELTY]) {
      expect(outcome(policy, constituted(policy)), policy.ref).toBe('VIOLATION');
      expect(state(policy, constituted(policy)), policy.ref).toBe('POLICY_CONSTITUTED');
    }
  });

  it('a RESTRICTED policy constituted is NOT a violation — §18 case 3', () => {
    for (const policy of [GRAPHIC_PRESENTATION, ADULT_CONTENT]) {
      const decision = evaluateConstitution(policy, constituted(policy), T);
      expect(decision.outcome, policy.ref).toBe('APPLICABLE_NO_VIOLATION');
      expect(decision.presentationConditionsApply, policy.ref).toBe(true);
      expect(explorePresentation(decision).state, policy.ref).toBe('PRESENTATION_CONDITIONS');
    }
  });

  it('every constituted state still renders unchanged — classification is not action', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      expect(feedTreatment(state(policy, constituted(policy))), policy.ref).toBe(
        FEED_TREATMENT_RENDER_UNCHANGED,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Negative — the corpus's own carve-outs
// ---------------------------------------------------------------------------

describe('2. negative cases', () => {
  it('any established carve-out settles it, even against an established decisive element', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      for (const carveOut of policy.carveOuts) {
        const signals = { ...constituted(policy), [carveOut]: true };
        expect(outcome(policy, signals), `${policy.ref}/${carveOut}`).toBe('NOT_APPLICABLE');
        expect(state(policy, signals), `${policy.ref}/${carveOut}`).toBe('PRESENTABLE');
      }
    }
  });

  it('a decisive element established false is non-constitution, not uncertainty', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      expect(outcome(policy, { [policy.decisive]: false }), policy.ref).toBe('NOT_APPLICABLE');
    }
  });

  it('#5: content the viewer DID initiate is non-constitution, not INDETERMINATE_CONTEXT', () => {
    const decision = evaluateConstitution(
      GRAPHIC_PRESENTATION,
      { viewingNotInitiatedByViewer: false },
      T,
    );
    expect(decision.outcome).toBe('NOT_APPLICABLE');
    expect(decision.outcome).not.toBe('INDETERMINATE_CONTEXT');
  });

  it('a carve-out never produces APPLICABLE_NO_VIOLATION on a PROHIBITED policy', () => {
    // The distinction is why carve-outs live in the signal layer rather than in
    // a `defeatingContext`, which would produce the other outcome.
    for (const policy of [GRAPHIC_HARM, HARMFUL_ACTIVITY]) {
      for (const carveOut of policy.carveOuts) {
        expect(outcome(policy, { [carveOut]: true }), carveOut).not.toBe('APPLICABLE_NO_VIOLATION');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3 + 4. Ambiguity and missing evidence
// ---------------------------------------------------------------------------

describe('3+4. ambiguity and missing evidence', () => {
  it('no signals at all is uncertainty, for every policy', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      expect(constitutedFrom(policy, {}), policy.ref).toBeUndefined();
      expect(outcome(policy, {}), policy.ref).toBe('INSUFFICIENT_EVIDENCE');
      expect(state(policy, {}), policy.ref).toBe('UNDETERMINED_EVIDENCE');
    }
  });

  it('every carve-out ruled out, decisive element unknown, is still uncertainty', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      const allRuledOut = Object.fromEntries(policy.carveOuts.map((c) => [c, false]));
      expect(outcome(policy, allRuledOut), policy.ref).toBe('INSUFFICIENT_EVIDENCE');
    }
  });

  it('#15: a recognised legitimate purpose does NOT clear the content', () => {
    // The corpus: "slaughter conducted with suffering materially beyond the
    // purpose *can* constitute it." Pig slaughter, balut and veterinary surgery
    // are therefore open questions to a detector, not acquittals.
    for (const purpose of [
      'slaughterForFood',
      'traditionalCulturalFoodPractice',
      'veterinaryProcedure',
      'farming',
      'pestControl',
    ]) {
      const signals = { [purpose]: true } as Signals;
      expect(outcome(ANIMAL_CRUELTY, signals), purpose).toBe('INSUFFICIENT_EVIDENCE');
      expect(outcome(ANIMAL_CRUELTY, signals), purpose).not.toBe('VIOLATION');
      expect(outcome(ANIMAL_CRUELTY, signals), purpose).not.toBe('NOT_APPLICABLE');
    }
  });

  it('#15: unfamiliar Vietnamese food practice is not evidence of cruelty (CTX-2)', () => {
    for (const signals of [
      { balut: true, embryoVisible: true },
      { pigSlaughter: true, bloodVisible: true, livestream: true },
      { dogSurgery: true, bloodVisible: true, incisionVisible: true },
    ] as Signals[]) {
      expect(outcome(ANIMAL_CRUELTY, signals)).toBe('INSUFFICIENT_EVIDENCE');
    }
  });
});

// ---------------------------------------------------------------------------
// TOP-1 — a topic can never constitute a policy
// ---------------------------------------------------------------------------

describe('TOP-1: topics cannot constitute', () => {
  const topicOnly: Array<[PolicyConstitution, Signals, string]> = [
    [GRAPHIC_HARM, { blood: true, injury: true, gore: true }, 'blood and injury'],
    [HARMFUL_ACTIVITY, { dangerous: true, stunt: true, height: true }, 'danger'],
    [GRAPHIC_PRESENTATION, { intenseImagery: true, graphic: true }, 'intensity'],
    [ADULT_CONTENT, { explicit: true, nudity: true }, 'explicitness'],
    [ANIMAL_CRUELTY, { animal: true, blood: true, knife: true }, 'animals'],
  ];

  for (const [policy, signals, label] of topicOnly) {
    it(`${policy.ref}: ${label} alone yields uncertainty, never a finding`, () => {
      expect(constitutedFrom(policy, signals)).toBeUndefined();
      expect(outcome(policy, signals)).toBe('INSUFFICIENT_EVIDENCE');
      expect(outcome(policy, signals)).not.toBe('VIOLATION');
    });
  }

  it('unknown signal names are inert — a detector cannot smuggle one in', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      const noise: Signals = { severity: true, urgent: true, confidence: true, flagged: true };
      expect(constitutedFrom(policy, noise), policy.ref).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Faults
// ---------------------------------------------------------------------------

describe('5. fault cases', () => {
  it('a malformed predicate is not a violation', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      const decision = evaluatePolicy(recordFor(policy), {
        subject: {},
        predicate: { op: 'nope', left: { value: 1 } } as unknown as Expression,
        asOf: T,
      });
      expect(decision.outcome, policy.ref).not.toBe('VIOLATION');
      expect(explorePresentation(decision).state, policy.ref).toBe('UNDETERMINED_EVIDENCE');
    }
  });

  it('a missing predicate is not a violation', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      const decision = evaluatePolicy(recordFor(policy), { subject: {}, asOf: T });
      expect(decision.outcome, policy.ref).not.toBe('VIOLATION');
    }
  });

  it('an undetermined answer omits the field rather than writing false', () => {
    expect(subjectFrom(undefined)).toEqual({ constitution: {} });
    expect(subjectFrom(false)).toEqual({ constitution: { established: false } });
    expect(CONSTITUTED_PATH).toBe('constitution.established');
  });
});

// ---------------------------------------------------------------------------
// 6. Staleness
// ---------------------------------------------------------------------------

describe('6. stale results', () => {
  it('a stale classification is withheld, neither softened nor hardened', () => {
    const classification = classifyExploreContent({
      contentId: 'review-1',
      contentVersion: 'v1',
      policyDecisions: IMPLEMENTED_POLICIES.map((p) => evaluateConstitution(p, constituted(p), T)),
      evaluatedAt: T,
    });
    expect(classification.states).toHaveLength(5);
    expect(currentStates(classification, 'v1').states).toHaveLength(5);
    expect(currentStates(classification, 'v2').states).toBeNull();
    expect(currentStates(classification, 'v2').stale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multi-policy — no precedence, nothing discarded
// ---------------------------------------------------------------------------

describe('multi-policy', () => {
  it('keeps every classification side by side and invents no precedence', () => {
    const classification = classifyExploreContent({
      contentId: 'review-1',
      contentVersion: 'v1',
      policyDecisions: [
        evaluateConstitution(GRAPHIC_HARM, constituted(GRAPHIC_HARM), T), // violation
        evaluateConstitution(ADULT_CONTENT, constituted(ADULT_CONTENT), T), // conditions
        evaluateConstitution(ANIMAL_CRUELTY, {}, T), // unknown
        evaluateConstitution(HARMFUL_ACTIVITY, { fiction: true }, T), // not applicable
      ],
      evaluatedAt: T,
    });
    expect(classification.states.map((s) => s.state)).toEqual([
      'POLICY_CONSTITUTED',
      'PRESENTATION_CONDITIONS',
      'UNDETERMINED_EVIDENCE',
      'PRESENTABLE',
    ]);
    expect(classification.combined).toBeNull();
    for (const s of classification.states) {
      expect(feedTreatment(s.state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
    }
  });

  it('produces no action vocabulary anywhere', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      const decision = evaluateConstitution(policy, constituted(policy), T);
      for (const forbidden of ['action', 'severity', 'rank', 'score', 'hide', 'visible', 'suppress'])
        for (const keys of [Object.keys(decision), Object.keys(explorePresentation(decision))])
          expect(keys, `${policy.ref}.${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the probe carries a policy and a predicate, and nothing else', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      const probe = probeFor(policy);
      expect(probe.policy).toBe(policy.ref);
      expect(probe.predicate).toEqual(CONSTITUTIVE_PREDICATE);
      expect(Object.keys(probe).sort()).toEqual(['policy', 'predicate']);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Exhaustive — the only path to a finding
// ---------------------------------------------------------------------------

describe('7. exhaustive safety', () => {
  for (const policy of IMPLEMENTED_POLICIES) {
    it(`${policy.ref}: the ONLY path to true is the decisive element, established`, () => {
      const keys = [policy.decisive, ...policy.carveOuts];
      const tri: Tri[] = [true, false, undefined];
      const total = tri.length ** keys.length;
      let positives = 0;

      for (let n = 0; n < total; n++) {
        const signals: Record<string, Tri> = {};
        let rest = n;
        for (const key of keys) {
          signals[key] = tri[rest % tri.length];
          rest = Math.floor(rest / tri.length);
        }
        if (constitutedFrom(policy, signals) !== true) continue;
        positives++;
        expect(signals[policy.decisive]).toBe(true);
        for (const carveOut of policy.carveOuts) expect(signals[carveOut]).not.toBe(true);
      }

      expect(positives).toBeGreaterThan(0);
      // Exactly one decisive value × every carve-out being anything but `true`.
      expect(positives).toBe(2 ** policy.carveOuts.length);
    });
  }

  it('no combination of signals produces a violation without the decisive element', () => {
    for (const policy of IMPLEMENTED_POLICIES) {
      for (const value of [false, undefined] as Tri[]) {
        const signals: Record<string, Tri> = { [policy.decisive]: value };
        for (const carveOut of policy.carveOuts) signals[carveOut] = false;
        expect(outcome(policy, signals), `${policy.ref}/${String(value)}`).not.toBe('VIOLATION');
      }
    }
  });
});
