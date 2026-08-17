/**
 * The publication gate — a layer ABOVE per-policy results.
 *
 * ============================================================================
 * WHY THIS LAYER EXISTS
 * ============================================================================
 * A policy result answers "is this policy constituted?". It does not answer
 * "may this be published?". Those are different questions with different
 * owners: the first belongs to the corpus, the second to Product.
 *
 * Collapsing them produced a real bug. `ts.hate.protected-target-abuse` is Legal
 * blocked, so it can never return anything but "cannot tell" — and when every
 * policy result was treated as a publication blocker, that one permanently
 * blocked every upload. Not because anything unsafe was found, but because one
 * policy is unanswerable.
 *
 * The fix is not to weaken that policy or to hide it. It is to stop assuming
 * that a policy result is a publication decision.
 *
 * ============================================================================
 * THE UNRESOLVED STATE IS STILL THE POINT
 * ============================================================================
 * Whether a Legal-blocked policy should block Explore publication is a Product
 * and Legal question. For `ts.hate.protected-target-abuse` the Owner answered it
 * on 2026-08-17 (Option B) — but the mechanism stays, because the next policy
 * added will arrive undecided and must not be assumed either way.
 *
 * An undecided rule produces `CONFIGURATION_REQUIRED` — deliberately neither
 * "publish" nor "under review for safety reasons".
 *
 * 🚨 UNRESOLVED MUST NOT COLLAPSE IN EITHER DIRECTION. Defaulting to publish
 * would be inventing a Legal answer. Defaulting to block, silently, would be
 * inventing a Product answer and would look identical to a safety hold. So it
 * gets its own value, content does not become public, and the reason travels
 * with the result.
 */

import type { PolicyOutcomeLine } from './safetyResult';

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** What a policy's result is authorised to do to publication. */
export const GATE_RULES = [
  'BLOCKS_PUBLICATION',
  'DOES_NOT_BLOCK_PUBLICATION',
  /** Nobody has decided. Neither allow nor block may be assumed. */
  'UNRESOLVED',
] as const;
export type GateRule = (typeof GATE_RULES)[number];

/**
 * Per-policy publication authority.
 *
 * 🔑 Written out policy by policy, with no default. A policy missing from this
 * table is a configuration gap, not an implicit allow — {@link ruleFor} returns
 * `UNRESOLVED` for anything it does not recognise.
 *
 * 🔑 `ts.hate.protected-target-abuse` carries an explicit Product decision — see
 * {@link GATE_RULE_DECISIONS}. It changed this policy's publication authority
 * and nothing else: the policy is still Legal blocked and still reports
 * `LEGAL_REVIEW_REQUIRED` at the policy layer.
 */
export const PUBLICATION_GATE_RULES: Readonly<Record<string, GateRule>> = Object.freeze({
  // Seventeen policies whose results speak for themselves: if one is
  // constituted, that is a safety finding and it blocks publication.
  'ts.violence.graphic-harm': 'BLOCKS_PUBLICATION',
  'ts.violence.incitement-threats': 'BLOCKS_PUBLICATION',
  'ts.selfharm.promotion': 'BLOCKS_PUBLICATION',
  'ts.danger.harmful-activity': 'BLOCKS_PUBLICATION',
  'ts.graphic.presentation': 'BLOCKS_PUBLICATION',
  'ts.child.sexual-exploitation': 'BLOCKS_PUBLICATION',
  'ts.child.sexualization': 'BLOCKS_PUBLICATION',
  'ts.child.grooming': 'BLOCKS_PUBLICATION',
  'ts.child.abuse-harm': 'BLOCKS_PUBLICATION',
  'ts.sexual.exploitation-nonconsent': 'BLOCKS_PUBLICATION',
  'ts.sexual.adult-content': 'BLOCKS_PUBLICATION',
  'ts.harassment.targeted': 'BLOCKS_PUBLICATION',
  'ts.privacy.personal-information': 'BLOCKS_PUBLICATION',
  'ts.animal.cruelty': 'BLOCKS_PUBLICATION',
  'ts.deception.harmful': 'BLOCKS_PUBLICATION',
  'ts.fraud.scam': 'BLOCKS_PUBLICATION',
  'ts.platform.abuse-manipulation': 'BLOCKS_PUBLICATION',

  // ✅ PRODUCT DECISION, Owner, 2026-08-17 — OPTION B.
  //
  // The policy is Legal blocked at G02-D-07b, so it can never produce anything
  // but "cannot tell". Product decided that this unanswerable state must not
  // hold every upload, and set its publication authority accordingly.
  //
  // 🚨 WHAT THIS DECISION IS NOT:
  //   · it does NOT resolve `G02-D-07b` — that remains unresolved
  //   · it does NOT define `PROTECTED_TARGET_SET` — none is defined anywhere
  //   · it does NOT change the policy's own result, which stays Legal blocked
  //     and continues to surface as `LEGAL_REVIEW_REQUIRED` at the policy layer
  //   · it is NOT a Legal ratification and must never be described as one
  //
  // It changes exactly one thing: whether this policy's result gates
  // publication. `LEGAL_REVIEW_REQUIRED` at the policy layer no longer means an
  // automatic publication block.
  'ts.hate.protected-target-abuse': 'DOES_NOT_BLOCK_PUBLICATION',
});

/**
 * The record of who decided what, and what they explicitly did not decide.
 *
 * Exported so the decision is auditable from code and assertable by a test,
 * rather than living only in a commit message.
 */
