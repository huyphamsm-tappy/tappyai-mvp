/**
 * Trust & Safety Policy — type layer (SC-1 record shape and taxonomy value spaces).
 *
 * SOURCE OF TRUTH: docs/policy/02_POLICY_TAXONOMY.md (Group 02) and
 * docs/policy/01_GOVERNANCE.md (Group 01). Every value space in this file is
 * transcribed from a numbered rule in that corpus. Nothing here is invented, and
 * nothing here may be extended by interpretation — the corpus reserves vocabulary
 * extension to an explicit Owner decision (HRM-0 / A1-B).
 *
 * ARCHITECTURE: this file is the *Source* layer of the Source / Provider / Engine
 * separation recorded in docs/policy/PRECEDENT_POLICY_AS_DATA.md §2.
 * It is inert data and types only — no evaluation logic, no storage access.
 *
 * RECORD SHAPE: G02-D-09g-7 = Option A (Owner approved 2026-08-15), ratified as
 * SC-1. Every policy declares every mandatory field itself. There is no
 * inheritance, no domain identity and no domain versioning (09g-7 §1.3 FACT 1/2).
 */

// ---------------------------------------------------------------------------
// Identity and versioning — VER-T1, §02:1570
// ---------------------------------------------------------------------------

/**
 * Policy identity: `ts.<family>.<policy>`.
 * VER-T1: "`ts.animal.cruelty` is the identity; `ts.animal.cruelty@2` is a
 * version. Decisions cite the version."
 */
export type PolicyIdentity = string;

/** A versioned policy reference: `ts.<family>.<policy>@<n>`. */
export type PolicyVersionedRef = string;

/**
 * Version notation is `@<n>` and is scoped to a *policy*.
 *
 * It must never be borrowed for any other object. The Policy Taxonomy logic has
 * its own separate identity (`tappyai.policy-taxonomy`) and its own separate
 * `<major>.<minor>.<patch>` notation; the Governance document carries `1.0`.
 * Three notations, three distinct objects — they must not be conflated.
 */
export const POLICY_VERSION_PATTERN = /^@(\d+)$/;
export const POLICY_IDENTITY_PATTERN = /^ts\.[a-z0-9-]+\.[a-z0-9-]+$/;

// ---------------------------------------------------------------------------
// Classification outcomes — §4
// ---------------------------------------------------------------------------

/** §4 classification outcomes. Exactly seven; the corpus defines no others. */
export const OUTCOME_CLASSES = [
  'OUT_OF_SCOPE',
  'NOT_APPLICABLE',
  'APPLICABLE_NO_VIOLATION',
  'VIOLATION',
  'INSUFFICIENT_EVIDENCE',
  'DISPUTED',
  'INDETERMINATE_CONTEXT',
] as const;

export type OutcomeClass = (typeof OUTCOME_CLASSES)[number];

/**
 * OUT-1: `INSUFFICIENT_EVIDENCE`, `DISPUTED` and `INDETERMINATE_CONTEXT` are
 * **terminal outcomes, not soft violations**. Nothing downstream may treat them
 * as diminished violations.
 */
export const TERMINAL_NON_VIOLATING_OUTCOMES: readonly OutcomeClass[] = [
  'INSUFFICIENT_EVIDENCE',
  'DISPUTED',
  'INDETERMINATE_CONTEXT',
] as const;

/** The only outcome that constitutes a violation. */
export const VIOLATING_OUTCOMES: readonly OutcomeClass[] = ['VIOLATION'] as const;

// ---------------------------------------------------------------------------
// Disposition — observed value space across all 18 SC-1 records
// ---------------------------------------------------------------------------

/**
 * `disposition` value space.
 *
 * `RESTRICTED` is in scope for v1 (G02-D-02 RESOLVED 2026-08-15) and means
 * "permitted subject to conditions" — it is **not** a prohibition.
 */
