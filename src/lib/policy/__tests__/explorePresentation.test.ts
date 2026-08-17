/**
 * EXPLORE SAFETY — adapter contract, UAT sweep, and failure safety.
 *
 * Three layers:
 *   1. The adapter's own contract (states, totality, no action anywhere).
 *   2. Every one of the 107 UAT scenarios pushed through the adapter, so the
 *      Explore-facing answer is proven for real Vietnamese content and not just
 *      for the classification underneath it.
 *   3. Failure safety A–I: the boundary conditions where a mistake would put
 *      ordinary content in front of the wrong outcome.
 */

import { describe, expect, it } from 'vitest';

import { UAT_MATRIX, type UatScenario } from '../__uat__/matrix';
import { UAT_MATRIX_VN } from '../__uat__/matrixVn';
import {
  EXPLORE_PRESENTATION_STATES,
  NON_CONSTITUTED_STATES,
  explorePresentation,
  explorePresentationSet,
  type ExplorePresentationState,
} from '../explore/presentation';
import { evaluatePolicy, type EvaluationInput, type PolicyDecision } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import { POLICY_REGISTRY } from '../source/registry';
import { OUTCOME_CLASSES } from '../types';
import { getProtectedTargetSet } from '../legal/protectedTargets';

const ASOF = '2026-08-16T00:00:00Z';
const LEGAL_POLICY = 'ts.hate.protected-target-abuse';

function predicateFor(t: 'TRUE' | 'FALSE' | 'UNKNOWN'): Expression {
  if (t === 'TRUE') return { op: 'eq', left: { value: 1 }, right: { value: 1 } };
  if (t === 'FALSE') return { op: 'eq', left: { value: 1 }, right: { value: 2 } };
  return { op: 'eq', left: { ref: 'unestablished' }, right: { value: 1 } };
}

const recordOf = (id: string) => {
  const r = POLICY_REGISTRY.find((x) => x.identity === id);
  if (!r) throw new Error(`registry missing ${id}`);
  return r;
};

function decide(s: UatScenario): PolicyDecision {
  const input: EvaluationInput = {
    subject: {},
    asOf: ASOF,
    predicate: predicateFor(s.harness.constitutive),
    ...(s.harness.defeat ? { defeatingContext: predicateFor(s.harness.defeat) } : {}),
    ...(s.harness.contextUnreadable ? { contextUnreadable: true } : {}),
    ...(s.harness.responseWarranted ? { responseWarranted: true } : {}),
  };
  return evaluatePolicy(recordOf(s.policy), input);
}

const ALL = [...UAT_MATRIX, ...UAT_MATRIX_VN].filter((s) => s.expected !== 'NOT_ESTABLISHED');

/** What the corpus outcome must translate to, Explore-side. */
const EXPECTED_STATE: Record<string, ExplorePresentationState> = {
  VIOLATION: 'POLICY_CONSTITUTED',
  NOT_APPLICABLE: 'PRESENTABLE',
  APPLICABLE_NO_VIOLATION: 'PRESENTABLE', // or PRESENTATION_CONDITIONS, handled below
  INSUFFICIENT_EVIDENCE: 'UNDETERMINED_EVIDENCE',
  INDETERMINATE_CONTEXT: 'UNDETERMINED_CONTEXT',
};

// ---------------------------------------------------------------------------
// 1. Adapter contract
// ---------------------------------------------------------------------------

