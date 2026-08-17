/**
 * EXPLORE OBSERVATION — safety of the wiring seam, and the equivalence guard.
 *
 * The central claim under test: **integrating observation changes nothing a
 * user receives.** Everything else here supports that claim or bounds it.
 *
 * It also pins the finding that decided how far the wiring went: with no
 * detector, observation yields nothing, and this seam says so instead of
 * manufacturing a page of "we could not tell".
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  OBSERVATION_CLIENT_FIELDS,
  observeExploreContent,
  responseIsFreeOfObservation,
  type ObservationInput,
  type PolicyProbe,
} from '../explore/observation';
import { contentVersionFrom } from '../explore/contentClassification';
import { evaluatePolicy, type PolicyDecision } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import { POLICY_REGISTRY } from '../source/registry';

const T1 = '2026-08-16T10:00:00Z';
const TRUE_EXPR: Expression = { op: 'eq', left: { value: 1 }, right: { value: 1 } };
const UNKNOWN_EXPR: Expression = { op: 'eq', left: { ref: 'nope' }, right: { value: 1 } };

const recordOf = (id: string) => {
  const r = POLICY_REGISTRY.find((x) => x.identity === id);
  if (!r) throw new Error(`registry missing ${id}`);
  return r;
};

/** The caller-supplied evaluator, exactly as a real integration would pass one. */
const evaluate = (probe: PolicyProbe, asOf: string): PolicyDecision =>
  evaluatePolicy(recordOf(probe.policy), {
    subject: {},
    asOf,
    predicate: probe.predicate,
    ...(probe.defeatingContext ? { defeatingContext: probe.defeatingContext } : {}),
    ...(probe.contextUnreadable ? { contextUnreadable: true } : {}),
  });

const content = { contentId: 'review-abc', contentVersion: 'v1' };
const observe = (probes: readonly PolicyProbe[], over: Partial<ObservationInput> = {}) =>
  observeExploreContent({ content, probes, evaluatedAt: T1, ...over }, evaluate);

// ---------------------------------------------------------------------------
// The finding: no detector means no observation
// ---------------------------------------------------------------------------

