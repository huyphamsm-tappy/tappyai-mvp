/**
 * The activation guard.
 *
 * ============================================================================
 * WHAT IT IS FOR
 * ============================================================================
 * The safety machinery is built and tested, but switching it on in production
 * requires answers nobody has given yet. This guard refuses activation while
 * those answers are missing, and — just as importantly — says WHY in a way that
 * cannot be mistaken for a safety finding.
 *
 * ============================================================================
 * FAILS CLOSED, BUT NEVER LIES
 * ============================================================================
 * Two different failures must never be conflated:
 *
 *   "activation is blocked because configuration is incomplete"
 *   "this content violated a policy"
 *
 * The first is a statement about US. The second is a statement about a user.
 * Collapsing them would let an unfinished configuration read as an accusation,
 * which is precisely the harm the corpus's notice rules exist to prevent.
 *
 * So the guard reports a `BlockedActivation` with a machine-readable reason, and
 * nothing in it is a policy outcome, a severity, or an action.
 */

import { PUBLICATION_GATE_RULES, unresolvedPolicies } from './publicationGate';

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

/**
 * Everything that must be true before the gate may run in production.
 *
 * Each is a fact about the SYSTEM, never about a piece of content.
 */
export const ACTIVATION_PRECONDITIONS = [
  /** Every policy's publication authority has been decided by Product/Legal. */
  'GATE_RULES_RESOLVED',
  /** The lifecycle columns exist in the database. */
  'SCHEMA_MIGRATED',
  /** Product has explicitly turned the gate on. */
  'ACTIVATION_ENABLED',
] as const;
export type ActivationPrecondition = (typeof ACTIVATION_PRECONDITIONS)[number];

export interface ActivationEnvironment {
  /** True once `20260817_content_safety_gate.sql` has been applied. */
  readonly schemaMigrated?: boolean;
  /** Product's explicit switch. Absent means off. */
  readonly activationEnabled?: boolean;
}

export type ActivationStatus =
  | { readonly active: true }
  | {
      readonly active: false;
      /** Which preconditions are unmet. Never empty when inactive. */
      readonly unmet: readonly ActivationPrecondition[];
      /**
       * Policies whose publication authority is undecided. Present so the
       * blocker can be read without guessing which decision is missing.
       */
      readonly unresolvedPolicies: readonly string[];
      /**
       * 🚨 Always false. Exists so any consumer that might be tempted to render
       * this as an accusation has an explicit, testable "this is not that".
       */
      readonly isSafetyFinding: false;
    };

/**
 * May the gate run in production?
 *
 * Fails closed: anything unmet, or an environment that says nothing, yields
 * inactive. There is no path where an absent answer becomes a yes.
 */
export function activationStatus(env: ActivationEnvironment = {}): ActivationStatus {
  const unmet: ActivationPrecondition[] = [];
  const unresolved = unresolvedPolicies();

  if (unresolved.length > 0) unmet.push('GATE_RULES_RESOLVED');
  if (env.schemaMigrated !== true) unmet.push('SCHEMA_MIGRATED');
  if (env.activationEnabled !== true) unmet.push('ACTIVATION_ENABLED');

  if (unmet.length === 0) return { active: true };

  return {
    active: false,
    unmet,
    unresolvedPolicies: unresolved,
    isSafetyFinding: false,
  };
}

/**
 * A sentence describing the blocker, for an operator log — never for an author.
 *
 * 🚨 It deliberately contains no content id, no user, and no policy outcome. If
 * this string ever reaches an author it must still be impossible to read as an
 * accusation, which is why it talks only about configuration.
 */
export function activationBlockerSummary(status: ActivationStatus): string {
  if (status.active) return 'Content safety gate: active.';
  const parts = [`Content safety gate: NOT ACTIVE (${status.unmet.join(', ')}).`];
  if (status.unresolvedPolicies.length > 0) {
    parts.push(
      `Publication authority undecided for: ${status.unresolvedPolicies.join(', ')}. This is a configuration gap, not a finding about any content.`,
    );
  }
  return parts.join(' ');
}

/**
 * The publication state to use while the gate is not active.
 *
 * 🔑 `null` — meaning "the gate did not decide" — and NOT `UNDER_REVIEW`.
 * Writing `UNDER_REVIEW` would hold every upload on the strength of a
 * configuration gap, which is the block-all default the design forbids. Leaving
 * it null keeps new content on exactly the behaviour it has today, and the
 * access-control layer already treats null as legacy.
 *
 * This is the whole reason the guard exists: an unfinished configuration must
 * change nothing, in either direction, until Product decides.
 */
export function publicationStateWhileInactive(): null {
  return null;
}

/** True when every policy has a decided publication authority. */
export function gateRulesAreResolved(): boolean {
  return Object.values(PUBLICATION_GATE_RULES).every((rule) => rule !== 'UNRESOLVED');
}

// ---------------------------------------------------------------------------
// Production configuration
// ---------------------------------------------------------------------------

/**
 * The activation environment, read from configuration.
 *
 * Both switches are opt-in and default to off: an unset variable, a typo, or a
 * value like `"false"` all leave the gate closed. Only the exact string `true`
 * turns a precondition on, so nothing ambiguous can activate it.
 *
 * `CONTENT_SAFETY_GATE_ENABLED` is the runtime switch the rollback procedure
 * flips; `CONTENT_SAFETY_SCHEMA_MIGRATED` records that the lifecycle columns
 * exist. They are separate because a deploy can happen before a migration and
 * the gate must not run against columns that are not there.
 */
export function activationEnvironmentFromConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ActivationEnvironment {
  return {
    activationEnabled: env.CONTENT_SAFETY_GATE_ENABLED === 'true',
    schemaMigrated: env.CONTENT_SAFETY_SCHEMA_MIGRATED === 'true',
  };
}

/** Is the gate active right now, per configuration? */
export function gateIsActive(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return activationStatus(activationEnvironmentFromConfig(env)).active;
}
