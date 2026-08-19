// P1 (Multi-LLM router foundation) — mutation gate.
//
// Covers every kill the Owner required for P1. The point is that these are not
// hypotheticals: each one is a real edit to real source that a reviewer could
// plausibly wave through, and each must make a test go red.
//
// Single-line anchors only (the tree is CRLF; a multi-line "\n" anchor silently
// matches nothing and reports a false pass). Anchor count is asserted to be
// exactly 1 before a mutation is trusted.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const RTR = ROOT + '/src/lib/ai/llm/routing/router.ts'
const SIG = ROOT + '/src/lib/ai/llm/routing/signals.ts'
const AIC = ROOT + '/src/lib/ai/llm/ai.ts'
const WTH = ROOT + '/src/lib/ai/tools/weather.ts'

// Covers router/signals/shadow/registry/ai unit tests AND the static guard,
// which reads the whole of src/ off disk and so sees the tool mutation too.
const SPEC = 'src/lib/ai/llm'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const FILES = [RTR, SIG, AIC, WTH]
const orig = Object.fromEntries(FILES.map(f => [f, readFileSync(f, 'utf8')]))

const M = [
  // ── forced premium/incumbent default ──────────────────────────────────────
  { f: RTR, n: 'MP01 prefer the incumbent vendor over the cheapest eligible model',
    from: '  const best = sorted[0]',
    to: "  const best = sorted.find(c => c.providerId === 'claude') ?? sorted[0]" },
  { f: RTR, n: 'MP02 fall back to the priciest model instead of refusing when nothing qualifies',
    from: '  if (eligible.length === 0) {',
    to: '  if (false) {' },

  // ── routing on the wrong thing ────────────────────────────────────────────
  { f: RTR, n: 'MP03 route on message LENGTH — long input forced off the cheap tier',
    from: '  if (c.contextWindow < s.approxInputTokens) return false',
    to: "  if (c.contextWindow < s.approxInputTokens) return false\n  if (s.approxInputTokens > 10000 && c.tier === 'cheap') return false" },
  { f: RTR, n: 'MP04 ignore the reasoning floor (complexity/risk stop mattering)',
    from: '  if (REASONING_RANK[c.reasoning] < REASONING_RANK[floor]) return false',
    to: '' },
  { f: RTR, n: 'MP05 treat availability as a preference rather than a hard filter',
    from: '  if (!c.available) return false', to: '' },
  { f: RTR, n: 'MP06 let price beat capability — tool-less models stay eligible',
    from: '  if (s.needsTools && !c.toolCalling) return false', to: '' },

  // ── fallback policy ───────────────────────────────────────────────────────
  { f: RTR, n: 'MP07 fallback exceeds one hop',
    from: '    .slice(0, 1)', to: '    .slice(0, 3)' },
  { f: RTR, n: 'MP08 fallback names the SAME provider that just failed',
    from: '    .filter(c => c.fallbackEligible && c.providerId !== best.providerId)',
    to: '    .filter(c => c.fallbackEligible)' },
  { f: RTR, n: 'MP09 fallback drawn from ALL candidates, not the eligible set',
    from: '  const chain: ProviderId[] = sorted', to: '  const chain: ProviderId[] = [...candidates]' },

  // ── untrusted input reaching routing ──────────────────────────────────────
  { f: SIG, n: 'MP10 raw user input leaks into the routing signal set',
    from: "    securityVerdict: 'clean',",
    to: "    securityVerdict: 'clean',\n    rawPrompt: (input as unknown as { prompt?: string }).prompt," },
  { f: WTH, n: 'MP11 an untrusted tool surface reaches for the router',
    from: "import { getCache, setCache } from './common'",
    to: "import { getCache, setCache } from './common'\nimport { route } from '../llm/routing/router'" },

  // ── router bypass / double evaluation ─────────────────────────────────────
  { f: AIC, n: 'MP12 bypass the router entirely on the generate path',
    from: "    observe('generate', provider, model.modelId, messages, opts)", to: '' },
  { f: AIC, n: 'MP13 evaluate routing TWICE (the shape a re-route from tool output would take)',
    from: "    observe('generate', provider, model.modelId, messages, opts)",
    to: "    observe('generate', provider, model.modelId, messages, opts)\n    observe('generate', provider, model.modelId, messages, opts)" },

  // ── cache safety ──────────────────────────────────────────────────────────
  { f: AIC, n: 'MP14 routing metadata injected into the SHARED cached prefix',
    from: "  if (opts.systemShared) messages.push({ role: 'system', content: opts.systemShared })",
    to: "  if (opts.systemShared) messages.push({ role: 'system', content: opts.systemShared + JSON.stringify(opts.routing ?? {}) })" },

  // ── shadow mode must stay off and stay harmless ───────────────────────────
  { f: ROOT + '/src/lib/ai/llm/routing/shadow.ts', n: 'MP15 shadow mode defaults to ON',
    from: "  if (process.env[SHADOW_FLAG] !== '1') return", to: '' },
  { f: ROOT + '/src/lib/ai/llm/routing/shadow.ts', n: 'MP16 a shadow failure escapes and breaks the reply',
    from: '  } catch (e) {', to: '  } catch (e) { throw e } finally { if (false) {' },
  { f: ROOT + '/src/lib/ai/llm/routing/shadow.ts', n: 'MP17 a no-decision is papered over with whatever actually served',
    from: '      selectedProvider: null,', to: '      selectedProvider: actual.providerId,' },
]

// shadow.ts joins the file set only if a mutation targets it.
for (const m of M) if (!(m.f in orig)) orig[m.f] = readFileSync(m.f, 'utf8')

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
