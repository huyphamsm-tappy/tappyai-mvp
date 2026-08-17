#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ONE-CLIP CONTENT SAFETY SMOKE TEST
//
// Runs one real item through the whole pipeline and prints what happened at
// every stage: which modalities ran, what they observed, what each of the 18
// policies concluded, the safety state, and the publication decision.
//
// It CHANGES NOTHING. No database write, no publication, no notification. It
// reads an existing review row (or a URL you pass) and evaluates it.
//
//   node scripts/safety/smoke-one-clip.mjs --review <review-id>
//   node scripts/safety/smoke-one-clip.mjs --image <https url> [--caption "..."]
//
// The vision modality needs ANTHROPIC_API_KEY in the environment. Without it the
// frame modality reports FAILED, which is itself a correct and visible result.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

// Teach Node the `@/` alias and TypeScript extensions, so this runs as one
// command without a build step. Type stripping is Node's own.
register('./_resolve.mjs', import.meta.url);

// Load .env.local the way the app does, so the vision call can authenticate.
for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(path.join(ROOT, file), 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // absent is fine
  }
}

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const reviewId = arg('review');
const imageUrl = arg('image');
const caption = arg('caption') ?? '';

if (!reviewId && !imageUrl) {
  console.error('Usage: --review <id>   OR   --image <https url> [--caption "..."]');
  process.exit(1);
}

const load = async (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const { gatherEvidence, safetyContentVersion } = await load('src/lib/safety/evidence/pipeline.ts');
const { evaluateSafety, mayPublish } = await load('src/lib/safety/gate/safetyResult.ts');
const { ruleFor } = await load('src/lib/safety/gate/publicationGate.ts');
const { noticeFor } = await load('src/lib/safety/gate/authorNotice.ts');

// --- 1. the subject ---------------------------------------------------------
let subject;
if (reviewId) {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to read a review.');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await db
    .from('reviews')
    .select('id, body, hashtags, place_name, place_address, content_type, source_type, media_url, thumbnail')
    .eq('id', reviewId)
    .maybeSingle();
  if (error || !data) {
    console.error(`Could not read review ${reviewId}: ${error?.message ?? 'not found'}`);
    process.exit(1);
  }
  subject = data;
} else {
  subject = {
    id: 'ad-hoc-clip',
    body: caption,
    hashtags: [],
    content_type: 'photo',
    media_url: imageUrl,
    thumbnail: imageUrl,
  };
}

const now = new Date().toISOString();
const line = (s = '─') => console.log(s.repeat(78));

console.log('\nCONTENT SAFETY — ONE CLIP\n');
line();
console.log(`content id      : ${subject.id}`);
console.log(`content version : ${safetyContentVersion(subject)}`);
console.log(`has thumbnail   : ${Boolean(subject.thumbnail)}`);
console.log(`content type    : ${subject.content_type ?? '(none)'}`);

// --- 2. UNDER_REVIEW --------------------------------------------------------
line();
console.log('STAGE 1  UPLOAD → UNDER_REVIEW');
console.log('  every item starts here; nothing publishes before a valid decision');

// --- 3. evidence ------------------------------------------------------------
line();
console.log('STAGE 2  MEDIA EVIDENCE PIPELINE');
const bundle = await gatherEvidence(subject, now);
for (const r of bundle.results) {
  const head = `  ${r.modality.padEnd(14)} ${r.status.padEnd(12)}`;
  if (r.status === 'OBSERVED') {
    const ids = r.contactIdentifiers?.length ? ` identifiers=${r.contactIdentifiers.length}` : '';
    const desc = r.descriptors?.length ? ` descriptors=[${r.descriptors.join(', ')}]` : '';
    const txt = r.recognisedText ? ` text=${r.recognisedText.length} chars` : '';
    console.log(`${head}${ids}${desc}${txt}`);
  } else {
    console.log(`${head} ${r.reason}`);
  }
}

// --- 4. policy evaluation — LAYER A -----------------------------------------
line();
console.log('STAGE 3  PER-POLICY RESULTS  (layer A — what the corpus says)');
const result = evaluateSafety(bundle, now);
for (const p of result.policies) {
  const rule = ruleFor(p.policy);
  const mark = rule === 'UNRESOLVED' ? '  ⟵ gate rule UNRESOLVED' : '';
  console.log(`  ${p.policy.padEnd(36)} ${p.outcome.padEnd(24)}${mark}`);
}

// --- 5. safety state --------------------------------------------------------
line();
console.log('STAGE 4  CONTENT SAFETY STATE');
console.log(`  ${result.state}`);
console.log('  (a property of the content, NOT the publication decision)');

// --- 6. publication gate — LAYER B ------------------------------------------
line();
console.log('STAGE 5  PUBLICATION GATE  (layer B — what Product authorises)');
console.log(`  decision        : ${result.gate.decision}`);
console.log(`  blocked by      : ${result.gate.blockedBy.join(', ') || '(none)'}`);
console.log(`  UNRESOLVED rule : ${result.gate.unresolved.join(', ') || '(none)'}`);
console.log(`  set aside       : ${result.gate.notBlocking.join(', ') || '(none)'}`);
console.log(`  stored state    : ${result.publication}`);
console.log(`  may publish now : ${mayPublish(result, safetyContentVersion(subject))}`);
if (result.gate.decision === 'CONFIGURATION_REQUIRED') {
  console.log('');
  console.log('  ⚠ This clip is held by a MISSING PRODUCT/LEGAL DECISION, not by a');
  console.log('    safety finding. Nothing unsafe was detected. The gate rule for');
  console.log(`    ${result.gate.unresolved.join(', ')} has not been decided.`);
}

// --- 6. what the author would be told ---------------------------------------
const notice = noticeFor(result.state);
line();
console.log('AUTHOR NOTICE (text only — nothing is sent)');
console.log(`  notify          : ${notice.notify}`);
console.log(`  asserts violation: ${notice.assertsViolation}`);
if (notice.notify) {
  console.log(`  title           : ${notice.title}`);
  console.log(`  detail          : ${notice.detail}`);
}

// --- 7. honest coverage statement -------------------------------------------
line();
console.log('COVERAGE GAPS');
if (result.coverageGaps.length === 0) console.log('  none');
for (const gap of result.coverageGaps) console.log(`  · ${gap}`);

line('═');
if (result.state === 'UNDETERMINED' || result.state === 'LEGAL_REVIEW_REQUIRED') {
  console.log('Pipeline is operational, but evidence coverage is insufficient for this clip.');
} else {
  console.log(`Pipeline reached: ${result.state}`);
}
console.log('Nothing was written, published, restricted or sent.');
