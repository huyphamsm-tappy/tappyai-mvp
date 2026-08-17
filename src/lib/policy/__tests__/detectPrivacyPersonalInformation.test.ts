/**
 * P1 PILOT — the frozen product contract, as executable guards.
 *
 * The point of this suite is NOT that the classifier is clever. It is that the
 * Owner's freeze of 2026-08-17 cannot be undone by a later edit without a test
 * going red.
 *
 * 🚨 THE ASSERTION THAT MATTERS MOST IS AN ABSENCE. `UAT-PPI-1` and
 * `EXP-PRIV-2` are POSITIVE scenarios in the UAT bed, and under this contract
 * they must come back UNDETERMINED, not VIOLATION. That is a deliberate 2-case
 * divergence from the bed, accepted by Product, and it is the reason the
 * accepted score is 6/8.
 *
 * 🚨 THERE IS NO "8/8 MUST PASS" TEST HERE, ON PURPOSE. Reaching 8/8 would mean
 * something inferred consent or its absence, which freeze clauses 3 and 4
 * forbid. 8/8 is a symptom, not an improvement.
 */

import { describe, expect, it } from 'vitest';

import {
  CONSENT_EVIDENCE,
  P1_CARVE_OUTS,
  P1_POLICY,
  P1_POLICY_REF,
  P1_PREDICATE,
  P1_SUBJECT_PATH,
  contactIdentifiersIn,
  detectPrivacySignals,
  evaluatePrivacy,
  evaluatePrivacyContent,
  exposureConstitutedFrom,
  privacyProbe,
  privacyPolicyRecord,
  privacySubject,
  type ConsentEvidence,
  type PrivacySignals,
} from '../detect/privacyPersonalInformation';
import { evaluatePolicy } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import {
  FEED_TREATMENT_RENDER_UNCHANGED,
  classifyExploreContent,
  contentVersionFrom,
  currentStates,
  feedTreatment,
} from '../explore/contentClassification';
import { observeExploreContent, responseIsFreeOfObservation } from '../explore/observation';
import { explorePresentation } from '../explore/presentation';
import { UAT_MATRIX } from '../__uat__/matrix';
import { UAT_MATRIX_VN } from '../__uat__/matrixVn';
import { UAT_MATRIX_EXPLORE } from '../__uat__/matrixExplore';

const T = '2026-08-17T00:00:00Z';
const BED = [...UAT_MATRIX, ...UAT_MATRIX_VN, ...UAT_MATRIX_EXPLORE];

const stateOf = (signals: PrivacySignals) => explorePresentation(evaluatePrivacy(signals, T)).state;
const outcomeOf = (signals: PrivacySignals) => evaluatePrivacy(signals, T).outcome;

/**
 * Signals a detector can actually produce for each scenario in the bed, given
 * the data TappyAI holds. Consent evidence is absent throughout, because no
 * source for it exists — that is the state of the world, not a test shortcut.
 */
const SCENARIO_SIGNALS: Record<string, PrivacySignals> = {
  // Another person's contact details; nothing establishes consent either way.
  'UAT-PPI-1': { identifyingInformationPresent: true, consentEvidence: 'NO_EVIDENCE' },
  'EXP-PRIV-2': { identifyingInformationPresent: true, consentEvidence: 'NO_EVIDENCE' },
  'UAT-PPI-3': { identifyingInformationPresent: true, consentEvidence: 'NO_EVIDENCE' },
  'VN-PRIV-3': { identifyingInformationPresent: true, consentEvidence: 'NO_EVIDENCE' },
  // The review's own place: business contact details, §9.4.
  'UAT-PPI-2': {
    identifyingInformationPresent: true,
    subjectIsBusinessContact: true,
    consentEvidence: 'NO_EVIDENCE',
  },
  'VN-PRIV-1': {
    identifyingInformationPresent: true,
    subjectIsBusinessContact: true,
    consentEvidence: 'NO_EVIDENCE',
  },
  'EXP-PRIV-1': {
    identifyingInformationPresent: true,
    subjectIsBusinessContact: true,
    consentEvidence: 'NO_EVIDENCE',
  },
  // The poster's own number, §9.4 self-disclosure.
  'VN-PRIV-2': {
    identifyingInformationPresent: true,
    selfDisclosure: true,
    consentEvidence: 'NO_EVIDENCE',
  },
};

