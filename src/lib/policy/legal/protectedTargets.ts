/**
 * PROTECTED_TARGET_SET — Legal dependency boundary (`G02-D-07b`).
 *
 * ============================================================================
 * THIS VALUE DOES NOT EXIST YET AND MUST NOT BE INVENTED.
 * ============================================================================
 *
 * Owner decision D2 (2026-08-16): protected targets are **PENDING LEGAL**.
 *   - It is forbidden to add or remove a target.
 *   - It is specifically forbidden to unilaterally exclude "political opinion".
 *   - No placeholder, sample, default, empty set or "reasonable guess" may be
 *     substituted. An empty array is NOT a safe default here: it would silently
 *     turn a protected-target policy into a no-op.
 *
 * This module is the **only** place the rest of the system may learn what the
 * protected target set is. Everything downstream depends on the interface, not
 * on a value. When Legal delivers `G02-D-07b`, a new provider is registered here
 * and nothing else in the architecture changes — no engine change, no schema
 * change, no service change, no test rewrite.
 *
 * Consumers: `ts.hate.protected-target-abuse` (`decisive_dimensions` and
 * `severity_envelope` are OPEN pending this decision).
 */

/** The blocking decision id, quoted so it is greppable. */
export const PROTECTED_TARGET_DECISION_ID = 'G02-D-07b' as const;

export interface ProtectedTarget {
  /** Stable machine key, supplied by Legal. */
  readonly key: string;
  /** Human-readable label, supplied by Legal. */
  readonly label: string;
}

/**
 * The result of asking for the protected target set.
 *
 * Deliberately a discriminated union rather than `ProtectedTarget[] | null`, so
 * that a caller cannot accidentally treat "not yet decided" as "none".
 */
export type ProtectedTargetSetResult =
  | { readonly state: 'AVAILABLE'; readonly targets: readonly ProtectedTarget[]; readonly sourceVersion: string }
  | { readonly state: 'BLOCKED'; readonly blockedBy: string; readonly reason: string };

export interface ProtectedTargetSetProvider {
  get(): ProtectedTargetSetResult;
}

/**
 * The provider in force today: the set is undecided and every caller is told so
 * explicitly.
 *
 * This is not a stub to be "filled in later" — it is the correct, honest
 * implementation of the current state, and it is what makes the blocked
 * dependency visible at runtime instead of hidden behind a default.
 */
export class BlockedProtectedTargetSetProvider implements ProtectedTargetSetProvider {
  get(): ProtectedTargetSetResult {
    return {
      state: 'BLOCKED',
      blockedBy: PROTECTED_TARGET_DECISION_ID,
      reason:
        'PROTECTED_TARGET_SET is pending Legal review (Owner decision D2). ' +
        'No value may be assumed, defaulted or inferred.',
    };
  }
}

/**
 * The provider Legal's answer will be delivered through.
 *
 * Constructing it requires a non-empty target list and a source version, so the
 * decision can be cited in an audit record (PRECEDENT §3.1: a decision must
 * record the id + version of what produced it).
 */
export class ResolvedProtectedTargetSetProvider implements ProtectedTargetSetProvider {
  constructor(
    private readonly targets: readonly ProtectedTarget[],
    private readonly sourceVersion: string,
  ) {
    if (targets.length === 0) {
      throw new Error(
        'ResolvedProtectedTargetSetProvider requires a non-empty target set. ' +
          'An empty set is not a resolution of ' +
          PROTECTED_TARGET_DECISION_ID +
          ' — use BlockedProtectedTargetSetProvider while the decision is open.',
      );
    }
    if (!sourceVersion.trim()) {
      throw new Error('ResolvedProtectedTargetSetProvider requires a sourceVersion for audit citation.');
    }
  }

  get(): ProtectedTargetSetResult {
    return { state: 'AVAILABLE', targets: this.targets, sourceVersion: this.sourceVersion };
  }
}

/**
 * The process-wide default. Swapping this line is the entire integration cost of
 * Legal's answer.
 */
let activeProvider: ProtectedTargetSetProvider = new BlockedProtectedTargetSetProvider();

export function getProtectedTargetSet(): ProtectedTargetSetResult {
  return activeProvider.get();
}

/** Test seam and future injection point. */
export function setProtectedTargetSetProvider(provider: ProtectedTargetSetProvider): void {
  activeProvider = provider;
}

export function resetProtectedTargetSetProvider(): void {
  activeProvider = new BlockedProtectedTargetSetProvider();
}

/**
 * True when a policy cannot be fully evaluated because this dependency is open.
 *
 * Callers use this to degrade *explicitly* — see the fallback rules in
 * `../engine/evaluator.ts`, which map a blocked dependency onto a terminal
 * non-violating outcome rather than onto a violation or a silent pass.
 */
export function isProtectedTargetSetBlocked(): boolean {
  return getProtectedTargetSet().state === 'BLOCKED';
}
