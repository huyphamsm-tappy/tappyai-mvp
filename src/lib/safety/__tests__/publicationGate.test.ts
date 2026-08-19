/**
 * The publication gate — the layer that keeps "is this policy constituted?"
 * separate from "may this be published?".
 *
 * The two things this suite exists to prove:
 *
 *   1. an undecided rule collapses in NEITHER direction — not to publish, not
 *      to a silent safety hold;
 *   2. the architecture can express both future answers about the Legal-blocked
 *      policy without either being chosen here.
 */

import { describe, expect, it } from 'vitest';

import {
  GATE_RULES,
  GATE_RULE_DECISIONS,
  PUBLICATION_DECISIONS,
  PUBLICATION_GATE_RULES,
  aggregatePublication,
  aggregateWithRules,
  isBlockingResult,
  ruleFor,
  storedStateFor,
  unresolvedPolicies,
} from '../gate/publicationGate';
import { evaluateSafety, publicationFromGate, type PolicyOutcomeLine } from '../gate/safetyResult';
import { textEvidence } from '../evidence/modalities';
import { POLICY_REGISTRY } from '@/lib/policy/source/registry';
import type { EvidenceBundle, ModalityResult } from '../evidence/types';

const T = '2026-08-17T16:00:00Z';
const HATE = 'ts.hate.protected-target-abuse';

const line = (policy: string, outcome: string, gate?: string): PolicyOutcomeLine => ({
  policy,
  outcome,
  ...(gate ? { gate } : {}),
});

/** Every policy cleared except the ones named. */
const allClearExcept = (...overrides: PolicyOutcomeLine[]): PolicyOutcomeLine[] => {
  const byPolicy = new Map(overrides.map((o) => [o.policy, o]));
  return POLICY_REGISTRY.map(
    (r) => byPolicy.get(r.identity) ?? line(r.identity, 'NOT_APPLICABLE'),
  );
};

// ---------------------------------------------------------------------------
// The rules table
// ---------------------------------------------------------------------------

