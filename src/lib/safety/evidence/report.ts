/**
 * A user report as an EVIDENCE SOURCE.
 *
 * ============================================================================
 * THE ONE RULE
 * ============================================================================
 * A report is evidence that someone complained. It is not evidence that they
 * were right, and it is never a finding.
 *
 *     REPORT EXISTS  ↛  VIOLATION
 *
 * What a report can do is supply a basis the policy engine already knows how to
 * weigh: it becomes an `EvidenceBasis` with a source id, and the existing
 * corroboration gate decides whether enough independent bases exist. Nothing
 * here reaches around that gate.
 *
 * ============================================================================
 * WHAT IT CANNOT DO
 * ============================================================================
 * · It cannot satisfy a `HUMAN_REQUIRED` policy. A complaint is not a review.
 * · It cannot corroborate itself. Ten reports from one account are one source.
 * · It cannot establish consent for P1 unless it has been VERIFIED, and no
 *   verification workflow exists — so today it never does, and P1's frozen
 *   6/8 semantics are untouched.
 * · Its reason is a hint about which policy to look at, never a classification.
 *   The reporter picks from a menu; the policy engine remains authoritative.
 *
 * ============================================================================
 * PRIVACY
 * ============================================================================
 * The reporter's identity never leaves this module. What travels onward is an
 * opaque `sourceId` derived from it — enough to tell two reporters apart, not
 * enough to name either. Report free text never becomes an evidence field and is
 * never logged.
 */

import type { EvidenceBasis } from '@/lib/policy/detect/evidenceGate';

// ---------------------------------------------------------------------------
// Reason taxonomy
// ---------------------------------------------------------------------------

/**
 * Report reasons, each mapped to the policy identifier it points at.
 *
 * 🚨 The identifiers come from the corpus; none is invented here. The mapping
 * says "look at this policy", never "this policy is constituted" — a reporter
 * choosing "harassment" does not make it harassment.
 *
 * `other` maps to nothing on purpose: a reason that names no policy must not be
 * quietly routed to one.
 */
export const REPORT_REASONS = Object.freeze({
  privacy: 'ts.privacy.personal-information',
  violence: 'ts.violence.graphic-harm',
  threats: 'ts.violence.incitement-threats',
  harmful_activity: 'ts.danger.harmful-activity',
  adult_content: 'ts.sexual.adult-content',
  non_consensual_sexual: 'ts.sexual.exploitation-nonconsent',
  child_safety: 'ts.child.sexual-exploitation',
  self_harm: 'ts.selfharm.promotion',
  harassment: 'ts.harassment.targeted',
  hate: 'ts.hate.protected-target-abuse',
  animal_cruelty: 'ts.animal.cruelty',
  fraud: 'ts.fraud.scam',
  deception: 'ts.deception.harmful',
  platform_abuse: 'ts.platform.abuse-manipulation',
  other: null,
} as const);

export type ReportReason = keyof typeof REPORT_REASONS;
export const REPORT_REASON_KEYS = Object.keys(REPORT_REASONS) as readonly ReportReason[];

