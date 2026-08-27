// Phase 3 — entity/offer grouping. Every safety rule (don't merge different
// configs, don't merge uncertain identity, dedupe identical offers) must have a
// mutation that DIES.
//
// Single-line anchors only; each is uniqueness-checked before use — an anchor
// found 0x or 2x is SKIPPED loudly rather than counted.
//
// Usage:  node docs/consultative/entity-model-mutations.mjs [ROOT]
// ROOT must be a worktree holding the COMMITTED tree — never the one you edit in.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = process.argv[2] || 'C:/wtdq'
const F = ROOT + '/src/lib/ai/consultative/entityModel.ts'
const SPEC = 'src/lib/ai/consultative/entityModel.test.ts'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const orig = readFileSync(F, 'utf8')

const M = [
  { n: 'M01 group UNCERTAIN identity by key too — merges size-unknown / capacity-unknown rows',
    from: '    if (e.identityCertain) {', to: '    if (true) {' },
  { n: 'M02 uncertain rows share ONE key — collapses them into a single entity',
    from: '        entityKey: `uncertain:${i}`,', to: '        entityKey: `uncertain:0`,' },
  { n: 'M03 group certain rows by a CONSTANT key — merges every config into one',
    from: '      let ent = byKey.get(e.identityKey)', to: '      let ent = byKey.get("K")' },
  { n: 'M04 …and set the entity key constant to match (proves M03 is the real grouping key)',
    from: '        ent = { entityKey: e.identityKey, type, identity: e.identity, identityCertain: true, offers: [] }',
    to: '        ent = { entityKey: "K", type, identity: e.identity, identityCertain: true, offers: [] }' },
  { n: 'M05 stop deduping offers — the same listing twice becomes two offers',
    from: '      if (!ent.offers.some(o => offerDedupeKey(o) === k)) ent.offers.push(off)',
    to: '      ent.offers.push(off)' },
  { n: 'M06 dedupe by SELLER alone — two different-price offers from one seller collapse',
    from: '  return `s:${o.seller}|p:${o.price}|c:${o.condition}`', to: '  return `s:${o.seller}`' },
  { n: 'M07 dedupe ignores the URL — distinct listings with different urls collapse',
    from: "  if (o.url !== UNKNOWN) return `u:${o.url}`", to: '  if (false) return ``' },
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
  console.log(`restored entityModel.ts ${hash(readFileSync(F, 'utf8')) === hash(orig) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
}
if (survivors.length) console.log(`\nSURVIVORS:\n${survivors.map(s => '  - ' + s).join('\n')}`)
console.log(`\n${killed}/${M.length} killed, ${skipped} skipped`)
