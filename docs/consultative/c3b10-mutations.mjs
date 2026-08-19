// C3-B.10 §8 — every critical rule of the money guard must have a mutation that
// DIES. Single-line anchors only (the tree is CRLF; a multi-line "\n" anchor
// silently matches nothing and reports a false pass).
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const MG = ROOT + '/src/lib/ai/moneyGuard.ts'
const SE = ROOT + '/src/lib/ai/streamEnrichment.ts'
const SPEC = 'src/lib/ai/moneyGuard.test.ts'
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const orig = { [MG]: readFileSync(MG, 'utf8'), [SE]: readFileSync(SE, 'utf8') }

const M = [
  { f: MG, n: 'M01 remove the mandatory currency unit (bare numbers become money)',
    from: 'const UNIT = `(${UNIT_ALT})(?![\\\\p{L}\\\\d])`', to: 'const UNIT = `(${UNIT_ALT})?(?![\\\\p{L}\\\\d])`' },
  { f: MG, n: 'M02 loosen the ±2% tolerance to ±20%',
    from: 'export const ROUNDING_TOLERANCE = 0.02', to: 'export const ROUNDING_TOLERANCE = 0.20' },
  { f: MG, n: 'M03 accept an accessory price as the product price',
    from: "  if (recordIsAccessory && !entityIsAccessory) return 'ACCESSORY'", to: '' },
  { f: MG, n: 'M04 collapse variants into the exact model',
    from: "  if (present.length === need.length) return extraVariant.length > 0 ? 'VARIANT' : 'EXACT_PRODUCT'",
    to: "  if (present.length === need.length) return 'EXACT_PRODUCT'" },
  { f: MG, n: 'M05 accept a range on ONE supported endpoint',
    from: "    if (exact(claim.lo).length > 0 && exact(claim.hi).length > 0) return { verdict: 'VERIFIED' }",
    to: "    if (exact(claim.lo).length > 0 || exact(claim.hi).length > 0) return { verdict: 'VERIFIED' }" },
  // The first M06 (`>= 2` → `>= 0`) was INERT: with an empty verifiedValues the
  // loops never run, so nothing changed. The meaningful mutation is to feed the
  // arithmetic rule EVERY claim value instead of only the verified ones.
  { f: MG, n: 'M06 allow arithmetic over UNVERIFIED operands',
    from: "  const verifiedValues = first.filter(c => c.verdict === 'VERIFIED').flatMap(c => c.kind === 'range' ? [c.lo, c.hi] : [c.lo])",
    to: '  const verifiedValues = first.flatMap(c => c.kind === \'range\' ? [c.lo, c.hi] : [c.lo])' },
  { f: MG, n: 'M07 disable redaction (unsupported claims pass through)',
    from: '  return { text: redactUnsupportedClaims(text, claims), claims, enforced: true }',
    to: '  return { text, claims, enforced: true }' },
  { f: MG, n: 'M08 redact SUPPORTED prices too',
    from: "  const bad = claims.filter(c => c.verdict !== 'VERIFIED').sort((a, b) => b.start - a.start)",
    to: '  const bad = claims.slice().sort((a, b) => b.start - a.start)' },
  { f: MG, n: 'M09 parse URLs and machine blocks as prose money',
    from: '|https?:\\/\\/\\S+/g', to: '/g' },
  { f: MG, n: 'M10 read a price out of the title instead of the structured field',
    from: '  if (!rec.price) return null', to: '  if (!rec.price) return structuredFromTitle(rec)' },
  { f: MG, n: 'M11 drop POLICY R4 (accessory REQUEST no longer targets accessories)',
    from: '  const entityIsAccessory = ACCESSORY_RE.test(strip(entity))', to: '  const entityIsAccessory = false' },
  { f: MG, n: 'M12 make the guard enforce even without structured prices',
    from: '  if (!hasStructuredPrice) return { text, claims: [], enforced: false }',
    to: '  if (hasStructuredPrice && false) return { text, claims: [], enforced: false }' },
  { f: MG, n: 'M13 treat a missing price as zero instead of absent',
    from: '  if (digits.length < 4) return null', to: '  if (digits.length < 4) return 0' },
  { f: MG, n: 'M14 break the "+" variant boundary again (S24+ passes as S24)',
    from: '|\\+/g', to: '|\\b\\+\\b/g' },
  { f: SE, n: 'M15 stop feeding the guard the structured records',
    from: '                  for (const r of searchResults) productRecords.push(r as EvidenceRecord)', to: '' },
  { f: SE, n: 'M16 stop feeding the guard the requested entity',
    from: "            if (call.toolName === 'search_products' && call.args?.query) productQueries.push(call.args.query)", to: '' },
]

let killed = 0, skipped = 0
try {
  for (const m of M) {
    const o = orig[m.f]
    const n = o.split(m.from).length - 1
    if (n !== 1) { skipped++; console.log(`SKIP      ${m.n}\n          anchor found ${n}x — FIX THE ANCHOR`); continue }
    writeFileSync(m.f, o.replace(m.from, m.to))
    let failed = false
    try { execSync(`npx vitest run ${SPEC}`, { cwd: ROOT, stdio: 'pipe' }) } catch { failed = true }
    writeFileSync(m.f, o)
    if (failed) killed++
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'}  ${m.n}`)
  }
} finally {
  for (const [f, s] of Object.entries(orig)) writeFileSync(f, s)
  for (const [f, s] of Object.entries(orig)) {
    console.log(`restored ${f.split('/').pop().padEnd(22)} ${hash(readFileSync(f, 'utf8')) === hash(s) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  }
}
console.log(`\n${killed}/${M.length} killed, ${skipped} skipped`)
