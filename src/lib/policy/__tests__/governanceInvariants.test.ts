/**
 * Governance invariants as executable guards.
 *
 * Every rule tested here is ALREADY RATIFIED — Group 01 §10 (GA-1…GA-10,
 * PROP-2), Group 02 §4 (OUT-1…OUT-3), §7 (ENV-1…ENV-7, SEV-8/9) and the Legal
 * boundary at G02-D-07b. Nothing new is invented; the point is that a future
 * edit cannot silently break one of them.
 *
 * Several tests read the module's own source. That is deliberate: the strongest
 * available guarantee that no enforcement action exists is that no identifier
 * naming one exists anywhere in the policy module.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PROTECTED_TARGET_DEPENDENT_POLICIES,
  deriveOutcome,
  evaluatePolicy,
  type EvaluationInput,
} from '../engine/evaluator';
import type { Expression, Truth } from '../engine/expression';
import {
  getProtectedTargetSet,
  isProtectedTargetSetBlocked,
  resetProtectedTargetSetProvider,
} from '../legal/protectedTargets';
import {
  SEVERITY_UNDETERMINED,
  TERMINAL_NON_VIOLATING_OUTCOMES,
  caseSeverityFromEnvelope,
  isEnvelopeDeclaredAbsent,
  isEnvelopeUndetermined,
  type SeverityEnvelope,
} from '../types';
import { POLICY_REGISTRY } from '../source/registry';
import {
  ADOPTED_SOURCE_HASH,
  HELD_LEGAL_BOUNDARY_STATE,
  HOLD_RELEASE,
  LIVE_LEGAL_BOUNDARY_STATE,
  MEASURED_DRIFT,
  REGISTRY_SNAPSHOT_HASH,
  SOURCE_SNAPSHOT_STATUS,
  actualRegistrySourceHash,
  isSourceDrifting,
  registryMatchesAdoptedSource,
  snapshotMatchesRegistry,
} from '../source/sourceSnapshot';
import {
  REVERSIBILITY_CLASSES,
  assessExpiry,
  automationMayEscalate,
  automationMayReach,
  isBacklog,
  isTsAuditAction,
  type ReviewObligation,
} from '../infra/obligations';

const ALWAYS_TRUE: Expression = { op: 'eq', left: { value: 1 }, right: { value: 1 } };
const ALWAYS_FALSE: Expression = { op: 'eq', left: { value: 1 }, right: { value: 2 } };
/** Reads a field the subject does not have — the engine's UNKNOWN path. */
const UNKNOWABLE: Expression = { op: 'eq', left: { ref: 'nope' }, right: { value: 1 } };

const record = () => POLICY_REGISTRY.find((r) => r.identity === 'ts.fraud.scam')!;
const input = (over: Partial<EvaluationInput> = {}): EvaluationInput => ({
  subject: {},
  asOf: '2026-08-16T00:00:00Z',
  predicate: ALWAYS_TRUE,
  ...over,
});

// ---------------------------------------------------------------------------
// OUT-1 / OUT-2 / OUT-3 — outcomes
// ---------------------------------------------------------------------------

describe('§4 outcomes', () => {
  it('OUT-1: terminal non-violating outcomes are exactly the three the corpus names', () => {
    expect([...TERMINAL_NON_VIOLATING_OUTCOMES].sort()).toEqual([
      'DISPUTED',
      'INDETERMINATE_CONTEXT',
      'INSUFFICIENT_EVIDENCE',
    ]);
  });

  it('OUT-1: a terminal outcome is never reported as a violation', () => {
    const d = evaluatePolicy(record(), input({ predicate: UNKNOWABLE }));
    expect(d.outcome).not.toBe('VIOLATION');
    expect(d.terminalNonViolating).toBe(true);
  });

  it('a non-violation cannot become a violation through a fault', () => {
    for (const predicate of [UNKNOWABLE, undefined]) {
      const d = evaluatePolicy(record(), input({ predicate }));
      expect(d.outcome).not.toBe('VIOLATION');
    }
  });

  it('§6.3: a defeating context yields APPLICABLE_NO_VIOLATION, not a violation', () => {
    const d = evaluatePolicy(record(), input({ defeatingContext: ALWAYS_TRUE }));
    expect(d.outcome).toBe('APPLICABLE_NO_VIOLATION');
    // OUT-2: recorded, not discarded — and it is NOT a terminal non-violating class.
    expect(d.terminalNonViolating).toBe(false);
  });

  it('a defeating context that cannot be read is NOT treated as an absent one', () => {
    const d = evaluatePolicy(record(), input({ defeatingContext: UNKNOWABLE }));
    expect(d.outcome).not.toBe('VIOLATION');
  });

  it('CTX-1: unreadable decisive context yields INDETERMINATE_CONTEXT, never a violation', () => {
    const d = evaluatePolicy(record(), input({ contextUnreadable: true }));
    expect(d.outcome).toBe('INDETERMINATE_CONTEXT');
  });

  it('OUT-3: response_warranted is carried, and carries no action', () => {
    const d = evaluatePolicy(record(), input({ responseWarranted: true }));
    expect(d.responseWarranted).toBe(true);
    // It must not change the classification in any direction.
    expect(d.outcome).toBe(evaluatePolicy(record(), input()).outcome);
    expect(Object.keys(d)).not.toContain('action');
  });

  it('GA-9: every uncertain path resolves away from a finding', () => {
    const truths: Truth[] = ['TRUE', 'FALSE', 'UNKNOWN'];
    for (const t of truths) {
      // A fault present ⇒ never a violation, whatever the predicate said.
      expect(deriveOutcome(t, [{ kind: 'MISSING_FIELD', detail: 'x' }])).not.toBe('VIOLATION');
    }
    expect(deriveOutcome('UNKNOWN', [])).toBe('INSUFFICIENT_EVIDENCE');
    expect(deriveOutcome('TRUE', [], { defeated: 'UNKNOWN' })).toBe('INSUFFICIENT_EVIDENCE');
  });
});

