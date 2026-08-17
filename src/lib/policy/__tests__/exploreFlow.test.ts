/**
 * EXPLORE FLOW — content → classification → feed.
 *
 * Exercises the whole path a real post takes, with the emphasis on the three
 * things that would hurt users if they broke: a stale answer surviving an edit,
 * one policy's result contaminating another's, and any state quietly turning
 * into an action.
 *
 * Vietnamese scenarios are driven from the existing UAT matrices, so nothing is
 * re-invented and every one of them stays traceable to the corpus.
 */

import { describe, expect, it } from 'vitest';

import { UAT_MATRIX_VN } from '../__uat__/matrixVn';
import type { UatScenario } from '../__uat__/matrix';
import {
  FEED_TREATMENT,
  FEED_TREATMENT_RENDER_UNCHANGED,
  classifyContent,
  currentStates,
  feedTreatment,
  feedTreatmentIsUniform,
  isStale,
  type ContentRef,
} from '../explore/contentClassification';
import {
  EXPLORE_PRESENTATION_STATES,
  type ExplorePresentationState,
} from '../explore/presentation';
import { evaluatePolicy, type EvaluationInput, type PolicyDecision } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import { POLICY_REGISTRY } from '../source/registry';

const T1 = '2026-08-16T10:00:00Z';
const T2 = '2026-08-16T11:00:00Z';
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
  evaluatePolicy(recordOf(policy), { subject: {}, asOf: T1, predicate: P.TRUE, ...input });

const post = (version: string): ContentRef => ({ contentId: 'post-1', contentVersion: version });

/** Drives a Vietnamese UAT scenario through the full flow. */
function classifyScenario(s: UatScenario, content: ContentRef, at = T1) {
  const decision = evaluatePolicy(recordOf(s.policy), {
    subject: {},
    asOf: at,
    predicate: P[s.harness.constitutive],
    ...(s.harness.defeat ? { defeatingContext: P[s.harness.defeat] } : {}),
    ...(s.harness.contextUnreadable ? { contextUnreadable: true } : {}),
    ...(s.harness.responseWarranted ? { responseWarranted: true } : {}),
  });
  return classifyContent(content, [decision], at);
}

// ---------------------------------------------------------------------------
// A. Content lifecycle
// ---------------------------------------------------------------------------

