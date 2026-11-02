// V3 Phase 1 — AI Consultative: every property the phase claims must have a
// mutation that DIES.
//
// A test that passes on gutted code proves nothing. This harness breaks one
// property at a time and requires the spec to notice. A SURVIVED line is a
// property that is not actually protected, whatever the green suite says.
//
// Single-line anchors only. The tree is CRLF, so a multi-line "\n" anchor
// silently matches nothing and reports a false pass — that has bitten this repo
// before. Every anchor is asserted UNIQUE before it is applied; an anchor found
// 0 or 2+ times is reported as SKIP, never counted as a kill.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ROOT = process.env.TAPPY_ROOT
  || 'C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/v3-phase1-ai-consultative'

const NEED = ROOT + '/src/lib/ai/consultative/needProfile.ts'
const BRIEF = ROOT + '/src/lib/ai/consultative/needBrief.ts'
const PICK = ROOT + '/src/lib/ai/consultative/pick.ts'
const RANK = ROOT + '/src/lib/ai/consultative/rank.ts'
const RUN = ROOT + '/src/lib/ai/actions/runAction.ts'
const ROUTE = ROOT + '/src/app/api/chat/route.ts'

const PHASE1 = 'src/lib/ai/consultative/consultativePhase1.test.ts'
const LOCK = 'src/lib/ai/consultative/architectureLock.test.ts'
const BOUNDARY = 'src/lib/ai/actions/__tests__/actionBoundary.test.ts'

const M = [
  // ── Understanding ────────────────────────────────────────────────────────
  {
    f: NEED, spec: PHASE1, n: 'MU01 the occasion lexicon never runs (purpose is lost again)',
    from: '    for (const [re, key] of OCCASIONS) {',
    to: '    for (const [re, key] of [] as ReadonlyArray<[RegExp, string]>) {',
  },
  {
    f: NEED, spec: PHASE1, n: 'MU02 party size is extracted and then discarded',
    from: '    if (party !== null) {',
    to: '    if (party !== null && false) {',
  },
  {
    f: NEED, spec: PHASE1, n: 'MU03 loosen the party-size anchor so a per-person BUDGET reads as a headcount',
    from: '  /\\b(\\d{1,2})\\s*(?:nguoi|khach|thuc khach|pax)\\b/,',
    to: '  /\\b(\\d{1,2})[^.!?]{0,6}(?:nguoi|khach|thuc khach|pax)\\b/,',
  },
  {
    f: NEED, spec: PHASE1, n: 'MU04 drop the venue-seeking verbs (dat ban / tim quan resolve no domain)',
    from: "  [/\\bdat ban\\b|\\btim quan\\b|\\bkiem quan\\b|book a table|table for/, 'places'],",
    to: '',
  },
  {
    f: NEED, spec: PHASE1, n: 'MU05 let the bare district word claim the places domain',
    from: "  [/\\bdat ban\\b|\\btim quan\\b|\\bkiem quan\\b|book a table|table for/, 'places'],",
    to: "  [/\\bquan\\b|book a table|table for/, 'places'],",
  },

  // ── Uncertainty ──────────────────────────────────────────────────────────
  {
    f: BRIEF, spec: PHASE1, n: 'MU06 nothing is ever unverifiable (a stated "quiet" goes silent again)',
    from: '    if (SCOREABLE.includes(scoreKey(p.key))) continue',
    to: '    if (true) continue',
  },
  {
    f: BRIEF, spec: PHASE1, n: 'MU07 must-haves the hard filter cannot enforce are not disclosed',
    from: '  for (const m of need.mustHave) {',
    to: '  for (const m of [] as string[]) {',
  },
  {
    f: BRIEF, spec: PHASE1, n: 'MU08 disclaim durable preferences too (noise the user never asked for)',
    from: "    if (p.source === 'preference') continue",
    to: '    if (false) continue',
  },
  {
    f: BRIEF, spec: PHASE1, n: 'MU09 the disclosure block is built but never emitted',
    from: '  const unverifiableBlock = unverifiable.length > 0',
    to: '  const unverifiableBlock = unverifiable.length > 99',
  },
  {
    f: RANK, spec: PHASE1, n: 'MU10 rating leaves SCOREABLE — a checkable criterion is disclaimed',
    from: "export const SCOREABLE: readonly string[] = ['rating', 'reviewCount', 'distance', 'price', 'stars', 'eta', 'wifi', 'outdoor', 'vegetarian', 'cuisine']",
    to: "export const SCOREABLE: readonly string[] = ['reviewCount', 'distance', 'price', 'stars', 'eta', 'wifi', 'outdoor', 'vegetarian', 'cuisine']",
  },
  {
    f: PICK, spec: PHASE1, n: 'MU11 cannot_verify is computed and dropped from the payload',
    from: '    ...(pick.cannotVerify.length > 0 ? { cannot_verify: pick.cannotVerify } : {}),',
    to: '',
  },
  {
    f: PICK, spec: PHASE1, n: 'MU12 cannot_verify repeats what unverified already says (one word, two rules)',
    from: '    cannotVerify: top.missing.filter(k => !top.unverifiedMustHave.includes(k) && !top.unverifiedAvoid.includes(k)),',
    to: '    cannotVerify: top.missing,',
  },
  {
    f: PICK, spec: PHASE1, n: 'MU13 the model is never told what cannot_verify means',
    from: '- \\`cannot_verify\\` la nhung TIEU CHI user DA NEU ma rieng lua chon nay KHONG co du lieu',
    to: '- (removed)',
    partial: true,
  },

  // ── Context / the brief ──────────────────────────────────────────────────
  {
    f: BRIEF, spec: PHASE1, n: 'MU14 the brief is never rendered (understanding stops reaching the model)',
    from: "  if (known.length === 0) return ''",
    to: "  return ''",
  },
  {
    f: BRIEF, spec: PHASE1, n: 'MU15 the brief stops forbidding a re-ask',
    from: 'TUYET DOI KHONG hoi lai bat ky dieu nao da ghi o tren.',
    to: '',
  },
  {
    f: BRIEF, spec: PHASE1, n: 'MU16 unknown factors are reported for turns that choose nothing',
    from: '  if (need.domain === null) return []',
    to: '  if (need.domain === null && false) return []',
  },
  {
    f: BRIEF, spec: PHASE1, n: 'MU17 a headcount is demanded even with no occasion (the interview returns)',
    from: "  if (isVenue && need.partySize === null && need.useCases.length > 0) out.push('so nguoi')",
    to: "  if (isVenue && need.partySize === null) out.push('so nguoi')",
  },
  {
    f: ROUTE, spec: PHASE1, n: 'MU18 the route stops sending the brief',
    from: "    needProfile.domain ? renderNeedBrief(needProfile) : '',",
    to: '',
  },

  // ── Anti-interview ───────────────────────────────────────────────────────
  {
    f: ROUTE, spec: PHASE1, n: 'MU19 answering a clarification may be answered with another question',
    from: "    turnIntent === 'clarification_response' ? buildClarificationAnsweredBlock() : '',",
    to: '',
  },

  // ── Architecture / cost ──────────────────────────────────────────────────
  {
    f: ROUTE, spec: LOCK, n: 'MU20 a SECOND AI.stream() is introduced',
    from: '  result = AI.stream({',
    to: "  const extraStream = AI.stream({ role, system: '', messages: [] }); void extraStream; result = AI.stream({",
  },

  // ── Decision boundary (Phase 0, must still hold) ─────────────────────────
  {
    f: RUN, spec: BOUNDARY, n: 'MU21 the write boundary stops requiring an authenticated actor',
    from: '  if (!actor.userId) {',
    to: '  if (!actor.userId && false) {',
  },
]

