// P2 (real multi-provider integration + routing activation prep) — mutation gate.
//
// Covers the kills the Owner listed for P2 that P0/P1 did not already own.
// P0 and P1 mutation suites still run separately and must both stay 100%.
//
// Each mutation is a plausible-looking edit a reviewer could wave through. The
// two that matter most are the twins: "planning always → Claude" and "planning
// always → cheap". Both are wrong for the same reason — they bypass the
// capability floor and decide by task name — and a policy that only rejects one
// of them is not a policy.
//
// Single-line anchors only (the tree is CRLF; a multi-line "\n" anchor silently
// matches nothing and reports a false pass).
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const RTR = ROOT + '/src/lib/ai/llm/routing/router.ts'
const SIG = ROOT + '/src/lib/ai/llm/routing/signals.ts'
const CHT = ROOT + '/src/lib/ai/llm/routing/chatHints.ts'
const RTE = ROOT + '/src/app/api/chat/route.ts'

const SPEC = 'src/lib/ai/llm'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const FILES = [RTR, SIG, CHT, RTE]
const orig = Object.fromEntries(FILES.map(f => [f, readFileSync(f, 'utf8')]))

const M = [
  // ── the planning twins: both bypass the floor, both must die ──────────────
  { f: RTR, n: 'MQ01 planning ALWAYS routes premium (decide by task name, not capability)',
    from: '  const eligible = candidates.filter(c => isEligible(c, signals, floor))',
    to: "  const eligible = candidates.filter(c => isEligible(c, signals, floor) && (signals.taskClass !== 'planning' || c.tier === 'premium'))" },
  { f: SIG, n: 'MQ02 planning ALWAYS routes cheap (floor collapsed at the source)',
    from: "  planning: 'high',", to: "  planning: 'low'," },

  // ── untrusted input steering selection ────────────────────────────────────
  { f: RTR, n: 'MQ03 provider chosen from a user-supplied string (lang)',
    from: '  const best = sorted[0]',
    to: '  const best = sorted.find(c => c.providerId === (signals.lang as unknown as string)) ?? sorted[0]' },
  { f: SIG, n: 'MQ04 a caller hint can WAIVE a capability the method requires',
    from: "    needsVision: method === 'vision' || hints?.needsVision === true,",
    to: "    needsVision: hints?.needsVision ?? (method === 'vision')," },

  // ── STEP 6 regressions: the planning signal going dark again ──────────────
  { f: CHT, n: 'MQ05 the chat mapper stops reporting planning as planning',
    from: "    task: facts.noToolTurn ? 'conversational'",
    to: "    task: facts.noToolTurn ? 'conversational' : 'tool_dialogue' ? 'tool_dialogue'" },
  { f: RTE, n: 'MQ06 the chat route stops handing its hints to the model call',
    from: '    routing: routingHints,', to: '' },
  { f: CHT, n: 'MQ07 an image turn no longer requires vision capability',
    from: '    needsVision: facts.hasImage,', to: '    needsVision: false,' },
  { f: CHT, n: 'MQ08 a money-bearing turn is no longer elevated risk',
    from: "    risk: facts.hasBudget ? 'elevated' : 'routine',", to: "    risk: 'routine'," },

  // ── memory / untrusted content reaching the hint surface ──────────────────
  { f: CHT, n: 'MQ09 memory content is admitted onto the hint surface',
    from: '  lang: string', to: '  lang: string\n  memoryBlock?: string' },
]

let killed = 0, survived = 0, skipped = 0
try {
  for (const m of M) {
    const o = orig[m.f]
    const n = o.split(m.from).length - 1
    if (n !== 1) { skipped++; console.log(`SKIP      ${m.n}\n          anchor found ${n}x — FIX THE ANCHOR`); continue }
    writeFileSync(m.f, o.replace(m.from, m.to))
    let failed = false
    try { execSync(`npx vitest run ${SPEC}`, { cwd: ROOT, stdio: 'pipe' }) } catch { failed = true }
    writeFileSync(m.f, o)
    if (failed) killed++; else survived++
    console.log(`${failed ? 'KILLED  ' : 'SURVIVED'}  ${m.n}`)
  }
} finally {
  for (const [f, s] of Object.entries(orig)) writeFileSync(f, s)
  for (const [f, s] of Object.entries(orig)) {
    const same = hash(readFileSync(f, 'utf8')) === hash(s)
    console.log(`restored ${f.split('/').pop().padEnd(14)} ${same ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  }
}
console.log(`\n${killed}/${M.length} killed, ${survived} survived, ${skipped} skipped`)