describe('A. content lifecycle', () => {
  it('create → classify: the classification names the version it describes', () => {
    const c = classifyContent(post('v1'), [evaluate('ts.fraud.scam')], T1);
    expect(c.content.contentVersion).toBe('v1');
    expect(c.evaluatedAt).toBe(T1);
    expect(c.states).toHaveLength(1);
    expect(c.states[0].state).toBe('POLICY_CONSTITUTED');
  });

  it('edit → the old classification is stale, and its states are withheld', () => {
    const c = classifyContent(post('v1'), [evaluate('ts.fraud.scam')], T1);
    expect(isStale(c, 'v1')).toBe(false);
    expect(isStale(c, 'v2')).toBe(true);

    const now = currentStates(c, 'v2');
    expect(now.stale).toBe(true);
    // Withheld, not downgraded and not upgraded — it is about something else.
    expect(now.states).toBeNull();
  });

  it('edit → reclassify gives the new answer, not the old one', () => {
    const before = classifyContent(post('v1'), [evaluate('ts.fraud.scam', { predicate: P.TRUE })], T1);
    const after = classifyContent(post('v2'), [evaluate('ts.fraud.scam', { predicate: P.FALSE })], T2);
    expect(before.states[0].state).toBe('POLICY_CONSTITUTED');
    expect(after.states[0].state).toBe('PRESENTABLE');
    expect(currentStates(after, 'v2').states?.[0].state).toBe('PRESENTABLE');
  });

  it('edit back → reclassify returns to the earlier answer without carrying history', () => {
    const v3 = classifyContent(post('v3'), [evaluate('ts.fraud.scam', { predicate: P.TRUE })], T2);
    expect(v3.states[0].state).toBe('POLICY_CONSTITUTED');
    // Nothing in the classification records that it was ever anything else.
    expect(Object.keys(v3)).toEqual(['content', 'evaluatedAt', 'states', 'combined']);
  });

  it('repeated edits never leave a stale result standing', () => {
    const versions = ['v1', 'v2', 'v3', 'v4'];
    const predicates = [P.FALSE, P.TRUE, P.FALSE, P.TRUE];
    const expected = ['PRESENTABLE', 'POLICY_CONSTITUTED', 'PRESENTABLE', 'POLICY_CONSTITUTED'];

    versions.forEach((v, i) => {
      const c = classifyContent(post(v), [evaluate('ts.fraud.scam', { predicate: predicates[i] })], T1);
      expect(c.states[0].state, v).toBe(expected[i]);
      // Every earlier classification is stale against the current version.
      for (const older of versions.slice(0, i)) {
        expect(isStale(classifyContent(post(older), [evaluate('ts.fraud.scam')], T1), v), older).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// B. Policy combinations
// ---------------------------------------------------------------------------

describe('B. policy combinations', () => {
  it('one policy', () => {
    const c = classifyContent(post('v1'), [evaluate('ts.fraud.scam')], T1);
    expect(c.states).toHaveLength(1);
    expect(c.combined).toBeNull();
  });

  it('several policies keep every match, in order, with no winner chosen', () => {
    const decisions = [
      evaluate('ts.fraud.scam'),
      evaluate('ts.deception.harmful'),
      evaluate('ts.platform.abuse-manipulation'),
    ];
    const c = classifyContent(post('v1'), decisions, T1);
    expect(c.states).toHaveLength(3);
    expect(c.combined).toBeNull();
    expect(c.states.map((s) => s.policy)).toEqual(decisions.map((d) => d.policy));
  });

  it('policy + RESTRICTED: neither is promoted over the other', () => {
    const c = classifyContent(
      post('v1'),
      [evaluate('ts.violence.incitement-threats'), evaluate('ts.graphic.presentation')],
      T1,
    );
    expect(c.states.map((s) => s.state)).toEqual([
      'POLICY_CONSTITUTED',
      'PRESENTATION_CONDITIONS',
    ]);
    expect(c.combined).toBeNull();
  });

  it('policy + uncertainty: the uncertain one stays uncertain', () => {
    const c = classifyContent(
      post('v1'),
      [evaluate('ts.fraud.scam'), evaluate('ts.harassment.targeted', { predicate: P.UNKNOWN })],
      T1,
    );
    expect(c.states.map((s) => s.state)).toEqual(['POLICY_CONSTITUTED', 'UNDETERMINED_EVIDENCE']);
  });

  it('policy + Legal BLOCKED: the Legal state stays separate and keeps its blocker', () => {
    const c = classifyContent(post('v1'), [evaluate('ts.fraud.scam'), evaluate(LEGAL_POLICY)], T1);
    expect(c.states[0].state).toBe('POLICY_CONSTITUTED');
    expect(c.states[0].blockedBy).toBeUndefined();
    expect(c.states[1].state).toBe('UNDECIDABLE_LEGAL_BLOCKED');
    expect(c.states[1].blockedBy).toBe('G02-D-07b');
  });
});

// ---------------------------------------------------------------------------
// C. Vietnamese content through the whole flow
// ---------------------------------------------------------------------------

describe('C. Vietnamese content, end to end', () => {
  const pick = (id: string) => {
    const s = UAT_MATRIX_VN.find((x) => x.id === id);
    if (!s) throw new Error(`scenario ${id} missing`);
    return s;
  };

  const ORDINARY = [
    'VN-FOOD-1', // tiết canh
    'VN-FOOD-2', // mổ lợn
    'VN-VET-1', // thú y
    'VN-IDIOM-1', // "huỷ diệt tụi nó"
    'VN-IDIOM-2', // "đập chết cái app"
    'VN-MIX-1', // "kill cái deadline"
    'VN-DIALECT-2', // tiếng lóng miền Nam
    'VN-BIZ-1', // review 1 sao
    'VN-BIZ-2', // tố quán
    'VN-SOCIAL-1', // repost tin tức
    'VN-SOCIAL-2', // trích lời đe doạ để đưa tin
    'VN-MED-1', // giải phẫu y khoa
    'VN-MED-2', // phẫu thuật
    'VN-EDU-1', // giáo dục giới tính
    'VN-KID-1', // ảnh gia đình
    'VN-PRIV-1', // SĐT quán
  ];

  it.each(ORDINARY)('%s renders unchanged and is never constituted', (id) => {
    const c = classifyScenario(pick(id), post('v1'));
    expect(c.states[0].state).not.toBe('POLICY_CONSTITUTED');
    expect(feedTreatment(c.states[0].state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
  });

  const UNCERTAIN = ['VN-IDIOM-4', 'VN-NODAU-1', 'VN-ASR-1', 'VN-ASR-2', 'VN-ASR-3', 'VN-CTX-1', 'VN-CTX-2'];

  it.each(UNCERTAIN)('%s stays uncertain and never escalates', (id) => {
    const c = classifyScenario(pick(id), post('v1'));
    expect(['UNDETERMINED_EVIDENCE', 'UNDETERMINED_CONTEXT']).toContain(c.states[0].state);
  });

  it('an uncertain post that is later edited with more context reclassifies cleanly', () => {
    const vague = classifyScenario(pick('VN-CTX-2'), post('v1'), T1);
    expect(vague.states[0].state).toBe('UNDETERMINED_EVIDENCE');

    // The creator adds the surrounding thread; the record can now be read.
    const clarified = classifyContent(
      post('v2'),
      [evaluate('ts.harassment.targeted', { predicate: P.FALSE, asOf: T2 })],
      T2,
    );
    expect(isStale(vague, 'v2')).toBe(true);
    expect(clarified.states[0].state).toBe('PRESENTABLE');
  });
});

// ---------------------------------------------------------------------------
// D. Safety — the whole point
// ---------------------------------------------------------------------------

describe('D. flow safety', () => {
  it('every state renders unchanged — the feed contract is uniform', () => {
    expect(feedTreatmentIsUniform()).toBe(true);
    for (const s of EXPLORE_PRESENTATION_STATES) {
      expect(FEED_TREATMENT[s as ExplorePresentationState], s).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
    }
    expect(new Set(Object.values(FEED_TREATMENT)).size).toBe(1);
  });

  it('no state and no classification carries an action, a rank or a severity', () => {
    for (const id of POLICY_REGISTRY.map((r) => r.identity)) {
      const c = classifyContent(post('v1'), [evaluate(id)], T1);
      expect(Object.keys(c)).toEqual(['content', 'evaluatedAt', 'states', 'combined']);
      for (const s of c.states) {
        for (const forbidden of ['action', 'severity', 'rank', 'score', 'hide', 'visible']) {
          expect(Object.keys(s), `${id}.${forbidden}`).not.toContain(forbidden);
        }
      }
    }
  });

  it('an engine fault flows through as a non-finding', () => {
    const c = classifyContent(post('v1'), [evaluate('ts.fraud.scam', { predicate: undefined })], T1);
    expect(c.states[0].state).not.toBe('POLICY_CONSTITUTED');
    expect(feedTreatment(c.states[0].state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
  });

  it('a stale classification cannot be mistaken for a current safe one', () => {
    const c = classifyContent(post('v1'), [evaluate('ts.fraud.scam', { predicate: P.FALSE })], T1);
    expect(c.states[0].state).toBe('PRESENTABLE');
    // After an edit the "safe" answer is withheld rather than carried forward.
    expect(currentStates(c, 'v2').states).toBeNull();
  });

  it('creator and viewer receive an identical classification', () => {
    const asCreator = classifyContent(post('v1'), [evaluate('ts.graphic.presentation')], T1);
    const asViewer = classifyContent(post('v1'), [evaluate('ts.graphic.presentation')], T1);
    expect(asCreator).toEqual(asViewer);
  });
});