const orig = {}
for (const m of M) if (!(m.f in orig)) orig[m.f] = readFileSync(m.f, 'utf8')

let killed = 0
let survived = 0
let skipped = 0
const survivors = []

try {
  for (const m of M) {
    const o = orig[m.f]
    const n = o.split(m.from).length - 1
    if (n !== 1) {
      skipped++
      console.log(`SKIP      ${m.n}\n          anchor found ${n}x — FIX THE ANCHOR`)
      continue
    }
    writeFileSync(m.f, o.replace(m.from, m.to))
    let failed = false
    try {
      execSync(`npx vitest run ${m.spec}`, { cwd: ROOT, stdio: 'pipe' })
    } catch {
      failed = true
    }
    writeFileSync(m.f, o)
    if (failed) {
      killed++
      console.log(`KILLED    ${m.n}`)
    } else {
      survived++
      survivors.push(m.n)
      console.log(`SURVIVED  ${m.n}   <<< the property is NOT protected`)
    }
  }
} finally {
  // Restore unconditionally — a crashed run must never leave a mutant on disk.
  for (const [f, o] of Object.entries(orig)) writeFileSync(f, o)
}

console.log(`\nkilled=${killed} survived=${survived} skipped=${skipped} of ${M.length}`)
if (survivors.length > 0) {
  console.log('SURVIVORS:')
  for (const s of survivors) console.log('  - ' + s)
}
process.exit(survived > 0 || skipped > 0 ? 1 : 0)