// ---------------------------------------------------------------------------
// ENV-1 … ENV-7, SEV-8/9
// ---------------------------------------------------------------------------

describe('severity envelopes', () => {
  const bounded: SeverityEnvelope = { kind: 'BOUNDED', min: 'S4', max: 'S4' };
  const open: SeverityEnvelope = { kind: 'OPEN' };
  const none: SeverityEnvelope = { kind: 'NO_ENVELOPE' };

  it('ENV-1/ENV-2/SEV-9: no envelope yields a case severity — not even a single-class one', () => {
    for (const env of [bounded, open, none]) {
      expect(caseSeverityFromEnvelope(env)).toBe(SEVERITY_UNDETERMINED);
    }
  });

  it('ENV-6 OPEN and ENV-7 NO_ENVELOPE are distinct states, and neither is the other', () => {
    expect(isEnvelopeUndetermined(open)).toBe(true);
    expect(isEnvelopeUndetermined(none)).toBe(false);
    expect(isEnvelopeDeclaredAbsent(none)).toBe(true);
    expect(isEnvelopeDeclaredAbsent(open)).toBe(false);
  });

  it('NO_ENVELOPE does not mean "ignore": both ENV-7 policies remain PROHIBITED-or-RESTRICTED and enabled', () => {
    const env7 = POLICY_REGISTRY.filter(
      (r) => r.severity_envelope.status === 'DECLARED' && r.severity_envelope.value?.kind === 'NO_ENVELOPE',
    );
    expect(env7).toHaveLength(2);
    for (const r of env7) {
      expect(r.disposition.value).toBe('RESTRICTED');
      expect(r.lifecycle.enabled).toBe(true);
      expect(r.constitutive_behavior.status).toBe('DECLARED');
    }
  });

  it('OPEN does not mean "allow forever": the OPEN-envelope policy is not ratifiable', () => {
    const openEnv = POLICY_REGISTRY.filter((r) => r.severity_envelope.status === 'OPEN');
    expect(openEnv).toHaveLength(1);
    expect(openEnv[0].identity).toBe('ts.hate.protected-target-abuse');
    expect(openEnv[0].disposition.value).toBe('PROHIBITED');
    const d = evaluatePolicy(openEnv[0], input());
    expect(d.outcome).not.toBe('VIOLATION');
    expect(d.outcome).not.toBe('NOT_APPLICABLE');
  });

  it('the evaluator emits no severity at all', () => {
    expect(Object.keys(evaluatePolicy(record(), input()))).not.toContain('severity');
  });
});

// ---------------------------------------------------------------------------
// Legal boundary — G02-D-07b
// ---------------------------------------------------------------------------