// ---------------------------------------------------------------------------
// The bed this pilot is measured against really exists
// ---------------------------------------------------------------------------

describe('the UAT bed', () => {
  it('covers exactly the scenarios this pilot claims, and they are all P1', () => {
    const inBed = BED.filter((s) => s.policy === P1_POLICY).map((s) => s.id).sort();
    expect(inBed).toEqual(Object.keys(SCENARIO_SIGNALS).sort());
  });

  it('P1 is ratifiable and is not the Legal-blocked policy', () => {
    const record = privacyPolicyRecord();
    expect(record.identity).toBe(P1_POLICY);
    expect(record.severity_envelope.status).toBe('DECLARED');
    expect(record.disposition.value).toBe('PROHIBITED');
  });

  it('the cited version is the one the registry carries (VER-T1)', () => {
    // If the corpus ever bumps this policy, resolution fails loudly rather than
    // silently re-pointing the pilot at a different version of the rule.
    expect(P1_POLICY_REF).toBe(`${P1_POLICY}${privacyPolicyRecord().version.value}`);
    expect(evaluatePrivacy({ identifyingInformationPresent: true }, T).policy).toBe(P1_POLICY_REF);
  });
});

// ---------------------------------------------------------------------------
// A. Sufficient evidence — the approved classification behaviour
// ---------------------------------------------------------------------------

