/**
 * T&S infrastructure primitives — GA-4, GA-5, AU-1, AP-2.
 *
 * ============================================================================
 * THIS MODULE ACTIVATES NOTHING.
 * ============================================================================
 *
 * It contains no action, no queue, no worker, no I/O, no storage, no scheduler
 * and no user-facing effect. It is the *shape* of four things Group 01 already
 * ratified, expressed so that a future implementation cannot forget them:
 *
 *   GA-4  "Automated action must be time-bounded and self-expiring.
 *          Containment that does not expire is enforcement wearing a softer name."
 *   GA-5  "Every automated adverse action creates a review obligation, not merely
 *          a record. An unreviewed automated action must surface as a backlog,
 *          never lapse into a settled outcome."
 *   AU-1  governance acts are recorded with authority · reason · timestamp · scope.
 *   AP-2  "Notice precedes appeal. A person cannot appeal what they were not told."
 *
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------
 * There is no action vocabulary here — no HIDE, WARN, SUSPEND, BAN, DELETE or
 * BLOCK, and no synonym of any of them. Group 02 §17: "Group 09 owns actions",
 * and Group 09 has not started. An action type is Product policy, not plumbing,
 * so this module refers to an action only as an opaque `actionRef` that some
 * future authorised vocabulary will define.
 *
 * The reversibility class R0–R3 IS present, because Group 01 §10.2 ratified it
 * and it is what GA-1/GA-2/GA-7 are written in terms of.
 */

import type { OutcomeClass, PolicyVersionedRef } from '../types';

// ---------------------------------------------------------------------------
// Reversibility — Group 01 §10.2, ratified
// ---------------------------------------------------------------------------

/**
 * R0 no user-visible effect · R1 fully reversible, no lasting record ·
 * R2 reversible but materially adverse · R3 irreversible or effectively permanent.
 */
export const REVERSIBILITY_CLASSES = ['R0', 'R1', 'R2', 'R3'] as const;
export type ReversibilityClass = (typeof REVERSIBILITY_CLASSES)[number];

/** Ordered least-to-most permanent, so "more permanent than" is comparable. */
export function permanenceRank(cls: ReversibilityClass): number {
  return REVERSIBILITY_CLASSES.indexOf(cls);
}

/** R2 and R3 are "materially adverse" in §10.2's own terms. */
export function isAdverse(cls: ReversibilityClass): boolean {
  return cls === 'R2' || cls === 'R3';
}

/** GA-2: "No automated path to R3 exists." Not a preference — a governance invariant. */
export function automationMayReach(cls: ReversibilityClass): boolean {
  return cls !== 'R3';
}

/**
 * GA-7 escalation asymmetry: automation "may freely escalate toward containment
 * and toward human review. It may never escalate toward permanence."
 */
export function automationMayEscalate(
  from: ReversibilityClass,
  to: ReversibilityClass,
): boolean {
  if (!automationMayReach(to)) return false;
  return permanenceRank(to) <= permanenceRank(from);
}

// ---------------------------------------------------------------------------
// GA-4 — expiry
// ---------------------------------------------------------------------------

/**
 * A time bound on an automated action. GA-4 makes this mandatory, not optional:
 * there is no representable "automated and indefinite" state in this type.
 */
export interface Expiry {
  /** ISO-8601. Supplied by the caller; never computed from a wall clock here. */
  readonly notAfter: string;
}

export interface ExpiryAssessment {
  readonly expired: boolean;
  readonly notAfter: string;
}

/** Pure comparison. `asOf` is supplied — this module never reads a clock. */
export function assessExpiry(expiry: Expiry, asOf: string): ExpiryAssessment {
  return { expired: asOf >= expiry.notAfter, notAfter: expiry.notAfter };
}

// ---------------------------------------------------------------------------
// GA-5 — review obligation
// ---------------------------------------------------------------------------

export const REVIEW_OBLIGATION_STATES = ['OUTSTANDING', 'IN_REVIEW', 'DISCHARGED'] as const;
export type ReviewObligationState = (typeof REVIEW_OBLIGATION_STATES)[number];

