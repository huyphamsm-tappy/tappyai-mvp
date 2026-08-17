/**
 * EXPLORE PRODUCT CONTRACT — Q1–Q4.
 *
 * Product-level behaviour, expressed as tests so a decision cannot quietly
 * become a different decision later:
 *
 *   Q1 (settled, = A) content with presentation conditions keeps its current
 *      display; the state is recorded and nothing acts on it.
 *   Q2 (open)         several policies at once — asserted as "no merge", which
 *      is the current honest behaviour, not a chosen priority.
 *   Q3 (open)         edit after publish — asserted as "a classification is
 *      about a moment", which the corpus already implies via `asOf`.
 *   Q4 (open)         creator vs viewer — asserted as "indistinguishable",
 *      because the adapter has no audience input at all.
 *
 * No policy predicate is invented: every decision below comes from the real
 * engine driven by the same three-valued stand-in the UAT already uses.
 * Enforcement is NONE / NOT TESTED throughout — there is no action to test.
 */

import { describe, expect, it } from 'vitest';

import {
  explorePresentation,
  explorePresentationSet,
  type ExplorePresentationState,
} from '../explore/presentation';
import { evaluatePolicy, type EvaluationInput, type PolicyDecision } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import { POLICY_REGISTRY } from '../source/registry';

const ASOF_1 = '2026-08-16T10:00:00Z';
const ASOF_2 = '2026-08-16T11:00:00Z';
const LEGAL_POLICY = 'ts.hate.protected-target-abuse';

const P = {
  TRUE: { op: 'eq', left: { value: 1 }, right: { value: 1 } } as Expression,
  FALSE: { op: 'eq', left: { value: 1 }, right: { value: 2 } } as Expression,
  UNKNOWN: { op: 'eq', left: { ref: 'unestablished' }, right: { value: 1 } } as Expression,
};

const recordOf = (id: string) => {
  const r = POLICY_REGISTRY.find((x) => x.identity === id);
  if (!r) throw new Error(`registry missing ${id}`);
  return r;
};

const evaluate = (policy: string, input: Partial<EvaluationInput> = {}): PolicyDecision =>
  evaluatePolicy(recordOf(policy), { subject: {}, asOf: ASOF_1, predicate: P.TRUE, ...input });

const stateOf = (policy: string, input: Partial<EvaluationInput> = {}): ExplorePresentationState =>
  explorePresentation(evaluate(policy, input)).state;

// ---------------------------------------------------------------------------
// Q1 — settled: record only, display unchanged
// ---------------------------------------------------------------------------

describe('Q1 — presentation conditions are recorded, never acted on', () => {
  it('produces a state and nothing that could drive a display change', () => {
    for (const id of ['ts.graphic.presentation', 'ts.sexual.adult-content']) {
      const p = explorePresentation(evaluate(id));
      expect(p.state, id).toBe('PRESENTATION_CONDITIONS');
      expect(p.presentationConditions, id).toBe(true);

      // The whole output surface. If Explore is to change anything, it would
      // have to invent the instruction itself — this object does not carry one.
      expect(Object.keys(p).sort()).toEqual(['policy', 'presentationConditions', 'state']);
    }
  });

  it('is not a violation, and not treated as one', () => {
    for (const id of ['ts.graphic.presentation', 'ts.sexual.adult-content']) {
      expect(stateOf(id)).not.toBe('POLICY_CONSTITUTED');
    }
  });
});

// ---------------------------------------------------------------------------
// Q2 — several policies at once
// ---------------------------------------------------------------------------

describe('Q2 — multiple policies', () => {
  const combos: Array<{ name: string; policies: Array<[string, Partial<EvaluationInput>]> }> = [
    {
      name: 'two policies constituted',
      policies: [
        ['ts.fraud.scam', {}],
        ['ts.deception.harmful', {}],
      ],
    },
    {
      name: 'three policies constituted',
      policies: [
        ['ts.fraud.scam', {}],
        ['ts.deception.harmful', {}],
        ['ts.platform.abuse-manipulation', {}],
      ],
    },
    {
      name: 'a violation plus a RESTRICTED policy',
      policies: [
        ['ts.violence.incitement-threats', {}],
        ['ts.graphic.presentation', {}],
      ],
    },
    {
      name: 'a violation plus an uncertain policy',
      policies: [
        ['ts.fraud.scam', {}],
        ['ts.harassment.targeted', { predicate: P.UNKNOWN }],
      ],
    },
    {
      name: 'a violation plus the Legal-blocked policy',
      policies: [
        ['ts.fraud.scam', {}],
        [LEGAL_POLICY, {}],
      ],
    },
  ];

  it.each(combos.map((c) => [c.name, c] as const))('%s — nothing is merged', (_n, combo) => {
    const set = explorePresentationSet(combo.policies.map(([p, i]) => evaluate(p, i)));

    expect(set.states).toHaveLength(combo.policies.length);
    expect(set.combined, 'a single answer would be a priority rule the corpus does not define')
      .toBeNull();
    expect(set.reason).toMatch(/COMP-4/);

    // Every policy keeps its own state and its own version — nothing is lost.
    for (const s of set.states) expect(s.policy).toMatch(/@\d+$/);
    expect(new Set(set.states.map((s) => s.policy)).size).toBe(combo.policies.length);
  });

  it('a Legal-blocked policy in the set never contaminates the others', () => {
    const set = explorePresentationSet([evaluate('ts.fraud.scam'), evaluate(LEGAL_POLICY)]);
    const [scam, hate] = set.states;
    expect(scam.state).toBe('POLICY_CONSTITUTED');
    expect(scam.blockedBy).toBeUndefined();
    expect(hate.state).toBe('UNDECIDABLE_LEGAL_BLOCKED');
    expect(hate.blockedBy).toBe('G02-D-07b');
  });

  it('an uncertain policy alongside a violation is still reported as uncertain', () => {
    const set = explorePresentationSet([
      evaluate('ts.fraud.scam'),
      evaluate('ts.harassment.targeted', { predicate: P.UNKNOWN }),
    ]);
    expect(set.states.map((s) => s.state)).toEqual(['POLICY_CONSTITUTED', 'UNDETERMINED_EVIDENCE']);
  });
});