describe('A. sufficient evidence', () => {
  it('established non-consent over governed exposure constitutes the policy', () => {
    const signals: PrivacySignals = {
      identifyingInformationPresent: true,
      subjectIsAnotherPerson: true,
      consentEvidence: 'ESTABLISHED_ABSENT',
    };
    expect(exposureConstitutedFrom(signals)).toBe(true);
    expect(outcomeOf(signals)).toBe('VIOLATION');
    expect(stateOf(signals)).toBe('POLICY_CONSTITUTED');
  });

  it('established consent is a carve-out, not a violation (§9.4 shared with consent)', () => {
    const signals: PrivacySignals = {
      identifyingInformationPresent: true,
      consentEvidence: 'ESTABLISHED_GIVEN',
    };
    expect(outcomeOf(signals)).toBe('NOT_APPLICABLE');
    expect(stateOf(signals)).toBe('PRESENTABLE');
  });

  it('a classification is still not an action — POLICY_CONSTITUTED renders unchanged', () => {
    const state = stateOf({
      identifyingInformationPresent: true,
      consentEvidence: 'ESTABLISHED_ABSENT',
    });
    expect(feedTreatment(state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
  });
});

// ---------------------------------------------------------------------------
// B + C. Consent uncertainty and ambiguity — the frozen behaviour
// ---------------------------------------------------------------------------

describe('B. consent uncertainty stays UNDETERMINED (freeze clauses 2, 3, 6)', () => {
  for (const id of ['UAT-PPI-1', 'EXP-PRIV-2'] as const) {
    it(`${id} is UNDETERMINED, never a violation — this is the accepted divergence`, () => {
      const signals = SCENARIO_SIGNALS[id];
      expect(exposureConstitutedFrom(signals)).toBeUndefined();
      expect(outcomeOf(signals)).toBe('INSUFFICIENT_EVIDENCE');
      expect(stateOf(signals)).toBe('UNDETERMINED_EVIDENCE');
      // The bed expects a violation here. The freeze says otherwise, on purpose.
      expect(BED.find((s) => s.id === id)?.expected).toBe('VIOLATION');
    });
  }
});

describe('C. ambiguous records stay UNDETERMINED', () => {
  for (const id of ['UAT-PPI-3', 'VN-PRIV-3'] as const) {
    it(`${id} is UNDETERMINED, and the bed agrees`, () => {
      expect(outcomeOf(SCENARIO_SIGNALS[id])).toBe('INSUFFICIENT_EVIDENCE');
      expect(stateOf(SCENARIO_SIGNALS[id])).toBe('UNDETERMINED_EVIDENCE');
      expect(BED.find((s) => s.id === id)?.expected).toBe('INSUFFICIENT_EVIDENCE');
    });
  }
});

// ---------------------------------------------------------------------------
// D. Corpus-defined exclusions
// ---------------------------------------------------------------------------

describe('D. §9.4 Does not govern', () => {
  it('every carve-out the corpus names has a signal, none is silently dropped', () => {
    expect([...P1_CARVE_OUTS]).toHaveLength(5);
  });

  for (const id of ['UAT-PPI-2', 'VN-PRIV-1', 'EXP-PRIV-1'] as const) {
    it(`${id}: a business's own contact details are not governed`, () => {
      expect(outcomeOf(SCENARIO_SIGNALS[id])).toBe('NOT_APPLICABLE');
      expect(stateOf(SCENARIO_SIGNALS[id])).toBe('PRESENTABLE');
    });
  }

  it('VN-PRIV-2: self-disclosure is not governed', () => {
    expect(outcomeOf(SCENARIO_SIGNALS['VN-PRIV-2'])).toBe('NOT_APPLICABLE');
  });

  it('already-public and journalism carve-outs settle it the same way', () => {
    const base: PrivacySignals = { identifyingInformationPresent: true };
    expect(outcomeOf({ ...base, alreadyPublicInOrdinaryContext: true })).toBe('NOT_APPLICABLE');
    expect(outcomeOf({ ...base, journalismInPublicInterest: true })).toBe('NOT_APPLICABLE');
  });

  it('a carve-out yields NOT_APPLICABLE, never APPLICABLE_NO_VIOLATION', () => {
    // The distinction is why the carve-outs live in the signal layer and not in
    // a `defeatingContext`, which would produce the other outcome.
    for (const id of ['UAT-PPI-2', 'VN-PRIV-1', 'EXP-PRIV-1', 'VN-PRIV-2'] as const) {
      expect(outcomeOf(SCENARIO_SIGNALS[id]), id).not.toBe('APPLICABLE_NO_VIOLATION');
    }
  });
});

// ---------------------------------------------------------------------------
// The accepted tally — 6/8, stated as a distribution, never as "8/8"
// ---------------------------------------------------------------------------

describe('the accepted 6/8 result', () => {
  const results = Object.entries(SCENARIO_SIGNALS).map(([id, signals]) => ({
    id,
    kind: BED.find((s) => s.id === id)!.kind,
    expected: BED.find((s) => s.id === id)!.expected,
    got: outcomeOf(signals),
  }));

  it('is 4 NOT_APPLICABLE + 4 UNDETERMINED + 0 VIOLATION', () => {
    const tally = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.got] = (acc[r.got] ?? 0) + 1;
      return acc;
    }, {});
    expect(tally).toEqual({ NOT_APPLICABLE: 4, INSUFFICIENT_EVIDENCE: 4 });
  });

  it('matches the bed on exactly 6, and the 2 misses are the consent-uncertain pair', () => {
    const misses = results.filter((r) => r.got !== r.expected).map((r) => r.id).sort();
    expect(results.filter((r) => r.got === r.expected)).toHaveLength(6);
    expect(misses).toEqual(['EXP-PRIV-2', 'UAT-PPI-1']);
  });

  it('no false-positive scenario ever becomes a violation — the hard gate', () => {
    const falsePositives = results.filter((r) => r.kind === 'FALSE_POSITIVE');
    expect(falsePositives.length).toBeGreaterThanOrEqual(4);
    for (const r of falsePositives) expect(r.got, r.id).not.toBe('VIOLATION');
  });
});

// ---------------------------------------------------------------------------
// E. Safety
// ---------------------------------------------------------------------------

