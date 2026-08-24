// Phase 2 — normalized evidence. Every rule that keeps the record honest and
// keeps a different configuration distinct must have a mutation that DIES.
//
// Single-line anchors only; each is uniqueness-checked before use — an anchor
// found 0x or 2x is SKIPPED loudly rather than counted.
//
// Usage:  node docs/consultative/normalized-evidence-mutations.mjs [ROOT]
// ROOT must be a worktree holding the COMMITTED tree — never the one you edit in.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = process.argv[2] || 'C:/wtdq'
const F = ROOT + '/src/lib/ai/consultative/normalizedEvidence.ts'
const SPEC = 'src/lib/ai/consultative/normalizedEvidence.test.ts'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const orig = readFileSync(F, 'utf8')

const M = [
  { n: 'M01 model regex ignores the chip suffix — "M1 Pro" collapses to "M1"',
    from: '  const m = t.match(/\\bm(\\d)\\s*(pro max|max|pro|ultra)\\b/) || t.match(/\\bm(\\d)\\b/)',
    to: '  const m = t.match(/\\bm(\\d)\\b/)' },
  { n: 'M02 an absent chip returns "" instead of UNKNOWN',
    from: '  if (!m) return UNKNOWN', to: '  if (!m) return ""' },
  { n: 'M03 condition "cũ" loses its VN-letter boundary — matches "cũng"',
    from: "  { re: new RegExp(`(?<![${VN_LETTER}])c[uũ](?![${VN_LETTER}])`), label: 'Cũ' },",
    to: "  { re: new RegExp(`c[uũ]`), label: 'Cũ' }," },
  { n: 'M04 drop "chinh hang" from the condition vocabulary',
    from: "  { re: new RegExp(`chinh hang`), label: 'Chính hãng' },", to: '' },
  { n: 'M05 condition is read from the SELLER, not the title (rule 2)',
    from: '    condition: conditionFromTitle(title),',
    to: "    condition: conditionFromTitle(title + ' ' + String(raw.source ?? ''))," },
  { n: 'M06 identityKey omits the model — M1 and M1 Pro collide',
    from: '  return [p(id.model), p(id.ramGb), p(id.storageGb), p(id.condition), p(id.size)].join(\'|\')',
    to: "  return [p(id.ramGb), p(id.storageGb), p(id.condition), p(id.size)].join('|')" },
  { n: 'M07 identityKey omits RAM — 16GB and 32GB collide',
    from: '  return [p(id.model), p(id.ramGb), p(id.storageGb), p(id.condition), p(id.size)].join(\'|\')',
    to: "  return [p(id.model), p(id.storageGb), p(id.condition), p(id.size)].join('|')" },
  { n: 'M08 a chip ALONE is treated as groupable (drop the capacity requirement)',
    from: '    identityCertain: identity.model !== UNKNOWN && (ramGb !== UNKNOWN || storageGb !== UNKNOWN),',
    to: '    identityCertain: identity.model !== UNKNOWN,' },
  { n: 'M09 a missing number is passed through instead of becoming UNKNOWN',
    from: 'const num = (v: unknown): Known<number> => (typeof v === \'number\' && Number.isFinite(v) ? v : UNKNOWN)',
    to: 'const num = (v: unknown): Known<number> => (v as number)' },
  { n: 'M10 currency stays VND even when the price is UNKNOWN',
    from: '      currency: price === UNKNOWN ? UNKNOWN : \'VND\',',
    to: "      currency: 'VND'," },
  { n: 'M11 size regex accepts any number — "8CPU" becomes a size',
    from: '  const m = normalizeVN(title.toLowerCase()).match(/\\b(1[3-7])(?:[.,]\\d)?\\s*(?:inch|"|”|inches)\\b/)',
    to: '  const m = normalizeVN(title.toLowerCase()).match(/\\b(\\d+)/)' },
]

let killed = 0, skipped = 0
const survivors = []
try {
  for (const m of M) {
    const n = orig.split(m.from).length - 1
    if (n !== 1) { skipped++; console.log(`SKIP      ${m.n}\n          anchor found ${n}x — FIX THE ANCHOR`); continue }
    writeFileSync(F, orig.replace(m.from, m.to))
    let failed = false
    try { execSync(`npx vitest run ${SPEC}`, { cwd: ROOT, stdio: 'pipe' }) } catch { failed = true }
    writeFileSync(F, orig)
    if (failed) killed++; else survivors.push(m.n)
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'}  ${m.n}`)
  }
} finally {
  writeFileSync(F, orig)
  console.log(`restored normalizedEvidence.ts ${hash(readFileSync(F, 'utf8')) === hash(orig) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
}
if (survivors.length) console.log(`\nSURVIVORS:\n${survivors.map(s => '  - ' + s).join('\n')}`)
console.log(`\n${killed}/${M.length} killed, ${skipped} skipped`)
