import { afterEach, describe, expect, it } from 'vitest';

import {
  COMPARISON_OPERATORS,
  LOGICAL_OPERATORS,
  OPERATORS,
  assertNoExecutableMember,
  ExpressionStructureError,
  andTruth,
  isKnownOperator,
  notTruth,
  orTruth,
  validateExpression,
  type Expression,
} from '../engine/expression';
import {
  deriveOutcome,
  evaluatePolicy,
  PROTECTED_TARGET_DEPENDENT_POLICIES,
  type EvaluationFault,
} from '../engine/evaluator';
import {
  BlockedProtectedTargetSetProvider,
  PROTECTED_TARGET_DECISION_ID,
  ResolvedProtectedTargetSetProvider,
  getProtectedTargetSet,
  isProtectedTargetSetBlocked,
  resetProtectedTargetSetProvider,
  setProtectedTargetSetProvider,
} from '../legal/protectedTargets';
import {
  SC1_FIELDS,
  declared,
  isRatifiable,
  open,
  openFields,
  type PolicyRecord,
} from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<PolicyRecord> = {}): PolicyRecord {
  return {
    identity: 'ts.animal.cruelty',
    version: declared('@1'),
    constitutive_behavior: declared('see Governs'),
    does_not_govern: declared(['documentation']),
    evidence_sensitivity: declared({ markers: ['ORDINARY'] }),
    disposition: declared('PROHIBITED'),
    protected_interest: declared({ primary: 'dignity' }),
    applicability: declared({ actor: ['content item'], target: 'the depicted animal' }),
    content_classes: declared(['UGC', 'AI_GENERATED', 'AI_ASSISTED', 'MIXED', 'EXTERNAL_THIRD_PARTY']),
    defeating_contexts: declared([]),
    decisive_dimensions: declared(['Purpose']),
    severity_envelope: declared({ kind: 'BOUNDED', min: 'S2', max: 'S3' }),
    relationships: declared([{ kind: 'none-required' }]),
    lifecycle: { enabled: true, effectiveFrom: null, effectiveTo: null },
    ...overrides,
  };
}

const ASOF = '2026-08-16T00:00:00.000Z';

afterEach(() => {
  resetProtectedTargetSetProvider();
});

// ---------------------------------------------------------------------------
// PRECEDENT §3 — the guarantee that makes policy-as-data real
// ---------------------------------------------------------------------------

describe('PRECEDENT §3 — predicates are pure data', () => {
  it('rejects a function at the top level', () => {
    expect(() => assertNoExecutableMember(() => true)).toThrow(ExpressionStructureError);
  });

  it('rejects a function nested at depth', () => {
    const sneaky = { op: 'and', all: [{ op: 'eq', left: { ref: 'a' }, right: { value: 1 } }] } as Record<
      string,
      unknown
    >;
    (((sneaky.all as unknown[])[0] as Record<string, unknown>).right as Record<string, unknown>).match =
      () => true;
    expect(() => assertNoExecutableMember(sneaky)).toThrow(/Executable member/);
  });

  it('reports the path of the offending member', () => {
    const bad = { a: { b: [{ c: () => 1 }] } };
    expect(() => assertNoExecutableMember(bad)).toThrow(/\$\.a\.b\[0\]\.c/);
  });

  it('accepts a fully serialisable expression', () => {
    const expr: Expression = {
      op: 'and',
      all: [
        { op: 'eq', left: { ref: 'content.kind' }, right: { value: 'video' } },
        { op: 'in', left: { ref: 'content.lang' }, right: { value: ['vi', 'en'] } },
      ],
    };
    expect(() => assertNoExecutableMember(expr)).not.toThrow();
    expect(JSON.parse(JSON.stringify(expr))).toEqual(expr);
  });
});

