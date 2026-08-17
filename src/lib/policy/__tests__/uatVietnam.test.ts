/**
 * VIETNAM REALITY UAT — independent false-positive audit.
 *
 * Same two layers as the baseline audit: every scenario must quote the corpus
 * verbatim, and every scenario must resolve through the real engine to the
 * outcome the corpus requires.
 *
 * The dangerous-confusion list is asserted by name at the end, because those
 * are the failures that would make TappyAI look like it does not understand
 * Vietnam: food preparation read as violence, animal husbandry read as cruelty,
 * a one-star review read as harassment, an idiom read as a threat, a mangled
 * transcript read as anything at all.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { UAT_MATRIX, determinationOf, type UatScenario } from '../__uat__/matrix';
import { UAT_MATRIX_VN } from '../__uat__/matrixVn';
import { evaluatePolicy, type EvaluationInput } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import { POLICY_REGISTRY } from '../source/registry';
import { OUTCOME_CLASSES, type OutcomeClass } from '../types';

const CORPUS = readFileSync(
  path.resolve(__dirname, '../../../../docs/policy/02_POLICY_TAXONOMY.md'),
  'utf8',
);
const ASOF = '2026-08-16T00:00:00Z';

function predicateFor(t: 'TRUE' | 'FALSE' | 'UNKNOWN'): Expression {
  if (t === 'TRUE') return { op: 'eq', left: { value: 1 }, right: { value: 1 } };
  if (t === 'FALSE') return { op: 'eq', left: { value: 1 }, right: { value: 2 } };
  return { op: 'eq', left: { ref: 'unestablished' }, right: { value: 1 } };
}

function run(s: UatScenario) {
  const record = POLICY_REGISTRY.find((r) => r.identity === s.policy);
  if (!record) throw new Error(`registry missing ${s.policy}`);
  const input: EvaluationInput = {
    subject: {},
    asOf: ASOF,
    predicate: predicateFor(s.harness.constitutive),
    ...(s.harness.defeat ? { defeatingContext: predicateFor(s.harness.defeat) } : {}),
    ...(s.harness.contextUnreadable ? { contextUnreadable: true } : {}),
    ...(s.harness.responseWarranted ? { responseWarranted: true } : {}),
  };
  return evaluatePolicy(record, input);
}

const ALL = [...UAT_MATRIX, ...UAT_MATRIX_VN];
const testable = UAT_MATRIX_VN.filter((s) => s.expected !== 'NOT_ESTABLISHED');

describe('Vietnam UAT integrity', () => {
  it('adds real coverage without colliding with the baseline', () => {
    expect(UAT_MATRIX_VN.length).toBeGreaterThanOrEqual(45);
    const ids = ALL.map((s) => s.id);
    expect(new Set(ids).size, 'duplicate scenario id').toBe(ids.length);
  });

  it('every Vietnam scenario is traceable to the corpus, verbatim', () => {
    const untraceable = UAT_MATRIX_VN.filter((s) => !CORPUS.includes(s.evidence)).map(
      (s) => `${s.id}: "${s.evidence.slice(0, 60)}"`,
    );
    expect(untraceable).toEqual([]);
  });

  it('uses only established outcome classes, and asserts no enforcement', () => {
    for (const s of UAT_MATRIX_VN) {
      if (s.expected !== 'NOT_ESTABLISHED') {
        expect(OUTCOME_CLASSES as readonly string[], s.id).toContain(s.expected);
      }
      expect(s.enforcement, s.id).toBe('NONE / NOT TESTED');
    }
  });

  it('leaves nothing needing a Product decision', () => {
    const needsOwner = UAT_MATRIX_VN.filter((s) => determinationOf(s) === 'PRODUCT_DECISION_REQUIRED');
    expect(needsOwner.map((s) => s.id)).toEqual([]);
  });

  it('never touches the Legal-blocked policy', () => {
    expect(UAT_MATRIX_VN.some((s) => s.policy === 'ts.hate.protected-target-abuse')).toBe(false);
  });
});

describe('Vietnam false-positive audit', () => {
  it.each(testable.map((s) => [s.id, s] as const))('%s resolves as the corpus requires', (_id, s) => {
    expect(run(s).outcome).toBe(s.expected as OutcomeClass);
  });

  it('NOT ONE ordinary Vietnamese situation is classified as a violation', () => {
    const wrong = UAT_MATRIX_VN.filter(
      (s) => s.kind !== 'POSITIVE' && run(s).outcome === 'VIOLATION',
    ).map((s) => s.id);
    expect(wrong).toEqual([]);
  });

  it('genuine harm is still caught — the audit is not just permissive', () => {
    const positives = UAT_MATRIX_VN.filter((s) => s.kind === 'POSITIVE');
    expect(positives.length).toBeGreaterThanOrEqual(4);
    for (const s of positives) expect(run(s).outcome, s.id).toBe('VIOLATION');
  });
});

describe('the confusions that would embarrass TappyAI in Vietnam', () => {
  const notViolation = (id: string) => {
    const s = UAT_MATRIX_VN.find((x) => x.id === id);
    if (!s) throw new Error(`scenario ${id} missing`);
    expect(run(s).outcome, id).not.toBe('VIOLATION');
  };

  it('food preparation is never violence', () => ['VN-FOOD-1', 'VN-CULT-1'].forEach(notViolation));
  it('animal husbandry and veterinary work are never cruelty', () =>
    ['VN-FOOD-2', 'VN-FOOD-3', 'VN-VET-1'].forEach(notViolation));
  it('medical and educational content is never sexual or child-safety', () =>
    ['VN-MED-1', 'VN-MED-2', 'VN-EDU-1', 'VN-KID-1', 'VN-KID-2'].forEach(notViolation));
  it('journalism is never the thing it reports', () =>
    ['VN-SOCIAL-2', 'VN-EDU-2', 'VN-NEWS-1'].forEach(notViolation));
  it('criticism, reviews and complaints are never harassment', () =>
    ['VN-BIZ-1', 'VN-BIZ-2', 'VN-POL-1', 'VN-POL-4'].forEach(notViolation));
  it('idiom, metaphor and sarcasm are never literal violence', () =>
    ['VN-IDIOM-1', 'VN-IDIOM-2', 'VN-IDIOM-3', 'VN-IDIOM-5', 'VN-MIX-1'].forEach(notViolation));
  it('public business information is never a privacy violation', () =>
    ['VN-PRIV-1', 'VN-PRIV-2'].forEach(notViolation));
  it('an ASR error or a cut transcript never becomes a finding', () =>
    ['VN-ASR-1', 'VN-ASR-2', 'VN-ASR-3'].forEach(notViolation));
  it('missing conversation context never becomes a finding', () =>
    ['VN-CTX-1', 'VN-CTX-2', 'VN-CTX-3'].forEach(notViolation));
  it('reposted and quoted third-party content is not the user\'s own intent', () =>
    ['VN-SOCIAL-1', 'VN-SOCIAL-2', 'VN-SOCIAL-3'].forEach(notViolation));
  it('political and scientific disagreement is never a deception finding', () =>
    ['VN-POL-2', 'VN-POL-3'].forEach(notViolation));

  it('uncertainty always lands on a non-finding, never on a violation', () => {
    const uncertain = UAT_MATRIX_VN.filter(
      (s) => s.harness.constitutive === 'UNKNOWN' || s.harness.contextUnreadable,
    );
    expect(uncertain.length).toBeGreaterThanOrEqual(12);
    for (const s of uncertain) {
      const o = run(s).outcome;
      expect(['INSUFFICIENT_EVIDENCE', 'INDETERMINATE_CONTEXT'], s.id).toContain(o);
    }
  });
});
