/**
 * A user report as evidence — and everything it must never become.
 *
 * The headline claim: a report never produces a violation by existing. Every
 * other test here exists to make that claim falsifiable from a different angle.
 */

import { describe, expect, it } from 'vitest';

import {
  HUMAN_REQUIRED_REASONS,
  REPORT_REASONS,
  REPORT_REASON_KEYS,
  basesFromReports,
  consentEvidenceFromReports,
  distinctReporterCount,
  policiesIndicatedBy,
  policyForReason,
  publicSummary,
  reporterSourceId,
  requiresHumanReview,
  type UserReport,
} from '../evidence/report';
import { gateConstitution } from '@/lib/policy/detect/evidenceGate';
import { evaluateGated } from '@/lib/policy/detect/constitution';
import { HARASSMENT_TARGETED } from '@/lib/policy/detect/gatedPolicies';
import { evaluatePrivacy } from '@/lib/policy/detect/privacyPersonalInformation';
import { POLICY_REGISTRY } from '@/lib/policy/source/registry';

const T = '2026-08-17T15:00:00Z';

const report = (over: Partial<UserReport> = {}): UserReport => ({
  reportId: 'r1',
  reportedContentId: 'clip-1',
  reporterSourceId: reporterSourceId('user-a'),
  reason: 'harassment',
  createdAt: T,
  verification: 'UNVERIFIED',
  ...over,
});

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

describe('reason taxonomy', () => {
  it('every mapped reason points at a real corpus policy — none invented', () => {
    const identities = POLICY_REGISTRY.map((r) => r.identity);
    for (const reason of REPORT_REASON_KEYS) {
      const policy = policyForReason(reason);
      if (policy === null) continue;
      expect(identities, `${reason} → ${policy}`).toContain(policy);
    }
  });

  it('"other" maps to no policy, so an unnamed complaint is not routed anywhere', () => {
    expect(REPORT_REASONS.other).toBeNull();
    expect(policiesIndicatedBy([report({ reason: 'other' })])).toEqual([]);
  });

  it('choosing a reason is a hint, not a classification', () => {
    // The reason names a policy to look at. It sets no signal on that policy.
    const indicated = policiesIndicatedBy([report({ reason: 'harassment' })]);
    expect(indicated).toEqual(['ts.harassment.targeted']);
    const { decision } = evaluateGated(HARASSMENT_TARGETED, {}, T, {
      bases: basesFromReports([report({ reason: 'harassment' })], 'ts.harassment.targeted'),
    });
    expect(decision.outcome).not.toBe('VIOLATION');
  });
});

// ---------------------------------------------------------------------------
// The headline claim
// ---------------------------------------------------------------------------

describe('a report is never a finding', () => {
  it('an unverified report contributes NO basis at all', () => {
    expect(basesFromReports([report()], 'ts.harassment.targeted')).toEqual([]);
  });

  it('a hundred unverified reports still contribute nothing', () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      report({ reportId: `r${i}`, reporterSourceId: reporterSourceId(`user-${i}`) }),
    );
    expect(basesFromReports(many, 'ts.harassment.targeted')).toEqual([]);
    const { decision } = evaluateGated(HARASSMENT_TARGETED, {}, T, {
      bases: basesFromReports(many, 'ts.harassment.targeted'),
    });
    expect(decision.outcome).not.toBe('VIOLATION');
  });

  it('even verified reports cannot constitute a policy on their own', () => {
    // Bases are evidence about a conclusion; they never supply the constitutive
    // element itself. With no signals, the policy is simply not established.
    const verified = [
      report({ verification: 'VERIFIED', reporterSourceId: reporterSourceId('a') }),
      report({ reportId: 'r2', verification: 'VERIFIED', reporterSourceId: reporterSourceId('b') }),
    ];
    const { decision } = evaluateGated(HARASSMENT_TARGETED, {}, T, {
      bases: basesFromReports(verified, 'ts.harassment.targeted'),
    });
    expect(decision.outcome).toBe('INSUFFICIENT_EVIDENCE');
  });
});

// ---------------------------------------------------------------------------
// Independence
// ---------------------------------------------------------------------------

