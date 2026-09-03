// V3 Phase 2 — Cost Optimization: every cost property must have a mutation that
// DIES.
//
// Cost defects are the quietest defects there are. A broken cache breakpoint, a
// dropped telemetry field, an unbounded retry — none of them changes a single
// user-visible byte, so nothing except a test that is actively looking for them
// will ever notice. That is precisely why they need mutation coverage rather
// than assertions that read well.
//
// Single-line anchors only (CRLF tree — a multi-line "\n" anchor matches nothing
// and reports a false pass). Every anchor is asserted UNIQUE before use.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ROOT = process.env.TAPPY_ROOT
  || 'C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/v3-phase1-ai-consultative'

const ROUTE = ROOT + '/src/app/api/chat/route.ts'
const AI = ROOT + '/src/lib/ai/llm/ai.ts'
const CLAUDE = ROOT + '/src/lib/ai/llm/providers/claude.ts'
const EVENTS = ROOT + '/src/lib/observability/events.ts'
const PROMPT = ROOT + '/src/lib/ai/promptBuilder.ts'

const COST = 'src/lib/ai/costPhase2.test.ts'
const CACHE = 'src/lib/ai/llm/providers/cacheBoundary.test.ts'
const IDENTITY = 'src/lib/ai/llm/providers/modelIdentity.test.ts'
const USAGE = 'src/app/api/chat/usageEvent.test.ts'

const M = [
  // ── Retry: the invisible multiplier ──────────────────────────────────────
  {
    f: ROUTE, spec: COST, n: 'MP01 the retry ceiling goes back to being inherited',
    from: '    maxRetries: 2,', to: '',
  },
  {
    f: ROUTE, spec: COST, n: 'MP02 the retry ceiling is raised to a cost incident',
    from: '    maxRetries: 2,', to: '    maxRetries: 20,',
  },
  {
    // Both forwarding sites at once. The two lines are byte-identical, so a
    // single-occurrence anchor is impossible here and a multi-line one would be
    // the CRLF trap: an anchor containing "\n" matches nothing in this tree and
    // reports a false pass. `count` makes the plurality explicit instead.
    f: AI, spec: COST, n: 'MP03 the facade accepts the ceiling and drops it on the floor',
    from: '      maxRetries: opts.maxRetries,', to: '', count: 2,
  },

  // ── Cache boundary ───────────────────────────────────────────────────────
  {
    f: CLAUDE, spec: CACHE, n: 'MP04 the breakpoint moves to the LAST system segment (caches the clock)',
    from: '        if (m.role !== \'system\' || marked) return m',
    to: '        if (m.role !== \'system\') return m',
  },
  {
    f: CLAUDE, spec: CACHE, n: 'MP05 the breakpoint is never placed at all',
    from: '        marked = true', to: '        marked = true; return m',
  },
  {
    f: PROMPT, spec: COST, n: 'MP06 the consultative block is moved INTO the cached prefix',
    from: '  const shared = `${SYSTEM_BASE}${reviewBlock}${ctaBlock}${scopeBlock}${safetyBlock}${evidenceBlock}`',
    to: '  const shared = `${SYSTEM_BASE}${reviewBlock}${ctaBlock}${scopeBlock}${safetyBlock}${evidenceBlock}${pickBlock || \'\'}`',
  },
  {
    f: PROMPT, spec: COST, n: 'MP07 the user memory block is moved INTO the cached prefix',
    from: '  const shared = `${SYSTEM_BASE}${reviewBlock}${ctaBlock}${scopeBlock}${safetyBlock}${evidenceBlock}`',
    to: '  const shared = `${SYSTEM_BASE}${reviewBlock}${ctaBlock}${scopeBlock}${safetyBlock}${evidenceBlock}${memoryBlock || \'\'}`',
  },

  // ── Model routing / identity ─────────────────────────────────────────────
  {
    f: CLAUDE, spec: IDENTITY, n: 'MP08 `fast` goes back to the floating alias (forks the cache lineage)',
    from: "  fast:     'claude-haiku-4-5-20251001',", to: "  fast:     'claude-haiku-4-5',",
  },
  {
    f: ROUTE, spec: COST, n: 'MP09 every turn is routed to the expensive role',
    from: "  const role: ModelRole = (planningIntent || hasImage) ? 'planning' : isSimpleQuery(lastText, isFirstReply) ? 'fast' : 'smart'",
    to: "  const role: ModelRole = 'planning'",
  },

  // ── Context ──────────────────────────────────────────────────────────────
  {
    f: ROUTE, spec: COST, n: 'MP10 the history trim is removed (unbounded prompt growth)',
    from: '  const trimmedMessages = messages.length > 10 ? messages.slice(-10) : messages',
    to: '  const trimmedMessages = messages',
  },
  {
    f: ROUTE, spec: COST, n: 'MP11 tool definitions are sent on no-tool turns too',
    from: '    tools: noToolTurn ? undefined : timeTools({', to: '    tools: timeTools({',
  },
  {
    f: ROUTE, spec: COST, n: 'MP12 the need brief is sent on every turn, not only decision turns',
    from: "    needProfile.domain ? renderNeedBrief(needProfile) : '',",
    to: '    renderNeedBrief(needProfile),',
  },

  // ── Call count ───────────────────────────────────────────────────────────
  {
    f: ROUTE, spec: COST, n: 'MP13 the memory-extraction gate is removed (a third call on every turn)',
    from: '      if (authedUserId && worthExtract) {', to: '      if (authedUserId) {',
  },

  // ── Telemetry ────────────────────────────────────────────────────────────
  {
    f: EVENTS, spec: USAGE, n: 'MP14 the cost-per-feature field is dropped at the privacy boundary',
    from: "  'decisionDomain',", to: '',
  },
  {
    f: ROUTE, spec: COST, n: 'MP15 the route stops reporting which feature the turn was',
    from: '      decisionDomain: needProfile.domain,', to: '      decisionDomain: null,',
  },
  {
    f: ROUTE, spec: COST, n: 'MP16 the cost event is never recorded',
    from: '    recordEvent(usageEvent)', to: '',
  },

  // ── Safeguards ───────────────────────────────────────────────────────────
  {
    f: ROUTE, spec: COST, n: 'MP17 the step ceiling becomes an agent loop',
    from: '    maxSteps: noToolTurn ? 1 : planningIntent ? 8 : hasImage ? 3 : 5,',
    to: '    maxSteps: noToolTurn ? 1 : 50,',
  },
  {
    f: ROUTE, spec: COST, n: 'MP18 a dropped client keeps billing to maxDuration',
    from: '    abortSignal: req.signal,', to: '',
  },
  {
    f: ROUTE, spec: COST, n: 'MP19 the flood guard is removed',
    from: '  const rl = rateLimit(`chat:${clientIp(req)}`, 30, 60_000)',
    to: '  const rl = { ok: true, retryAfter: 0 }',
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
    const want = m.count ?? 1
    const n = o.split(m.from).length - 1
    if (n !== want) {
      skipped++
      console.log(`SKIP      ${m.n}\n          anchor found ${n}x, expected ${want}x — FIX THE ANCHOR`)
      continue
    }
    writeFileSync(m.f, o.split(m.from).join(m.to))
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
  for (const [f, o] of Object.entries(orig)) writeFileSync(f, o)
}

console.log(`\nkilled=${killed} survived=${survived} skipped=${skipped} of ${M.length}`)
if (survivors.length > 0) {
  console.log('SURVIVORS:')
  for (const s of survivors) console.log('  - ' + s)
}
