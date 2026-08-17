#!/usr/bin/env node
// Trust & Safety Policy — Source Registry generator.
//
// Reads the SC-1 records out of docs/policy/02_POLICY_TAXONOMY.md and emits
// src/lib/policy/source/registry.ts as typed, inert data.
//
// WHY A GENERATOR: the corpus is the source of truth (09g-7 Option A — every
// policy declares every mandatory field itself). Hand-maintaining 18 × 13
// declarations in TypeScript would create a second source that can drift from
// the first. Generating means drift is impossible by construction, and the
// regression test can re-derive from the corpus and compare.
//
// WHAT THIS GENERATOR DOES NOT DO:
//   - It does not clean up, normalise or summarise any declaration value.
//     Every declaration is preserved verbatim in `raw`.
//   - It derives a typed `value` ONLY for closed value spaces (version,
//     disposition, content_classes, evidence_sensitivity). Everything else is
//     carried as raw text, because typing prose would mean interpreting it.
//   - It never fills an OPEN declaration.
//   - It never invents an effective-from. SC-1 has no such field (VER-1.1).
//
// Zero dependencies, matching the convention of scripts/check-env.mjs.
//
// Usage:
//   node scripts/policy/generate-registry.mjs --dry-run
//   node scripts/policy/generate-registry.mjs --apply

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SOURCE_FILE = 'docs/policy/02_POLICY_TAXONOMY.md';
const TAXONOMY = path.join(REPO, SOURCE_FILE);
const OUT_DIR = path.join(REPO, 'src', 'lib', 'policy', 'source');
const OUT_FILE = path.join(OUT_DIR, 'registry.ts');

// --- Invariants the generator refuses to violate -----------------------------
const EXPECTED_RECORD_COUNT = 18;
const EXPECTED_DECLARATION_COUNT = 13;
const EXPECTED_RATIFIABLE = 17;
const LEGAL_BLOCKED_POLICY = 'ts.hate.protected-target-abuse';
// RE-PINNED 2026-08-16. `decisive_dimensions` left this list because the Owner
// authorised populating it, and the value declares WHICH §6.1 dimensions decide
// (Purpose, Actor & target) — never which characteristics qualify. Membership
// stays with Legal. This is a re-pin to the authorised state, not a relaxation:
// the field moved from LEGAL_BLOCKED_FIELDS to REQUIRED_DECLARED_FIELDS below,
// so the generator now asserts it is populated instead of merely tolerating it
// being open. `severity_envelope` remains the sole Legal boundary.
const LEGAL_BLOCKED_FIELDS = ['severity_envelope'];
/** Fields that MUST be DECLARED on every record, #13 included. Stricter than before. */
const REQUIRED_DECLARED_FIELDS = ['decisive_dimensions'];
const LEGAL_BLOCKED_BY = 'G02-D-07b';

const SC1_FIELDS = [
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
];

// Closed value spaces. An unknown member here is a hard failure, not a warning.
const DISPOSITIONS = ['PROHIBITED', 'RESTRICTED'];
// `evidence_sensitivity` is a SET of markers joined by `+`, not a base plus a
// qualifier. The four child-safety policies declare three markers at once.
const EVIDENCE_MARKERS = [
  'ORDINARY',
  'CORROBORATED',
  'HUMAN_REQUIRED',
  'LEGALLY_SENSITIVE',
  'RESTRICTED_HANDLING',
];
const CONTENT_CLASSES = ['UGC', 'AI_GENERATED', 'AI_ASSISTED', 'MIXED', 'EXTERNAL_THIRD_PARTY'];

const failures = [];
function fail(msg) {
  failures.push(msg);
}

// --- Parse -------------------------------------------------------------------