export function policyForReason(reason: ReportReason): string | null {
  return REPORT_REASONS[reason];
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * How much is known about a report's truth.
 *
 * `UNVERIFIED` is the only state a report can hold today, because no
 * verification workflow exists. It is a first-class value, not a placeholder:
 * an unverified report is real evidence that a complaint was made, and no
 * evidence at all about whether the complaint is correct.
 */
export const REPORT_VERIFICATION = ['UNVERIFIED', 'VERIFIED', 'REJECTED'] as const;
export type ReportVerification = (typeof REPORT_VERIFICATION)[number];

export interface UserReport {
  readonly reportId: string;
  readonly reportedContentId: string;
  /**
   * The reporter, as an opaque identifier. Two reports from one account share
   * it; nothing downstream can turn it back into a person.
   */
  readonly reporterSourceId: string;
  readonly reason: ReportReason;
  /** ISO-8601. Supplied by the caller; nothing here reads a clock. */
  readonly createdAt: string;
  readonly verification: ReportVerification;
}

/**
 * Derive the opaque source id from a reporter's user id.
 *
 * FNV-1a, matching the content fingerprint already used elsewhere — not
 * cryptographic and not pretending to be. Its job is "are these two reports the
 * same person?", never "who is this person?".
 */
export function reporterSourceId(userId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `reporter-${hash.toString(16).padStart(8, '0')}`;
}

// ---------------------------------------------------------------------------
// Reports → evidence bases
// ---------------------------------------------------------------------------

/**
 * Turn reports about one policy into evidence bases.
 *
 * 🔑 INDEPENDENCE IS BY SOURCE, NOT BY COUNT. The corroboration gate counts
 * distinct `sourceId`s, so ten reports from one account arrive as one basis and
 * can never satisfy a `CORROBORATED` policy on their own. That is the whole
 * reason the reporter id is carried at all.
 *
 * 🔑 A `REJECTED` report contributes a basis that does NOT support the
 * conclusion. Mixed reports therefore reach the gate as a conflict, which the
 * gate resolves to uncertainty — the corpus specifies no other outcome for
 * disagreement.
 *
 * Reports whose reason points at a different policy are ignored for that policy:
 * a complaint about spam is not evidence about privacy.
 */
export function basesFromReports(
  reports: readonly UserReport[],
  policy: string,
): readonly EvidenceBasis[] {
  const relevant = reports.filter((r) => policyForReason(r.reason) === policy);
  const seen = new Map<string, EvidenceBasis>();

  for (const report of relevant) {
    if (report.verification === 'UNVERIFIED') continue; // a complaint, not a basis
    const supports = report.verification === 'VERIFIED';
    const existing = seen.get(report.reporterSourceId);
    // One source, one basis. A source that both supports and contradicts is
    // itself unresolved, and the safe reading is that it does not support.
    if (existing && existing.supports !== supports) {
      seen.set(report.reporterSourceId, { sourceId: report.reporterSourceId, supports: false });
      continue;
    }
    if (!existing) {
      seen.set(report.reporterSourceId, {
        sourceId: report.reporterSourceId,
        supports,
        evidenceRef: report.reportId,
      });
    }
  }

  return [...seen.values()];
}

/**
 * How many genuinely independent reporters filed about this policy.
 *
 * Counts unverified reports too — this is a *volume* signal for triage, and is
 * deliberately NOT wired into any classification. Volume is not evidence.
 */
export function distinctReporterCount(
  reports: readonly UserReport[],
  policy: string,
): number {
  return new Set(
    reports.filter((r) => policyForReason(r.reason) === policy).map((r) => r.reporterSourceId),
  ).size;
}

/**
 * Which policies these reports ask the engine to look at.
 *
 * A hint about where to spend evaluation, nothing more. `other` contributes
 * none.
 */
export function policiesIndicatedBy(reports: readonly UserReport[]): readonly string[] {
  return [...new Set(reports.map((r) => policyForReason(r.reason)).filter((p): p is string => p !== null))];
}

// ---------------------------------------------------------------------------
// P1 and consent
// ---------------------------------------------------------------------------

/**
 * Consent evidence a report can supply — which today is none.
 *
 * 🔒 P1'S FREEZE, RESTATED AS CODE. A person reporting "that is my number and I
 * did not agree" is exactly the evidence P1 has always lacked. But an
 * *unverified* claim is not an established fact, and there is no verification
 * workflow to make it one. So this returns `undefined` for every report that
 * exists today, P1 keeps answering `UNDETERMINED`, and the measured 6/8 is
 * unchanged.
 *
 * 🚨 ABSENCE OF A REPORT IS NOT CONSENT. No report at all returns `undefined`
 * too — never `ESTABLISHED_GIVEN`. Silence is not agreement, and reading it as
 * agreement would be the exact inversion the freeze forbids.
 */
export function consentEvidenceFromReports(
  reports: readonly UserReport[],
): 'ESTABLISHED_ABSENT' | undefined {
  const verified = reports.filter(
    (r) => r.reason === 'privacy' && r.verification === 'VERIFIED',
  );
  return verified.length > 0 ? 'ESTABLISHED_ABSENT' : undefined;
}

/**
 * Does a report reach a policy the corpus reserves to a human?
 *
 * If so the answer is the same whatever the report says: a human must decide.
 * A report cannot stand in for one, and this function exists so that no caller
 * has to remember it.
 */
export const HUMAN_REQUIRED_REASONS: readonly ReportReason[] = Object.freeze([
  'child_safety',
  'self_harm',
]);

export function requiresHumanReview(reports: readonly UserReport[]): boolean {
  return reports.some((r) => HUMAN_REQUIRED_REASONS.includes(r.reason));
}

// ---------------------------------------------------------------------------
// What may be shown about a report
// ---------------------------------------------------------------------------

/** The public shape of a report: no reporter, no free text, no payload. */
export interface PublicReportSummary {
  readonly reportedContentId: string;
  readonly reason: ReportReason;
  readonly createdAt: string;
}

/**
 * Strip a report to what may be seen outside the safety layer.
 *
 * The reporter's identity and the opaque source id both stay behind: the source
 * id distinguishes reporters, so exposing it would let anyone with two reports
 * work out that the same person filed both.
 */
export function publicSummary(report: UserReport): PublicReportSummary {
  return {
    reportedContentId: report.reportedContentId,
    reason: report.reason,
    createdAt: report.createdAt,
  };
}
