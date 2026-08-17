/**
 * The generic policy evaluator.
 *
 * PRECEDENT_POLICY_AS_DATA.md §2: "The one generic evaluator… Knows nothing
 * about 'AI answers' or 'saved places'." This engine knows the expression
 * *grammar* and the §4 outcome classes. It knows nothing about any particular
 * policy, and it contains no policy content.
 *
 * WHAT THIS ENGINE DELIBERATELY DOES NOT DO
 * -----------------------------------------
 * It does not decide enforcement. ENV-3: "An envelope is not an enforcement
 * threshold. It authorises nothing." Enforcement actions belong to a group that
 * has not started, and inventing them here would be authoring Product policy.
 *
 * It does not assign severity. ENV-2 forbids deriving an envelope mechanically,
 * and a case severity is not an envelope (ENV-1).
 *
 * It does not supply predicates. The 18 SC-1 records declare *taxonomy*
 * metadata; per-policy detection predicates are Product content that does not
 * exist in the corpus. The engine evaluates whatever predicates it is given and
 * authors none.
 */

import {
  type Expression,
  type Operand,
  type Truth,
  andTruth,
  isFieldRef,
  isKnownOperator,
  notTruth,
  orTruth,
  validateExpression,
} from './expression';
import {
  type OutcomeClass,
  type PolicyRecord,
  type PolicyVersionedRef,
  TERMINAL_NON_VIOLATING_OUTCOMES,
  isRatifiable,
  openFields,
} from '../types';
import { getProtectedTargetSet } from '../legal/protectedTargets';

// ---------------------------------------------------------------------------
// Faults
// ---------------------------------------------------------------------------

export type FaultKind =
  | 'UNKNOWN_OPERATOR'
  | 'MALFORMED_EXPRESSION'
  | 'MISSING_FIELD'
  | 'BLOCKED_DEPENDENCY'
  | 'POLICY_NOT_RATIFIABLE';

export interface EvaluationFault {
  readonly kind: FaultKind;
  readonly detail: string;
  /** The decision id blocking this evaluation, when the fault is a dependency. */
  readonly blockedBy?: string;
}

// ---------------------------------------------------------------------------
// Subject
// ---------------------------------------------------------------------------

/** The thing being classified. Opaque to the engine; only field paths are read. */
export interface EvaluationSubject {
  readonly [key: string]: unknown;
}

export interface EvaluationInput {
  readonly subject: EvaluationSubject;
  /** The constitutive predicate for this policy. Absent means "none supplied". */
  readonly predicate?: Expression;
  /**
   * §6.3 defeating context — "behavior constituted, harm plausible, but a named
   * context defeats application".
   *
   * Supplied by the caller, exactly like `predicate`; the engine authors no
   * predicates. Without it, a policy that IS constituted can only ever produce
   * `VIOLATION`, and §4's `APPLICABLE_NO_VIOLATION` — the outcome OUT-2 says
   * must be *recorded, not discarded* — is unreachable.
   *
   * ⚠ Child-safety policies declare NO defeating context (§6.3, CS-0). Supplying
   * one for those is a caller error the corpus already forbids; this engine does
   * not police it, because the predicate content is Product material.
   */
  readonly defeatingContext?: Expression;
  /**
   * CTX-1 / PT-13: the decisive context is present but unreadable — commonly
   * missing cultural or linguistic context, or an unreadable target.
   *
   * Yields `INDETERMINATE_CONTEXT`, "never a violation".
   */
  readonly contextUnreadable?: boolean;
  /**
   * OUT-3 — "non-violating, response-warranted": an attribute of the
   * classification, carried so it cannot be lost.
   *
   * 🚨 It is NOT an action and NOT an enforcement signal. OUT-3: "what the
   * response is belongs to Group 09, and it must never be an enforcement
   * action." Nothing in this module reads it to decide anything.
   */
  readonly responseWarranted?: boolean;
  /** Evaluation timestamp, ISO-8601. Supplied by the caller; never `Date.now()` here. */
  readonly asOf: string;
}

// ---------------------------------------------------------------------------
// Decision record — PRECEDENT §3.1
// ---------------------------------------------------------------------------

/**
 * "A decision must record the `id` + `version` of the rule that produced it.
 *  Once rules can change at runtime, a decision record without a version cannot
 *  be explained after the fact."
 *
 * VER-T1 says the same from the taxonomy side: "Decisions cite the version."
 */
