/**
 * The activation guard, and the foundation freeze.
 *
 * Two jobs:
 *
 *   1. prove the guard fails closed while configuration is unresolved, and that
 *      "we have not decided" can never be read as "you did something wrong";
 *   2. pin the state of the technical foundation, so a later edit that changes
 *      any frozen property has to break a test rather than slip through.
 */

import { describe, expect, it } from 'vitest';

import {
  activationBlockerSummary,
  activationStatus,
  gateIsActive,
  gateRulesAreResolved,
  publicationStateWhileInactive,
} from '../gate/activation';
import {
  PUBLICATION_GATE_RULES,
  aggregateWithRules,
  unresolvedPolicies,
} from '../gate/publicationGate';
import { PUBLICATION_FOR, SAFETY_STATES } from '../gate/safetyResult';
import { NOTICE_FOR, noticeIsTruthful } from '../gate/authorNotice';
import { SUPPORTED_MODALITIES, UNSUPPORTED_MODALITIES } from '../evidence/modalities';
import { OBSERVABLE_POLICIES, POLICY_OBSERVABILITY } from '../mapping/policySignals';
import { isPubliclyReadable, SERVER_CONTROLLED_FIELDS } from '../gate/publicationAccess';
import { POLICY_TECHNICAL_STATUS } from '@/lib/policy/detect/constitution';
import { POLICY_REGISTRY } from '@/lib/policy/source/registry';
import { evaluatePrivacy } from '@/lib/policy/detect/privacyPersonalInformation';

const HATE = 'ts.hate.protected-target-abuse';
const T = '2026-08-17T17:00:00Z';

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