describe('Explore adapter contract', () => {
  it('has exactly six states and adds no outcome class', () => {
    expect(EXPLORE_PRESENTATION_STATES).toHaveLength(6);
    expect(OUTCOME_CLASSES).toHaveLength(7);
  });

  it('is total: every outcome class maps to a state', () => {
    for (const outcome of OUTCOME_CLASSES) {
      const fake = {
        policy: 'ts.fraud.scam@1',
        outcome,
        truth: 'TRUE',
        faults: [],
        asOf: ASOF,
        terminalNonViolating: false,
        responseWarranted: false,
        presentationConditionsApply: false,
      } as unknown as PolicyDecision;
      const p = explorePresentation(fake);
      expect(EXPLORE_PRESENTATION_STATES, outcome).toContain(p.state);
    }
  });

  it('carries the policy version so a state stays explainable', () => {
    const d = decide(UAT_MATRIX.find((s) => s.kind === 'POSITIVE')!);
    expect(explorePresentation(d).policy).toMatch(/^ts\.[a-z.-]+@\d+$/);
  });

  it('refuses to combine several policies — COMP-4', () => {
    const decisions = ALL.slice(0, 5).map(decide);
    const set = explorePresentationSet(decisions);
    expect(set.states).toHaveLength(5);
    expect(set.combined).toBeNull();
    expect(set.reason).toMatch(/COMP-4/);
  });

  it('exposes no action, no severity, no ranking, anywhere in its output', () => {
    for (const s of ALL.slice(0, 20)) {
      const keys = Object.keys(explorePresentation(decide(s)));
      for (const forbidden of ['action', 'severity', 'rank', 'score', 'hide', 'show', 'visible']) {
        expect(keys, s.id).not.toContain(forbidden);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. All 107 UAT scenarios, Explore-side
// ---------------------------------------------------------------------------

describe('Explore state for every UAT scenario', () => {
  it.each(ALL.map((s) => [s.id, s] as const))('%s reaches the right Explore state', (_id, s) => {
    const p = explorePresentation(decide(s));
    if (s.expected === 'APPLICABLE_NO_VIOLATION') {
      expect(['PRESENTABLE', 'PRESENTATION_CONDITIONS']).toContain(p.state);
    } else {
      expect(p.state).toBe(EXPECTED_STATE[s.expected as string]);
    }
  });

  it('NOT ONE ordinary Vietnamese item reaches POLICY_CONSTITUTED', () => {
    const wrong = [...UAT_MATRIX, ...UAT_MATRIX_VN]
      .filter((s) => s.kind !== 'POSITIVE' && s.expected !== 'NOT_ESTABLISHED')
      .filter((s) => explorePresentation(decide(s)).state === 'POLICY_CONSTITUTED')
      .map((s) => s.id);
    expect(wrong).toEqual([]);
  });

  it('uncertainty never reaches POLICY_CONSTITUTED or PRESENTABLE', () => {
    const uncertain = ALL.filter(
      (s) => s.harness.constitutive === 'UNKNOWN' || s.harness.contextUnreadable,
    );
    expect(uncertain.length).toBeGreaterThanOrEqual(25);
    for (const s of uncertain) {
      const state = explorePresentation(decide(s)).state;
      expect(['UNDETERMINED_EVIDENCE', 'UNDETERMINED_CONTEXT'], s.id).toContain(state);
    }
  });

  /**
   * "Constituted" splits two ways, and that split is the Owner's RESTRICTED
   * decision working as intended: a constituted PROHIBITED policy is a
   * violation; a constituted RESTRICTED one is not (option b, 2026-08-16).
   * Asserted as an exact partition rather than a blanket rule, so neither half
   * can drift into the other unnoticed.
   */
  it('genuine harm reaches POLICY_CONSTITUTED; constituted RESTRICTED does not', () => {
    const positives = ALL.filter((s) => s.kind === 'POSITIVE');
    expect(positives.length).toBeGreaterThanOrEqual(21);

    const restricted = new Set(
      POLICY_REGISTRY.filter((r) => r.disposition.value === 'RESTRICTED').map((r) => r.identity),
    );
    const constituted: string[] = [];
    const conditioned: string[] = [];

    for (const s of positives) {
      const state = explorePresentation(decide(s)).state;
      if (restricted.has(s.policy)) {
        expect(state, s.id).toBe('PRESENTATION_CONDITIONS');
        conditioned.push(s.id);
      } else {
        expect(state, s.id).toBe('POLICY_CONSTITUTED');
        constituted.push(s.id);
      }
    }
    expect(conditioned.sort()).toEqual(['UAT-GP-1', 'UAT-SAC-1']);
    expect(constituted.length).toBe(positives.length - 2);
  });
});

// ---------------------------------------------------------------------------
// 3. Failure safety A–I
// ---------------------------------------------------------------------------

describe('Explore failure safety', () => {
  const scam = recordOf('ts.fraud.scam');
  const state = (input: EvaluationInput) => explorePresentation(evaluatePolicy(scam, input)).state;

  it('A. missing evidence → UNDETERMINED_EVIDENCE', () => {
    expect(state({ subject: {}, asOf: ASOF, predicate: predicateFor('UNKNOWN') })).toBe(
      'UNDETERMINED_EVIDENCE',
    );
  });

  it('B. unreadable context → UNDETERMINED_CONTEXT', () => {
    expect(
      state({ subject: {}, asOf: ASOF, predicate: predicateFor('TRUE'), contextUnreadable: true }),
    ).toBe('UNDETERMINED_CONTEXT');
  });

  it('C. unknown defeat → UNDETERMINED_EVIDENCE, never constituted', () => {
    expect(
      state({
        subject: {},
        asOf: ASOF,
        predicate: predicateFor('TRUE'),
        defeatingContext: predicateFor('UNKNOWN'),
      }),
    ).toBe('UNDETERMINED_EVIDENCE');
  });

  it('D. an engine fault never reaches POLICY_CONSTITUTED', () => {
    // No predicate at all, and a malformed one.
    const noPredicate = state({ subject: {}, asOf: ASOF });
    const malformed = state({
      subject: {},
      asOf: ASOF,
      predicate: { op: 'notAnOperator', left: { value: 1 } } as unknown as Expression,
    });
    for (const s of [noPredicate, malformed]) {
      expect(s).not.toBe('POLICY_CONSTITUTED');
      expect(NON_CONSTITUTED_STATES).toContain(s);
    }
  });

  it('E. Legal blocked is its own state — never allow, never deny, never violation', () => {
    expect(getProtectedTargetSet().state).toBe('BLOCKED');
    for (const t of ['TRUE', 'FALSE', 'UNKNOWN'] as const) {
      const p = explorePresentation(
        evaluatePolicy(recordOf(LEGAL_POLICY), {
          subject: {},
          asOf: ASOF,
          predicate: predicateFor(t),
        }),
      );
      expect(p.state, t).toBe('UNDECIDABLE_LEGAL_BLOCKED');
      expect(p.state).not.toBe('PRESENTABLE');
      expect(p.state).not.toBe('POLICY_CONSTITUTED');
      expect(p.blockedBy).toBe('G02-D-07b');
      expect(p.presentationConditions).toBe(false);
    }
  });

  it('F. a constituted RESTRICTED policy → PRESENTATION_CONDITIONS', () => {
    for (const id of ['ts.graphic.presentation', 'ts.sexual.adult-content']) {
      const p = explorePresentation(
        evaluatePolicy(recordOf(id), { subject: {}, asOf: ASOF, predicate: predicateFor('TRUE') }),
      );
      expect(p.state, id).toBe('PRESENTATION_CONDITIONS');
      expect(p.presentationConditions, id).toBe(true);
    }
  });

  it('G. a non-RESTRICTED policy never receives the presentation attribute', () => {
    const nonRestricted = POLICY_REGISTRY.filter((r) => r.disposition.value !== 'RESTRICTED');
    expect(nonRestricted).toHaveLength(16);
    for (const r of nonRestricted) {
      for (const t of ['TRUE', 'FALSE', 'UNKNOWN'] as const) {
        const p = explorePresentation(
          evaluatePolicy(r, { subject: {}, asOf: ASOF, predicate: predicateFor(t) }),
        );
        expect(p.presentationConditions, `${r.identity}/${t}`).toBe(false);
        expect(p.state, `${r.identity}/${t}`).not.toBe('PRESENTATION_CONDITIONS');
      }
    }
  });

  it('H. changing disposition changes no action, because none exists', () => {
    // Same evaluation, both dispositions. The only difference permitted is the
    // state name — there is no action field to differ in.
    const prohibited = explorePresentation(
      evaluatePolicy(scam, { subject: {}, asOf: ASOF, predicate: predicateFor('TRUE') }),
    );
    const restricted = explorePresentation(
      evaluatePolicy(recordOf('ts.graphic.presentation'), {
        subject: {},
        asOf: ASOF,
        predicate: predicateFor('TRUE'),
      }),
    );
    expect(Object.keys(prohibited).sort()).toEqual(Object.keys(restricted).sort());
    for (const p of [prohibited, restricted]) {
      expect(Object.keys(p)).not.toContain('action');
    }
  });

  it('I. an envelope creates neither severity nor action', () => {
    for (const r of POLICY_REGISTRY) {
      const p = explorePresentation(
        evaluatePolicy(r, { subject: {}, asOf: ASOF, predicate: predicateFor('TRUE') }),
      );
      expect(Object.keys(p), r.identity).not.toContain('severity');
      expect(Object.keys(p), r.identity).not.toContain('action');
    }
  });
});
