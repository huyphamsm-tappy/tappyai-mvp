/**
 * FALSE-POSITIVE CLASSIFICATION AUDIT.
 *
 * The claim under test, in one sentence:
 *
 *   "Situations the corpus explicitly says are NOT violations do not become
 *    violations just because a policy exists."
 *
 * Two independent layers:
 *
 *   1. TRACEABILITY — every scenario's `evidence` must occur VERBATIM in
 *      `docs/policy/02_POLICY_TAXONOMY.md`. A scenario that cannot be traced to
 *      the corpus fails here, which is what stops the matrix from drifting into
 *      opinion.
 *
 *   2. CONTRACT — every scenario is run through the real engine, and the outcome
 *      must equal what the matrix says the corpus requires. The predicate is the
 *      matrix's three-valued stand-in, not a detection rule.
 *
 * Boundaries A–H from the audit brief are asserted individually at the end.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  UAT_EXCLUDED_POLICY,
  UAT_MATRIX,
  determinationOf,
  type HarnessTruth,
  type UatScenario,
} from '../__uat__/matrix';
import { evaluatePolicy, type EvaluationInput } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import { POLICY_REGISTRY } from '../source/registry';
import { OUTCOME_CLASSES, TERMINAL_NON_VIOLATING_OUTCOMES, type OutcomeClass } from '../types';
import { getProtectedTargetSet } from '../legal/protectedTargets';

const CORPUS = readFileSync(
  path.resolve(__dirname, '../../../../docs/policy/02_POLICY_TAXONOMY.md'),
  'utf8',
);

const ASOF = '2026-08-16T00:00:00Z';

/** Three-valued stand-in. TRUE/FALSE are decidable; UNKNOWN reads an absent field. */
function predicateFor(t: HarnessTruth): Expression {
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

const ratifiable = POLICY_REGISTRY.filter((r) => r.identity !== UAT_EXCLUDED_POLICY);
const falsePositives = UAT_MATRIX.filter((s) => s.kind === 'FALSE_POSITIVE');
const testable = UAT_MATRIX.filter((s) => s.expected !== 'NOT_ESTABLISHED');

// ---------------------------------------------------------------------------
// 1. Matrix integrity and traceability
// ---------------------------------------------------------------------------

describe('test isolation', () => {
  /**
   * `forensic/` holds Owner-authorised immutable snapshots that copy this file
   * verbatim. If discovery ever picks one up, the past and the present run
   * together and the totals stop meaning anything (336 reported where the
   * module has 169). Asserting on our own location makes that loud instead of
   * silent — a snapshot copy fails here rather than quietly inflating a count.
   */
  it('runs from the live module, never from a forensic snapshot', () => {
    expect(__dirname.replace(/\\/g, '/')).not.toMatch(/\/forensic\//);
  });
});

describe('UAT matrix integrity', () => {
  it('covers all 17 ratifiable policies, and excludes the Legal-blocked one', () => {
    const covered = new Set(UAT_MATRIX.map((s) => s.policy));
    expect(ratifiable).toHaveLength(17);
    for (const r of ratifiable) expect(covered.has(r.identity), r.identity).toBe(true);
    expect(covered.has(UAT_EXCLUDED_POLICY)).toBe(false);
  });

  it('gives every policy at least one positive, one false-positive and one ambiguous scenario', () => {
    for (const r of ratifiable) {
      const kinds = new Set(UAT_MATRIX.filter((s) => s.policy === r.identity).map((s) => s.kind));
      expect([...kinds].sort(), r.identity).toEqual(['AMBIGUOUS', 'FALSE_POSITIVE', 'POSITIVE']);
    }
  });

  it('has unique ids and names only outcome classes the corpus establishes', () => {
    const ids = UAT_MATRIX.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of UAT_MATRIX) {
      if (s.expected === 'NOT_ESTABLISHED') continue;
      expect(OUTCOME_CLASSES as readonly string[], s.id).toContain(s.expected);
    }
  });

  it('every scenario is traceable: its evidence occurs verbatim in the corpus', () => {
    const untraceable = UAT_MATRIX.filter((s) => !CORPUS.includes(s.evidence)).map(
      (s) => `${s.id}: "${s.evidence.slice(0, 60)}"`,
    );
    expect(untraceable).toEqual([]);
  });

  it('never asserts an enforcement outcome', () => {
    for (const s of UAT_MATRIX) expect(s.enforcement, s.id).toBe('NONE / NOT TESTED');
  });

  it('says of every scenario whether the corpus settles it or the Owner must', () => {
    const needsOwner = UAT_MATRIX.filter((s) => determinationOf(s) === 'PRODUCT_DECISION_REQUIRED');
    // Re-pinned 2026-08-16: the Owner decided the two RESTRICTED scenarios
    // (option b), so they left this list. One remains — DISPUTED — and the
    // Owner confirmed it stays a case-level judgement rather than an engine
    // outcome, so it is a permanent boundary, not an unanswered question.
    expect(needsOwner.map((s) => s.id).sort()).toEqual(['UAT-DH-3']);
    for (const s of UAT_MATRIX) {
      if (determinationOf(s) === 'CORPUS_DETERMINED') expect(s.expected, s.id).not.toBe('NOT_ESTABLISHED');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The audit itself
// ---------------------------------------------------------------------------

describe('false-positive classification audit', () => {
  it.each(testable.map((s) => [s.id, s] as const))('%s resolves as the corpus requires', (_id, s) => {
    expect(run(s).outcome).toBe(s.expected as OutcomeClass);
  });

  it('NO false-positive scenario produces a violation', () => {
    const wrong = falsePositives.filter((s) => run(s).outcome === 'VIOLATION').map((s) => s.id);
    expect(wrong).toEqual([]);
  });

  it('no scenario of any kind produces a violation unless the matrix says so', () => {
    const unexpected = testable
      .filter((s) => run(s).outcome === 'VIOLATION' && s.expected !== 'VIOLATION')
      .map((s) => s.id);
    expect(unexpected).toEqual([]);
  });

  it('OUT-3 response-warranted travels with the classification and changes nothing', () => {
    const s = UAT_MATRIX.find((x) => x.harness.responseWarranted)!;
    const d = run(s);
    expect(d.responseWarranted).toBe(true);
    expect(d.outcome).toBe('APPLICABLE_NO_VIOLATION');
  });
});

// ---------------------------------------------------------------------------
// 3. Boundaries A–H, asserted individually
// ---------------------------------------------------------------------------

describe('boundaries', () => {
  it('A. does_not_govern situations resolve to NOT_APPLICABLE', () => {
    const dng = falsePositives.filter((s) => s.expected === 'NOT_APPLICABLE');
    expect(dng.length).toBeGreaterThanOrEqual(14);
    for (const s of dng) expect(run(s).outcome, s.id).toBe('NOT_APPLICABLE');
  });

  it('B. defeat TRUE resolves to APPLICABLE_NO_VIOLATION', () => {
    const defeated = UAT_MATRIX.filter((s) => s.harness.defeat === 'TRUE');
    expect(defeated.length).toBeGreaterThan(0);
    for (const s of defeated) expect(run(s).outcome, s.id).toBe('APPLICABLE_NO_VIOLATION');
  });

  it('C. defeat UNKNOWN resolves to INSUFFICIENT_EVIDENCE and never escalates', () => {
    const record = POLICY_REGISTRY.find((r) => r.identity === 'ts.fraud.scam')!;
    const d = evaluatePolicy(record, {
      subject: {}, asOf: ASOF,
      predicate: predicateFor('TRUE'),
      defeatingContext: predicateFor('UNKNOWN'),
    });
    expect(d.outcome).toBe('INSUFFICIENT_EVIDENCE');
    expect(d.outcome).not.toBe('VIOLATION');
  });

  it('D. contextUnreadable resolves to INDETERMINATE_CONTEXT', () => {
    const unreadable = UAT_MATRIX.filter((s) => s.harness.contextUnreadable);
    expect(unreadable.length).toBeGreaterThan(0);
    for (const s of unreadable) expect(run(s).outcome, s.id).toBe('INDETERMINATE_CONTEXT');
  });

  it('E. a fault never produces a violation', () => {
    const record = POLICY_REGISTRY.find((r) => r.identity === 'ts.fraud.scam')!;
    const noPredicate = evaluatePolicy(record, { subject: {}, asOf: ASOF });
    expect(noPredicate.outcome).not.toBe('VIOLATION');
    expect(noPredicate.faults.length).toBeGreaterThan(0);
    expect(TERMINAL_NON_VIOLATING_OUTCOMES as readonly string[]).toContain(noPredicate.outcome);
  });

  it('F. Legal BLOCKED is neither allow nor deny', () => {
    expect(getProtectedTargetSet().state).toBe('BLOCKED');
    const blocked = POLICY_REGISTRY.find((r) => r.identity === UAT_EXCLUDED_POLICY)!;
    for (const t of ['TRUE', 'FALSE'] as const) {
      const d = evaluatePolicy(blocked, { subject: {}, asOf: ASOF, predicate: predicateFor(t) });
      expect(d.outcome).not.toBe('VIOLATION');
      expect(d.outcome).not.toBe('NOT_APPLICABLE');
      expect(d.faults.some((f) => f.blockedBy === 'G02-D-07b')).toBe(true);
    }
  });

  it('G. no scenario turns an envelope into a case severity or an action', () => {
    for (const s of testable) {
      const d = run(s) as unknown as Record<string, unknown>;
      expect(Object.keys(d), s.id).not.toContain('severity');
      expect(Object.keys(d), s.id).not.toContain('action');
      expect(s.severityTreatment, s.id).not.toMatch(/HIDE|WARN|SUSPEND|BAN|DELETE|BLOCK|TAKEDOWN/);
    }
  });

  it('H. disposition never implies an action anywhere in the matrix', () => {
    for (const s of UAT_MATRIX) {
      expect(`${s.why} ${s.situation}`, s.id).not.toMatch(
        /\b(?:hide|suspend|ban|delete|take ?down|block)\b/i,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Gaps are recorded, not hidden
// ---------------------------------------------------------------------------

describe('recorded gaps', () => {
  it('every NOT_ESTABLISHED scenario states why the corpus is silent', () => {
    const gaps = UAT_MATRIX.filter((s) => s.expected === 'NOT_ESTABLISHED');
    expect(gaps.length).toBeGreaterThan(0);
    for (const s of gaps) expect(s.why, s.id).toMatch(/GAP/);
  });

  /**
   * The RESTRICTED decision, pinned.
   *
   * Replaces the earlier divergence pin (corpus said "not a violation", the
   * engine said VIOLATION). The Owner decided option (b) on 2026-08-16, so this
   * now asserts the AUTHORISED behaviour instead of the contradiction — and it
   * is stricter, because it also pins the metadata attribute and its scope.
   */
  it('a constituted RESTRICTED policy is APPLICABLE_NO_VIOLATION with presentation conditions', () => {
    expect(CORPUS).toContain('`RESTRICTED`, not a violation');
    for (const policy of ['ts.graphic.presentation', 'ts.sexual.adult-content']) {
      const record = POLICY_REGISTRY.find((r) => r.identity === policy)!;
      expect(record.disposition.value).toBe('RESTRICTED');

      const s = UAT_MATRIX.find((x) => x.policy === policy && x.kind === 'POSITIVE')!;
      expect(s.expected, policy).toBe('APPLICABLE_NO_VIOLATION');

      const d = run(s);
      expect(d.outcome, policy).toBe('APPLICABLE_NO_VIOLATION');
      expect(d.presentationConditionsApply, policy).toBe(true);
      // Metadata, not an action, and not a severity.
      expect(Object.keys(d)).not.toContain('action');
      expect(Object.keys(d)).not.toContain('severity');
      // Not a terminal non-violating class: it is a recorded outcome (OUT-2).
      expect(d.terminalNonViolating, policy).toBe(false);
    }
  });

  it('presentation conditions attach ONLY where a RESTRICTED policy was constituted', () => {
    // Not constituted → nothing entered the policy → no conditions.
    const notConstituted = UAT_MATRIX.find(
      (x) => x.policy === 'ts.sexual.adult-content' && x.kind === 'FALSE_POSITIVE',
    )!;
    expect(run(notConstituted).presentationConditionsApply).toBe(false);

    // A PROHIBITED policy never carries the attribute, however it resolves.
    for (const s of UAT_MATRIX.filter((x) => x.policy === 'ts.fraud.scam')) {
      expect(run(s).presentationConditionsApply, s.id).toBe(false);
    }
  });

  it('records which §4 classes the engine can and cannot derive', () => {
    const derivable = new Set(testable.map((s) => run(s).outcome));
    // Reachable today.
    for (const c of [
      'VIOLATION',
      'NOT_APPLICABLE',
      'APPLICABLE_NO_VIOLATION',
      'INSUFFICIENT_EVIDENCE',
      'INDETERMINATE_CONTEXT',
    ] as const) {
      expect(derivable, c).toContain(c);
    }
    // Not derivable from a predicate, and the corpus does not require it to be:
    // DISPUTED is a case-level factual determination (§9.6, DEC-3), and
    // OUT_OF_SCOPE has a one-line §4 definition with no determination rule.
    expect(derivable).not.toContain('DISPUTED');
    expect(derivable).not.toContain('OUT_OF_SCOPE');
  });

  /**
   * Re-pinned 2026-08-16 after the Owner decided option (b).
   *
   * The previous version asserted that the two RESTRICTED policies WERE the
   * open gap. They no longer are. This asserts the closed state and is
   * stricter: no POSITIVE scenario may be unresolved at all any more, and the
   * one remaining gap is named exactly.
   */
  it('no constituted scenario is unresolved; the sole gap is the case-level DISPUTED boundary', () => {
    expect(UAT_MATRIX.filter((s) => s.expected === 'NOT_ESTABLISHED' && s.kind === 'POSITIVE')).toEqual([]);

    const gaps = UAT_MATRIX.filter((s) => s.expected === 'NOT_ESTABLISHED');
    expect(gaps.map((s) => s.id)).toEqual(['UAT-DH-3']);
    expect(gaps[0].kind).toBe('AMBIGUOUS');

    // Both RESTRICTED policies now resolve, and only they carry the attribute.
    const restricted = POLICY_REGISTRY.filter((r) => r.disposition.value === 'RESTRICTED');
    expect(restricted).toHaveLength(2);
    for (const r of restricted) {
      const s = UAT_MATRIX.find((x) => x.policy === r.identity && x.kind === 'POSITIVE')!;
      expect(s.expected, r.identity).toBe('APPLICABLE_NO_VIOLATION');
    }
  });
});
