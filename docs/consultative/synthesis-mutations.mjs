// Phase 4 — synthesis/decision. Every grounding + decision rule must have a
// mutation that DIES. Single-line anchors, uniqueness-checked (0x/2x = SKIP loud).
//
// Usage:  node docs/consultative/synthesis-mutations.mjs [ROOT]
// ROOT must hold the COMMITTED tree — never the worktree you edit in.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = process.argv[2] || 'C:/wtdq'
const F = ROOT + '/src/lib/ai/consultative/synthesis.ts'
const SPEC = 'src/lib/ai/consultative/synthesis.test.ts'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const orig = readFileSync(F, 'utf8')

const M = [
  { n: 'M01 price range invents a value instead of UNKNOWN when no offer is priced',
    from: '  if (prices.length === 0) return { low: UNKNOWN, high: UNKNOWN }',
    to: '  if (prices.length === 0) return { low: 0, high: 0 }' },
  { n: 'M02 price range uses only the min (drops the high)',
    from: '  return { low: Math.min(...prices), high: Math.max(...prices) }',
    to: '  return { low: Math.min(...prices), high: Math.min(...prices) }' },
  { n: 'M03 a mismatching attribute no longer returns "khac"',
    from: "    if (String(got).toLowerCase() !== String(want).toLowerCase()) return 'khac'", to: '' },
  { n: 'M04 an UNKNOWN attribute is treated as a match (drops the chua_ro path)',
    from: '    if (got === UNKNOWN) { sawUnknown = true; continue }', to: '    if (got === UNKNOWN) continue' },
  { n: 'M05 "no attribute asked" collapses to khop instead of chua_ro',
    from: "  if (!sawAsked) return 'chua_ro'", to: "  if (!sawAsked) return 'khop'" },
  { n: 'M06 recommendation invents a trade-off when the Pick has none',
    from: '      tradeOff: pick.runnerUp?.leadsOn ? { attribute: pick.runnerUp.leadsOn.key, evidence: pick.runnerUp.leadsOn.detail } : null,',
    to: "      tradeOff: { attribute: 'gia', evidence: 'gia thap hon' }," },
  { n: 'M07 recommendation includes ranking reasons with NO contribution (ungrounded)',
    from: '      reasons: pick.reasons.filter(r => r.contribution > 0).slice(0, 3).map(r => ({ attribute: r.key, evidence: r.detail })),',
    to: '      reasons: pick.reasons.slice(0, 3).map(r => ({ attribute: r.key, evidence: r.detail })),' },
  { n: 'M08 the recommended flag ignores the entity key — every group looks recommended',
    from: '      recommended: !!s.recommendation && e.entityKey === s.recommendation.entityKey,',
    to: '      recommended: !!s.recommendation,' },
  { n: 'M09 config label hides an UNKNOWN RAM as a real 0',
    from: "  parts.push(id.ramGb === UNKNOWN ? 'RAM ?' : `${id.ramGb}GB`)",
    to: '  parts.push(`${id.ramGb}GB`)' },
  { n: 'M10 sellers list keeps UNKNOWN sellers (leaks the marker as a name)',
    from: "      sellers: e.offers.map(o => o.seller).filter((x): x is string => typeof x === 'string'),",
    to: '      sellers: e.offers.map(o => String(o.seller)),' },
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
  console.log(`restored synthesis.ts ${hash(readFileSync(F, 'utf8')) === hash(orig) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
}
if (survivors.length) console.log(`\nSURVIVORS:\n${survivors.map(s => '  - ' + s).join('\n')}`)
console.log(`\n${killed}/${M.length} killed, ${skipped} skipped`)
