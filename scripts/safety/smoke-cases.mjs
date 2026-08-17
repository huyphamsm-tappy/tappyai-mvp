#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// SIX SMOKE CASES — the content safety gate, end to end, on synthetic evidence.
//
// Prints for each case:
//   PER-POLICY RESULTS · PUBLICATION GATE · FINAL PUBLICATION STATE · NOTIFICATION
//
// CHANGES NOTHING. No database write, no publication, no restriction, no
// notification is sent. Evidence is supplied directly so each case is
// reproducible without a network call or a real upload.
//
//   node --experimental-transform-types scripts/safety/smoke-cases.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
register('./_resolve.mjs', import.meta.url);

const load = async (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const { evaluateSafety } = await load('src/lib/safety/gate/safetyResult.ts');
const { noticeFor } = await load('src/lib/safety/gate/authorNotice.ts');
const { ruleFor } = await load('src/lib/safety/gate/publicationGate.ts');
const { activationStatus, activationBlockerSummary } = await load('src/lib/safety/gate/activation.ts');
const { textEvidence, metadataEvidence, videoFramesEvidence, audioSpeechEvidence } = await load(
  'src/lib/safety/evidence/modalities.ts',
);
const { basesFromReports, reporterSourceId } = await load('src/lib/safety/evidence/report.ts');
const { gateConstitution } = await load('src/lib/policy/detect/evidenceGate.ts');

const T = '2026-08-17T18:00:00Z';

const frame = (over = {}) => ({
  modality: 'IMAGE_FRAME',
  status: 'OBSERVED',
  descriptors: [],
  contactIdentifiers: [],
  recognisedText: '',
  ...over,
});

const bundle = (results, over = {}) => ({
  contentId: 'case',
  contentVersion: 'v1',
  gatheredAt: T,
  results,
  ...over,
});

// ---------------------------------------------------------------------------
// The six cases
// ---------------------------------------------------------------------------

const CASES = [
  {
    n: 1,
    title: 'Normal harmless clip',
    note: 'A food review with nothing contact-shaped anywhere.',
    bundle: bundle([
      textEvidence({ body: 'Quán bún chả này ngon lắm, không gian sạch sẽ', hashtags: ['anuong'] }),
      metadataEvidence({ place_name: 'Bún Chả Hương Liên', place_address: '24 Lê Văn Hưu' }),
      frame({ descriptors: ['bún chả', 'quán ăn', 'bàn gỗ'] }),
      videoFramesEvidence(),
      audioSpeechEvidence(),
    ]),
  },
  {
    n: 2,
    title: 'Potentially problematic clip',
    note: "Someone else's phone number on screen and in the caption. The pipeline SEES it — and still cannot establish consent, so no violation is concluded.",
    bundle: bundle([
      textEvidence({ body: 'Số của chị ấy là 0987 654 321', hashtags: [] }),
      metadataEvidence({ place_name: 'Quán Ngon', place_address: '12 Lê Lợi' }),
      frame({ descriptors: ['biển hiệu', 'người'], contactIdentifiers: ['0987654321'], recognisedText: '0987654321' }),
      videoFramesEvidence(),
      audioSpeechEvidence(),
    ]),
  },
  {
    n: 3,
    title: 'Insufficient evidence',
    note: 'Nothing but an empty caption. No modality established anything.',
    bundle: bundle([
      textEvidence({ body: '', hashtags: [] }),
      videoFramesEvidence(),
      audioSpeechEvidence(),
    ]),
  },
  {
    n: 4,
    title: 'User Report evidence',
    note: 'Two independent VERIFIED reports about harassment. Shown separately because a report feeds the evidence gate, not the constitutive element.',
    bundle: bundle([
      textEvidence({ body: 'Bài đăng bị báo cáo', hashtags: [] }),
      videoFramesEvidence(),
      audioSpeechEvidence(),
    ]),
    reports: [
      { reportId: 'r1', reportedContentId: 'case', reporterSourceId: reporterSourceId('a'), reason: 'harassment', createdAt: T, verification: 'VERIFIED' },
      { reportId: 'r2', reportedContentId: 'case', reporterSourceId: reporterSourceId('b'), reason: 'harassment', createdAt: T, verification: 'VERIFIED' },
      { reportId: 'r3', reportedContentId: 'case', reporterSourceId: reporterSourceId('a'), reason: 'harassment', createdAt: T, verification: 'UNVERIFIED' },
    ],
    reportPolicy: 'ts.harassment.targeted',
  },
  {
    n: 5,
    title: 'Human-required policy',
    note: 'A child-safety report with two independent VERIFIED sources. The machine still may not conclude.',
    bundle: bundle([
      textEvidence({ body: 'Bài bị báo cáo', hashtags: [] }),
      videoFramesEvidence(),
      audioSpeechEvidence(),
    ]),
    reports: [
      { reportId: 'r1', reportedContentId: 'case', reporterSourceId: reporterSourceId('a'), reason: 'child_safety', createdAt: T, verification: 'VERIFIED' },
      { reportId: 'r2', reportedContentId: 'case', reporterSourceId: reporterSourceId('b'), reason: 'child_safety', createdAt: T, verification: 'VERIFIED' },
    ],
    reportPolicy: 'ts.child.sexual-exploitation',
    markers: ['LEGALLY_SENSITIVE', 'RESTRICTED_HANDLING', 'HUMAN_REQUIRED'],
  },
  {
    n: 6,
    title: 'Legal-blocked policy',
    note: 'A hate report. The policy is blocked at G02-D-07b and its gate rule is undecided.',
    bundle: bundle([
      textEvidence({ body: 'Bài bị báo cáo', hashtags: [] }),
      videoFramesEvidence(),
      audioSpeechEvidence(),
    ]),
    reports: [
      { reportId: 'r1', reportedContentId: 'case', reporterSourceId: reporterSourceId('a'), reason: 'hate', createdAt: T, verification: 'VERIFIED' },
    ],
    reportPolicy: 'ts.hate.protected-target-abuse',
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const rule = (s = '─') => console.log(s.repeat(78));

console.log('\nCONTENT SAFETY GATE — SIX SMOKE CASES');
rule('═');
console.log(activationBlockerSummary(activationStatus()));
console.log('Nothing below is written, published, restricted or sent.');

for (const c of CASES) {
  rule('═');
  console.log(`CASE ${c.n} — ${c.title}`);
  console.log(`  ${c.note}`);
  rule();

  const result = evaluateSafety(c.bundle, T);

  console.log('  PER-POLICY RESULTS');
  const counts = {};
  for (const p of result.policies) counts[p.outcome] = (counts[p.outcome] ?? 0) + 1;
  for (const [outcome, n] of Object.entries(counts)) console.log(`    ${String(n).padStart(2)} × ${outcome}`);
  const notable = result.policies.filter((p) => p.outcome !== 'INSUFFICIENT_EVIDENCE');
  for (const p of notable) console.log(`       ${p.policy.padEnd(36)} ${p.outcome}`);
  console.log(`    unresolved gate rule: ${result.gate.unresolved.join(', ') || '(none)'}`);

  if (c.reports) {
    const bases = basesFromReports(c.reports, c.reportPolicy);
    const gate = gateConstitution(c.markers ?? ['CORROBORATED'], true, { bases });
    console.log('');
    console.log('  USER REPORT EVIDENCE');
    console.log(`    reports filed          : ${c.reports.length}`);
    console.log(`    independent bases      : ${bases.length}`);
    console.log(`    evidence gate          : ${gate.gate}`);
    console.log(`    ⟶ a report is evidence; the constitutive element is still unestablished`);
  }

  console.log('');
  console.log('  PUBLICATION GATE');
  console.log(`    decision               : ${result.gate.decision}`);
  console.log(`    blocked by (rule set)  : ${result.gate.blockedBy.length} policies`);
  console.log(`    undecided rule         : ${result.gate.unresolved.join(', ') || '(none)'}`);

  console.log('');
  console.log(`  FINAL PUBLICATION STATE : ${result.publication}`);
  console.log(`  CONTENT SAFETY STATE    : ${result.state}`);

  const notice = noticeFor(result.state);
  console.log('');
  console.log('  NOTIFICATION');
  console.log(`    generated              : ${notice.notify}`);
  console.log(`    asserts violation      : ${notice.assertsViolation}`);
  console.log(`    SENT                   : false  (generation ≠ sending)`);
  if (notice.notify) console.log(`    text                   : ${notice.title} — ${notice.detail}`);
}

rule('═');
console.log('Every case ended UNDER_REVIEW because one gate rule is undecided.');
console.log(`Undecided: ${ruleFor('ts.hate.protected-target-abuse')} for ts.hate.protected-target-abuse.`);
console.log('That is a missing Product/Legal decision, not a safety finding about any clip.');