/**
 * GA-5's "review obligation, not merely a record".
 *
 * There is no `LAPSED`, `EXPIRED` or `AUTO_CLOSED` state, and that omission is
 * the point: "An unreviewed automated action must surface as a backlog, never
 * lapse into a settled outcome." An obligation leaves OUTSTANDING only by being
 * discharged by a reviewer.
 */
export interface ReviewObligation {
  readonly obligationId: string;
  /** The decision that created it — `ts.x.y@n`, so it is explainable later (AP-7). */
  readonly policy: PolicyVersionedRef;
  readonly outcome: OutcomeClass;
  /** Opaque reference to whatever action a future Group 09 vocabulary names. */
  readonly actionRef: string;
  readonly reversibility: ReversibilityClass;
  readonly createdAt: string;
  readonly state: ReviewObligationState;
  /** GA-6 / HR-1: review was mandatory regardless of confidence. */
  readonly humanReviewMandatory: boolean;
}

/** An obligation is outstanding until a human discharges it. Expiry does not discharge it. */
export function isOutstanding(o: ReviewObligation): boolean {
  return o.state !== 'DISCHARGED';
}

/**
 * GA-5, stated as a predicate: an expired automated action whose obligation is
 * still outstanding is a **backlog item**, not a settled outcome.
 */
export function isBacklog(o: ReviewObligation, expiry: Expiry, asOf: string): boolean {
  return isOutstanding(o) && assessExpiry(expiry, asOf).expired;
}

// ---------------------------------------------------------------------------
// AU-1 — audit event shape
// ---------------------------------------------------------------------------

/**
 * A T&S audit event.
 *
 * AU-1 requires authority · reason · timestamp · scope. All four are required
 * fields here, so an unattributed or unexplained event is not constructible.
 *
 * 🔑 `namespace` is fixed to `ts.` and is deliberately NOT the Controller V2
 * `rbac.*` / `owner.*` vocabulary. Reusing the audit *infrastructure* is fine;
 * reusing the authorization *semantics* is not — they are different domains
 * with different authorities (Group 01 §2, B-1).
 */
export const TS_AUDIT_NAMESPACE = 'ts' as const;

export const TS_AUDIT_ACTIONS = [
  'ts.policy.evaluated',
  'ts.review.obligation_created',
  'ts.review.obligation_discharged',
  'ts.notice.issued',
  'ts.appeal.opened',
  'ts.appeal.decided',
] as const;
export type TsAuditAction = (typeof TS_AUDIT_ACTIONS)[number];

export interface TsAuditEvent {
  readonly action: TsAuditAction;
  /** AU-1 authority: the role, never a bare user id. Group 01 §5.1 roles are role-based. */
  readonly authority: string;
  /** AU-1 reason: free text, required. */
  readonly reason: string;
  /** AU-1 timestamp, ISO-8601, supplied by the caller. */
  readonly at: string;
  /** AU-1 scope: what the act reached. */
  readonly scope: string;
  /** AP-7 traceability: the policy id AND version the decision cited. */
  readonly policy?: PolicyVersionedRef;
}

/** Every T&S audit action must sit under the `ts.` namespace. Checked, not assumed. */
export function isTsAuditAction(action: string): action is TsAuditAction {
  return (TS_AUDIT_ACTIONS as readonly string[]).includes(action) && action.startsWith(`${TS_AUDIT_NAMESPACE}.`);
}

// ---------------------------------------------------------------------------
// AP-2 — notice channel abstraction
// ---------------------------------------------------------------------------

/**
 * The seam a future notice implementation plugs into.
 *
 * AP-2: notice states what happened, the policy basis, and how to appeal, "at a
 * level of detail that does not itself become an evasion manual". This interface
 * carries those three fields and nothing else — no action name, no severity, no
 * evidence.
 *
 * No implementation is provided. Nothing sends anything today.
 */
export interface Notice {
  readonly subjectRef: string;
  readonly whatHappened: string;
  /** AP-7: the policy id and version, so an appeal can compare versions. */
  readonly policyBasis: PolicyVersionedRef;
  readonly howToAppeal: string;
  readonly issuedAt: string;
}

export interface NoticeChannel {
  /** Deliberately returns the event to record, not a send result: this layer performs no I/O. */
  prepare(notice: Notice): TsAuditEvent;
}
