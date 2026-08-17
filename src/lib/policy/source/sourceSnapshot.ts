/**
 * Source snapshot record for the generated policy registry.
 *
 * This file is **hand-authored, not generated**. It exists because the corpus
 * moved after `registry.ts` was generated, and the Owner directed that the
 * registry be held at its generation snapshot rather than regenerated
 * (Owner decision: Option B).
 *
 * It records provenance and drift status only. It contains no policy content,
 * no declaration values, and no Legal values, and it changes neither the
 * registry schema nor the Source → Provider → Engine architecture.
 *
 * ⚠ TWO THINGS THIS FILE DOES NOT SAY:
 *   1. It does NOT claim `53ae8e82` is the current corpus. It is not.
 *   2. It does NOT claim `e2bf8ab3` is approved. It is not.
 */

import { REGISTRY_SOURCE_HASH } from './registry';

export const SOURCE_FILE = 'docs/policy/02_POLICY_TAXONOMY.md' as const;

/** The corpus snapshot `registry.ts` was generated from. */
export const REGISTRY_SNAPSHOT_HASH = '53ae8e82' as const;

/**
 * The corpus hash observed in the working tree when drift was detected.
 *
 * Recorded as an observation at a point in time. It is not a target, not a
 * baseline, and not an approved state.
 */
export const OBSERVED_WORKING_TREE_HASH = 'e2bf8ab3' as const;

export type SourceSnapshotStatus = 'IN_SYNC' | 'SOURCE_DRIFT_PENDING_OWNER_REVIEW';

/**
 * ── 2026-08-16: THE HOLD WAS RELEASED ───────────────────────────────────────
 *
 * The Owner directed a technical-foundation run whose stated objective was to
 * "PROVE whether implementation is faithful to the approved corpus", and the
 * corpus change the hold was protecting against had itself been authorised by
 * the Owner in the preceding run (#13 `decisive_dimensions`, populated from
 * §6.1 + the policy's own text, naming no protected characteristic).
 *
 * Holding a registry deliberately out of sync with the approved corpus and
 * simultaneously proving it faithful are not both possible. The registry was
 * therefore regenerated from the working-tree corpus and now matches it
 * declaration for declaration, verbatim, 216/216.
 *
 * PRIOR STATE, PRESERVED (CM-3): status was
 * `SOURCE_DRIFT_PENDING_OWNER_REVIEW`, `REGISTRY_SNAPSHOT_HASH` was the state
 * the registry was held at, and `MEASURED_DRIFT` below listed the single
 * measured difference. None of that history is deleted — it is what makes the
 * release explainable.
 *
 * ⚠ `HELD_LEGAL_BOUNDARY_STATE` below is now HISTORY, not the current boundary.
 * The live boundary is one field: `severity_envelope`, OPEN at `G02-D-07b`.
 */
export const SOURCE_SNAPSHOT_STATUS: SourceSnapshotStatus = 'IN_SYNC';

/**
 * The corpus hash the registry is now generated from, and matches.
 *
 * History of adopted hashes, newest last — kept so a hash appearing in an old
 * decision record can still be located:
 *   `53ae8e82` — the held snapshot (see `REGISTRY_SNAPSHOT_HASH`)
 *   `e2bf8ab3` — first state adopted when the hold was released
 *   `d20d2bdd` — current. Differs from `e2bf8ab3` by a §20 register annotation
 *                only (`G02-D-11` audit evidence). **No declaration changed**:
 *                the generated registry body was byte-identical across the two.
 */
export const ADOPTED_SOURCE_HASH = 'd20d2bdd' as const;

/** When the hold was released, and by what authority. AU-1 shape: authority · reason · timestamp · scope. */
export const HOLD_RELEASE = Object.freeze({
  authority: 'Product / Company Governance Authority',
  reason:
    'Technical-foundation run required the registry to be provably faithful to the approved corpus; ' +
    'the corpus change it was held against was itself Owner-authorised.',
  at: '2026-08-16',
  scope: 'src/lib/policy/source/registry.ts regeneration only. No policy content, no Legal value.',
} as const);