export interface PolicyDecision {
  /** `ts.<family>.<policy>@<n>` — identity AND version, never identity alone. */
  readonly policy: PolicyVersionedRef;
  readonly outcome: OutcomeClass;
  readonly truth: Truth;
  readonly faults: readonly EvaluationFault[];
  readonly asOf: string;
  /**
   * True when the outcome is one of the OUT-1 terminal non-violating outcomes.
   * Recorded explicitly so no consumer can treat it as a diminished violation.
   */
  readonly terminalNonViolating: boolean;
  /**
   * OUT-3, carried through from the input. An attribute of the classification,
   * never an action and never an enforcement signal.
   */
  readonly responseWarranted: boolean;
  /**
   * PRODUCT DECISION (Owner, 2026-08-16), option (b).
   *
   * True when a policy whose `disposition` is `RESTRICTED` was constituted. The
   * outcome in that case is `APPLICABLE_NO_VIOLATION` — a `RESTRICTED`
   * disposition "establishes no violation" (§7.3.9 Finding C, Row A), the class
   * means "permitted subject to conditions" (§9), and §18 case 3 records the
   * result as "`RESTRICTED`, not a violation".
   *
   * 🚨 This is CLASSIFICATION METADATA, in the shape of OUT-3 — never an action.
   * It says presentation conditions are in play; it does not say what they are,
   * who applies them, or what happens next. That belongs to Group 09, which is
   * not open. No new outcome class was created and no severity is implied.
   */
  readonly presentationConditionsApply: boolean;
}

// ---------------------------------------------------------------------------
// Field resolution
// ---------------------------------------------------------------------------

const MISSING = Symbol('MISSING');

function resolvePath(subject: EvaluationSubject, path: string): unknown | typeof MISSING {
  const segments = path.split('.');
  let current: unknown = subject;
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return MISSING;
    if (!(seg in (current as Record<string, unknown>))) return MISSING;
    current = (current as Record<string, unknown>)[seg];
  }
  return current === undefined ? MISSING : current;
}

function resolveOperand(
  subject: EvaluationSubject,
  operand: Operand,
): { value: unknown; missing: boolean } {
  if (isFieldRef(operand)) {
    const v = resolvePath(subject, operand.ref);
    return v === MISSING ? { value: undefined, missing: true } : { value: v, missing: false };
  }
  return { value: (operand as { value: unknown }).value, missing: false };
}

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

function evaluateExpression(
  expr: Expression,
  subject: EvaluationSubject,
  faults: EvaluationFault[],
): Truth {
  const op = (expr as { op: string }).op;

  // §3.1 — unknown operator denies. It never skips.
  if (!isKnownOperator(op)) {
    faults.push({ kind: 'UNKNOWN_OPERATOR', detail: `unknown operator '${op}'` });
    return 'UNKNOWN';
  }

  if (op === 'and') {
    const branches = (expr as { all: readonly Expression[] }).all;
    return andTruth(branches.map((b) => evaluateExpression(b, subject, faults)));
  }
  if (op === 'or') {
    const branches = (expr as { any: readonly Expression[] }).any;
    return orTruth(branches.map((b) => evaluateExpression(b, subject, faults)));
  }
  if (op === 'not') {
    return notTruth(evaluateExpression((expr as { expr: Expression }).expr, subject, faults));
  }

  const cmp = expr as { op: string; left: Operand; right?: Operand };
  const left = resolveOperand(subject, cmp.left);

  if (op === 'exists') return left.missing ? 'FALSE' : 'TRUE';
  if (op === 'missing') return left.missing ? 'TRUE' : 'FALSE';

  if (left.missing) {
    faults.push({
      kind: 'MISSING_FIELD',
      detail: `field '${isFieldRef(cmp.left) ? cmp.left.ref : '?'}' absent from subject`,
    });
    return 'UNKNOWN';
  }

  if (cmp.right === undefined) {
    faults.push({ kind: 'MALFORMED_EXPRESSION', detail: `'${op}' requires 'right'` });
    return 'UNKNOWN';
  }
  const right = resolveOperand(subject, cmp.right);
  if (right.missing) {
    faults.push({
      kind: 'MISSING_FIELD',
      detail: `field '${isFieldRef(cmp.right) ? cmp.right.ref : '?'}' absent from subject`,
    });
    return 'UNKNOWN';
  }

  return compare(op, left.value, right.value, faults);
}