describe('Legal BLOCKED is neither allow nor deny', () => {
  it('is BLOCKED today, and says so explicitly', () => {
    resetProtectedTargetSetProvider();
    expect(isProtectedTargetSetBlocked()).toBe(true);
    expect(getProtectedTargetSet()).toMatchObject({ state: 'BLOCKED', blockedBy: 'G02-D-07b' });
  });

  it('a dependent policy produces neither VIOLATION nor NOT_APPLICABLE, and records the blocker', () => {
    for (const id of PROTECTED_TARGET_DEPENDENT_POLICIES) {
      const r = POLICY_REGISTRY.find((x) => x.identity === id)!;
      for (const predicate of [ALWAYS_TRUE, ALWAYS_FALSE]) {
        const d = evaluatePolicy(r, input({ predicate }));
        expect(d.outcome).not.toBe('VIOLATION');
        expect(d.outcome).not.toBe('NOT_APPLICABLE');
        expect(d.faults.some((f) => f.blockedBy === 'G02-D-07b')).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// GA-2, GA-4, GA-5, GA-7 as executable rules
// ---------------------------------------------------------------------------

describe('Group 01 §10 automation invariants', () => {
  it('GA-2: automation may never reach R3', () => {
    expect(automationMayReach('R3')).toBe(false);
    for (const c of ['R0', 'R1', 'R2'] as const) expect(automationMayReach(c)).toBe(true);
  });

  it('GA-7: automation may escalate toward containment, never toward permanence', () => {
    expect(automationMayEscalate('R2', 'R1')).toBe(true);
    expect(automationMayEscalate('R2', 'R2')).toBe(true);
    expect(automationMayEscalate('R1', 'R2')).toBe(false);
    for (const from of REVERSIBILITY_CLASSES) expect(automationMayEscalate(from, 'R3')).toBe(false);
  });

  it('GA-4: an automated action is time-bounded, and expiry is a pure comparison', () => {
    const e = { notAfter: '2026-08-16T12:00:00Z' };
    expect(assessExpiry(e, '2026-08-16T11:59:59Z').expired).toBe(false);
    expect(assessExpiry(e, '2026-08-16T12:00:00Z').expired).toBe(true);
  });

  it('GA-5: expiry does NOT discharge a review obligation — it becomes backlog', () => {
    const o: ReviewObligation = {
      obligationId: 'o1',
      policy: 'ts.fraud.scam@1',
      outcome: 'VIOLATION',
      actionRef: 'opaque',
      reversibility: 'R1',
      createdAt: '2026-08-16T00:00:00Z',
      state: 'OUTSTANDING',
      humanReviewMandatory: false,
    };
    const e = { notAfter: '2026-08-16T12:00:00Z' };
    expect(isBacklog(o, e, '2026-08-16T13:00:00Z')).toBe(true);
    expect(isBacklog({ ...o, state: 'DISCHARGED' }, e, '2026-08-16T13:00:00Z')).toBe(false);
  });

  it('AU-1: T&S audit actions live in the ts. namespace, never the rbac. one', () => {
    expect(isTsAuditAction('ts.policy.evaluated')).toBe(true);
    expect(isTsAuditAction('rbac.access_denied')).toBe(false);
    expect(isTsAuditAction('owner.override')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Source snapshot consistency
// ---------------------------------------------------------------------------

describe('source snapshot', () => {
  it('the registry is built from the corpus state recorded as adopted', () => {
    expect(registryMatchesAdoptedSource()).toBe(true);
    expect(SOURCE_SNAPSHOT_STATUS).toBe('IN_SYNC');
    expect(isSourceDrifting()).toBe(false);
    expect(actualRegistrySourceHash()).toBe(ADOPTED_SOURCE_HASH);
  });

  it('the released hold and its measured drift are preserved, not erased (CM-3)', () => {
    expect(REGISTRY_SNAPSHOT_HASH).toBe('53ae8e82');
    expect(MEASURED_DRIFT).toHaveLength(1);
    expect(MEASURED_DRIFT[0]).toMatchObject({
      policy: 'ts.hate.protected-target-abuse',
      field: 'decisive_dimensions',
      snapshotStatus: 'OPEN',
      workingTreeStatus: 'DECLARED',
    });
    // The historical predicate must keep answering the historical question.
    expect(snapshotMatchesRegistry()).toBe(false);
    expect(HELD_LEGAL_BOUNDARY_STATE.decisive_dimensions).toBe('OPEN');
    expect(HOLD_RELEASE.authority).toBeTruthy();
    expect(HOLD_RELEASE.reason).toBeTruthy();
  });

  it('the live Legal boundary is one field, and it is the Legal one', () => {
    expect(LIVE_LEGAL_BOUNDARY_STATE).toMatchObject({
      decisive_dimensions: 'DECLARED',
      severity_envelope: 'OPEN',
      blockedBy: 'G02-D-07b',
    });
  });
});

// ---------------------------------------------------------------------------
// Source scan — the strongest available "enforcement is OFF" guarantee
// ---------------------------------------------------------------------------

describe('no enforcement vocabulary exists in the policy module', () => {
  const ROOT = path.resolve(__dirname, '..');

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sources(full);
      return full.endsWith('.ts') ? [full] : [];
    });
  }

  /**
   * Identifier-shaped occurrences only. Prose in a comment explaining that these
   * must not exist is exactly what we want to keep, so the patterns require the
   * shape of a declaration or a string literal.
   */
  const FORBIDDEN: readonly RegExp[] = [
    /\b(?:const|let|var|function|enum|type|interface|class)\s+(?:HIDE|WARN|SUSPEND|BAN|DELETE|BLOCK|TAKEDOWN|REMOVE)\b/,
    /['"](?:HIDE|WARN|SUSPEND|BAN|DELETE|BLOCK|TAKEDOWN)['"]/,
    /\bENFORCEMENT_ACTIONS\b/,
  ];

  it('defines no enforcement action anywhere under src/lib/policy', () => {
    const offenders: string[] = [];
    for (const file of sources(ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const re of FORBIDDEN) {
        const m = text.match(re);
        if (m) offenders.push(`${path.relative(ROOT, file)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never maps a disposition onto an action (§1595: a stance, not an action)', () => {
    for (const file of sources(ROOT)) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/PROHIBITED['"]?\s*(?:=>|:)\s*['"](?:HIDE|BLOCK|DELETE|BAN)/);
    }
  });
});
