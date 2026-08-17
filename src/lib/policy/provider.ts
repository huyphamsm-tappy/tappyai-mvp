/**
 * Policy Provider — the single seam between the Engine and however policy
 * records are actually stored.
 *
 * PRECEDENT_POLICY_AS_DATA.md §2:
 *   "The **ONLY** seam between the Engine and however rules are actually stored.
 *    Owns lifecycle filtering."
 *   Provider {
 *     getActive(asOf?): Rule[]      // enabled AND within its effective window
 *     getById(id): Rule | null      // any state — needed to explain a past decision
 *   }
 *
 * §2.2: "A future database / feature-flag / remote-config Rule Source implements
 * this same interface — zero change to the Engine, service, API, or dashboard."
 *
 * THIS LAYER IS RETRIEVAL AND LIFECYCLE. It does not evaluate predicates, decide
 * violations, map enforcement, infer Legal values, or manufacture policy content.
 */

import { POLICY_REGISTRY } from './source/registry';
import {
  type PolicyIdentity,
  type PolicyRecord,
  type PolicyVersionedRef,
  hasUndeterminedLifecycle,
  isRatifiable,
} from './types';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DuplicatePolicyError extends Error {
  constructor(readonly ref: string) {
    super(`Duplicate policy record for '${ref}'. The registry must not contain two records with the same id@version.`);
    this.name = 'DuplicatePolicyError';
  }
}

// ---------------------------------------------------------------------------
// Lookup results — never a bare null that a caller can mistake for "no policy"
// ---------------------------------------------------------------------------

export type PolicyLookupResult =
  | { readonly state: 'FOUND'; readonly record: PolicyRecord }
  | { readonly state: 'UNKNOWN_POLICY'; readonly identity: string }
  | {
      readonly state: 'UNKNOWN_VERSION';
      readonly identity: string;
      readonly requestedVersion: string;
      /** Versions that do exist for this identity, so the caller can explain itself. */
      readonly availableVersions: readonly string[];
    }
  | { readonly state: 'MALFORMED_REFERENCE'; readonly ref: string };

/**
 * The result of asking which policies are in force.
 *
 * `undetermined` is a first-class bucket, not a silent omission. Every one of
 * the 18 current records lands there, because SC-1 declares no effective-from
 * and `VER-1` therefore cannot be satisfied (see `canBeCitedInDecision`).
 * Returning them as "active" would be inventing a lifecycle; dropping them
 * silently would hide the gap. They are returned, labelled.
 */
export interface ActivePolicyResult {
  /** Enabled AND within a determinable effective window at `asOf`. */
  readonly active: readonly PolicyRecord[];
  /** Enabled but carrying no effective-from, so the window cannot be evaluated. */
  readonly undetermined: readonly PolicyRecord[];
  /** Explicitly disabled. */
  readonly disabled: readonly PolicyRecord[];
  /** Enabled, has a window, but `asOf` falls outside it. */
  readonly outOfWindow: readonly PolicyRecord[];
  readonly asOf: string;
}

// ---------------------------------------------------------------------------
// Reference parsing — `ts.<family>.<policy>@<n>`
// ---------------------------------------------------------------------------

const REF_PATTERN = /^(ts\.[a-z0-9-]+\.[a-z0-9-]+)(@\d+)?$/;

export function parsePolicyRef(
  ref: string,
): { identity: PolicyIdentity; version: string | null } | null {
  const m = ref.match(REF_PATTERN);
  if (!m) return null;
  return { identity: m[1], version: m[2] ?? null };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface PolicyProvider {
  getActive(asOf: string): ActivePolicyResult;
  getById(ref: PolicyVersionedRef): PolicyLookupResult;
  /** Every record in any state — needed to explain a past decision. */
  getAll(): readonly PolicyRecord[];
}

function versionOf(record: PolicyRecord): string {
  return record.version.status === 'DECLARED' && record.version.value
    ? String(record.version.value)
    : '';
}

/**
 * Provider over the generated in-repo registry.
 *
 * Duplicate detection runs at construction, so an inconsistent registry fails
 * at wiring time rather than at the first lookup.
 */
export class RegistryPolicyProvider implements PolicyProvider {
  private readonly byRef = new Map<string, PolicyRecord>();
  private readonly byIdentity = new Map<PolicyIdentity, PolicyRecord[]>();

  constructor(private readonly records: readonly PolicyRecord[] = POLICY_REGISTRY) {
    for (const record of records) {
      const version = versionOf(record);
      const ref = `${record.identity}${version}`;
      if (this.byRef.has(ref)) throw new DuplicatePolicyError(ref);
      this.byRef.set(ref, record);

      const list = this.byIdentity.get(record.identity) ?? [];
      list.push(record);
      this.byIdentity.set(record.identity, list);
    }
  }

  getAll(): readonly PolicyRecord[] {
    return this.records;
  }

  /**
   * Lifecycle filtering, exactly per PRECEDENT §2.1: enabled AND within its
   * effective window. Nothing is inferred when the window is absent.
   */
  getActive(asOf: string): ActivePolicyResult {
    const active: PolicyRecord[] = [];
    const undetermined: PolicyRecord[] = [];
    const disabled: PolicyRecord[] = [];
    const outOfWindow: PolicyRecord[] = [];

    for (const record of this.records) {
      if (!record.lifecycle.enabled) {
        disabled.push(record);
        continue;
      }
      if (hasUndeterminedLifecycle(record.lifecycle)) {
        undetermined.push(record);
        continue;
      }
      const from = record.lifecycle.effectiveFrom as string;
      const to = record.lifecycle.effectiveTo;
      const startedYet = asOf >= from;
      const stillInForce = to === null || asOf < to;
      if (startedYet && stillInForce) active.push(record);
      else outOfWindow.push(record);
    }

    return { active, undetermined, disabled, outOfWindow, asOf };
  }

  /**
   * Exact `id@version` resolution.
   *
   * A reference without a version is **not** silently resolved to "the latest".
   * VER-T1 says decisions cite the version; guessing one here would make a
   * decision record unexplainable, which is the failure PRECEDENT §3.1 exists to
   * prevent.
   */
  getById(ref: PolicyVersionedRef): PolicyLookupResult {
    const parsed = parsePolicyRef(ref);
    if (!parsed) return { state: 'MALFORMED_REFERENCE', ref };

    const candidates = this.byIdentity.get(parsed.identity);
    if (!candidates || candidates.length === 0) {
      return { state: 'UNKNOWN_POLICY', identity: parsed.identity };
    }

    const availableVersions = candidates.map(versionOf).filter(Boolean);

    if (parsed.version === null) {
      return {
        state: 'UNKNOWN_VERSION',
        identity: parsed.identity,
        requestedVersion: '(none supplied)',
        availableVersions,
      };
    }

    const found = this.byRef.get(`${parsed.identity}${parsed.version}`);
    if (!found) {
      return {
        state: 'UNKNOWN_VERSION',
        identity: parsed.identity,
        requestedVersion: parsed.version,
        availableVersions,
      };
    }
    return { state: 'FOUND', record: found };
  }

  /** Convenience for reporting; not used in evaluation. */
  ratifiableCount(): number {
    return this.records.filter(isRatifiable).length;
  }
}

/** The default provider over the generated registry. */
export const defaultPolicyProvider = new RegistryPolicyProvider();
