// Phase 1 — shopping search validity. Every rule that keeps junk out must have a
// mutation that DIES. A guard nothing can break is a guard nobody has tested.
//
// Single-line anchors only; each anchor is uniqueness-checked before it is
// applied — an anchor found 0x or 2x is SKIPPED loudly rather than counted,
// because "SURVIVED" from a bad anchor is the failure mode that makes a run
// meaningless.
//
// Usage:  node docs/consultative/shopping-validity-mutations.mjs [ROOT]
// ROOT must be a worktree holding the COMMITTED tree — never the one you edit in.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = process.argv[2] || 'C:/wtdq'
const F = ROOT + '/src/lib/ai/tools/shoppingValidity.ts'
const SPEC = 'src/lib/ai/tools/shoppingValidity.test.ts'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const orig = readFileSync(F, 'utf8')

// NOTE: the "!title || !link" guard was removed as an EQUIVALENT mutant — an
// empty title fails the relevance check and an empty link makes hostOf() return
// null, so the two halves killed nothing. Its behaviour is still pinned by the
// "an empty title or empty link is rejected" test.
const M = [
  { n: 'M03 allow a bare URL as the title',
    from: "  if (/^https?:\\/\\//i.test(title)) return false           // the title is just a URL", to: '' },
  { n: 'M04 stop rejecting news/social/video hosts',
    from: '  if (NON_COMMERCE_HOST.some(re => re.test(host))) return false', to: '' },
  { n: 'M05 stop rejecting search/category pages',
    from: '  if (GENERIC_PATH.some(re => re.test(link.toLowerCase()))) return false', to: '' },
  { n: 'M06 stop requiring relevance to the query',
    from: '  if (!isRelevant(query, title)) return false', to: '' },
  { n: 'M07 relevance matches the WRONG direction (query-startsWith-title) — lets "mã" satisfy "mac"',
    from: '  return q.some(qt => t.some(tt => tt.startsWith(qt)))',
    to: '  return q.some(qt => t.some(tt => qt.startsWith(tt)))' },
  { n: 'M08 relevance requires an EXACT token — drops "macbook" for "mac"',
    from: '  return q.some(qt => t.some(tt => tt.startsWith(qt)))',
    to: '  return q.some(qt => t.some(tt => tt === qt))' },
  { n: 'M09 remove news domains from the non-commerce list',
    from: '  /vnexpress\\./, /tuoitre\\./, /thanhnien\\./, /dantri\\./, /cafef\\./, /cafebiz\\./,', to: '' },
  { n: 'M10 remove the /search category-page marker',
    from: '  /\\/search\\b/, /[?&]keyword=/, /[?&]q=/, /[?&]search=/,', to: '' },
  { n: 'M11 make significant tokens include 1-char noise',
    from: '    .filter(t => t.length >= 2 && !STOPWORDS.has(t))',
    to: '    .filter(t => t.length >= 1)' },
  { n: 'M12 an empty-token query VETOES instead of passing through',
    from: '  if (q.length === 0) return true', to: '  if (q.length === 0) return false' },
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
  console.log(`restored shoppingValidity.ts ${hash(readFileSync(F, 'utf8')) === hash(orig) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
}
if (survivors.length) console.log(`\nSURVIVORS:\n${survivors.map(s => '  - ' + s).join('\n')}`)
console.log(`\n${killed}/${M.length} killed, ${skipped} skipped`)
