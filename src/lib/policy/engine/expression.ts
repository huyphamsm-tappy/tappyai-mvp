/**
 * Serialisable predicate grammar.
 *
 * PRECEDENT_POLICY_AS_DATA.md §3 is the binding constraint:
 *
 *   "If a future project wants rules that are genuinely data, every predicate
 *    must be a serialisable expression the engine interprets, with no executable
 *    member at any depth — and that must be enforced by a test, not by
 *    convention. A closed, finite operator set is the price. An open one is how
 *    a data format quietly becomes a scripting language."
 *
 * Consequences encoded here:
 *   - No member of an Expression may be a function. Enforced by
 *     `assertNoExecutableMember` and by a test, not by convention.
 *   - The operator set is closed and finite. Adding an operator is a deliberate
 *     edit to OPERATORS, not an extension point.
 *   - §3.1: an unknown operator denies. It never skips and never passes.
 */

// ---------------------------------------------------------------------------
// Operand
// ---------------------------------------------------------------------------

/** A reference to a field on the evaluation subject, e.g. `content.language`. */
export interface FieldRef {
  readonly ref: string;
}

/** A literal value. Only JSON scalars and arrays of scalars are permitted. */
export type Literal = string | number | boolean | null | readonly (string | number | boolean)[];

export type Operand = FieldRef | { readonly value: Literal };

export function isFieldRef(o: Operand): o is FieldRef {
  return typeof o === 'object' && o !== null && 'ref' in o;
}

// ---------------------------------------------------------------------------
// The closed operator set
// ---------------------------------------------------------------------------

export const COMPARISON_OPERATORS = [
  'eq',
  'neq',
  'in',
  'notIn',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'startsWith',
  'endsWith',
  'exists',
  'missing',
] as const;

export const LOGICAL_OPERATORS = ['and', 'or', 'not'] as const;

export const OPERATORS = [...COMPARISON_OPERATORS, ...LOGICAL_OPERATORS] as const;

export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];
export type LogicalOperator = (typeof LOGICAL_OPERATORS)[number];
export type Operator = (typeof OPERATORS)[number];

export function isKnownOperator(op: string): op is Operator {
  return (OPERATORS as readonly string[]).includes(op);
}

// ---------------------------------------------------------------------------
// Expression
// ---------------------------------------------------------------------------

export interface ComparisonExpression {
  readonly op: ComparisonOperator;
  readonly left: Operand;
  /** Absent for the unary operators `exists` / `missing`. */
  readonly right?: Operand;
}

export interface AndExpression {
  readonly op: 'and';
  readonly all: readonly Expression[];
}

export interface OrExpression {
  readonly op: 'or';
  readonly any: readonly Expression[];
}

export interface NotExpression {
  readonly op: 'not';
  readonly expr: Expression;
}

export type Expression = ComparisonExpression | AndExpression | OrExpression | NotExpression;

// ---------------------------------------------------------------------------
// Three-valued result
// ---------------------------------------------------------------------------

/**
 * Kleene three-valued logic.
 *
 * `UNKNOWN` is first-class and must never be collapsed to `false`. The taxonomy
 * takes the same position at case level: §4 makes `INSUFFICIENT_EVIDENCE`,
 * `DISPUTED` and `INDETERMINATE_CONTEXT` terminal outcomes rather than soft
 * violations (OUT-1). A predicate that cannot be decided is not a predicate that
 * failed.
 */
export type Truth = 'TRUE' | 'FALSE' | 'UNKNOWN';

export function andTruth(values: readonly Truth[]): Truth {
  if (values.includes('FALSE')) return 'FALSE';
  if (values.includes('UNKNOWN')) return 'UNKNOWN';
  return 'TRUE';
}

export function orTruth(values: readonly Truth[]): Truth {
  if (values.includes('TRUE')) return 'TRUE';
  if (values.includes('UNKNOWN')) return 'UNKNOWN';
  return 'FALSE';
}

export function notTruth(value: Truth): Truth {
  if (value === 'TRUE') return 'FALSE';
  if (value === 'FALSE') return 'TRUE';
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Structural validation — the §3 guarantee
// ---------------------------------------------------------------------------

export class ExpressionStructureError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(`${message} (at ${path})`);
    this.name = 'ExpressionStructureError';
  }
}

/**
 * Walks an arbitrary value and throws if any member, at any depth, is a
 * function. This is the mechanical enforcement PRECEDENT §3 demands.
 */
export function assertNoExecutableMember(value: unknown, path = '$'): void {
  if (typeof value === 'function') {
    throw new ExpressionStructureError('Executable member found; predicates must be pure data', path);
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoExecutableMember(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assertNoExecutableMember(v, `${path}.${k}`);
    }
  }
}

/**
 * Validates that an expression conforms to the closed grammar.
 *
 * Returns the list of problems rather than throwing on the first, so a policy
 * author sees every error at once.
 */
export function validateExpression(expr: unknown, path = '$'): string[] {
  const problems: string[] = [];

  if (!expr || typeof expr !== 'object' || Array.isArray(expr)) {
    return [`${path}: expression must be an object`];
  }

  const op = (expr as { op?: unknown }).op;
  if (typeof op !== 'string') {
    return [`${path}: missing string 'op'`];
  }

  if (!isKnownOperator(op)) {
    // §3.1 — an unknown operator is a hard structural error, never ignored.
    return [`${path}: unknown operator '${op}' (operator set is closed)`];
  }

  if (op === 'and' || op === 'or') {
    const key = op === 'and' ? 'all' : 'any';
    const branches = (expr as Record<string, unknown>)[key];
    if (!Array.isArray(branches)) {
      problems.push(`${path}: '${op}' requires an array '${key}'`);
    } else if (branches.length === 0) {
      problems.push(`${path}: '${op}' requires at least one branch`);
    } else {
      branches.forEach((b, i) => problems.push(...validateExpression(b, `${path}.${key}[${i}]`)));
    }
    return problems;
  }

  if (op === 'not') {
    const inner = (expr as { expr?: unknown }).expr;
    if (inner === undefined) problems.push(`${path}: 'not' requires 'expr'`);
    else problems.push(...validateExpression(inner, `${path}.expr`));
    return problems;
  }

  // Comparison operators.
  const left = (expr as { left?: unknown }).left;
  const right = (expr as { right?: unknown }).right;
  problems.push(...validateOperand(left, `${path}.left`));

  const unary = op === 'exists' || op === 'missing';
  if (unary) {
    if (right !== undefined) problems.push(`${path}: '${op}' is unary and must not carry 'right'`);
  } else if (right === undefined) {
    problems.push(`${path}: '${op}' requires 'right'`);
  } else {
    problems.push(...validateOperand(right, `${path}.right`));
  }

  return problems;
}

function validateOperand(operand: unknown, path: string): string[] {
  if (!operand || typeof operand !== 'object' || Array.isArray(operand)) {
    return [`${path}: operand must be {ref} or {value}`];
  }
  const hasRef = 'ref' in operand;
  const hasValue = 'value' in operand;
  if (hasRef === hasValue) {
    return [`${path}: operand must have exactly one of 'ref' or 'value'`];
  }
  if (hasRef && typeof (operand as FieldRef).ref !== 'string') {
    return [`${path}: 'ref' must be a string path`];
  }
  if (hasValue) {
    const v = (operand as { value: unknown }).value;
    const scalar = (x: unknown) =>
      x === null || ['string', 'number', 'boolean'].includes(typeof x);
    if (!scalar(v) && !(Array.isArray(v) && v.every(scalar))) {
      return [`${path}: 'value' must be a JSON scalar or array of scalars`];
    }
  }
  return [];
}