describe('gate rules', () => {
  it('every registry policy has an explicit rule — no policy is unlisted', () => {
    for (const r of POLICY_REGISTRY) {
      expect(PUBLICATION_GATE_RULES[r.identity], r.identity).toBeDefined();
      expect(GATE_RULES).toContain(PUBLICATION_GATE_RULES[r.identity]);
    }
  });

  it('an UNKNOWN policy is UNRESOLVED, never an implicit allow', () => {
    expect(ruleFor('ts.something.invented')).toBe('UNRESOLVED');
  });

  /**
   * ⚠ RE-PINNED, Owner decision 2026-08-17 — OPTION B. This block previously
   * asserted the hate rule was `UNRESOLVED`. Product decided it explicitly, so
   * the assertion moved to the decided value plus the record of what the
   * decision does NOT do. Tighter, not looser: an accidental change in either
   * direction now fails.
   */
  it('the hate rule is an EXPLICIT Product decision, not an assumption', () => {
    expect(ruleFor(HATE)).toBe('DOES_NOT_BLOCK_PUBLICATION');
    expect(unresolvedPolicies()).toEqual([]);

    const decision = GATE_RULE_DECISIONS.find((d) => d.policy === HATE);
    expect(decision, 'the decision must be recorded in code, not only in history').toBeDefined();
    expect(decision!.rule).toBe('DOES_NOT_BLOCK_PUBLICATION');
    expect(decision!.decidedBy).toContain('Product Owner');
  });

  it('the decision explicitly does NOT resolve Legal', () => {
    const decision = GATE_RULE_DECISIONS.find((d) => d.policy === HATE)!;
    expect(decision.doesNotResolve).toContain('G02-D-07b');
    expect(decision.doesNotResolve).toContain('PROTECTED_TARGET_SET');
    // And nothing anywhere may describe it as a ratification.
    expect(JSON.stringify(GATE_RULE_DECISIONS).toLowerCase()).not.toContain('ratif');
  });

  /**
   * Three policies are now non-blocking, and the reason differs: the hate policy
   * because it is Legal-blocked and unanswerable (Owner, 2026-08-17), and the two
   * RESTRICTED-disposition policies because a RESTRICTED disposition establishes
   * no violation even fully constituted (Owner, 2026-08-19).
   *
   * The assertion that matters is the complement: EVERY PROHIBITED policy still
   * blocks. That is what stops this list growing quietly.
   */
  const NON_BLOCKING = ['ts.hate.protected-target-abuse', 'ts.graphic.presentation', 'ts.sexual.adult-content'];

  it('every PROHIBITED policy still blocks — only the three named ones do not', () => {
    for (const r of POLICY_REGISTRY) {
      if (NON_BLOCKING.includes(r.identity)) continue;
      expect(PUBLICATION_GATE_RULES[r.identity], r.identity).toBe('BLOCKS_PUBLICATION');
    }
    expect(Object.values(PUBLICATION_GATE_RULES).filter((r) => r === 'DOES_NOT_BLOCK_PUBLICATION'))
      .toHaveLength(3);
  });

  /** The safety claim of the 2026-08-19 decision, asserted rather than asserted-in-prose. */
  it('the two newly non-blocking policies are exactly the RESTRICTED-disposition ones', () => {
    const restricted = POLICY_REGISTRY.filter((r) => r.disposition?.value === 'RESTRICTED').map((r) => r.identity);
    expect(restricted.sort()).toEqual(['ts.graphic.presentation', 'ts.sexual.adult-content']);
    for (const p of restricted)
      expect(PUBLICATION_GATE_RULES[p], p).toBe('DOES_NOT_BLOCK_PUBLICATION');
  });

  it('every child-safety and non-consent policy still blocks', () => {
    for (const p of [
      'ts.child.sexual-exploitation',
      'ts.child.sexualization',
      'ts.child.grooming',
      'ts.child.abuse-harm',
      'ts.sexual.exploitation-nonconsent',
    ])
      expect(PUBLICATION_GATE_RULES[p], p).toBe('BLOCKS_PUBLICATION');
  });

  it('only cleared outcomes are non-blocking', () => {
    expect(isBlockingResult(line('p', 'NOT_APPLICABLE'))).toBe(false);
    expect(isBlockingResult(line('p', 'APPLICABLE_NO_VIOLATION'))).toBe(false);
    for (const outcome of ['VIOLATION', 'INSUFFICIENT_EVIDENCE', 'INDETERMINATE_CONTEXT', 'ENGINE_ERROR'])
      expect(isBlockingResult(line('p', outcome)), outcome).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The unresolved state
// ---------------------------------------------------------------------------

describe('an undecided rule collapses in neither direction', () => {
  // The mechanism is still live for any policy without a decided rule — proven
  // with a synthetic one, since production now has none.
  const UNDECIDED = 'ts.some.future-policy';

  it('a clip blocked ONLY by an undecided policy is CONFIGURATION_REQUIRED', () => {
    const outcome = aggregatePublication([
      ...allClearExcept(),
      line(UNDECIDED, 'INSUFFICIENT_EVIDENCE'),
    ]);
    expect(outcome.decision).toBe('CONFIGURATION_REQUIRED');
    expect(outcome.unresolved).toEqual([UNDECIDED]);
  });

  it('CONFIGURATION_REQUIRED does not publish — that would invent the answer', () => {
    expect(storedStateFor('CONFIGURATION_REQUIRED')).toBe('UNDER_REVIEW');
    expect(storedStateFor('CONFIGURATION_REQUIRED')).not.toBe('PUBLISHED');
  });

  it('...and it is DISTINGUISHABLE from an ordinary safety hold', () => {
    const configGap = aggregatePublication([
      ...allClearExcept(),
      line(UNDECIDED, 'INSUFFICIENT_EVIDENCE'),
    ]);
    const safetyHold = aggregatePublication(
      allClearExcept(line('ts.fraud.scam', 'INSUFFICIENT_EVIDENCE')),
    );
    expect(configGap.decision).toBe('CONFIGURATION_REQUIRED');
    expect(safetyHold.decision).toBe('UNDER_REVIEW');
  });

  it('a configuration gap is reported BEFORE an ordinary hold, never hidden behind one', () => {
    const outcome = aggregatePublication([
      ...allClearExcept(line('ts.fraud.scam', 'INSUFFICIENT_EVIDENCE')),
      line(UNDECIDED, 'INSUFFICIENT_EVIDENCE'),
    ]);
    expect(outcome.decision).toBe('CONFIGURATION_REQUIRED');
    expect(outcome.blockedBy).toContain('ts.fraud.scam');
  });

  it('a real violation still outranks the configuration gap', () => {
    const outcome = aggregatePublication([
      ...allClearExcept(line('ts.privacy.personal-information', 'VIOLATION')),
      line(UNDECIDED, 'INSUFFICIENT_EVIDENCE'),
    ]);
    expect(outcome.decision).toBe('RESTRICTED');
  });
});

// ---------------------------------------------------------------------------
// Option B in effect
// ---------------------------------------------------------------------------

describe('Option B — the Legal block no longer gates publication', () => {
  it('a clip whose ONLY blocker is the hate policy now publishes', () => {
    const outcome = aggregatePublication(allClearExcept(line(HATE, 'INSUFFICIENT_EVIDENCE', 'LEGAL')));
    expect(outcome.decision).toBe('PUBLISHED');
    expect(outcome.notBlocking).toEqual([HATE]);
  });

  it('the hate RESULT is untouched — the Legal boundary is set aside, not erased', () => {
    const lines = allClearExcept(line(HATE, 'INSUFFICIENT_EVIDENCE', 'LEGAL'));
    aggregatePublication(lines);
    const hateLine = lines.find((l) => l.policy === HATE)!;
    expect(hateLine.outcome).toBe('INSUFFICIENT_EVIDENCE');
    expect(hateLine.outcome).not.toBe('NOT_APPLICABLE');
    expect(hateLine.outcome).not.toBe('APPLICABLE_NO_VIOLATION');
    expect(hateLine.gate).toBe('LEGAL');
  });

  it('every other policy still blocks — Option B did not open the gate generally', () => {
    for (const policy of ['ts.fraud.scam', 'ts.child.grooming', 'ts.privacy.personal-information']) {
      const outcome = aggregatePublication(allClearExcept(line(policy, 'INSUFFICIENT_EVIDENCE')));
      expect(outcome.decision, policy).toBe('UNDER_REVIEW');
    }
  });

  it('a hate VIOLATION would still not restrict — it is set aside either way', () => {
    // Unreachable today (the policy cannot be constituted while Legal-blocked),
    // but the rule must be unambiguous: DOES_NOT_BLOCK means exactly that.
    const outcome = aggregatePublication(allClearExcept(line(HATE, 'VIOLATION')));
    expect(outcome.decision).toBe('PUBLISHED');
    expect(outcome.notBlocking).toEqual([HATE]);
  });
});

// ---------------------------------------------------------------------------
// Both future configurations — neither is chosen here
// ---------------------------------------------------------------------------

describe('the architecture supports both future answers', () => {
  const onlyHateBlocking = allClearExcept(line(HATE, 'INSUFFICIENT_EVIDENCE', 'LEGAL'));

  it('CONFIGURATION A — hate blocks publication → UNDER_REVIEW', () => {
    const outcome = aggregateWithRules(onlyHateBlocking, { [HATE]: 'BLOCKS_PUBLICATION' });
    expect(outcome.decision).toBe('UNDER_REVIEW');
    expect(outcome.blockedBy).toEqual([HATE]);
    expect(outcome.unresolved).toEqual([]);
  });

  it('CONFIGURATION B — hate does not block → the other policies decide', () => {
    const outcome = aggregateWithRules(onlyHateBlocking, {
      [HATE]: 'DOES_NOT_BLOCK_PUBLICATION',
    });
    expect(outcome.decision).toBe('PUBLISHED');
    expect(outcome.notBlocking).toEqual([HATE]);
  });

  it('CONFIGURATION B does NOT make other policies stop mattering', () => {
    const outcome = aggregateWithRules(
      allClearExcept(
        line(HATE, 'INSUFFICIENT_EVIDENCE'),
        line('ts.fraud.scam', 'INSUFFICIENT_EVIDENCE'),
      ),
      { [HATE]: 'DOES_NOT_BLOCK_PUBLICATION' },
    );
    expect(outcome.decision).toBe('UNDER_REVIEW');
    expect(outcome.blockedBy).toEqual(['ts.fraud.scam']);
  });

  it('CONFIGURATION B is the shipped one, chosen explicitly by Product', () => {
    expect(PUBLICATION_GATE_RULES[HATE]).toBe('DOES_NOT_BLOCK_PUBLICATION');
  });

  it('under CONFIGURATION B the hate RESULT is untouched — the Legal boundary survives', () => {
    const outcome = aggregateWithRules(onlyHateBlocking, {
      [HATE]: 'DOES_NOT_BLOCK_PUBLICATION',
    });
    // The gate set it aside; it did not rewrite it.
    expect(outcome.notBlocking).toEqual([HATE]);
    const hateLine = onlyHateBlocking.find((l) => l.policy === HATE)!;
    expect(hateLine.outcome).toBe('INSUFFICIENT_EVIDENCE');
    expect(hateLine.outcome).not.toBe('NOT_APPLICABLE');
    expect(hateLine.outcome).not.toBe('APPLICABLE_NO_VIOLATION');
  });
});

// ---------------------------------------------------------------------------
// No hidden precedence
// ---------------------------------------------------------------------------

describe('no hidden precedence', () => {
  it('order of results does not change the decision', () => {
    const lines = allClearExcept(
      line(HATE, 'INSUFFICIENT_EVIDENCE'),
      line('ts.fraud.scam', 'INSUFFICIENT_EVIDENCE'),
    );
    expect(aggregatePublication(lines).decision).toBe(
      aggregatePublication([...lines].reverse()).decision,
    );
  });

  it('nothing is ranked by severity — each result meets its own rule', () => {
    // A policy with an S4 envelope has no more publication authority than one
    // with S1; the gate consults rules, not severities.
    const s4 = aggregatePublication(allClearExcept(line('ts.child.grooming', 'INSUFFICIENT_EVIDENCE')));
    const s1 = aggregatePublication(allClearExcept(line('ts.animal.cruelty', 'INSUFFICIENT_EVIDENCE')));
    expect(s4.decision).toBe(s1.decision);
  });

  it('an all-clear page publishes', () => {
    expect(aggregatePublication(allClearExcept()).decision).toBe('PUBLISHED');
  });
});

// ---------------------------------------------------------------------------
// Integration with the full result
// ---------------------------------------------------------------------------

describe('safety result keeps both layers', () => {
  const bundle = (results: ModalityResult[]): EvidenceBundle => ({
    contentId: 'c',
    contentVersion: 'v1',
    gatheredAt: T,
    results,
  });

  it('the per-policy results survive alongside the gate outcome', () => {
    const result = evaluateSafety(bundle([textEvidence({ body: 'Quán ngon' })]), T);
    expect(result.policies).toHaveLength(18);
    expect(result.gate.decision).toBeDefined();
    expect(PUBLICATION_DECISIONS).toContain(result.gate.decision);
  });

  it('a bundle with no metadata is still held — absence needs a complete examination', () => {
    // TEXT alone is not a complete examination: METADATA never observed, so the
    // absence model stays silent and the prohibitive policies cannot be cleared.
    const result = evaluateSafety(bundle([textEvidence({ body: 'Quán ngon' })]), T);
    expect(result.gate.decision).toBe('UNDER_REVIEW');
    expect(result.publication).toBe('UNDER_REVIEW');
    // 🔑 The three non-blocking policies are set aside for publication...
    expect([...result.gate.notBlocking].sort()).toEqual([
      'ts.graphic.presentation',
      'ts.hate.protected-target-abuse',
      'ts.sexual.adult-content',
    ]);
    expect(result.gate.unresolved).toEqual([]);
    // ...and the content's safety state STILL reports the Legal block. Both
    // Owner decisions changed publication authority, never the policy layer.
    expect(result.state).toBe('LEGAL_REVIEW_REQUIRED');
  });

  it('an engine error holds publication regardless of any gate rule', () => {
    const result = evaluateSafety(
      bundle([{ modality: 'IMAGE_FRAME', status: 'FAILED', reason: 'vision call failed' }]),
      T,
    );
    expect(result.state).toBe('ENGINE_ERROR');
    expect(result.publication).toBe('UNDER_REVIEW');
  });

  it('an engine error overrides even a gate that says PUBLISHED', () => {
    // The decisive case, and it is unreachable through a bundle today: a broken
    // evaluation whose gate nonetheless concluded "publish". Tested directly so
    // the rule cannot rot into a redundant branch nobody exercises.
    expect(publicationFromGate('ENGINE_ERROR', 'PUBLISHED')).toBe('UNDER_REVIEW');
    for (const decision of PUBLICATION_DECISIONS)
      expect(publicationFromGate('ENGINE_ERROR', decision), decision).toBe('UNDER_REVIEW');
  });

  it('every other state defers to the gate, and only PUBLISHED publishes', () => {
    expect(publicationFromGate('SAFE', 'PUBLISHED')).toBe('PUBLISHED');
    expect(publicationFromGate('SAFE', 'CONFIGURATION_REQUIRED')).toBe('UNDER_REVIEW');
    expect(publicationFromGate('SAFE', 'UNDER_REVIEW')).toBe('UNDER_REVIEW');
    expect(publicationFromGate('VIOLATION', 'RESTRICTED')).toBe('RESTRICTED');
  });
});