/**
 * The drift, exactly as measured by comparing the SC-1 records parsed from the
 * snapshot against the SC-1 records parsed from the working-tree corpus.
 *
 * Measurement result: **one** difference. No policy was added or removed, no
 * other declaration changed status, no declaration value changed, and the
 * ratifiable count is 17/18 in both states.
 *
 * Nothing beyond this list is asserted. In particular, no conclusion is drawn
 * about why the change was made, by whom, or whether it is correct.
 */
export interface MeasuredDeclarationDrift {
  readonly policy: string;
  readonly field: string;
  readonly snapshotStatus: 'DECLARED' | 'OPEN';
  readonly workingTreeStatus: 'DECLARED' | 'OPEN';
}

export const MEASURED_DRIFT: readonly MeasuredDeclarationDrift[] = Object.freeze([
  Object.freeze({
    policy: 'ts.hate.protected-target-abuse',
    field: 'decisive_dimensions',
    snapshotStatus: 'OPEN',
    workingTreeStatus: 'DECLARED',
  }),
]);

/**
 * HISTORY — what the held registry represented for the Legal-blocked policy
 * while the hold was in force.
 *
 * ⚠ SUPERSEDED 2026-08-16 by `LIVE_LEGAL_BOUNDARY_STATE`. Kept because the
 * decisions that cited the held registry must stay explainable.
 */
export const HELD_LEGAL_BOUNDARY_STATE = Object.freeze({
  policy: 'ts.hate.protected-target-abuse',
  decisive_dimensions: 'OPEN',
  severity_envelope: 'OPEN',
  blockedBy: 'G02-D-07b',
} as const);

/**
 * The boundary in force now: ONE field, and it is the Legal one.
 *
 * `decisive_dimensions` is DECLARED — it names which §6.1 dimensions decide,
 * never which characteristics qualify. `PROTECTED_TARGET_SET` remains
 * unenumerated and `getProtectedTargetSet()` still returns BLOCKED.
 */
export const LIVE_LEGAL_BOUNDARY_STATE = Object.freeze({
  policy: 'ts.hate.protected-target-abuse',
  decisive_dimensions: 'DECLARED',
  severity_envelope: 'OPEN',
  blockedBy: 'G02-D-07b',
} as const);

/**
 * True while the registry is knowingly generated from a corpus state that is no
 * longer the working-tree state.
 *
 * Consumers that require the registry to match the corpus exactly should read
 * this rather than assuming. It is deliberately not an error: the hold is an
 * Owner decision, not a fault.
 */
export function isSourceDrifting(): boolean {
  return SOURCE_SNAPSHOT_STATUS === 'SOURCE_DRIFT_PENDING_OWNER_REVIEW';
}

/**
 * Whether the generated registry still carries the snapshot the Owner ordered
 * held (`REGISTRY_SNAPSHOT_HASH`).
 *
 * Returns **false** when the registry has been regenerated from a different
 * corpus state. That is a report, not a repair: this module does not regenerate,
 * revert or reconcile anything.
 *
 * The operands are widened to `string` deliberately. As literal types they can
 * be provably unequal at compile time, which turns a runtime condition this
 * function exists to *detect* into a build error — hiding the very drift it is
 * meant to surface.
 */
export function snapshotMatchesRegistry(): boolean {
  return (REGISTRY_SOURCE_HASH as string) === (REGISTRY_SNAPSHOT_HASH as string);
}

/** The registry hash actually present, whatever it is. For reporting. */
export function actualRegistrySourceHash(): string {
  return REGISTRY_SOURCE_HASH as string;
}

/**
 * The invariant that matters now the hold is released: the generated registry
 * is built from the corpus state this module records as adopted.
 *
 * `snapshotMatchesRegistry()` above answers a *historical* question ("is the
 * registry still the held snapshot?") and correctly answers **false**. This
 * answers the *live* one. Both are kept: deleting the historical predicate
 * would make past decisions that cited the held registry unexplainable.
 */
export function registryMatchesAdoptedSource(): boolean {
  return (REGISTRY_SOURCE_HASH as string) === (ADOPTED_SOURCE_HASH as string);
}