function compare(op: string, l: unknown, r: unknown, faults: EvaluationFault[]): Truth {
  const bool = (b: boolean): Truth => (b ? 'TRUE' : 'FALSE');
  switch (op) {
    case 'eq':
      return bool(l === r);
    case 'neq':
      return bool(l !== r);
    case 'in':
      return Array.isArray(r) ? bool(r.includes(l as never)) : unknownFault(op, faults);
    case 'notIn':
      return Array.isArray(r) ? bool(!r.includes(l as never)) : unknownFault(op, faults);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (typeof l !== 'number' || typeof r !== 'number') return unknownFault(op, faults);
      if (op === 'gt') return bool(l > r);
      if (op === 'gte') return bool(l >= r);
      if (op === 'lt') return bool(l < r);
      return bool(l <= r);
    }
    case 'contains':
      if (typeof l === 'string' && typeof r === 'string') return bool(l.includes(r));
      if (Array.isArray(l)) return bool(l.includes(r as never));
      return unknownFault(op, faults);
    case 'startsWith':
      return typeof l === 'string' && typeof r === 'string'
        ? bool(l.startsWith(r))
        : unknownFault(op, faults);
    case 'endsWith':
      return typeof l === 'string' && typeof r === 'string'
        ? bool(l.endsWith(r))
        : unknownFault(op, faults);
    default:
      faults.push({ kind: 'UNKNOWN_OPERATOR', detail: `unhandled operator '${op}'` });
      return 'UNKNOWN';
  }
}

