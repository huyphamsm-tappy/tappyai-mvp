// P0 (Multi-LLM, de-vendor) — mutation gate.
//
// Every rule P0 introduces must have a mutation that DIES. Two things are being
// proved: that the new unit tests actually constrain the registry/adapter/
// capability layer, and that the T9 architecture guard is LIVE against real
// source edits rather than only against its own control strings — a static
// guard that passes because its regex is inert is the exact failure mode
// documented in feedback_never_author_code_through_shell.
//
// Single-line anchors only (the tree is CRLF; a multi-line "\n" anchor silently
// matches nothing and reports a false pass). Anchor count is asserted to be
// exactly 1 before a mutation is trusted.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp'
const REG = ROOT + '/src/lib/ai/llm/registry.ts'
const CLA = ROOT + '/src/lib/ai/llm/providers/claude.ts'
const AIC = ROOT + '/src/lib/ai/llm/ai.ts'
const RTE = ROOT + '/src/app/api/chat/route.ts'

// One spec dir covers all four: registry/claude/ai unit tests AND the static
// guard, which reads route.ts off disk and so sees route mutations too.
const SPEC = 'src/lib/ai/llm'

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const FILES = [REG, CLA, AIC, RTE]
const orig = Object.fromEntries(FILES.map(f => [f, readFileSync(f, 'utf8')]))

const M = [
  // ── registry.ts: the keyed/lazy cache ─────────────────────────────────────
  { f: REG, n: 'MR01 revert to the process-lifetime singleton (first caller wins forever)',
    from: '  const cached = instances.get(id)', to: '  const cached = instances.values().next().value' },
  { f: REG, n: 'MR02 serve an uninstalled adapter with Claude instead of throwing',
    from: "    case 'deepseek':", to: "    case 'deepseek': return createClaudeProvider(modelOverridesFromEnv())" },
  { f: REG, n: 'MR03 drop case-insensitivity on LLM_PROVIDER',
    from: "  return (process.env.LLM_PROVIDER ?? 'claude').toLowerCase() as ProviderId",
    to: "  return (process.env.LLM_PROVIDER ?? 'claude') as ProviderId" },
  { f: REG, n: 'MR04 change the default provider when LLM_PROVIDER is unset',
    from: "process.env.LLM_PROVIDER ?? 'claude'", to: "process.env.LLM_PROVIDER ?? 'openai'" },
  { f: REG, n: 'MR05 report every supported id as constructed (laziness becomes unobservable)',
    from: '  return [...instances.keys()]', to: '  return [...SUPPORTED]' },
  { f: REG, n: 'MR06 never cache — rebuild the adapter on every call',
    from: '  instances.set(id, created)', to: '' },
  { f: REG, n: 'MR07 drop the planning→smart override fallback',
    from: '    planning: process.env.LLM_PLANNING_MODEL ?? process.env.LLM_SMART_MODEL,',
    to: '    planning: process.env.LLM_PLANNING_MODEL,' },

  // ── providers/claude.ts: the pin, usageMetrics, the cache breakpoint ──────
  { f: CLA, n: 'MC01 unpin fast back to the floating alias',
    from: "  fast:     'claude-haiku-4-5-20251001',", to: "  fast:     'claude-haiku-4-5'," },
  { f: CLA, n: 'MC02 report an absent counter as 0 instead of null',
    from: "  return typeof value === 'number' ? value : null", to: "  return typeof value === 'number' ? value : 0" },
  { f: CLA, n: 'MC03 report a reported 0 as absent (collapses "off" into "missed")',
    from: "  return typeof value === 'number' ? value : null",
    to: "  return typeof value === 'number' && value !== 0 ? value : null" },
  { f: CLA, n: 'MC04 read the wrong vendor counter into cacheReadTokens',
    from: '        cacheReadTokens: counter(meta?.cacheReadInputTokens),',
    to: '        cacheReadTokens: counter(meta?.cacheCreationInputTokens),' },
  { f: CLA, n: 'MC05 drop the defensive chaining (telemetry can throw on junk)',
    from: '        ?.providerMetadata?.anthropic', to: '        .providerMetadata.anthropic' },
  { f: CLA, n: 'MC06 mark EVERY system message (cache breakpoint swallows the dynamic segment)',
    from: "        if (m.role !== 'system' || marked) return m", to: "        if (m.role !== 'system') return m" },
  { f: CLA, n: 'MC07 decorate by mutating the caller\'s message objects',
    from: '        return { ...m, providerOptions: { anthropic: { cacheControl: { type: \'ephemeral\' as const } } } }',
    to: '        return Object.assign(m, { providerOptions: { anthropic: { cacheControl: { type: \'ephemeral\' as const } } } })' },

  // ── ai.ts: exactly-once resolution ────────────────────────────────────────
  { f: AIC, n: 'MA01 resolve a SECOND provider inside buildMessages (shape/serve split)',
    from: '  return provider.decorateMessages ? provider.decorateMessages(messages) : messages',
    to: '  const p2 = getProvider(); return p2.decorateMessages ? p2.decorateMessages(messages) : messages' },
  { f: AIC, n: 'MA02 stub usageMetrics instead of delegating to the provider',
    from: '    return getProvider().usageMetrics(step)',
    to: '    return { cacheReadTokens: null, cacheCreationTokens: null }' },
  { f: AIC, n: 'MA03 change the stream default role',
    // Anchor moved in P1 when ai.ts hoisted the model out of the call site.
    from: "    const model = provider.model(opts.role ?? 'smart')", to: "    const model = provider.model(opts.role ?? 'fast')" },
  { f: AIC, n: 'MA04 assume every provider decorates (breaks adapters that do not)',
    from: '  return provider.decorateMessages ? provider.decorateMessages(messages) : messages',
    to: '  return provider.decorateMessages(messages)' },

  // ── T9 guard liveness: real boundary breaches in real files ───────────────
  { f: RTE, n: 'MT01 [guard] read the vendor cache shape inline in the chat route again',
    from: '        const { cacheReadTokens: read, cacheCreationTokens: created } = AI.usageMetrics(step)',
    to: '        const { cacheReadTokens: read, cacheCreationTokens: created } = { cacheReadTokens: step.providerMetadata?.anthropic?.cacheReadInputTokens ?? null, cacheCreationTokens: null }' },
  { f: RTE, n: 'MT02 [guard] inline a concrete model id at a business call site',
    from: '  const role: ModelRole = (planningIntent || hasImage)',
    to: "  const pinned = 'claude-haiku-4-5-20251001'\n  const role: ModelRole = (planningIntent || hasImage)" },
  { f: RTE, n: 'MT03 [guard] read a vendor credential outside the adapter',
    from: '  const startTime = Date.now()', to: '  const startTime = Date.now()\n  const k = process.env.ANTHROPIC_API_KEY' },
  { f: AIC, n: 'MT04 [guard] import an adapter directly, bypassing the registry',
    from: "import { getProvider } from './registry'",
    to: "import { getProvider } from './registry'\nimport './providers/claude'" },
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
  // Restore unconditionally, then PROVE the tree is byte-identical. A mutation
  // run that silently leaves a mutant behind is worse than no run at all.
  for (const [f, s] of Object.entries(orig)) writeFileSync(f, s)
  for (const [f, s] of Object.entries(orig)) {
    const same = hash(readFileSync(f, 'utf8')) === hash(s)
    console.log(`restored ${f.split('/').pop().padEnd(14)} ${same ? 'IDENTICAL ✅' : 'MISMATCH ❌'}`)
  }
}
console.log(`\n${killed}/${M.length} killed, ${survived} survived, ${skipped} skipped`)