describe('independence', () => {
  it('the same reporter filing repeatedly is ONE source', () => {
    const same = [
      report({ reportId: 'r1', verification: 'VERIFIED' }),
      report({ reportId: 'r2', verification: 'VERIFIED' }),
      report({ reportId: 'r3', verification: 'VERIFIED' }),
    ];
    const bases = basesFromReports(same, 'ts.harassment.targeted');
    expect(bases).toHaveLength(1);
    expect(distinctReporterCount(same, 'ts.harassment.targeted')).toBe(1);
    // ...and one source never satisfies a CORROBORATED policy.
    expect(gateConstitution(['CORROBORATED'], true, { bases }).gate).toBe(
      'INSUFFICIENT_CORROBORATION',
    );
  });

  it('different reporters are different sources', () => {
    const bases = basesFromReports(
      [
        report({ reportId: 'r1', verification: 'VERIFIED', reporterSourceId: reporterSourceId('a') }),
        report({ reportId: 'r2', verification: 'VERIFIED', reporterSourceId: reporterSourceId('b') }),
      ],
      'ts.harassment.targeted',
    );
    expect(bases).toHaveLength(2);
    expect(gateConstitution(['CORROBORATED'], true, { bases }).gate).toBe('SUFFICIENT');
  });

  it('reporter ids are stable per user and differ between users', () => {
    expect(reporterSourceId('user-a')).toBe(reporterSourceId('user-a'));
    expect(reporterSourceId('user-a')).not.toBe(reporterSourceId('user-b'));
  });

  it('conflicting reports resolve to uncertainty, never a finding', () => {
    const bases = basesFromReports(
      [
        report({ reportId: 'r1', verification: 'VERIFIED', reporterSourceId: reporterSourceId('a') }),
        report({ reportId: 'r2', verification: 'REJECTED', reporterSourceId: reporterSourceId('b') }),
      ],
      'ts.harassment.targeted',
    );
    expect(gateConstitution(['CORROBORATED'], true, { bases }).gate).toBe('CONFLICTING_EVIDENCE');
  });

  it('a single source that both supports and contradicts does not support — IN EITHER ORDER', () => {
    // Order matters and a mutation exploited it: keying the dedup map by report
    // id instead of reporter id left the conflict branch unreachable, which only
    // showed up when the contradicting report arrived FIRST.
    const supporting = report({ reportId: 'r1', verification: 'VERIFIED' });
    const contradicting = report({ reportId: 'r2', verification: 'REJECTED' });

    for (const [label, pair] of [
      ['supports first', [supporting, contradicting]],
      ['contradicts first', [contradicting, supporting]],
    ] as const) {
      const bases = basesFromReports(pair, 'ts.harassment.targeted');
      expect(bases, label).toHaveLength(1);
      expect(bases[0].supports, label).toBe(false);
      expect(bases[0].sourceId, label).toBe(supporting.reporterSourceId);
    }
  });

  it('a report about another policy is not evidence about this one', () => {
    const bases = basesFromReports(
      [report({ reason: 'fraud', verification: 'VERIFIED' })],
      'ts.harassment.targeted',
    );
    expect(bases).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Human-required
// ---------------------------------------------------------------------------

describe('human-required policies', () => {
  it('a report can never stand in for a human reviewer', () => {
    const reports = [
      report({ reason: 'child_safety', verification: 'VERIFIED', reporterSourceId: reporterSourceId('a') }),
      report({ reportId: 'r2', reason: 'child_safety', verification: 'VERIFIED', reporterSourceId: reporterSourceId('b') }),
    ];
    expect(requiresHumanReview(reports)).toBe(true);
    const bases = basesFromReports(reports, 'ts.child.sexual-exploitation');
    expect(bases).toHaveLength(2);
    // Two independent verified sources — and still no violation, because the
    // corpus reserves the conclusion to a human.
    expect(gateConstitution(['HUMAN_REQUIRED'], true, { bases }).gate).toBe(
      'HUMAN_REVIEW_REQUIRED',
    );
  });

  it('the human-required reasons are the ones the corpus marks human-required', () => {
    for (const reason of HUMAN_REQUIRED_REASONS) {
      const policy = policyForReason(reason)!;
      const record = POLICY_REGISTRY.find((r) => r.identity === policy)!;
      expect(record.evidence_sensitivity.value?.markers, reason).toContain('HUMAN_REQUIRED');
    }
  });
});

// ---------------------------------------------------------------------------
// P1
// ---------------------------------------------------------------------------

describe('P1 consent — the freeze holds', () => {
  it('no report means no consent evidence — silence is never agreement', () => {
    expect(consentEvidenceFromReports([])).toBeUndefined();
  });

  it('an unverified privacy report does not establish non-consent', () => {
    expect(consentEvidenceFromReports([report({ reason: 'privacy' })])).toBeUndefined();
  });

  it('P1 still answers UNDETERMINED with a report present — 6/8 unchanged', () => {
    const consent = consentEvidenceFromReports([report({ reason: 'privacy' })]);
    const decision = evaluatePrivacy(
      {
        identifyingInformationPresent: true,
        subjectIsAnotherPerson: true,
        ...(consent ? { consentEvidence: consent } : {}),
      },
      T,
    );
    expect(decision.outcome).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('only a VERIFIED privacy report could ever supply it — and none can be verified today', () => {
    expect(
      consentEvidenceFromReports([report({ reason: 'privacy', verification: 'VERIFIED' })]),
    ).toBe('ESTABLISHED_ABSENT');
    // ...which is unreachable in production: no verification workflow exists, so
    // every real report is UNVERIFIED. This test documents the future path, not
    // a present capability.
  });
});

// ---------------------------------------------------------------------------
// Privacy of the report itself
// ---------------------------------------------------------------------------

describe('reporter privacy', () => {
  it('the public summary carries no reporter and no free text', () => {
    const summary = publicSummary(report());
    expect(Object.keys(summary).sort()).toEqual(['createdAt', 'reason', 'reportedContentId']);
    expect(JSON.stringify(summary)).not.toContain('reporter');
  });

  it('the source id does not reveal the user id it came from', () => {
    const id = reporterSourceId('9d4cdf3b-a93f-427c-880a-9950472e3705');
    expect(id).not.toContain('9d4cdf3b');
    expect(id).toMatch(/^reporter-[0-9a-f]{8}$/);
  });

  it('an evidence basis carries the report id but never the reporter', () => {
    const bases = basesFromReports([report({ verification: 'VERIFIED' })], 'ts.harassment.targeted');
    expect(bases[0].evidenceRef).toBe('r1');
    expect(bases[0].sourceId).toMatch(/^reporter-/);
    expect(JSON.stringify(bases)).not.toContain('user-a');
  });
});
