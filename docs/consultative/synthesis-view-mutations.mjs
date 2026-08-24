// Phase 9 — synthesis → client display view. Every projection rule that could
// silently disagree with the backend decision (index alignment, recommended
// binding, UNKNOWN→null) must have a mutation that DIES. Single-line anchors,
// uniqueness-checked (0x/2x = SKIP loud).
//
// Usage:  node docs/consultative/synthesis-view-mutations.mjs [ROOT]
// ROOT must hold the COMMITTED tree; the suite must be GREEN first or every
// mutant "dies" for the wrong reason (a pre-existing failure).
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = process.argv[2] || 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/modest-roentgen-d36e92'
const F = ROOT + '/src/lib/ai/consultative/synthesisView.ts'
const SPEC = 'src/lib/ai/consultative/synthesisView.test.ts'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const orig = readFileSync(F, 'utf8')

const M = [
  { n: 'M01 aligns every group to entities[0] — later configs mislabelled',
    from: '    const g = groups[i]', to: '    const g = groups[0]' },
  { n: 'M02 config falls back to empty even when the group has one',
    from: "      config: g ? g.config : '',", to: "      config: ''," },
  { n: 'M03 every entity looks recommended (drops the group binding)',
    from: '      recommended: g ? g.recommended : false,', to: '      recommended: true,' },
  { n: 'M04 the match verdict is invented as khop instead of read',
    from: "      matchesRequest: g ? g.matchesRequest : 'chua_ro',", to: "      matchesRequest: 'khop'," },
  { n: 'M05 a missing price low leaks the UNKNOWN sentinel (no nn)',
    from: '      priceLow: g ? nn(g.priceLow) : null,', to: '      priceLow: g ? g.priceLow : null,' },
  { n: 'M06 an offer price leaks the UNKNOWN sentinel (no nn)',
    from: '        price: nn(o.price),', to: '        price: o.price,' },
  { n: 'M07 an offer seller leaks the UNKNOWN sentinel (no nn)',
    from: '        seller: nn(o.seller),', to: '        seller: o.seller,' },
  { n: 'M08 an offer url leaks the UNKNOWN sentinel (no nn)',
    from: '        url: nn(o.url),', to: '        url: o.url,' },
  { n: 'M09 the recommendation is dropped entirely',
    from: '    recommendation: rec', to: '    recommendation: rec && false' },
  { n: 'M10 recommendation points at no entity (entityKey nulled)',
    from: '        entityKey: rec.entityKey,', to: '        entityKey: null,' },
  { n: 'M11 recommendation reasons are dropped',
    from: '        reasons: rec.reasons,', to: '        reasons: [],' },
  { n: 'M12 recommendation seller leaks the UNKNOWN sentinel (no nn)',
    from: '        seller: nn(rec.seller),', to: '        seller: rec.seller,' },
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
  console.log(`restored synthesisView.ts ${hash(readFileSync(F, 'utf8')) === hash(orig) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
}
if (survivors.length) console.log(`\nSURVIVORS:\n${survivors.map(s => '  - ' + s).join('\n')}`)
console.log(`\n${killed}/${M.length} killed, ${skipped} skipped`)