describe('E. safety', () => {
  it('FREEZE CLAUSE 3, exhaustively: the ONLY path to true is established non-consent', () => {
    const tri = [true, false, undefined];
    const consents: Array<ConsentEvidence | undefined> = [...CONSENT_EVIDENCE, undefined];
    let positives = 0;
    let combinations = 0;

    for (const identifyingInformationPresent of tri)
      for (const subjectIsAnotherPerson of tri)
        for (const subjectIsBusinessContact of tri)
          for (const selfDisclosure of tri)
            for (const alreadyPublicInOrdinaryContext of tri)
              for (const journalismInPublicInterest of tri)
                for (const consentEvidence of consents) {
                  combinations++;
                  const signals: PrivacySignals = {
                    identifyingInformationPresent,
                    subjectIsAnotherPerson,
                    subjectIsBusinessContact,
                    selfDisclosure,
                    alreadyPublicInOrdinaryContext,
                    journalismInPublicInterest,
                    consentEvidence,
                  };
                  if (exposureConstitutedFrom(signals) !== true) continue;
                  positives++;
                  expect(consentEvidence).toBe('ESTABLISHED_ABSENT');
                  expect(identifyingInformationPresent).toBe(true);
                  expect(subjectIsBusinessContact).not.toBe(true);
                  expect(selfDisclosure).not.toBe(true);
                  expect(alreadyPublicInOrdinaryContext).not.toBe(true);
                  expect(journalismInPublicInterest).not.toBe(true);
                  expect(subjectIsAnotherPerson).not.toBe(false);
                }

    expect(combinations).toBe(3 ** 6 * 4);
    expect(positives).toBeGreaterThan(0);
  });

  it('absent consent evidence never becomes a violation, whatever else is known', () => {
    const tri = [true, false, undefined];
    for (const subjectIsAnotherPerson of tri)
      for (const consentEvidence of ['NO_EVIDENCE', undefined] as const) {
        const signals: PrivacySignals = {
          identifyingInformationPresent: true,
          subjectIsAnotherPerson,
          consentEvidence,
        };
        expect(outcomeOf(signals)).not.toBe('VIOLATION');
      }
  });

  it('an undetermined answer omits the field rather than writing false', () => {
    // A `false` here would be read as an affirmative finding of no violation.
    expect(privacySubject({ consentEvidence: 'NO_EVIDENCE' })).toEqual({ exposure: {} });
    expect(privacySubject({ identifyingInformationPresent: false })).toEqual({
      exposure: { constituted: false },
    });
    expect(P1_SUBJECT_PATH).toBe('exposure.constituted');
  });

  it('the extractor never claims that identifying information is absent', () => {
    const signals = detectPrivacySignals({ text: 'Quán này ngon, không có gì đặc biệt' });
    expect(signals.identifyingInformationPresent).toBeUndefined();
    expect(outcomeOf(signals)).not.toBe('VIOLATION');
    expect(outcomeOf(signals)).not.toBe('NOT_APPLICABLE');
  });

  it('an engine fault is not a violation', () => {
    const malformed = { op: 'nope', left: { value: 1 } } as unknown as Expression;
    const d = evaluatePolicy(privacyPolicyRecord(), {
      subject: {},
      predicate: malformed,
      asOf: T,
    });
    expect(d.outcome).not.toBe('VIOLATION');
    expect(explorePresentation(d).state).toBe('UNDETERMINED_EVIDENCE');
  });

  it('a missing predicate is not a violation either', () => {
    const d = evaluatePolicy(privacyPolicyRecord(), { subject: {}, asOf: T });
    expect(d.outcome).not.toBe('VIOLATION');
  });

  it('a stale result is withheld — not reused, not softened, not hardened', () => {
    const v1 = contentVersionFrom({ body: 'gọi 0912 345 678', hashtags: [] });
    const v2 = contentVersionFrom({ body: 'gọi 0912 345 679', hashtags: [] });
    const classification = classifyExploreContent({
      contentId: 'review-1',
      contentVersion: v1,
      policyDecisions: [evaluatePrivacy(SCENARIO_SIGNALS['UAT-PPI-2'], T)],
      evaluatedAt: T,
    });
    expect(v1).not.toBe(v2);
    expect(currentStates(classification, v1).states).toHaveLength(1);
    expect(currentStates(classification, v2).states).toBeNull();
    expect(currentStates(classification, v2).stale).toBe(true);
  });

  it('produces no action vocabulary anywhere in its output', () => {
    for (const signals of Object.values(SCENARIO_SIGNALS)) {
      const decision = evaluatePrivacy(signals, T);
      const presentation = explorePresentation(decision);
      for (const forbidden of ['action', 'severity', 'rank', 'score', 'hide', 'visible', 'suppress'])
        for (const keys of [Object.keys(decision), Object.keys(presentation)])
          expect(keys).not.toContain(forbidden);
    }
  });

  it('every P1 state renders unchanged — classification is not action', () => {
    for (const signals of Object.values(SCENARIO_SIGNALS))
      expect(feedTreatment(stateOf(signals))).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
  });
});

// ---------------------------------------------------------------------------
// Signal extraction
// ---------------------------------------------------------------------------

