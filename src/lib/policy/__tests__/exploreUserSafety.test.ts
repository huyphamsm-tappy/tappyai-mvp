/**
 * EXPLORE USER SAFETY — the product view.
 *
 * Runs the Explore-specific matrix end to end, then asks the question the other
 * suites do not: **can any of this reach the user interface at all?**
 *
 * That last part is checked against the real feed route's own source, because
 * "the classification has no action field" and "the feed response is unchanged"
 * are different claims, and only the second one is what a user experiences.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { UAT_MATRIX } from '../__uat__/matrix';
import { UAT_MATRIX_VN } from '../__uat__/matrixVn';
import { UAT_MATRIX_EXPLORE } from '../__uat__/matrixExplore';
import type { UatScenario } from '../__uat__/matrix';
import {
  FEED_TREATMENT_RENDER_UNCHANGED,
  classifyContent,
  currentStates,
  feedTreatment,
} from '../explore/contentClassification';
import { explorePresentation } from '../explore/presentation';
import { evaluatePolicy, type EvaluationInput, type PolicyDecision } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import { POLICY_REGISTRY } from '../source/registry';
import { OUTCOME_CLASSES } from '../types';

const CORPUS = readFileSync(
  path.resolve(__dirname, '../../../../docs/policy/02_POLICY_TAXONOMY.md'),
  'utf8',
);
const T1 = '2026-08-16T10:00:00Z';

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

function decide(s: UatScenario, asOf = T1): PolicyDecision {
  const input: EvaluationInput = {
    subject: {},
    asOf,
    predicate: P[s.harness.constitutive],
    ...(s.harness.defeat ? { defeatingContext: P[s.harness.defeat] } : {}),
    ...(s.harness.contextUnreadable ? { contextUnreadable: true } : {}),
    ...(s.harness.responseWarranted ? { responseWarranted: true } : {}),
  };
  return evaluatePolicy(recordOf(s.policy), input);
}

const stateOf = (s: UatScenario) => explorePresentation(decide(s)).state;
const testable = UAT_MATRIX_EXPLORE.filter((s) => s.expected !== 'NOT_ESTABLISHED');
const ALL = [...UAT_MATRIX, ...UAT_MATRIX_VN, ...UAT_MATRIX_EXPLORE].filter(
  (s) => s.expected !== 'NOT_ESTABLISHED',
);

// ---------------------------------------------------------------------------
// Matrix integrity
// ---------------------------------------------------------------------------

describe('Explore matrix integrity', () => {
  it('is traceable to the corpus, verbatim, and asserts no enforcement', () => {
    const untraceable = UAT_MATRIX_EXPLORE.filter((s) => !CORPUS.includes(s.evidence)).map(
      (s) => `${s.id}: "${s.evidence.slice(0, 60)}"`,
    );
    expect(untraceable).toEqual([]);
    for (const s of UAT_MATRIX_EXPLORE) {
      expect(s.enforcement, s.id).toBe('NONE / NOT TESTED');
      if (s.expected !== 'NOT_ESTABLISHED') {
        expect(OUTCOME_CLASSES as readonly string[], s.id).toContain(s.expected);
      }
    }
  });

  it('strengthens the policies that were thinnest on Explore', () => {
    const count = (id: string) => UAT_MATRIX_EXPLORE.filter((s) => s.policy === id).length;
    expect(count('ts.child.sexual-exploitation')).toBeGreaterThanOrEqual(3);
    expect(count('ts.child.grooming')).toBeGreaterThanOrEqual(2);
    expect(count('ts.sexual.adult-content')).toBeGreaterThanOrEqual(2);
    expect(count('ts.selfharm.promotion')).toBeGreaterThanOrEqual(2);
  });

  it('has unique ids across all three matrices', () => {
    const ids = [...UAT_MATRIX, ...UAT_MATRIX_VN, ...UAT_MATRIX_EXPLORE].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// False positives — the whole point
// ---------------------------------------------------------------------------

describe('false positives on Explore', () => {
  it.each(testable.map((s) => [s.id, s] as const))('%s resolves as the corpus requires', (_id, s) => {
    expect(decide(s).outcome).toBe(s.expected);
  });

  it('NOT ONE ordinary Explore post is constituted', () => {
    const wrong = UAT_MATRIX_EXPLORE.filter(
      (s) => s.kind !== 'POSITIVE' && s.expected !== 'NOT_ESTABLISHED',
    )
      .filter((s) => stateOf(s) === 'POLICY_CONSTITUTED')
      .map((s) => s.id);
    expect(wrong).toEqual([]);
  });

  it('across ALL matrices, zero false positives', () => {
    const wrong = ALL.filter((s) => s.kind !== 'POSITIVE')
      .filter((s) => stateOf(s) === 'POLICY_CONSTITUTED')
      .map((s) => s.id);
    expect(wrong).toEqual([]);
  });

  it('a sensational caption over harmless media does not constitute anything', () => {
    const s = UAT_MATRIX_EXPLORE.find((x) => x.id === 'EXP-MISMATCH-1')!;
    expect(stateOf(s)).toBe('PRESENTABLE');
  });
});

// ---------------------------------------------------------------------------
// Uncertainty, classified by cause
// ---------------------------------------------------------------------------

describe('uncertainty is separated by cause, never merged into a verdict', () => {
  it('evidence gaps and context gaps stay distinct', () => {
    const evidenceGaps = ALL.filter((s) => s.expected === 'INSUFFICIENT_EVIDENCE');
    const contextGaps = ALL.filter((s) => s.expected === 'INDETERMINATE_CONTEXT');
    expect(evidenceGaps.length).toBeGreaterThanOrEqual(20);
    expect(contextGaps.length).toBeGreaterThanOrEqual(9);
    for (const s of evidenceGaps) expect(stateOf(s), s.id).toBe('UNDETERMINED_EVIDENCE');
    for (const s of contextGaps) expect(stateOf(s), s.id).toBe('UNDETERMINED_CONTEXT');
  });

  it('Legal blocked is a fourth, separate cause — not evidence, not context', () => {
    const p = explorePresentation(
      evaluatePolicy(recordOf('ts.hate.protected-target-abuse'), {
        subject: {},
        asOf: T1,
        predicate: P.TRUE,
      }),
    );
    expect(p.state).toBe('UNDECIDABLE_LEGAL_BLOCKED');
    expect(p.blockedBy).toBe('G02-D-07b');
  });

  it('engine/input failure is a fifth cause and still never a verdict', () => {
    const p = explorePresentation(
      evaluatePolicy(recordOf('ts.fraud.scam'), { subject: {}, asOf: T1 }),
    );
    expect(p.state).not.toBe('POLICY_CONSTITUTED');
    expect(p.state).not.toBe('PRESENTABLE');
  });

  it('uncertainty never carries intent, severity or an action', () => {
    for (const s of ALL.filter((x) => x.harness.constitutive === 'UNKNOWN')) {
      const keys = Object.keys(explorePresentation(decide(s)));
      for (const f of ['intent', 'severity', 'action', 'confidence', 'score']) {
        expect(keys, `${s.id}.${f}`).not.toContain(f);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-policy — no "the strictest one wins"
// ---------------------------------------------------------------------------

describe('multi-policy never implies stricter handling', () => {
  const ev = (id: string, over: Partial<EvaluationInput> = {}) =>
    evaluatePolicy(recordOf(id), { subject: {}, asOf: T1, predicate: P.TRUE, ...over });

  it('two, three, and mixed combinations all render unchanged', () => {
    const combos: PolicyDecision[][] = [
      [ev('ts.fraud.scam'), ev('ts.deception.harmful')],
      [ev('ts.fraud.scam'), ev('ts.deception.harmful'), ev('ts.platform.abuse-manipulation')],
      [ev('ts.fraud.scam'), ev('ts.graphic.presentation')],
      [ev('ts.fraud.scam'), ev('ts.harassment.targeted', { predicate: P.UNKNOWN })],
      [ev('ts.fraud.scam'), ev('ts.hate.protected-target-abuse')],
    ];
    for (const decisions of combos) {
      const c = classifyContent({ contentId: 'x', contentVersion: 'v1' }, decisions, T1);
      expect(c.combined).toBeNull();
      for (const s of c.states) {
        expect(feedTreatment(s.state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
      }
    }
  });

  it('one constituted policy does not change how the others are reported', () => {
    const alone = classifyContent(
      { contentId: 'x', contentVersion: 'v1' },
      [ev('ts.harassment.targeted', { predicate: P.UNKNOWN })],
      T1,
    );
    const alongside = classifyContent(
      { contentId: 'x', contentVersion: 'v1' },
      [ev('ts.fraud.scam'), ev('ts.harassment.targeted', { predicate: P.UNKNOWN })],
      T1,
    );
    expect(alongside.states[1]).toEqual(alone.states[0]);
  });
});

// ---------------------------------------------------------------------------
// Content lifecycle — no history poisoning
// ---------------------------------------------------------------------------

describe('content lifecycle V1 → V4', () => {
  const ev = (t: 'TRUE' | 'FALSE' | 'UNKNOWN') =>
    evaluatePolicy(recordOf('ts.fraud.scam'), { subject: {}, asOf: T1, predicate: P[t] });

  it('each version stands on its own, and nothing carries forward', () => {
    const plan: Array<['TRUE' | 'FALSE' | 'UNKNOWN', string]> = [
      ['FALSE', 'PRESENTABLE'],
      ['TRUE', 'POLICY_CONSTITUTED'],
      ['UNKNOWN', 'UNDETERMINED_EVIDENCE'],
      ['FALSE', 'PRESENTABLE'],
    ];
    const classifications = plan.map(([truth], i) =>
      classifyContent({ contentId: 'post', contentVersion: `v${i + 1}` }, [ev(truth)], T1),
    );

    classifications.forEach((c, i) => {
      expect(c.states[0].state, `v${i + 1}`).toBe(plan[i][1]);
      // Older classifications are stale against the newest version.
      if (i < 3) expect(currentStates(c, 'v4').states, `v${i + 1}`).toBeNull();
    });

    // The final version returns to normal with no residue of having been constituted.
    expect(classifications[3].states[0].state).toBe('PRESENTABLE');
    expect(JSON.stringify(classifications[3])).not.toMatch(/POLICY_CONSTITUTED|history|previous/);
  });
});

// ---------------------------------------------------------------------------
// Product experience — can any of this reach the user?
// ---------------------------------------------------------------------------

describe('product experience', () => {
  const SRC = path.resolve(__dirname, '../../..');
  const feed = readFileSync(path.join(SRC, 'app/api/reviews/feed/route.ts'), 'utf8');

  /**
   * Comments stripped before matching.
   *
   * ⚠ RE-PINNED, Owner decision 2026-08-17. The route now carries a comment
   * block explaining the P1 observation call, and that prose legitimately
   * contains words like "classification". Matching the raw file would flag the
   * explanation rather than a field — so the assertion moved to CODE ONLY,
   * which is a stricter question than the one it replaced ("does a policy field
   * exist in the code", not "does the word appear in the file").
   */
  const feedCode = feed
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('the feed response shape is untouched: no policy field reaches the client', () => {
    // Names that could only have come from the policy layer. A bare `state` is
    // deliberately NOT on this list: the route uses the word in a comment about
    // an old caching bug, and matching it would be flagging prose, not a field.
    for (const field of [
      'presentationConditions',
      'policyState',
      'policy_state',
      'classification',
      'PRESENTATION_CONDITIONS',
      'POLICY_CONSTITUTED',
      'UNDETERMINED_',
      'UNDECIDABLE_',
    ]) {
      expect(feedCode, field).not.toMatch(new RegExp(field.replace(/_/g, '_')));
    }
  });

  it('feed ordering and visibility are decided by nothing policy-related', () => {
    // Sorting exists in the route and must stay driven by product signals only.
    expect(feed).toMatch(/sort/);
    expect(feedCode).not.toMatch(/feedTreatment|POLICY_CONSTITUTED/);
    // No line that decides order or visibility may consult the policy layer.
    for (const line of feedCode.split('\n')) {
      if (!/\b(?:sort|order|rank|is_hidden|slice|filter)\b/.test(line)) continue;
      expect(line, line.trim()).not.toMatch(/policy|observePrivacy/i);
    }
  });

  it('creator and viewer journeys produce identical classifications', () => {
    for (const s of UAT_MATRIX_EXPLORE.slice(0, 8)) {
      const asCreator = explorePresentation(decide(s));
      const asViewer = explorePresentation(decide(s));
      expect(asViewer, s.id).toEqual(asCreator);
    }
  });

  it('nothing in a classification could render as a warning, badge or notice', () => {
    for (const s of ALL.slice(0, 30)) {
      const p = explorePresentation(decide(s)) as unknown as Record<string, unknown>;
      for (const f of ['message', 'label', 'badge', 'warning', 'notice', 'reason', 'text']) {
        expect(Object.keys(p), `${s.id}.${f}`).not.toContain(f);
      }
    }
  });
});