describe('no detector, no observation', () => {
  it('says "no detector" instead of inventing a page of uncertainty', () => {
    const result = observe([]);
    expect(result).toEqual({ observed: false, reason: 'NO_DETECTOR' });
  });

  it('the corpus really does contain no predicate — this is measured, not assumed', () => {
    const corpus = readFileSync(
      path.resolve(__dirname, '../../../../docs/policy/02_POLICY_TAXONOMY.md'),
      'utf8',
    );
    expect(corpus).not.toMatch(/\bpredicate\b/i);
  });

  it('evaluating with no predicate would indeed be uninformative — hence the refusal', () => {
    // What wiring today would produce for every row of every policy.
    for (const r of POLICY_REGISTRY.slice(0, 5)) {
      const d = evaluatePolicy(r, { subject: {}, asOf: T1 });
      expect(d.outcome).toBe('INSUFFICIENT_EVIDENCE');
      expect(d.faults.some((f) => f.detail.includes('no predicate'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Observation records: shape, privacy, correctness
// ---------------------------------------------------------------------------

describe('observation records', () => {
  it('carry only identifiers and states — there is nowhere to put PII', () => {
    const result = observe([{ policy: 'ts.fraud.scam', predicate: TRUE_EXPR }]);
    expect(result.observed).toBe(true);
    if (!result.observed) return;

    expect(Object.keys(result.records[0]).sort()).toEqual([
      'contentId',
      'contentVersion',
      'evaluatedAt',
      'policy',
      'presentationConditions',
      'state',
    ]);
    for (const forbidden of ['body', 'caption', 'media_url', 'user_id', 'author', 'text', 'raw']) {
      expect(Object.keys(result.records[0])).not.toContain(forbidden);
    }
  });

  it('record the policy version, so a line stays explainable later', () => {
    const result = observe([{ policy: 'ts.fraud.scam', predicate: TRUE_EXPR }]);
    if (!result.observed) throw new Error('expected observation');
    expect(result.records[0].policy).toMatch(/^ts\.[a-z.-]+@\d+$/);
    expect(result.records[0].contentVersion).toBe('v1');
    expect(result.records[0].evaluatedAt).toBe(T1);
  });

  it('keep every policy when several are probed — no precedence, no winner', () => {
    const result = observe([
      { policy: 'ts.fraud.scam', predicate: TRUE_EXPR },
      { policy: 'ts.graphic.presentation', predicate: TRUE_EXPR },
      { policy: 'ts.harassment.targeted', predicate: UNKNOWN_EXPR },
    ]);
    if (!result.observed) throw new Error('expected observation');
    expect(result.records.map((r) => r.state)).toEqual([
      'POLICY_CONSTITUTED',
      'PRESENTATION_CONDITIONS',
      'UNDETERMINED_EVIDENCE',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Legal, RESTRICTED, version — the boundaries that must not move
// ---------------------------------------------------------------------------

describe('boundaries survive the wiring seam', () => {
  it('Legal blocked stays its own state and keeps its blocker', () => {
    const result = observe([{ policy: 'ts.hate.protected-target-abuse', predicate: TRUE_EXPR }]);
    if (!result.observed) throw new Error('expected observation');
    expect(result.records[0].state).toBe('UNDECIDABLE_LEGAL_BLOCKED');
    expect(result.records[0].blockedBy).toBe('G02-D-07b');
    expect(result.records[0].state).not.toBe('PRESENTABLE');
    expect(result.records[0].state).not.toBe('POLICY_CONSTITUTED');
  });

  it('RESTRICTED stays PRESENTATION_CONDITIONS and carries no display instruction', () => {
    for (const id of ['ts.graphic.presentation', 'ts.sexual.adult-content']) {
      const result = observe([{ policy: id, predicate: TRUE_EXPR }]);
      if (!result.observed) throw new Error('expected observation');
      expect(result.records[0].state, id).toBe('PRESENTATION_CONDITIONS');
      expect(result.records[0].presentationConditions, id).toBe(true);
      for (const f of ['hide', 'blur', 'gate', 'interstitial', 'action']) {
        expect(Object.keys(result.records[0]), `${id}.${f}`).not.toContain(f);
      }
    }
  });

  it('a version change makes the old observation belong to the old version only', () => {
    const v1 = observe([{ policy: 'ts.fraud.scam', predicate: TRUE_EXPR }]);
    const v2 = observe([{ policy: 'ts.fraud.scam', predicate: TRUE_EXPR }], {
      content: { contentId: 'review-abc', contentVersion: 'v2' },
    });
    if (!v1.observed || !v2.observed) throw new Error('expected observations');
    expect(v1.records[0].contentVersion).toBe('v1');
    expect(v2.records[0].contentVersion).toBe('v2');
    expect(v1.records[0].contentVersion).not.toBe(v2.records[0].contentVersion);
  });

  it('a real post fingerprint changes with the post and not with its like count', () => {
    const post = { body: 'Quán ngon', hashtags: ['anuong'] };
    expect(contentVersionFrom(post)).toBe(contentVersionFrom({ ...post }));
    expect(contentVersionFrom({ ...post, body: 'Quán dở' })).not.toBe(contentVersionFrom(post));
  });
});

// ---------------------------------------------------------------------------
// USER-VISIBLE EQUIVALENCE — the central guarantee
// ---------------------------------------------------------------------------

describe('user-visible equivalence', () => {
  const SRC = path.resolve(__dirname, '../../..');
  const feedSource = readFileSync(path.join(SRC, 'app/api/reviews/feed/route.ts'), 'utf8');

  it('observation contributes no client field, by construction', () => {
    expect(OBSERVATION_CLIENT_FIELDS).toEqual([]);
  });

  it('a feed row is free of observation fields', () => {
    const row = {
      id: 'r1',
      user_id: 'u1',
      body: 'Quán ngon',
      photos: [],
      like_count: 3,
      liked_by_me: false,
      created_at: T1,
    };
    expect(responseIsFreeOfObservation(row)).toBe(true);
    expect(responseIsFreeOfObservation({ ...row, policyState: 'PRESENTABLE' })).toBe(false);
  });

  /**
   * ⚠ RE-PINNED, Owner decision 2026-08-17. P1 is now wired into this route, so
   * "mentions no policy at all" is no longer the truth. The replacement is
   * narrower, not looser: the route may reach policy through exactly ONE module,
   * and still may not name a classification state or a treatment.
   */
  it('the live feed route reaches policy through exactly one observation entry point', () => {
    const policyImports = [...feedSource.matchAll(/from\s*['"]([^'"]*lib\/policy[^'"]*)['"]/g)].map(
      (m) => m[1],
    );
    expect(policyImports).toEqual(['@/lib/policy/explore/reviewFeedObservation']);
    expect(feedSource).not.toMatch(/observeExploreContent|classifyExploreContent|feedTreatment/);
    expect(feedSource).not.toMatch(/PRESENTATION_CONDITIONS|POLICY_CONSTITUTED|UNDETERMINED_/);
  });

  it('the response contract is exactly what it was: the select list is untouched', () => {
    // The fields the client receives are fixed by EXPLORE_SELECT plus enrichment.
    // If observation had leaked in, one of these names would have to appear.
    const select = feedSource.match(/const EXPLORE_SELECT = `([\s\S]*?)`/)?.[1] ?? '';
    expect(select).toBeTruthy();
    for (const leaked of ['policy', 'state', 'classification', 'presentation']) {
      expect(select.toLowerCase(), leaked).not.toContain(leaked);
    }
  });

  it('ordering, visibility and recommendation remain driven by product signals only', () => {
    expect(feedSource).toMatch(/sort/);
    expect(feedSource).toMatch(/is_hidden/); // the author's own hide, pre-existing
    // ...and none of it consults policy.
    const policyDriven = /(?:sort|order|rank|is_hidden)[^\n]*(?:policy|POLICY_|PRESENTATION_)/i;
    expect(feedSource).not.toMatch(policyDriven);
  });
});