function parseRecords(text) {
  const lines = text.split(/\r?\n/);
  const records = [];
  lines.forEach((line, i) => {
    if (!line.includes('Conformance (SC-1)')) return;
    const start = line.indexOf('Conformance (SC-1)');
    let body = line.slice(start + 'Conformance (SC-1)'.length);
    body = body.replace(/^\*\*\s*/, '').replace(/^\s*[—-]\s*/, '');

    const parts = body.split(/ · (?=`[a-z_]+`)/);
    const decls = {};
    for (const p of parts) {
      const m = p.match(/^`([a-z_]+)`\s*(✅|🔶)\s*([\s\S]*)$/);
      if (!m) {
        fail(`line ${i + 1}: malformed declaration fragment: ${p.slice(0, 60)}`);
        continue;
      }
      const [, field, mark, rawValue] = m;
      if (decls[field]) fail(`line ${i + 1}: duplicate declaration '${field}'`);
      decls[field] = { status: mark === '✅' ? 'DECLARED' : 'OPEN', raw: rawValue.trim() };
    }
    if (parts.length !== EXPECTED_DECLARATION_COUNT) {
      fail(`line ${i + 1}: ${parts.length} declarations, expected ${EXPECTED_DECLARATION_COUNT}`);
    }
    for (const f of SC1_FIELDS) {
      if (!(f in decls)) fail(`line ${i + 1}: required field '${f}' is absent`);
    }
    const identity = (decls.identity?.raw ?? '').replace(/`/g, '').trim();
    if (!/^ts\.[a-z0-9-]+\.[a-z0-9-]+$/.test(identity)) {
      fail(`line ${i + 1}: identity '${identity}' does not match ts.<family>.<policy>`);
    }
    // A record may carry a trailing note after its last declaration. The split
    // above uses a `(?=\`field\`)` lookahead, so such a note stays GLUED to the
    // last declaration's raw — which silently put #13's PROTECTED_TARGET_SET
    // note inside its `relationships` value. Separate it, and assert what it is.
    let trailingNote;
    const last = SC1_FIELDS[SC1_FIELDS.length - 1];
    const lastRaw = decls[last]?.raw ?? '';
    const cut = lastRaw.indexOf(' · ');
    if (cut !== -1) {
      trailingNote = lastRaw.slice(cut + 3).trim();
      decls[last].raw = lastRaw.slice(0, cut).trim();
      if (/^`[a-z_]+`/.test(trailingNote)) {
        fail(`line ${i + 1}: trailing fragment looks like a 14th declaration: ${trailingNote.slice(0, 60)}`);
      }
      if (identity !== LEGAL_BLOCKED_POLICY) {
        fail(`line ${i + 1}: only ${LEGAL_BLOCKED_POLICY} may carry a trailing note; ${identity} does`);
      }
      if (!trailingNote.includes(LEGAL_BLOCKED_BY)) {
        fail(`line ${i + 1}: the trailing note must cite ${LEGAL_BLOCKED_BY}; got: ${trailingNote.slice(0, 60)}`);
      }
    }
    records.push({ identity, sourceLine: i + 1, decls, trailingNote });
  });
  return records;
}

// --- Typed projections for closed value spaces only --------------------------

function stripMd(s) {
  return s.replace(/`/g, '').replace(/\*\*/g, '').trim();
}

/** Everything before the first parenthetical Owner-decision note. */
function headOf(raw) {
  return stripMd(raw.split(/\s*\*?\(/)[0]);
}

function projectVersion(raw, id) {
  const head = headOf(raw);
  const m = head.match(/^@(\d+)$/);
  if (!m) {
    fail(`${id}: version '${head}' is not @<n>`);
    return null;
  }
  return `@${m[1]}`;
}

function projectDisposition(raw, id) {
  const head = headOf(raw);
  if (!DISPOSITIONS.includes(head)) {
    fail(`${id}: unknown disposition '${head}' (closed set: ${DISPOSITIONS.join(', ')})`);
    return null;
  }
  return head;
}

/**
 * `severity_envelope` → the closed ENV state space.
 *
 * 🚨 `NO_ENVELOPE` MUST be tested before `OPEN`. ENV-7's own wording says it is
 * "not the OPEN of ENV-6", so a naive substring test for OPEN reads the ENV-7
 * value as OPEN — the exact misread that the standing audit script hit.
 *
 * A projection is NOT a derivation: it types a value the corpus already states.
 * ENV-2 forbids deriving an envelope, and nothing here derives one.
 */
function projectEnvelope(raw, id) {
  const s = raw.replace(/~~[^~]*~~/g, '');
  if (/\bNO_ENVELOPE\b/.test(s)) return { kind: 'NO_ENVELOPE' };
  if (/\bOPEN\b/.test(s)) return { kind: 'OPEN' };
  const range = s.match(/\bS([1-4])\s*[–—-]\s*S([1-4])\b/);
  if (range) {
    if (Number(range[1]) > Number(range[2])) {
      fail(`${id}: envelope S${range[1]}–S${range[2]} is inverted`);
      return null;
    }
    return { kind: 'BOUNDED', min: `S${range[1]}`, max: `S${range[2]}` };
  }
  const single = s.match(/\bS([1-4])\b/);
  if (single) return { kind: 'BOUNDED', min: `S${single[1]}`, max: `S${single[1]}` };
  fail(`${id}: unparsable severity_envelope '${raw.slice(0, 60)}'`);
  return null;
}

function projectEvidence(raw, id) {
  const head = headOf(raw).replace(/\*+$/, '').trim();
  const tokens = head
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    fail(`${id}: evidence_sensitivity is empty`);
    return null;
  }
  const unknown = tokens.filter((t) => !EVIDENCE_MARKERS.includes(t));
  if (unknown.length) {
    fail(
      `${id}: unknown evidence_sensitivity marker(s) '${unknown.join("', '")}' ` +
        `(closed set: ${EVIDENCE_MARKERS.join(', ')})`,
    );
    return null;
  }
  // Preserve corpus order; do not sort, do not dedupe silently.
  const dupes = tokens.filter((t, i) => tokens.indexOf(t) !== i);
  if (dupes.length) fail(`${id}: repeated evidence_sensitivity marker(s) ${[...new Set(dupes)].join(', ')}`);
  return { markers: tokens };
}

function projectContentClasses(raw, id) {
  const head = headOf(raw);
  const found = CONTENT_CLASSES.filter((c) => new RegExp(`\\b${c}\\b`).test(head));
  const unknown = head
    .split(/[,\s]+/)
    .map((t) => t.replace(/[^A-Z_]/g, ''))
    .filter((t) => t.length > 2 && /^[A-Z_]+$/.test(t) && !CONTENT_CLASSES.includes(t));
  if (unknown.length) fail(`${id}: unknown content class token(s) ${[...new Set(unknown)].join(', ')}`);
  if (found.length === 0) {
    fail(`${id}: no content classes recognised in '${head.slice(0, 60)}'`);
    return null;
  }
  return found;
}

// --- Build -------------------------------------------------------------------

const text = readFileSync(TAXONOMY, 'utf8');
const sourceHash = createHash('sha256').update(readFileSync(TAXONOMY)).digest('hex').slice(0, 8);
const records = parseRecords(text);

if (records.length !== EXPECTED_RECORD_COUNT) {
  fail(`record count ${records.length}, expected ${EXPECTED_RECORD_COUNT}`);
}

const seen = new Set();
for (const r of records) {
  const version = r.decls.version?.status === 'DECLARED' ? headOf(r.decls.version.raw) : '(open)';
  const key = `${r.identity}${version}`;
  if (seen.has(key)) fail(`duplicate policy id/version '${key}'`);
  seen.add(key);
}

const ratifiable = records.filter((r) => SC1_FIELDS.every((f) => r.decls[f]?.status === 'DECLARED'));
if (ratifiable.length !== EXPECTED_RATIFIABLE) {
  fail(`ratifiable count ${ratifiable.length}, expected ${EXPECTED_RATIFIABLE}`);
}

// The #13 Legal boundary must remain exactly as it is.
const blocked = records.find((r) => r.identity === LEGAL_BLOCKED_POLICY);
if (!blocked) {
  fail(`${LEGAL_BLOCKED_POLICY} is absent from the corpus`);
} else {
  for (const f of LEGAL_BLOCKED_FIELDS) {
    if (blocked.decls[f]?.status !== 'OPEN') {
      fail(
        `${LEGAL_BLOCKED_POLICY}.${f} is '${blocked.decls[f]?.status}' but must remain OPEN ` +
          `pending ${LEGAL_BLOCKED_BY} — refusing to generate a populated Legal field`,
      );
    }
  }
  const unexpectedOpen = SC1_FIELDS.filter(
    (f) => blocked.decls[f]?.status === 'OPEN' && !LEGAL_BLOCKED_FIELDS.includes(f),
  );
  if (unexpectedOpen.length) fail(`${LEGAL_BLOCKED_POLICY}: unexpected OPEN field(s) ${unexpectedOpen.join(', ')}`);
}

// Added 2026-08-16 with the re-pin above: fields that were once Legal-blocked
// and have since been authorised must now be POSITIVELY present on every
// record. Tolerating an absence is what let a stale boundary linger.
for (const f of REQUIRED_DECLARED_FIELDS) {
  const missing = records.filter((r) => r.decls[f]?.status !== 'DECLARED');
  if (missing.length) {
    fail(`${f} must be DECLARED on all ${EXPECTED_RECORD_COUNT} records; missing on ${missing.map((r) => r.identity).join(', ')}`);
  }
}

const otherNonRatifiable = records.filter(
  (r) => r.identity !== LEGAL_BLOCKED_POLICY && SC1_FIELDS.some((f) => r.decls[f]?.status !== 'DECLARED'),
);
if (otherNonRatifiable.length) {
  fail(`unexpected non-ratifiable record(s): ${otherNonRatifiable.map((r) => r.identity).join(', ')}`);
}

// Typed projections (closed value spaces only).
const generatedAt = new Date().toISOString().slice(0, 10);
const built = records.map((r) => {
  const id = r.identity;
  const proj = {};
  if (r.decls.version.status === 'DECLARED') proj.version = projectVersion(r.decls.version.raw, id);
  if (r.decls.disposition.status === 'DECLARED') proj.disposition = projectDisposition(r.decls.disposition.raw, id);
  if (r.decls.evidence_sensitivity.status === 'DECLARED')
    proj.evidence_sensitivity = projectEvidence(r.decls.evidence_sensitivity.raw, id);
  if (r.decls.content_classes.status === 'DECLARED')
    proj.content_classes = projectContentClasses(r.decls.content_classes.raw, id);
  if (r.decls.severity_envelope.status === 'DECLARED')
    proj.severity_envelope = projectEnvelope(r.decls.severity_envelope.raw, id);
  return { ...r, proj };
});

if (failures.length) {
  console.error('GENERATOR FAILED — refusing to write:\n');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

// --- Emit --------------------------------------------------------------------

const q = (s) => JSON.stringify(s);

function emitDeclaration(field, d, proj) {
  const parts = [`status: ${q(d.status)}`];
  if (d.status === 'OPEN') {
    parts.push('value: null');
    parts.push(`openReason: ${q('OPEN in the corpus; pending ' + LEGAL_BLOCKED_BY)}`);
    parts.push(`blockedBy: ${q(LEGAL_BLOCKED_BY)}`);
  } else if (proj !== undefined && proj !== null) {
    parts.push(`value: ${JSON.stringify(proj)}`);
  } else {
    // Prose declaration: the raw text IS the value. Nothing is interpreted.
    parts.push(`value: ${q(d.raw)}`);
  }
  parts.push(`raw: ${q(d.raw)}`);
  return `      ${field}: { ${parts.join(', ')} },`;
}

const body = built
  .map((r) => {
    const lines = [`    {`, `      identity: ${q(r.identity)},`];
    for (const f of SC1_FIELDS) {
      if (f === 'identity') continue;
      lines.push(emitDeclaration(f, r.decls[f], r.proj[f]));
    }
    if (r.trailingNote) lines.push(`      trailingNote: ${q(r.trailingNote)},`);
    lines.push(
      `      lifecycle: { enabled: true, effectiveFrom: null, effectiveTo: null },`,
      `      provenance: {`,
      `        sourceFile: ${q(SOURCE_FILE)},`,
      `        sourceHash: ${q(sourceHash)},`,
      `        sourceLine: ${r.sourceLine},`,
      `        generatedAt: ${q(generatedAt)},`,
      `      },`,
      `    },`,
    );
    return lines.join('\n');
  })
  .join('\n');

const output = `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Regenerate with:
 *   node scripts/policy/generate-registry.mjs --apply
 *
 * Source of truth: ${SOURCE_FILE} (SC-1 records, 09g-7 Option A).
 * Source hash at generation: ${sourceHash}
 * Records: ${records.length} · Declarations each: ${EXPECTED_DECLARATION_COUNT} · Ratifiable: ${ratifiable.length}/${records.length}
 *
 * This is the SOURCE layer of Source → Provider → Engine
 * (docs/policy/PRECEDENT_POLICY_AS_DATA.md §2): inert data only. No evaluation
 * logic, no storage access, no predicates, no enforcement.
 *
 * Every declaration carries \`raw\` — the corpus text verbatim. A typed \`value\`
 * is present only where the corpus defines a closed value space; prose
 * declarations carry their text as the value, uninterpreted.
 *
 * \`lifecycle.effectiveFrom\` is null for every record. That is the state of the
 * corpus, not a default: SC-1 declares no effective-from, and VER-1.1 records
 * that the corpus "does not say where an effective-from or an effective-to
 * lives". See \`canBeCitedInDecision\` in ../types.
 *
 * ${LEGAL_BLOCKED_POLICY} keeps ${LEGAL_BLOCKED_FIELDS.join(' and ')} OPEN,
 * blocked by ${LEGAL_BLOCKED_BY}. The generator refuses to write if it is populated,
 * and equally refuses to write if ${REQUIRED_DECLARED_FIELDS.join(', ')} is NOT
 * populated on all ${EXPECTED_RECORD_COUNT} records (re-pinned 2026-08-16).
 */

import type { PolicyRecord } from '../types';

export const POLICY_REGISTRY: readonly PolicyRecord[] = Object.freeze([
${body}
] as unknown as PolicyRecord[]);

export const REGISTRY_SOURCE_HASH = ${q(sourceHash)} as const;
export const REGISTRY_RECORD_COUNT = ${records.length} as const;
export const REGISTRY_RATIFIABLE_COUNT = ${ratifiable.length} as const;
`;

const isApply = process.argv.includes('--apply');
const isDryRun = process.argv.includes('--dry-run') || !isApply;

console.log(`source            ${SOURCE_FILE}`);
console.log(`source hash       ${sourceHash}`);
console.log(`records           ${records.length}/${EXPECTED_RECORD_COUNT}`);
console.log(`declarations each ${EXPECTED_DECLARATION_COUNT}`);
console.log(`ratifiable        ${ratifiable.length}/${records.length}`);
console.log(`legal-blocked     ${LEGAL_BLOCKED_POLICY} -> ${LEGAL_BLOCKED_FIELDS.join(', ')} OPEN (${LEGAL_BLOCKED_BY})`);
console.log(`output            ${path.relative(REPO, OUT_FILE)}`);
console.log(`bytes             ${Buffer.byteLength(output)}`);

if (isDryRun) {
  const existing = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : null;
  const state = existing === null ? 'WOULD CREATE' : existing === output ? 'UP TO DATE' : 'WOULD UPDATE';
  console.log(`\nDRY RUN — no file written. ${state}`);
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, output, 'utf8');
console.log('\nAPPLIED.');