describe('signal extraction', () => {
  it('finds Vietnamese phone numbers and emails, however they are spaced', () => {
    expect(contactIdentifiersIn('gọi 0912 345 678 nhé')).toContain('0912345678');
    expect(contactIdentifiersIn('gọi 0912.345.678')).toContain('0912345678');
    expect(contactIdentifiersIn('+84912345678')).toContain('84912345678');
    expect(contactIdentifiersIn('mail: a.b@quan.vn')).toContain('abquanvn');
  });

  it('does not mistake a price for a phone number', () => {
    expect(contactIdentifiersIn('món này 100.000.000đ')).toEqual([]);
    expect(contactIdentifiersIn('hết 250000 đồng')).toEqual([]);
  });

  it("establishes the business carve-out from the row's own place fields", () => {
    const signals = detectPrivacySignals({
      text: 'Quán ngon, đặt bàn 0912 345 678',
      businessContactStrings: ['Quán Ngon', '12 Lê Lợi', '0912345678'],
    });
    expect(signals.subjectIsBusinessContact).toBe(true);
    expect(outcomeOf(signals)).toBe('NOT_APPLICABLE');
  });

  it('establishes self-disclosure from the posting account', () => {
    const signals = detectPrivacySignals({
      text: 'Ai cần thì nhắn mình 0912 345 678',
      authorContactStrings: ['0912345678'],
    });
    expect(signals.selfDisclosure).toBe(true);
    expect(outcomeOf(signals)).toBe('NOT_APPLICABLE');
  });

  it('leaves the business carve-out unestablished when the platform holds nothing', () => {
    // The Explore feed does not select place contact numbers today, so this is
    // the production shape. Uncertainty, never a finding.
    const signals = detectPrivacySignals({ text: 'gọi 0912 345 678' });
    expect(signals.subjectIsBusinessContact).toBeUndefined();
    expect(evaluatePrivacyContent({ text: 'gọi 0912 345 678' }, T).outcome).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
  });
});

// ---------------------------------------------------------------------------
// F. Boundary — independently classifiable, observation only
// ---------------------------------------------------------------------------

describe('F. boundary', () => {
  it('P1 stays independently classifiable, with no precedence invented', () => {
    const classification = classifyExploreContent({
      contentId: 'review-1',
      contentVersion: 'v1',
      policyDecisions: [
        evaluatePrivacy(SCENARIO_SIGNALS['UAT-PPI-2'], T),
        evaluatePrivacy(SCENARIO_SIGNALS['UAT-PPI-1'], T),
      ],
      evaluatedAt: T,
    });
    expect(classification.states.map((s) => s.state)).toEqual([
      'PRESENTABLE',
      'UNDETERMINED_EVIDENCE',
    ]);
    expect(classification.combined).toBeNull();
  });

  it('the probe carries a policy and a predicate, and nothing else', () => {
    const probe = privacyProbe();
    expect(probe.policy).toBe(P1_POLICY_REF);
    expect(probe.predicate).toEqual(P1_PREDICATE);
    expect(Object.keys(probe).sort()).toEqual(['policy', 'predicate']);
  });

  it('composes with the observation seam and carries no content or identity', () => {
    const result = observeExploreContent(
      { content: { contentId: 'review-1', contentVersion: 'v1' }, probes: [privacyProbe()], evaluatedAt: T },
      (probe, asOf) =>
        evaluatePolicy(privacyPolicyRecord(), {
          subject: privacySubject(SCENARIO_SIGNALS['UAT-PPI-1']),
          predicate: probe.predicate,
          asOf,
        }),
    );
    expect(result.observed).toBe(true);
    if (!result.observed) return;
    expect(result.records).toHaveLength(1);
    expect(result.records[0].state).toBe('UNDETERMINED_EVIDENCE');
    for (const field of ['body', 'text', 'userId', 'user_id', 'author', 'mediaUrl'])
      expect(Object.keys(result.records[0])).not.toContain(field);
  });

  it('contributes nothing to a client response', () => {
    expect(responseIsFreeOfObservation({ id: 'r1', body: 'x', place_name: 'y' })).toBe(true);
  });

  it('the predicate is inert data — no executable member at any depth', () => {
    const walk = (v: unknown): void => {
      expect(typeof v).not.toBe('function');
      if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(P1_PREDICATE);
    expect(JSON.parse(JSON.stringify(P1_PREDICATE))).toEqual(P1_PREDICATE);
  });
});