describe('the operator set is closed and finite', () => {
  it('exposes exactly the declared operators', () => {
    expect(OPERATORS).toHaveLength(COMPARISON_OPERATORS.length + LOGICAL_OPERATORS.length);
    expect(new Set(OPERATORS).size).toBe(OPERATORS.length);
  });

  it('does not recognise an operator outside the set', () => {
    expect(isKnownOperator('eval')).toBe(false);
    expect(isKnownOperator('regex')).toBe(false);
    expect(isKnownOperator('eq')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §3.1 — unknown operator denies, never skips
// ---------------------------------------------------------------------------

describe('PRECEDENT §3.1 — unknown operator denies, never skips', () => {
  it('is a structural validation error', () => {
    const problems = validateExpression({ op: 'exec', left: { ref: 'x' }, right: { value: 1 } });
    expect(problems.join()).toMatch(/unknown operator 'exec'/);
  });

  it('never yields VIOLATION through an unknown operator', () => {
    const decision = evaluatePolicy(makeRecord(), {
      subject: { x: 1 },
      predicate: { op: 'exec', left: { ref: 'x' }, right: { value: 1 } } as unknown as Expression,
      asOf: ASOF,
    });
    expect(decision.outcome).not.toBe('VIOLATION');
    expect(decision.faults.some((f: EvaluationFault) => f.kind === 'UNKNOWN_OPERATOR')).toBe(true);
  });

  it('never silently passes as NOT_APPLICABLE', () => {
    const decision = evaluatePolicy(makeRecord(), {
      subject: { x: 1 },
      predicate: { op: 'exec', left: { ref: 'x' } } as unknown as Expression,
      asOf: ASOF,
    });
    expect(decision.outcome).not.toBe('NOT_APPLICABLE');
    expect(decision.outcome).toBe('INSUFFICIENT_EVIDENCE');
  });
});

// ---------------------------------------------------------------------------
// Three-valued logic — OUT-1 alignment
// ---------------------------------------------------------------------------

describe('three-valued logic keeps UNKNOWN first-class', () => {
  it('and: FALSE dominates, UNKNOWN beats TRUE', () => {
    expect(andTruth(['TRUE', 'FALSE', 'UNKNOWN'])).toBe('FALSE');
    expect(andTruth(['TRUE', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(andTruth(['TRUE', 'TRUE'])).toBe('TRUE');
  });

  it('or: TRUE dominates, UNKNOWN beats FALSE', () => {
    expect(orTruth(['FALSE', 'UNKNOWN', 'TRUE'])).toBe('TRUE');
    expect(orTruth(['FALSE', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(orTruth(['FALSE', 'FALSE'])).toBe('FALSE');
  });

  it('not: UNKNOWN is preserved, never collapsed to FALSE', () => {
    expect(notTruth('UNKNOWN')).toBe('UNKNOWN');
    expect(notTruth('TRUE')).toBe('FALSE');
    expect(notTruth('FALSE')).toBe('TRUE');
  });

  it('a missing field yields UNKNOWN, not FALSE', () => {
    const decision = evaluatePolicy(makeRecord(), {
      subject: {},
      predicate: { op: 'eq', left: { ref: 'content.kind' }, right: { value: 'video' } },
      asOf: ASOF,
    });
    expect(decision.truth).toBe('UNKNOWN');
    expect(decision.outcome).toBe('INSUFFICIENT_EVIDENCE');
  });
});

// ---------------------------------------------------------------------------
// Outcome mapping — no fault path reaches VIOLATION
// ---------------------------------------------------------------------------

describe('§4 outcome mapping', () => {
  it('maps a clean TRUE to VIOLATION', () => {
    expect(deriveOutcome('TRUE', [])).toBe('VIOLATION');
  });

  it('maps a clean FALSE to NOT_APPLICABLE', () => {
    expect(deriveOutcome('FALSE', [])).toBe('NOT_APPLICABLE');
  });

  it('never maps a faulted evaluation to VIOLATION, whatever the truth value', () => {
    const fault: EvaluationFault = { kind: 'MISSING_FIELD', detail: 'x' };
    for (const truth of ['TRUE', 'FALSE', 'UNKNOWN'] as const) {
      expect(deriveOutcome(truth, [fault])).not.toBe('VIOLATION');
    }
  });

  it('marks OUT-1 outcomes as terminal non-violating', () => {
    const decision = evaluatePolicy(makeRecord(), { subject: {}, asOf: ASOF });
    expect(decision.terminalNonViolating).toBe(true);
  });

  it('evaluates a satisfied predicate to VIOLATION when there is no fault', () => {
    const decision = evaluatePolicy(makeRecord(), {
      subject: { content: { kind: 'video' } },
      predicate: { op: 'eq', left: { ref: 'content.kind' }, right: { value: 'video' } },
      asOf: ASOF,
    });
    expect(decision.faults).toHaveLength(0);
    expect(decision.outcome).toBe('VIOLATION');
  });
});

// ---------------------------------------------------------------------------
// PRECEDENT §3.1 — decisions cite id + version (VER-T1)
// ---------------------------------------------------------------------------

describe('decisions cite identity AND version', () => {
  it('emits ts.<family>.<policy>@<n>', () => {
    const decision = evaluatePolicy(makeRecord(), { subject: {}, asOf: ASOF });
    expect(decision.policy).toBe('ts.animal.cruelty@1');
  });

  it('records the evaluation timestamp supplied by the caller', () => {
    const decision = evaluatePolicy(makeRecord(), { subject: {}, asOf: ASOF });
    expect(decision.asOf).toBe(ASOF);
  });
});

// ---------------------------------------------------------------------------
// Ratifiability — the SC-1 field-presence test (09g-7 Option A)
// ---------------------------------------------------------------------------

describe('SC-1 ratifiability', () => {
  it('declares 13 mandatory fields', () => {
    expect(SC1_FIELDS).toHaveLength(13);
  });

  it('a fully declared record is ratifiable', () => {
    expect(isRatifiable(makeRecord())).toBe(true);
    expect(openFields(makeRecord())).toEqual([]);
  });

  it('an OPEN declaration makes the record not ratifiable', () => {
    const record = makeRecord({
      severity_envelope: open('pending Legal', PROTECTED_TARGET_DECISION_ID),
    });
    expect(isRatifiable(record)).toBe(false);
    expect(openFields(record)).toContain('severity_envelope');
  });

  it('a non-ratifiable policy cannot produce a VIOLATION', () => {
    const record = makeRecord({
      decisive_dimensions: open('pending Legal', PROTECTED_TARGET_DECISION_ID),
    });
    const decision = evaluatePolicy(record, {
      subject: { content: { kind: 'video' } },
      predicate: { op: 'eq', left: { ref: 'content.kind' }, right: { value: 'video' } },
      asOf: ASOF,
    });
    expect(decision.outcome).not.toBe('VIOLATION');
    expect(decision.faults.some((f) => f.kind === 'POLICY_NOT_RATIFIABLE')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The Legal boundary — G02-D-07b
// ---------------------------------------------------------------------------

describe('PROTECTED_TARGET_SET is an isolated Legal boundary', () => {
  it('is BLOCKED by default and names the blocking decision', () => {
    const result = getProtectedTargetSet();
    expect(result.state).toBe('BLOCKED');
    if (result.state === 'BLOCKED') {
      expect(result.blockedBy).toBe('G02-D-07b');
    }
    expect(isProtectedTargetSetBlocked()).toBe(true);
  });

  it('refuses to treat an empty set as a resolution', () => {
    expect(() => new ResolvedProtectedTargetSetProvider([], 'v1')).toThrow(/non-empty/);
  });

  it('requires a source version so the decision can be cited', () => {
    expect(() => new ResolvedProtectedTargetSetProvider([{ key: 'x', label: 'X' }], '  ')).toThrow(
      /sourceVersion/,
    );
  });

  it('accepts an injected Legal answer without any other change', () => {
    setProtectedTargetSetProvider(
      new ResolvedProtectedTargetSetProvider(
        [{ key: 'religion', label: 'Religion' }],
        'G02-D-07b@1',
      ),
    );
    const result = getProtectedTargetSet();
    expect(result.state).toBe('AVAILABLE');
    if (result.state === 'AVAILABLE') {
      expect(result.targets).toHaveLength(1);
      expect(result.sourceVersion).toBe('G02-D-07b@1');
    }
  });

  it('makes the blocked dependency loud on the dependent policy', () => {
    const record = makeRecord({ identity: 'ts.hate.protected-target-abuse' });
    const decision = evaluatePolicy(record, {
      subject: { content: { kind: 'video' } },
      predicate: { op: 'eq', left: { ref: 'content.kind' }, right: { value: 'video' } },
      asOf: ASOF,
    });
    const blocked = decision.faults.find((f) => f.kind === 'BLOCKED_DEPENDENCY');
    expect(blocked).toBeDefined();
    expect(blocked?.blockedBy).toBe('G02-D-07b');
    expect(decision.outcome).not.toBe('VIOLATION');
    expect(decision.outcome).not.toBe('NOT_APPLICABLE');
  });

  it('stops flagging the dependency once Legal answers — no code change needed', () => {
    setProtectedTargetSetProvider(
      new ResolvedProtectedTargetSetProvider([{ key: 'religion', label: 'Religion' }], 'G02-D-07b@1'),
    );
    const record = makeRecord({ identity: 'ts.hate.protected-target-abuse' });
    const decision = evaluatePolicy(record, {
      subject: { content: { kind: 'video' } },
      predicate: { op: 'eq', left: { ref: 'content.kind' }, right: { value: 'video' } },
      asOf: ASOF,
    });
    expect(decision.faults.some((f) => f.kind === 'BLOCKED_DEPENDENCY')).toBe(false);
  });

  it('declares exactly the policies that depend on it', () => {
    expect(PROTECTED_TARGET_DEPENDENT_POLICIES).toEqual(['ts.hate.protected-target-abuse']);
  });

  it('the default provider is the blocked one', () => {
    expect(new BlockedProtectedTargetSetProvider().get().state).toBe('BLOCKED');
  });
});

// ---------------------------------------------------------------------------
// Expression validation surface
// ---------------------------------------------------------------------------

describe('expression validation', () => {
  it('accepts a well-formed nested expression', () => {
    expect(
      validateExpression({
        op: 'or',
        any: [
          { op: 'exists', left: { ref: 'a' } },
          { op: 'not', expr: { op: 'eq', left: { ref: 'b' }, right: { value: 2 } } },
        ],
      }),
    ).toEqual([]);
  });

  it('rejects an operand carrying both ref and value', () => {
    const problems = validateExpression({
      op: 'eq',
      left: { ref: 'a', value: 1 },
      right: { value: 2 },
    });
    expect(problems.join()).toMatch(/exactly one of 'ref' or 'value'/);
  });

  it('rejects a unary operator carrying a right operand', () => {
    const problems = validateExpression({ op: 'exists', left: { ref: 'a' }, right: { value: 1 } });
    expect(problems.join()).toMatch(/unary/);
  });

  it('rejects an empty and-branch', () => {
    expect(validateExpression({ op: 'and', all: [] }).join()).toMatch(/at least one branch/);
  });

  it('rejects a non-scalar literal', () => {
    const problems = validateExpression({
      op: 'eq',
      left: { ref: 'a' },
      right: { value: { nested: true } },
    });
    expect(problems.join()).toMatch(/JSON scalar/);
  });
});
