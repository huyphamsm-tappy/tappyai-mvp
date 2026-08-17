/**
 * The eleven evidence-gated policies, and the completeness of the eighteen.
 *
 * The safety claim is narrow and absolute: for a `HUMAN_REQUIRED` policy the
 * machine can NEVER reach a violation on its own, and for a `CORROBORATED`
 * policy it can never reach one on a single source. Everything else in this file
 * exists to make those two sentences falsifiable.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  POLICY_TECHNICAL_STATUS,
  TECHNICAL_STATUSES,
  constitutedFrom,
  evaluateConstitution,
  evaluateGated,
  recordFor,
  type PolicyConstitution,
  type Signals,
} from '../detect/constitution';
import {
  GATE_STATES,
  gateConstitution,
  hasConflict,
  independentSupportCount,
  machineMayNeverConclude,
  type EvidenceBasis,
} from '../detect/evidenceGate';
import {
  CORROBORATED_POLICIES,
  GATED_POLICIES,
  HUMAN_REQUIRED_POLICIES,
  SELFHARM_PROMOTION,
  selfHarmDisclosure,
} from '../detect/gatedPolicies';
import { IMPLEMENTED_POLICIES } from '../detect/policies';
import { P1_POLICY } from '../detect/privacyPersonalInformation';
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

const constituted = (p: PolicyConstitution): Signals => ({ [p.decisive]: true });
const markersOf = (p: PolicyConstitution) =>
  recordFor(p).evidence_sensitivity.value?.markers ?? [];

const TWO_SOURCES: EvidenceBasis[] = [
  { sourceId: 'source-a', supports: true },
  { sourceId: 'source-b', supports: true },
];
const ONE_SOURCE_TWICE: EvidenceBasis[] = [
  { sourceId: 'source-a', supports: true },
  { sourceId: 'source-a', supports: true },
];
const CONFLICTING: EvidenceBasis[] = [
  { sourceId: 'source-a', supports: true },
  { sourceId: 'source-b', supports: false },
];

// ---------------------------------------------------------------------------
// 18/18 — every policy has a technical status
// ---------------------------------------------------------------------------

describe('the eighteen are fully accounted for', () => {
  it('the status matrix is exactly the registry — none missing, none duplicated', () => {
    const ids = POLICY_TECHNICAL_STATUS.map((p) => p.identity).sort();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(POLICY_REGISTRY.map((r) => r.identity).sort());
    expect(ids).toHaveLength(18);
  });

  it('no policy is left unstarted, and every status carries a stated cause', () => {
    for (const entry of POLICY_TECHNICAL_STATUS) {
      expect(TECHNICAL_STATUSES, entry.identity).toContain(entry.status);
      expect(entry.awaiting.length, entry.identity).toBeGreaterThan(0);
      expect(entry.suppliedBy.length, entry.identity).toBeGreaterThan(0);
    }
  });

  it('the three categories hold 6 implemented, 11 evidence-gated, 1 Legal-blocked', () => {
    const count = (s: string) => POLICY_TECHNICAL_STATUS.filter((p) => p.status === s).length;
    expect(count('IMPLEMENTED')).toBe(6);
    expect(count('EVIDENCE_GATED')).toBe(11);
    expect(count('LEGAL_BLOCKED')).toBe(1);
  });

  it('each category matches the code that actually implements it', () => {
    const implemented = POLICY_TECHNICAL_STATUS.filter((p) => p.status === 'IMPLEMENTED').map(
      (p) => p.identity,
    );
    expect(implemented.sort()).toEqual(
      [...IMPLEMENTED_POLICIES.map((p) => p.ref.replace(/@\d+$/, '')), P1_POLICY].sort(),
    );

    const evidenceGated = POLICY_TECHNICAL_STATUS.filter((p) => p.status === 'EVIDENCE_GATED').map(
      (p) => p.identity,
    );
    expect(evidenceGated.sort()).toEqual(
      GATED_POLICIES.map((p) => p.ref.replace(/@\d+$/, '')).sort(),
    );

    const legal = POLICY_TECHNICAL_STATUS.filter((p) => p.status === 'LEGAL_BLOCKED');
    expect(legal.map((p) => p.identity)).toEqual(['ts.hate.protected-target-abuse']);
    expect(legal[0].suppliedBy).toContain('G02-D-07b');
  });

  it('the Legal-blocked policy has no constitutive definition anywhere', () => {
    const everyDefinition = [...IMPLEMENTED_POLICIES, ...GATED_POLICIES];
    expect(everyDefinition.map((p) => p.ref)).not.toContain('ts.hate.protected-target-abuse@1');
  });
});

// ---------------------------------------------------------------------------
// Corpus traceability
// ---------------------------------------------------------------------------

describe('corpus traceability', () => {
  for (const policy of GATED_POLICIES) {
    it(`${policy.ref} quotes the corpus verbatim`, () => {
      expect(policy.corpusPhrases.length).toBeGreaterThan(0);
      for (const phrase of policy.corpusPhrases) {
        expect(CORPUS, `${policy.ref}: ${phrase}`).toContain(phrase);
      }
    });
  }

  it('every gated policy cites the version the registry carries', () => {
    for (const policy of GATED_POLICIES) {
      const record = recordFor(policy);
      expect(policy.ref).toBe(`${record.identity}${record.version.value}`);
    }
  });
});

// ---------------------------------------------------------------------------
// HUMAN_REQUIRED — the machine may never conclude
// ---------------------------------------------------------------------------

describe('HUMAN_REQUIRED', () => {
  it('every child-safety policy and self-harm carries the marker', () => {
    for (const policy of HUMAN_REQUIRED_POLICIES) {
      expect(markersOf(policy), policy.ref).toContain('HUMAN_REQUIRED');
      expect(machineMayNeverConclude(markersOf(policy)), policy.ref).toBe(true);
    }
  });

  it('an established constitutive element still cannot become a violation', () => {
    for (const policy of HUMAN_REQUIRED_POLICIES) {
      const { decision, gate } = evaluateGated(policy, constituted(policy), T);
      expect(gate, policy.ref).toBe('HUMAN_REVIEW_REQUIRED');
      expect(decision.outcome, policy.ref).toBe('INSUFFICIENT_EVIDENCE');
      expect(explorePresentation(decision).state, policy.ref).toBe('UNDETERMINED_EVIDENCE');
    }
  });

  it('no amount of machine evidence substitutes for the human', () => {
    const manySources: EvidenceBasis[] = Array.from({ length: 10 }, (_, i) => ({
      sourceId: `source-${i}`,
      supports: true,
    }));
    for (const policy of HUMAN_REQUIRED_POLICIES) {
      const { decision, gate } = evaluateGated(policy, constituted(policy), T, {
        bases: manySources,
      });
      expect(gate, policy.ref).toBe('HUMAN_REVIEW_REQUIRED');
      expect(decision.outcome, policy.ref).not.toBe('VIOLATION');
    }
  });

  it('a human conclusion is the only thing that opens the gate', () => {
    for (const policy of HUMAN_REQUIRED_POLICIES) {
      const { decision, gate } = evaluateGated(policy, constituted(policy), T, {
        humanReview: { concluded: true },
      });
      expect(gate, policy.ref).toBe('SUFFICIENT');
      expect(decision.outcome, policy.ref).toBe('VIOLATION');
    }
  });

  it('the machine may still establish NON-constitution without a human', () => {
    // The corpus bars concluding a violation, not clearing content.
    for (const policy of HUMAN_REQUIRED_POLICIES) {
      const { decision, gate } = evaluateGated(policy, { [policy.decisive]: false }, T);
      expect(gate, policy.ref).toBe('SUFFICIENT');
      expect(decision.outcome, policy.ref).toBe('NOT_APPLICABLE');
    }
  });

  it('CS-0.3: no child-safety policy has a purpose carve-out that could excuse it', () => {
    for (const policy of HUMAN_REQUIRED_POLICIES) {
      expect(policy.carveOuts, policy.ref).toEqual([]);
    }
    // And a claimed purpose cannot move the answer.
    for (const policy of HUMAN_REQUIRED_POLICIES) {
      const claimed: Signals = {
        ...constituted(policy),
        education: true,
        documentation: true,
        research: true,
        journalism: true,
      };
      expect(constitutedFrom(policy, claimed), policy.ref).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// OUT-3 — self-harm disclosure must never be a violation
// ---------------------------------------------------------------------------

describe('OUT-3: self-harm disclosure and support-seeking', () => {
  it('is APPLICABLE_NO_VIOLATION with a warranted response — not NOT_APPLICABLE', () => {
    const decision = evaluateConstitution(
      SELFHARM_PROMOTION,
      constituted(SELFHARM_PROMOTION),
      T,
      selfHarmDisclosure(),
    );
    expect(decision.outcome).toBe('APPLICABLE_NO_VIOLATION');
    expect(decision.responseWarranted).toBe(true);
    expect(decision.outcome).not.toBe('VIOLATION');
  });

  it('carries no action — a warranted response is not an enforcement signal', () => {
    const decision = evaluateConstitution(
      SELFHARM_PROMOTION,
      constituted(SELFHARM_PROMOTION),
      T,
      selfHarmDisclosure(),
    );
    for (const forbidden of ['action', 'severity', 'rank', 'hide', 'visible', 'suppress'])
      expect(Object.keys(decision)).not.toContain(forbidden);
    expect(feedTreatment(explorePresentation(decision).state)).toBe(
      FEED_TREATMENT_RENDER_UNCHANGED,
    );
  });

  it('the decisive element is direction, not the topic of self-harm', () => {
    const topicOnly: Signals = { selfHarm: true, suicide: true, distress: true };
    expect(constitutedFrom(SELFHARM_PROMOTION, topicOnly)).toBeUndefined();
    expect(evaluateGated(SELFHARM_PROMOTION, topicOnly, T).decision.outcome).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
  });
});

// ---------------------------------------------------------------------------
// CORROBORATED — two independent bases, or nothing
// ---------------------------------------------------------------------------

describe('CORROBORATED', () => {
  it('every corroborated policy carries the marker', () => {
    for (const policy of CORROBORATED_POLICIES) {
      expect(markersOf(policy), policy.ref).toContain('CORROBORATED');
    }
  });

  it('no evidence at all cannot conclude', () => {
    for (const policy of CORROBORATED_POLICIES) {
      const { decision, gate } = evaluateGated(policy, constituted(policy), T);
      expect(gate, policy.ref).toBe('INSUFFICIENT_CORROBORATION');
      expect(decision.outcome, policy.ref).toBe('INSUFFICIENT_EVIDENCE');
    }
  });

  it('one source cannot conclude', () => {
    for (const policy of CORROBORATED_POLICIES) {
      const { decision, gate } = evaluateGated(policy, constituted(policy), T, {
        bases: [{ sourceId: 'source-a', supports: true }],
      });
      expect(gate, policy.ref).toBe('INSUFFICIENT_CORROBORATION');
      expect(decision.outcome, policy.ref).not.toBe('VIOLATION');
    }
  });

  it('the SAME source counted twice is not corroboration', () => {
    expect(independentSupportCount(ONE_SOURCE_TWICE)).toBe(1);
    for (const policy of CORROBORATED_POLICIES) {
      const { decision, gate } = evaluateGated(policy, constituted(policy), T, {
        bases: ONE_SOURCE_TWICE,
      });
      expect(gate, policy.ref).toBe('INSUFFICIENT_CORROBORATION');
      expect(decision.outcome, policy.ref).not.toBe('VIOLATION');
    }
  });

  it('two independent supporting sources satisfy the requirement', () => {
    expect(independentSupportCount(TWO_SOURCES)).toBe(2);
    for (const policy of CORROBORATED_POLICIES) {
      const { decision, gate } = evaluateGated(policy, constituted(policy), T, {
        bases: TWO_SOURCES,
      });
      expect(gate, policy.ref).toBe('SUFFICIENT');
      expect(decision.outcome, policy.ref).toBe('VIOLATION');
    }
  });

  it('conflicting evidence is uncertainty, never a finding', () => {
    expect(hasConflict(CONFLICTING)).toBe(true);
    for (const policy of CORROBORATED_POLICIES) {
      const { decision, gate } = evaluateGated(policy, constituted(policy), T, {
        bases: [...CONFLICTING, { sourceId: 'source-c', supports: true }],
      });
      expect(gate, policy.ref).toBe('CONFLICTING_EVIDENCE');
      expect(decision.outcome, policy.ref).toBe('INSUFFICIENT_EVIDENCE');
    }
  });

  it('a carve-out clears content without needing any corroboration at all', () => {
    for (const policy of CORROBORATED_POLICIES) {
      const carveOut = policy.carveOuts[0];
      const { decision, gate } = evaluateGated(policy, { [carveOut]: true }, T);
      expect(gate, policy.ref).toBe('SUFFICIENT');
      expect(decision.outcome, `${policy.ref}/${carveOut}`).toBe('NOT_APPLICABLE');
    }
  });

  it('an evidence basis carries no content and no identity', () => {
    const basis: EvidenceBasis = { sourceId: 'source-a', supports: true, evidenceRef: 'ref-123' };
    expect(Object.keys(basis).sort()).toEqual(['evidenceRef', 'sourceId', 'supports']);
    expect(JSON.stringify(basis)).not.toMatch(/body|caption|user|email|phone/i);
  });
});

// ---------------------------------------------------------------------------
// The gate itself
// ---------------------------------------------------------------------------

describe('the gate is one-directional', () => {
  it('never turns a non-finding into a finding, for any marker set or evidence', () => {
    const markerSets = [
      [],
      ['ORDINARY'],
      ['CORROBORATED'],
      ['HUMAN_REQUIRED'],
      ['LEGALLY_SENSITIVE', 'RESTRICTED_HANDLING', 'HUMAN_REQUIRED'],
    ];
    const evidenceSets = [
      {},
      { bases: TWO_SOURCES },
      { bases: CONFLICTING },
      { humanReview: { concluded: true } },
      { bases: TWO_SOURCES, humanReview: { concluded: true } },
    ];
    for (const markers of markerSets)
      for (const evidence of evidenceSets)
        for (const input of [false, undefined] as const) {
          const result = gateConstitution(markers, input, evidence);
          expect(result.constituted, `${markers}/${JSON.stringify(evidence)}`).toBe(input);
        }
  });

  it('exhaustive: a finding survives only where the corpus permits it', () => {
    const markerSets = [['ORDINARY'], ['CORROBORATED'], ['HUMAN_REQUIRED']];
    const baseSets: EvidenceBasis[][] = [[], [{ sourceId: 'a', supports: true }], ONE_SOURCE_TWICE, TWO_SOURCES, CONFLICTING];
    const humanStates = [undefined, { concluded: false }, { concluded: true }];
    let survivors = 0;

    for (const markers of markerSets)
      for (const bases of baseSets)
        for (const humanReview of humanStates) {
          const result = gateConstitution(markers, true, { bases, humanReview });
          if (result.constituted !== true) continue;
          survivors++;
          expect(hasConflict(bases)).toBe(false);
          if (markers.includes('HUMAN_REQUIRED')) expect(humanReview?.concluded).toBe(true);
          if (markers.includes('CORROBORATED')) expect(independentSupportCount(bases)).toBeGreaterThanOrEqual(2);
        }
    expect(survivors).toBeGreaterThan(0);
  });

  it('reports only the four states it declares', () => {
    expect([...GATE_STATES]).toEqual([
      'SUFFICIENT',
      'HUMAN_REVIEW_REQUIRED',
      'INSUFFICIENT_CORROBORATION',
      'CONFLICTING_EVIDENCE',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Legal boundary, staleness, action vocabulary
// ---------------------------------------------------------------------------

describe('boundaries', () => {
  it('the Legal-blocked policy is neither allow nor deny, whatever it is asked', () => {
    const record = POLICY_REGISTRY.find((r) => r.identity === 'ts.hate.protected-target-abuse')!;
    for (const established of [true, false]) {
      const decision = evaluateConstitution(
        { ...record, ref: 'ts.hate.protected-target-abuse@1', decisive: 'x', carveOuts: [], corpusPhrases: [], decisiveSource: '' } as unknown as PolicyConstitution,
        { x: established },
        T,
      );
      expect(decision.outcome).not.toBe('VIOLATION');
      expect(decision.outcome).not.toBe('NOT_APPLICABLE');
      expect(decision.faults.some((f) => f.blockedBy === 'G02-D-07b')).toBe(true);
      expect(explorePresentation(decision).state).toBe('UNDECIDABLE_LEGAL_BLOCKED');
    }
  });

  it('a stale gated classification is withheld, not reused', () => {
    const classification = classifyExploreContent({
      contentId: 'c1',
      contentVersion: 'v1',
      policyDecisions: GATED_POLICIES.map(
        (p) => evaluateGated(p, constituted(p), T, { bases: TWO_SOURCES, humanReview: { concluded: true } }).decision,
      ),
      evaluatedAt: T,
    });
    expect(classification.states).toHaveLength(11);
    expect(currentStates(classification, 'v2').states).toBeNull();
    expect(classification.combined).toBeNull();
  });

  it('no gated policy produces action vocabulary or changes feed treatment', () => {
    for (const policy of GATED_POLICIES) {
      const { decision } = evaluateGated(policy, constituted(policy), T, {
        bases: TWO_SOURCES,
        humanReview: { concluded: true },
      });
      const presentation = explorePresentation(decision);
      expect(feedTreatment(presentation.state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
      for (const forbidden of ['action', 'severity', 'rank', 'hide', 'visible', 'suppress'])
        for (const keys of [Object.keys(decision), Object.keys(presentation)])
          expect(keys, `${policy.ref}.${forbidden}`).not.toContain(forbidden);
    }
  });
});
