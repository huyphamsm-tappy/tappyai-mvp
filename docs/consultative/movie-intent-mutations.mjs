// Entertainment routing rule — detectMovieRecommendationIntent. Each of the three
// decision branches must have a mutation that DIES. Single-line anchors,
// uniqueness-checked (0x/2x = SKIP loud). The suite must be GREEN first.
//
// Usage:  node docs/consultative/movie-intent-mutations.mjs [ROOT]
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = process.argv[2] || 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/modest-roentgen-d36e92'
const F = ROOT + '/src/lib/ai/intent.ts'
const SPEC = 'src/lib/ai/movieRecommendationIntent.test.ts'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const orig = readFileSync(F, 'utf8')

const M = [
  { n: 'M01 a movie word is REJECTED instead of required (recommendation never detected)',
    from: '  if (!movieRe.test(t)) return false', to: '  if (movieRe.test(t)) return false' },
  { n: 'M02 a cinema/showtime ask is NOT excluded (venue routed as a recommendation)',
    from: '  if (cinemaVenueRe.test(t)) return false', to: '' },
  { n: 'M03 any movie mention counts as a recommendation (drops the "suggest" cue)',
    from: '  return recommendWatchRe.test(t)', to: '  return true' },
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
  console.log(`restored intent.ts ${hash(readFileSync(F, 'utf8')) === hash(orig) ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
}
if (survivors.length) console.log(`\nSURVIVORS:\n${survivors.map(s => '  - ' + s).join('\n')}`)
console.log(`\n${killed}/${M.length} killed, ${skipped} skipped`)