export const GATE_RULE_DECISIONS: readonly {
  readonly policy: string;
  readonly rule: GateRule;
  readonly decidedBy: string;
  readonly decidedOn: string;
  readonly doesNotResolve: readonly string[];
}[] = Object.freeze([
  {
    policy: 'ts.hate.protected-target-abuse',
    rule: 'DOES_NOT_BLOCK_PUBLICATION',
    decidedBy: 'Product Owner — explicit decision, Option B',
    decidedOn: '2026-08-17',
    doesNotResolve: [
      'G02-D-07b',
      'PROTECTED_TARGET_SET',
      'the policy result itself, which remains Legal blocked',
    ],
  },
]);

export function ruleFor(policy: string): GateRule {
  return PUBLICATION_GATE_RULES[policy] ?? 'UNRESOLVED';
}

/** Policies whose publication authority nobody has decided. */
export function unresolvedPolicies(): readonly string[] {
  return Object.entries(PUBLICATION_GATE_RULES)
    .filter(([, rule]) => rule === 'UNRESOLVED')
    .map(([policy]) => policy);
}

// ---------------------------------------------------------------------------
// Which results are blocking at all
// ---------------------------------------------------------------------------

/**
 * Outcomes that mean "this policy did not stand in the way".
 *
 * Everything else — a violation, uncertainty, a Legal block, an engine error —
 * is a result that COULD block, and whether it actually does is then decided by
 * that policy's rule. Separating "could" from "does" is the whole design.
 */
const NON_BLOCKING_OUTCOMES: readonly string[] = ['NOT_APPLICABLE', 'APPLICABLE_NO_VIOLATION'];

export function isBlockingResult(line: PolicyOutcomeLine): boolean {
  return !NON_BLOCKING_OUTCOMES.includes(line.outcome);
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export const PUBLICATION_DECISIONS = [
  'PUBLISHED',
  'UNDER_REVIEW',
  'RESTRICTED',
  /** A policy that could block has no decided rule. Neither allow nor block. */
  'CONFIGURATION_REQUIRED',
] as const;
export type PublicationDecision = (typeof PUBLICATION_DECISIONS)[number];

export interface GateOutcome {
  readonly decision: PublicationDecision;
  /** Policies that actually blocked, with the rule that let them. */
  readonly blockedBy: readonly string[];
  /** Policies that could have blocked but have no decided rule. */
  readonly unresolved: readonly string[];
  /**
   * Policies whose results were set aside by an explicit
   * `DOES_NOT_BLOCK_PUBLICATION` rule. Recorded so a deliberate exclusion is
   * never invisible.
   */
  readonly notBlocking: readonly string[];
}

/**
 * Aggregate per-policy results into one publication decision.
 *
 * Order and each step's ground:
 *
 *  1. a constituted policy WITH a blocking rule → `RESTRICTED`
 *     (a real finding, and Product has said this policy may act on it)
 *  2. any policy that could block but has no rule → `CONFIGURATION_REQUIRED`
 *     (checked BEFORE the ordinary hold, so a configuration gap is never
 *      disguised as a safety hold)
 *  3. any other blocking result with a blocking rule → `UNDER_REVIEW`
 *  4. otherwise → `PUBLISHED`
 *
 * 🚨 There is no "most severe wins" and no implicit precedence between policies.
 * Each result is consulted against its own rule; nothing is ranked.
 */
export function aggregatePublication(lines: readonly PolicyOutcomeLine[]): GateOutcome {
  return aggregateWithRules(lines, {});
}

/**
 * What to store for a gate decision.
 *
 * `CONFIGURATION_REQUIRED` stores `UNDER_REVIEW`: content does not become public
 * while a rule is undecided, because publishing would be inventing the answer.
 * The distinction survives in `safety_state` and in every report — this function
 * narrows the value for a column that has only three legal values, and nothing
 * else reads it to decide meaning.
 */
export function storedStateFor(
  decision: PublicationDecision,
): 'PUBLISHED' | 'UNDER_REVIEW' | 'RESTRICTED' {
  if (decision === 'PUBLISHED') return 'PUBLISHED';
  if (decision === 'RESTRICTED') return 'RESTRICTED';
  return 'UNDER_REVIEW';
}

/**
 * A configuration in which a policy is declared not to block publication.
 *
 * Exists so a configuration can be explored in a test without changing what
 * production uses. Production always reads {@link PUBLICATION_GATE_RULES}; an
 * override passed here never reaches it.
 */
export function aggregateWithRules(
  lines: readonly PolicyOutcomeLine[],
  overrides: Readonly<Record<string, GateRule>>,
): GateOutcome {
  const merged: Record<string, GateRule> = { ...PUBLICATION_GATE_RULES, ...overrides };

  const blockedBy: string[] = [];
  const unresolved: string[] = [];
  const notBlocking: string[] = [];
  let restricted = false;

  for (const line of lines) {
    if (!isBlockingResult(line)) continue;
    const rule = merged[line.policy] ?? 'UNRESOLVED';
    if (rule === 'UNRESOLVED') unresolved.push(line.policy);
    else if (rule === 'DOES_NOT_BLOCK_PUBLICATION') notBlocking.push(line.policy);
    else {
      blockedBy.push(line.policy);
      if (line.outcome === 'VIOLATION') restricted = true;
    }
  }

  const decision: PublicationDecision = restricted
    ? 'RESTRICTED'
    : unresolved.length > 0
      ? 'CONFIGURATION_REQUIRED'
      : blockedBy.length > 0
        ? 'UNDER_REVIEW'
        : 'PUBLISHED';

  return { decision, blockedBy, unresolved, notBlocking };
}