export const DISPOSITIONS = ['PROHIBITED', 'RESTRICTED'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

// ---------------------------------------------------------------------------
// Severity envelope — ENV-1 … ENV-7
// ---------------------------------------------------------------------------

/** Severity classes observed in envelopes across the corpus. */
export const SEVERITY_CLASSES = ['S1', 'S2', 'S3', 'S4'] as const;
export type SeverityClass = (typeof SEVERITY_CLASSES)[number];

/**
 * The three envelope states.
 *
 * - `BOUNDED`  — an inclusive range of severity classes (ENV-1, ENV-5).
 * - `OPEN`     — ENV-6: "`OPEN` is not an envelope. It records that the taxonomy
 *                has not yet determined one." This is an *undetermined* marker.
 * - `NO_ENVELOPE` — ENV-7 (G02-D-02a = C, Owner 2026-08-16): a policy whose
 *                disposition is `RESTRICTED` carries no severity envelope at
 *                taxonomy level. Distinct from `OPEN`, and distinct from the
 *                §4 outcome `NOT_APPLICABLE` and the case-level marker
 *                `SEVERITY_UNDETERMINED`.
 */
export type SeverityEnvelope =
  | { kind: 'BOUNDED'; min: SeverityClass; max: SeverityClass }
  | { kind: 'OPEN' }
  | { kind: 'NO_ENVELOPE' };

/**
 * ENV-3: "An envelope is not an enforcement threshold. It authorises nothing."
 * ENV-2: an envelope is never inferred mechanically from the number of
 * dimensions a policy engages.
 *
 * Consumers must not derive enforcement from an envelope. This constant exists
 * so the prohibition is greppable from code.
 */
export const ENVELOPE_AUTHORISES_NOTHING = true as const;

/**
 * Case-level severity marker for "not determined for this case".
 *
 * It is NOT an envelope state and NOT a §4 outcome. Four distinct things are
 * kept apart here, and conflating any two of them is the failure this constant
 * exists to prevent:
 *
 *   `SEVERITY_UNDETERMINED`  case level — this case's severity is not determined
 *   `OPEN`                   envelope   — ENV-6, the taxonomy has determined none
 *   `NO_ENVELOPE`            envelope   — ENV-7, a RESTRICTED policy carries none
 *   `NOT_APPLICABLE`         outcome    — §4, no constitutive behavior is present
 */
export const SEVERITY_UNDETERMINED = 'SEVERITY_UNDETERMINED' as const;
export type CaseSeverity = SeverityClass | typeof SEVERITY_UNDETERMINED;

/**
 * The case severity implied by an envelope: **none, ever**.
 *
 * ENV-1 (an envelope is not a case severity), ENV-2 (never derived
 * mechanically) and SEV-9 (severity is an input to Group 06, never a decision).
 * A `BOUNDED` envelope of `S4` does **not** make the case S4 — it bounds what a
 * case severity may be once one is determined by something that is not this
 * function.
 *
 * Exists so that the one correct answer is importable, and so any future code
 * reaching for "envelope → severity" finds a hard `SEVERITY_UNDETERMINED`.
 */
export function caseSeverityFromEnvelope(_envelope: SeverityEnvelope): typeof SEVERITY_UNDETERMINED {
  return SEVERITY_UNDETERMINED;
}

/** True when the envelope records that the taxonomy has NOT determined one (ENV-6). */
export function isEnvelopeUndetermined(envelope: SeverityEnvelope): boolean {
  return envelope.kind === 'OPEN';
}

/**
 * ENV-7 is a *declared* state, not a gap and not a permission.
 *
 * `NO_ENVELOPE` says severity is not meaningful at taxonomy level for a
 * `RESTRICTED` policy. It never means "ignore this policy", and it never means
 * the policy is unconstituted.
 */
export function isEnvelopeDeclaredAbsent(envelope: SeverityEnvelope): boolean {
  return envelope.kind === 'NO_ENVELOPE';
}

// ---------------------------------------------------------------------------
// Content classes — SCOPE-1 / D3
// ---------------------------------------------------------------------------

/** SCOPE-1 content class value space (B-5). D3: all five apply to every policy. */
export const CONTENT_CLASSES = [
  'UGC',
  'AI_GENERATED',
  'AI_ASSISTED',
  'MIXED',
  'EXTERNAL_THIRD_PARTY',
] as const;
export type ContentClass = (typeof CONTENT_CLASSES)[number];

// ---------------------------------------------------------------------------
// Applicability — §3.1 subject types (Actor) + §7.3.10 affected entity (Target)
// ---------------------------------------------------------------------------

/**
 * §3.1 subject types: "Policies declare which subject types they reach."
 * Owner decision 2026-08-16: applicability is declared as **two separate
 * dimensions**, Actor and Target — never collapsed into one.
 */
export const ACTOR_SUBJECT_TYPES = [
  'content item',
  'actor/account',
  'interaction',
  'coordinated set',
] as const;
export type ActorSubjectType = (typeof ACTOR_SUBJECT_TYPES)[number];

export interface Applicability {
  /** §3.1 subject types this policy reaches. */
  actor: readonly ActorSubjectType[];
  /**
   * The affected entity, per §7.3.10. Free prose in the corpus — carried as a
   * declared string rather than an enum, because the corpus does not enumerate
   * a closed target vocabulary.
   */
  target: string;
}

// ---------------------------------------------------------------------------
// Decisive dimensions — §6.1
// ---------------------------------------------------------------------------

/**
 * §6.1 fixes the dimension space. All FIVE headings, not the three that happen
 * to be declared today.
 *
 * ⚠ An earlier revision listed only `Purpose`, `Actor & target` and `Setting` —
 * the three the eighteen records currently use. That silently narrowed a corpus
 * value space: `Cultural & linguistic` and `Temporal & geographic` are §6.1
 * headings too, and a future record declaring one would have been rejected by
 * the type rather than by the corpus. The value space belongs to §6.1, not to
 * the current census.
 */
export const DECISIVE_DIMENSIONS = [
  'Purpose',
  'Actor & target',
  'Setting',
  'Cultural & linguistic',
  'Temporal & geographic',
] as const;
export type DecisiveDimension = (typeof DECISIVE_DIMENSIONS)[number];

// ---------------------------------------------------------------------------
// Evidence sensitivity
// ---------------------------------------------------------------------------

/**
 * `evidence_sensitivity` marker vocabulary.
 *
 * The declaration is a **set of markers combined with `+`**, not a single value
 * with an optional qualifier. The five distinct declarations across the 18
 * records are:
 *
 *   ORDINARY                                                  ×6
 *   CORROBORATED                                              ×6
 *   LEGALLY_SENSITIVE + RESTRICTED_HANDLING + HUMAN_REQUIRED  ×4  (child safety)
 *   HUMAN_REQUIRED                                            ×1
 *   CORROBORATED + RESTRICTED_HANDLING                        ×1
 *
 * ⚠ Modelling this as `{ base, restrictedHandling }` — as an earlier revision of
 * this file did — cannot represent the three-marker child-safety declaration and
 * would silently drop `HUMAN_REQUIRED` from exactly the four most
 * safety-critical records. The set model is the one the corpus actually uses.
 */
export const EVIDENCE_SENSITIVITY_MARKERS = [
  'ORDINARY',
  'CORROBORATED',
  'HUMAN_REQUIRED',
  'LEGALLY_SENSITIVE',
  'RESTRICTED_HANDLING',
] as const;
export type EvidenceSensitivityMarker = (typeof EVIDENCE_SENSITIVITY_MARKERS)[number];

export interface EvidenceSensitivityDeclaration {
  /** Every marker the record declares, in corpus order. Never empty. */
  markers: readonly EvidenceSensitivityMarker[];
}

export function hasEvidenceMarker(
  decl: EvidenceSensitivityDeclaration,
  marker: EvidenceSensitivityMarker,
): boolean {
  return decl.markers.includes(marker);
}

// ---------------------------------------------------------------------------
// Declaration status — the SC-1 conformance marks
// ---------------------------------------------------------------------------

/**
 * A declaration is either DECLARED (corpus ✅) or OPEN (corpus 🔶).
 *
 * `OPEN` is first-class and must never be silently defaulted, coerced or filled.
 * A policy with any OPEN declaration is **not ratifiable**.
 */
export type DeclarationStatus = 'DECLARED' | 'OPEN';

export interface Declaration<T> {
  status: DeclarationStatus;
  /** Null exactly when status is OPEN. */
  value: T | null;
  /**
   * The declaration text exactly as it appears in the corpus, preserved
   * verbatim including markdown emphasis and parenthetical Owner-decision notes.
   *
   * This exists so the generated registry never has to "clean up" a value in
   * order to type it. Where a typed `value` is derived, it is derived only from
   * a closed value space; everything else survives here unaltered.
   */
  raw?: string;
  /**
   * When status is OPEN, the reason it is open, as recorded by the corpus or by
   * an Owner decision. Never inferred.
   */
  openReason?: string;
  /** The blocking decision id, e.g. `G02-D-07b`, when one exists. */
  blockedBy?: string;
}

export function declared<T>(value: T, raw?: string): Declaration<T> {
  return raw === undefined ? { status: 'DECLARED', value } : { status: 'DECLARED', value, raw };
}

export function open<T>(openReason: string, blockedBy?: string, raw?: string): Declaration<T> {
  return { status: 'OPEN', value: null, openReason, blockedBy, ...(raw === undefined ? {} : { raw }) };
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * Where a registry record came from.
 *
 * ⚠ The corpus does **not** define a provenance structure for policy records.
 * A search of all nine `docs/policy/` files finds `provenance` only at `EV-2`
 * (decision provenance: measured / inferred / judged-by-human) — which governs
 * *decisions*, not *records*. This shape is therefore deliberately mechanical:
 * it records **where the bytes came from**, and asserts nothing about policy
 * semantics, authority, ratification or lifecycle.
 */
export interface PolicyProvenance {
  /** Repo-relative path of the corpus file. */
  readonly sourceFile: string;
  /** SHA-256 (first 8 hex) of the corpus file at generation time. */
  readonly sourceHash: string;
  /** 1-based line of the `Conformance (SC-1)` record in that file. */
  readonly sourceLine: number;
  /** ISO-8601 date the registry was generated, supplied by the generator. */
  readonly generatedAt: string;
}

// ---------------------------------------------------------------------------
// The SC-1 record — 13 mandatory declarations
// ---------------------------------------------------------------------------

/** The 13 SC-1 declarations, in corpus order. */
export const SC1_FIELDS = [
  'identity',
  'constitutive_behavior',
  'does_not_govern',
  'evidence_sensitivity',
  'disposition',
  'version',
  'protected_interest',
  'applicability',
  'content_classes',
  'defeating_contexts',
  'decisive_dimensions',
  'severity_envelope',
  'relationships',
] as const;

export type Sc1Field = (typeof SC1_FIELDS)[number];

/**
 * A self-contained per-policy record (SC-1, Option A).
 *
 * Every field is a Declaration so that OPEN is representable without inventing a
 * value. This is what makes "not ratifiable" a machine-checkable state rather
 * than a comment.
 */
export interface PolicyRecord {
  /** `ts.<family>.<policy>` — always declared; it is the record's key. */
  identity: PolicyIdentity;

  /** `@<n>` — VER-T1. Decisions cite the version. */
  version: Declaration<string>;

  constitutive_behavior: Declaration<string>;
  does_not_govern: Declaration<readonly string[]>;
  evidence_sensitivity: Declaration<EvidenceSensitivityDeclaration>;
  disposition: Declaration<Disposition>;
  protected_interest: Declaration<ProtectedInterestDeclaration>;
  applicability: Declaration<Applicability>;
  content_classes: Declaration<readonly ContentClass[]>;
  defeating_contexts: Declaration<readonly string[]>;
  decisive_dimensions: Declaration<readonly DecisiveDimension[]>;
  severity_envelope: Declaration<SeverityEnvelope>;
  relationships: Declaration<readonly PolicyRelationship[]>;

  /**
   * Lifecycle metadata (PRECEDENT §2.1). Carried as fields on the record and
   * filtered by the Provider, so "which policy was in force at time T" is an
   * answerable question rather than archaeology.
   */
  lifecycle: PolicyLifecycle;

  /**
   * Corpus text that follows the last declaration on the SC-1 line and is not
   * itself a declaration.
   *
   * Exactly one record carries one today: `ts.hate.protected-target-abuse`'s
   * note that `PROTECTED_TARGET_SET` membership remains OPEN at `G02-D-07b`.
   * It is kept OUT of `relationships.raw`, where an earlier generator revision
   * silently glued it — a Legal-blocked note inside a DECLARED field's value.
   */
  trailingNote?: string;

  /** Where these bytes came from. Absent on hand-built test fixtures. */
  provenance?: PolicyProvenance;
}

/**
 * 09g-2 A2-B primary/secondary model. `harm-class-derived` is a marker used
 * where the interest varies across cases within one policy rather than being a
 * single policy-level value.
 */
export interface ProtectedInterestDeclaration {
  primary: string;
  secondary?: string;
  /** True for `ts.deception.harmful`, which derives its interest per harm class. */
  harmClassDerived?: boolean;
}

export interface PolicyRelationship {
  kind: 'none-required' | 'broader-than' | 'narrower-than' | 'related-to';
  target?: PolicyIdentity;
}

/**
 * Lifecycle metadata (PRECEDENT §2.1: `enabled`, `effectiveFrom`, `effectiveTo`,
 * `version` carried as fields and filtered by the Provider).
 *
 * 🔴 CORPUS REALITY, NOT A DEFAULT: `VER-1` (01_GOVERNANCE §7) requires every
 * ratified policy artefact to carry a version identifier, an **effective-from**
 * and, where applicable, an **effective-to** — and states that "an artefact
 * without these cannot be cited in a decision record."
 *
 * `VER-1.1` then records that the corpus "does not say where an `effective-from`
 * or an `effective-to` lives, or what either contains", and **SC-1 has no
 * effective-from declaration**. No effective date exists for any of the 18
 * records.
 *
 * Therefore `effectiveFrom` is `null` for every generated record. That null is
 * **the truth of the corpus**, not a placeholder, and it must never be filled in
 * with a guess. `undeterminedLifecycle()` below is how the Provider keeps such a
 * record visible instead of silently treating it as active-since-forever or
 * silently dropping it.
 */
export interface PolicyLifecycle {
  enabled: boolean;
  /** ISO-8601. Null means "no effective-from recorded in the corpus" (VER-1 unmet). */
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

/** True when the record lacks the dates VER-1 requires for decision citation. */
export function hasUndeterminedLifecycle(lifecycle: PolicyLifecycle): boolean {
  return lifecycle.effectiveFrom === null;
}

/**
 * VER-1's citation precondition, as a machine-checkable predicate.
 *
 * "An artefact without these cannot be cited in a decision record."
 * Currently false for all 18 records, because no effective-from exists.
 */
export function canBeCitedInDecision(record: PolicyRecord): boolean {
  return record.version.status === 'DECLARED' && record.lifecycle.effectiveFrom !== null;
}

// ---------------------------------------------------------------------------
// Ratifiability
// ---------------------------------------------------------------------------

/**
 * A policy is ratifiable exactly when all 13 SC-1 declarations are DECLARED.
 *
 * This is the direct field-presence test that Option A was chosen to make
 * possible (09g-7 §8: "a checker reads one record").
 */
export function openFields(record: PolicyRecord): Sc1Field[] {
  const out: Sc1Field[] = [];
  for (const field of SC1_FIELDS) {
    if (field === 'identity') {
      if (!record.identity) out.push(field);
      continue;
    }
    const decl = record[field as Exclude<Sc1Field, 'identity'>] as Declaration<unknown>;
    if (!decl || decl.status !== 'DECLARED') out.push(field);
  }
  return out;
}

export function isRatifiable(record: PolicyRecord): boolean {
  return openFields(record).length === 0;
}
