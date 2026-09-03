// V3 Phase 3 — INTEGRATION pass: the invariant Phase 1 satisfies by construction.
//
// Phase 1 added `renderNeedBrief`, the first prompt block in this codebase built
// FROM the user's conversation that is NOT fenced. That is correct: it prints
// constants selected by the user's text (SUBJECTS, PLACES, CUISINES, the label
// tables) plus two numbers, never the text itself.
//
// But nothing HELD that construction in place. The fence architecture guard
// (fenceBoundary.test.ts) checks that every declared LABEL has a producer — it
// cannot see a producer that declares no label, which is exactly what needBrief
// is. So the two realistic drifts below would have shipped silently.
//
// Plain string replacement, not regex: the anchors contain backslashes and
// braces, and every layer of shell/regex escaping between here and the file is
// a chance to write a mutation that quietly matches nothing and reports a false
// pass. Each anchor is asserted UNIQUE before it is used.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ROOT = process.env.TAPPY_ROOT
  || 'C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/v3-integration'

const NEED_PROFILE = ROOT + '/src/lib/ai/consultative/needProfile.ts'
const TEST = 'src/lib/ai/security/needBriefBoundary.test.ts'

const MUTATIONS = [
  {
    id: 'MI01',
    what: 'the district reader captures words instead of digits',
    file: NEED_PROFILE,
    from: 't.match(/\\bquan\\s+(\\d{1,2})\\b/)',
    to: 't.match(/\\bquan\\s+(\\w{1,30})\\b/)',
  },
  {
    id: 'MI02',
    what: "the location keeps the user's own words instead of the matched place",
    file: NEED_PROFILE,
    from: 'p.location.text = place',
    to: 'p.location.text = t',
  },
]

let killed = 0
let survived = 0

for (const m of MUTATIONS) {
  const original = readFileSync(m.file, 'utf8')

  const occurrences = original.split(m.from).length - 1
  if (occurrences !== 1) {
    console.log(`ANCHOR!   ${m.id} anchor appears ${occurrences} times, expected exactly 1 — not run`)
    survived++
    continue
  }

  writeFileSync(m.file, original.split(m.from).join(m.to))
  try {
    execSync(`npx vitest run ${TEST}`, { cwd: ROOT, stdio: 'ignore' })
    console.log(`SURVIVED  ${m.id} ${m.what}`)
    survived++
  } catch {
    console.log(`KILLED    ${m.id} ${m.what}`)
    killed++
  } finally {
    writeFileSync(m.file, original)
  }
}

console.log(`\nkilled=${killed} survived=${survived} of ${MUTATIONS.length}`)
process.exit(survived === 0 ? 0 : 1)