describe('activation guard', () => {
  /**
   * ⚠ RE-PINNED, Owner decision 2026-08-17 — Option B resolved the last gate
   * rule, so `GATE_RULES_RESOLVED` is now met. The remaining two preconditions
   * are environment facts, and the guard still fails closed on both.
   */
  it('gate rules ARE resolved — Option B decided the last one', () => {
    expect(gateRulesAreResolved()).toBe(true);
  });

  it('with no environment configuration the gate is still NOT active', () => {
    const status = activationStatus({});
    expect(status.active).toBe(false);
    if (status.active) return;
    expect(status.unmet).toEqual(['SCHEMA_MIGRATED', 'ACTIVATION_ENABLED']);
    expect(status.unresolvedPolicies).toEqual([]);
  });

  it('fails CLOSED — every partial environment stays inactive', () => {
    for (const env of [
      {},
      { schemaMigrated: true },
      { activationEnabled: true },
      { schemaMigrated: false, activationEnabled: true },
      { schemaMigrated: true, activationEnabled: false },
    ]) {
      expect(activationStatus(env).active, JSON.stringify(env)).toBe(false);
    }
  });

  it('activates only when BOTH environment preconditions are explicitly true', () => {
    expect(activationStatus({ schemaMigrated: true, activationEnabled: true }).active).toBe(true);
  });

  it('only the exact string "true" activates — nothing ambiguous does', () => {
    for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes'])
      expect(
        gateIsActive({ CONTENT_SAFETY_GATE_ENABLED: value, CONTENT_SAFETY_SCHEMA_MIGRATED: 'true' }),
        String(value),
      ).toBe(false);
    expect(
      gateIsActive({ CONTENT_SAFETY_GATE_ENABLED: 'true', CONTENT_SAFETY_SCHEMA_MIGRATED: 'true' }),
    ).toBe(true);
  });

  it('a configuration gap is NEVER a safety finding', () => {
    const status = activationStatus({});
    if (status.active) throw new Error('expected inactive');
    expect(status.isSafetyFinding).toBe(false);
    const serialised = JSON.stringify(status);
    for (const word of ['VIOLATION', 'RESTRICTED', 'severity', 'action'])
      expect(serialised, word).not.toContain(word);
  });

  it('the operator summary never reads as an accusation', () => {
    const summary = activationBlockerSummary(activationStatus({}));
    expect(summary).not.toMatch(/violat/i);
  });

  it('while inactive the gate writes NO state — it does not hold every upload', () => {
    expect(publicationStateWhileInactive()).toBeNull();
    expect(isPubliclyReadable(publicationStateWhileInactive())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Foundation freeze
// ---------------------------------------------------------------------------

describe('foundation freeze', () => {
  it('18/18 policies are represented', () => {
    expect(POLICY_TECHNICAL_STATUS).toHaveLength(18);
    expect(POLICY_TECHNICAL_STATUS.map((p) => p.identity).sort()).toEqual(
      POLICY_REGISTRY.map((r) => r.identity).sort(),
    );
  });

  it('P1 stays at 6/8 — consent is still not established from anything', () => {
    // The two POSITIVE bed cases, with everything observable supplied.
    const decision = evaluatePrivacy(
      { identifyingInformationPresent: true, subjectIsAnotherPerson: true },
      T,
    );
    expect(decision.outcome).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('the policy-result layer is independent of the publication gate', () => {
    // Changing a gate rule must not change any policy result. Proven by taking
    // the same lines through two different configurations.
    const lines = [
      { policy: HATE, outcome: 'INSUFFICIENT_EVIDENCE' },
      { policy: 'ts.fraud.scam', outcome: 'NOT_APPLICABLE' },
    ];
    const a = aggregateWithRules(lines, { [HATE]: 'BLOCKS_PUBLICATION' });
    const b = aggregateWithRules(lines, { [HATE]: 'DOES_NOT_BLOCK_PUBLICATION' });
    expect(a.decision).not.toBe(b.decision);
    // ...and the inputs are untouched by either.
    expect(lines[0].outcome).toBe('INSUFFICIENT_EVIDENCE');
    expect(lines[1].outcome).toBe('NOT_APPLICABLE');
  });

  it('the hate gate rule is the Product-decided Option B, and no rule is undecided', () => {
    expect(PUBLICATION_GATE_RULES[HATE]).toBe('DOES_NOT_BLOCK_PUBLICATION');
    expect(unresolvedPolicies()).toEqual([]);
  });

  it('the hate POLICY RESULT is still Legal-blocked — Option B did not touch it', () => {
    // The distinction the whole decision rests on: publication authority
    // changed, the policy layer did not.
    const record = POLICY_TECHNICAL_STATUS.find((p) => p.identity === HATE)!;
    expect(record.status).toBe('LEGAL_BLOCKED');
    expect(record.suppliedBy).toContain('G02-D-07b');
  });

  it('CONFIGURATION_REQUIRED is still distinct from UNDER_REVIEW', () => {
    const lines = [{ policy: 'ts.some.future-policy', outcome: 'INSUFFICIENT_EVIDENCE' }];
    expect(aggregateWithRules(lines, {}).decision).toBe('CONFIGURATION_REQUIRED');
    expect(
      aggregateWithRules(lines, { 'ts.some.future-policy': 'BLOCKS_PUBLICATION' }).decision,
    ).toBe('UNDER_REVIEW');
  });

  it('only one policy is reachable by observation, and consent is not observable', () => {
    expect([...OBSERVABLE_POLICIES]).toEqual(['ts.privacy.personal-information']);
    expect(POLICY_OBSERVABILITY.filter((p) => p.establishedByObservation)).toHaveLength(1);
  });

  it('three modalities run, two are declared unavailable', () => {
    expect([...SUPPORTED_MODALITIES]).toEqual(['TEXT', 'METADATA', 'IMAGE_FRAME']);
    expect([...UNSUPPORTED_MODALITIES]).toEqual(['VIDEO_FRAMES', 'AUDIO_SPEECH']);
  });

  it('only SAFE publishes; every other state waits or restricts', () => {
    expect(PUBLICATION_FOR.SAFE).toBe('PUBLISHED');
    for (const s of SAFETY_STATES) if (s !== 'SAFE') expect(PUBLICATION_FOR[s], s).not.toBe('PUBLISHED');
  });

  it('notification generation is truthful for every state, and sends nothing', () => {
    for (const s of SAFETY_STATES) expect(noticeIsTruthful(s), s).toBe(true);
    // The notice is data. There is no transport in its shape.
    for (const s of SAFETY_STATES)
      expect(Object.keys(NOTICE_FOR[s]).sort()).toEqual([
        'assertsViolation',
        'detail',
        'notify',
        'title',
      ]);
  });

  it('publication remains server-controlled', () => {
    for (const f of ['publication_state', 'safety_state', 'evaluated_version'])
      expect(SERVER_CONTROLLED_FIELDS).toContain(f);
  });

  it('no enforcement vocabulary entered the safety layer', () => {
    // The policy module has its own scan; this pins the same property for the
    // layer that was added on top of it.
    const forbidden = ['hide', 'ban', 'suspend', 'takedown', 'shadow', 'penalt'];
    const surfaces = [
      JSON.stringify(PUBLICATION_GATE_RULES),
      JSON.stringify(PUBLICATION_FOR),
      JSON.stringify(NOTICE_FOR),
    ].join(' ');
    for (const word of forbidden) expect(surfaces.toLowerCase(), word).not.toContain(word);
  });
});