function unknownFault(op: string, faults: EvaluationFault[]): Truth {
  faults.push({ kind: 'MALFORMED_EXPRESSION', detail: `operand types unsuitable for '${op}'` });
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Policy evaluation
// ---------------------------------------------------------------------------

/**
 * Policies whose evaluation depends on the Legal-blocked protected target set.
 *
 * Listed by identity so the dependency is declared in exactly one place. When
 * `G02-D-07b` resolves, this list stops mattering because the provider returns
 * AVAILABLE — no code here changes.
 */
export const PROTECTED_TARGET_DEPENDENT_POLICIES: readonly string[] = [
  'ts.hate.protected-target-abuse',
];

export function evaluatePolicy(record: PolicyRecord, input: EvaluationInput): PolicyDecision {
  const faults: EvaluationFault[] = [];
  const version = record.version.status === 'DECLARED' ? record.version.value : null;
  const policyRef: PolicyVersionedRef = version ? `${record.identity}${version}` : record.identity;

  // 1. A policy that is not ratifiable cannot produce a violation.
  if (!isRatifiable(record)) {
    faults.push({
      kind: 'POLICY_NOT_RATIFIABLE',
      detail: `open declarations: ${openFields(record).join(', ')}`,
    });
  }

  // 2. A blocked Legal dependency is loud, never silent.
  if (PROTECTED_TARGET_DEPENDENT_POLICIES.includes(record.identity)) {
    const targets = getProtectedTargetSet();
    if (targets.state === 'BLOCKED') {
      faults.push({
        kind: 'BLOCKED_DEPENDENCY',
        detail: targets.reason,
        blockedBy: targets.blockedBy,
      });
    }
  }

  // 3. Structural validation of the predicate, before evaluation.
  let truth: Truth = 'UNKNOWN';
  if (input.predicate === undefined) {
    faults.push({
      kind: 'MALFORMED_EXPRESSION',
      detail: 'no predicate supplied for this policy',
    });
  } else {
    const problems = validateExpression(input.predicate);
    if (problems.length > 0) {
      for (const p of problems) {
        faults.push({
          kind: p.includes('unknown operator') ? 'UNKNOWN_OPERATOR' : 'MALFORMED_EXPRESSION',
          detail: p,
        });
      }
    } else {
      truth = evaluateExpression(input.predicate, input.subject, faults);
    }
  }

  // 4. The §6.3 defeating context, evaluated the same way and never inferred.
  let defeated: Truth | undefined;
  if (input.defeatingContext !== undefined) {
    const problems = validateExpression(input.defeatingContext);
    if (problems.length > 0) {
      for (const p of problems) {
        faults.push({
          kind: p.includes('unknown operator') ? 'UNKNOWN_OPERATOR' : 'MALFORMED_EXPRESSION',
          detail: `defeating context: ${p}`,
        });
      }
      defeated = 'UNKNOWN';
    } else {
      defeated = evaluateExpression(input.defeatingContext, input.subject, faults);
    }
  }

  // 5. The RESTRICTED disposition, read from the policy record itself — never
  //    from the caller, so it cannot be spoofed per-evaluation.
  const restricted =
    record.disposition.status === 'DECLARED' && record.disposition.value === 'RESTRICTED';

  const outcome = deriveOutcome(truth, faults, {
    defeated,
    contextUnreadable: input.contextUnreadable === true,
    restrictedDisposition: restricted,
  });

  return {
    policy: policyRef,
    outcome,
    truth,
    faults,
    asOf: input.asOf,
    terminalNonViolating: (TERMINAL_NON_VIOLATING_OUTCOMES as readonly OutcomeClass[]).includes(
      outcome,
    ),
    responseWarranted: input.responseWarranted === true,
    // Only where the RESTRICTED policy was actually constituted. A RESTRICTED
    // policy that is NOT constituted carries no conditions — nothing entered it.
    presentationConditionsApply: restricted && outcome === 'APPLICABLE_NO_VIOLATION' && truth === 'TRUE',
  };
}

/** Optional context for {@link deriveOutcome}. Absent fields mean "not supplied". */
export interface OutcomeContext {
  /** Truth of the §6.3 defeating-context predicate, when one was supplied. */
  readonly defeated?: Truth;
  /** CTX-1 / PT-13: decisive context present but unreadable. */
  readonly contextUnreadable?: boolean;
  /**
   * True when the policy's own `disposition` is `RESTRICTED` (Owner decision
   * 2026-08-16, option b). Read from the policy record, never supplied by a
   * caller as a judgement.
   */
  readonly restrictedDisposition?: boolean;
}

/**
 * Maps a three-valued predicate result onto a §4 outcome class.
 *
 * The mapping is deliberately conservative in one direction only: **no fault
 * path can produce `VIOLATION`, and no fault path can produce a silent
 * `NOT_APPLICABLE`.** A fault always lands on a terminal non-violating outcome
 * that is recorded (OUT-1, OUT-2).
 *
 * Order matters, and each step cites its rule:
 *
 *  1. Any fault            → `INSUFFICIENT_EVIDENCE`  (OUT-1; a blocked Legal
 *                            dependency is a fault, so it can become neither an
 *                            allow nor a deny)
 *  2. `contextUnreadable`  → `INDETERMINATE_CONTEXT`  (CTX-1: "never a violation")
 *  3. constitutive FALSE   → `NOT_APPLICABLE`         (§4: "the default")
 *  4. constitutive UNKNOWN → `INSUFFICIENT_EVIDENCE`  (GA-9: uncertainty resolves
 *                            toward the reversible option, never toward a finding)
 *  5. defeat TRUE          → `APPLICABLE_NO_VIOLATION` (§6.3, §4: "the behavior is
 *                            present, but context defeats it")
 *  6. defeat UNKNOWN       → `INSUFFICIENT_EVIDENCE`  (an unread defeat is NOT an
 *                            absent defeat — the difference between a recorded
 *                            uncertainty and a manufactured violation)
 *  7. RESTRICTED policy    → `APPLICABLE_NO_VIOLATION` (Owner decision 2026-08-16,
 *                            option b: "permitted subject to conditions"
 *                            establishes no violation. §18 case 3 records the
 *                            result as "`RESTRICTED`, not a violation". The
 *                            attribute `presentationConditionsApply` carries the
 *                            "conditions" half; it is metadata, not an action)
 *  8. otherwise            → `VIOLATION`
 *
 * `DISPUTED` is not produced here by design, and the Owner re-confirmed it on
 * 2026-08-16: §9.6 makes it a case-level factual judgement, not a predicate
 * result. Unresolvable records stay on the INSUFFICIENT_EVIDENCE /
 * INDETERMINATE_CONTEXT paths.
 */
export function deriveOutcome(
  truth: Truth,
  faults: readonly EvaluationFault[],
  context: OutcomeContext = {},
): OutcomeClass {
  if (faults.length > 0) return 'INSUFFICIENT_EVIDENCE';
  if (context.contextUnreadable === true) return 'INDETERMINATE_CONTEXT';
  if (truth === 'FALSE') return 'NOT_APPLICABLE';
  if (truth !== 'TRUE') return 'INSUFFICIENT_EVIDENCE';
  if (context.defeated === 'TRUE') return 'APPLICABLE_NO_VIOLATION';
  if (context.defeated === 'UNKNOWN') return 'INSUFFICIENT_EVIDENCE';
  if (context.restrictedDisposition === true) return 'APPLICABLE_NO_VIOLATION';
  return 'VIOLATION';
}