// ---------------------------------------------------------------------------
// Q3 — edit after publish
// ---------------------------------------------------------------------------

describe('Q3 — a classification is about a moment, not about a piece of content forever', () => {
  it('every decision is stamped with the time it was made', () => {
    expect(evaluate('ts.fraud.scam', { asOf: ASOF_1 }).asOf).toBe(ASOF_1);
    expect(evaluate('ts.fraud.scam', { asOf: ASOF_2 }).asOf).toBe(ASOF_2);
  });

  const transitions: Array<[string, string, Partial<EvaluationInput>, Partial<EvaluationInput>, ExplorePresentationState, ExplorePresentationState]> = [
    ['normal → violation', 'ts.fraud.scam', { predicate: P.FALSE }, { predicate: P.TRUE }, 'PRESENTABLE', 'POLICY_CONSTITUTED'],
    ['violation → normal', 'ts.fraud.scam', { predicate: P.TRUE }, { predicate: P.FALSE }, 'POLICY_CONSTITUTED', 'PRESENTABLE'],
    ['uncertain → context supplied', 'ts.harassment.targeted', { predicate: P.UNKNOWN }, { predicate: P.FALSE }, 'UNDETERMINED_EVIDENCE', 'PRESENTABLE'],
    ['restricted → normal', 'ts.graphic.presentation', { predicate: P.TRUE }, { predicate: P.FALSE }, 'PRESENTATION_CONDITIONS', 'PRESENTABLE'],
    ['normal → restricted', 'ts.sexual.adult-content', { predicate: P.FALSE }, { predicate: P.TRUE }, 'PRESENTABLE', 'PRESENTATION_CONDITIONS'],
    ['context unreadable → readable', 'ts.danger.harmful-activity', { contextUnreadable: true }, {}, 'UNDETERMINED_CONTEXT', 'POLICY_CONSTITUTED'],
  ];

  it.each(transitions.map((t) => [t[0], t] as const))(
    '%s — re-evaluating the edited content gives the new answer, not the old one',
    (_name, [, policy, before, after, expectedBefore, expectedAfter]) => {
      expect(stateOf(policy, { ...before, asOf: ASOF_1 })).toBe(expectedBefore);
      expect(stateOf(policy, { ...after, asOf: ASOF_2 })).toBe(expectedAfter);
    },
  );

  it('repeated edits are independent — no result is sticky', () => {
    const seq = [P.FALSE, P.TRUE, P.FALSE, P.TRUE].map((predicate, i) =>
      stateOf('ts.fraud.scam', { predicate, asOf: `2026-08-16T1${i}:00:00Z` }),
    );
    expect(seq).toEqual([
      'PRESENTABLE',
      'POLICY_CONSTITUTED',
      'PRESENTABLE',
      'POLICY_CONSTITUTED',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Q4 — creator vs viewer
// ---------------------------------------------------------------------------

describe('Q4 — the adapter cannot tell a creator from a viewer', () => {
  it('takes no audience input, so the same content yields one state for everyone', () => {
    // Evaluating twice with identical inputs — there is no third input to vary.
    const a = explorePresentation(evaluate('ts.graphic.presentation'));
    const b = explorePresentation(evaluate('ts.graphic.presentation'));
    expect(a).toEqual(b);
  });

  it('carries nothing creator-facing: no message, no strike, no appeal, no notice', () => {
    const p = explorePresentation(evaluate('ts.fraud.scam')) as unknown as Record<string, unknown>;
    for (const field of ['message', 'notice', 'strike', 'appeal', 'warning', 'audience', 'viewer']) {
      expect(Object.keys(p)).not.toContain(field);
    }
  });

  it('draft and published content are the same to this layer — it never saw a status', () => {
    // The adapter has no publication-status input either. If Explore wants to
    // treat a draft differently, that is a new Product decision, not a flag.
    const keys = Object.keys(explorePresentation(evaluate('ts.fraud.scam')));
    expect(keys).not.toContain('status');
    expect(keys).not.toContain('published');
  });
});
