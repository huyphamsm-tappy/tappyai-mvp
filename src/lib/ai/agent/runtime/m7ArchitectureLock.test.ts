// @vitest-environment node
// Phase 8 M7 — the final architecture locks for TAPPY_AGENT=2 (web). Each test names the invariant it protects; a failure means the
// architecture changed, not that a test needs loosening. Source-level checks read the files that own the boundary; behavioural checks
// run the runtime with a scripted model (no network).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { agentRuntimeV2Enabled, startAgentRuntimeTurn } from './index'
import { AgentRunTrace } from './trace'
import { RUNTIME_LIMITS } from './limits'
import { haikuFallbackEnabled } from '@/lib/ai/llm/registry'
import type { RuntimeStep } from './loop'

const ROOT = join(__dirname, '..', '..', '..', '..', '..')
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const ROUTE = src('src/app/api/chat/route.ts')

afterEach(() => vi.restoreAllMocks())

describe('M7 · one runtime, flag-isolated', () => {
  it('TAPPY_AGENT=2 is the only switch to the runtime; unset (production) and "1" never reach it', () => {
    expect(agentRuntimeV2Enabled({})).toBe(false)
    expect(agentRuntimeV2Enabled({ TAPPY_AGENT: '1' })).toBe(false)
    expect(agentRuntimeV2Enabled({ TAPPY_AGENT: 'true' })).toBe(false)
    expect(agentRuntimeV2Enabled({ TAPPY_AGENT: '2' })).toBe(true)
  })
  it('the route starts the runtime in exactly one place, chosen by the Phase 8 trace (agentV2); the Phase 7 loop is the else branch only', () => {
    expect(ROUTE.match(/startAgentRuntimeTurn\(/g)).toHaveLength(1)
    expect(ROUTE.match(/startAgentTurn\(/g)).toHaveLength(1)
    expect(ROUTE).toMatch(/return agentRunTrace\s*\?\s*startAgentRuntimeTurn\(\{[^\n]*\}\)\s*:\s*startAgentTurn\(turnInput\)/)
    expect(ROUTE).toMatch(/const agentRunTrace = agentV2 \? new AgentRunTrace\(/)
  })
  it('exactly one agent loop serves the runtime: runAgentRuntime is called only by runtime/index.ts, which never touches the Phase 7 loop', () => {
    const idx = src('src/lib/ai/agent/runtime/index.ts')
    expect(idx.match(/runAgentRuntime\(/g)).toHaveLength(1)
    expect(idx).not.toMatch(/runBoundedAgent/)
    for (const f of ['src/app/api/chat/route.ts', 'src/lib/ai/streamEnrichment.ts', 'src/lib/ai/agent/index.ts']) expect(src(f)).not.toMatch(/runAgentRuntime\(/)
  })
})

describe('M7 · no legacy reasoning around the runtime', () => {
  it('the legacy intent / consult-brain model calls, every pre-search, the evening plan and the plan completion are gated off the agent path', () => {
    expect(ROUTE).toMatch(/const lunaIntentRun = !agentOn && /)
    expect(ROUTE).toMatch(/const consultRun = lunaRun \?\? \(!agentOn && /)
    expect(ROUTE).toMatch(/let presearchPlan = consultativeV1 && !agentOn \?/)
    expect(ROUTE).toMatch(/const flightPresearch = consultativeV1 && !agentOn && /)
    expect(ROUTE).toMatch(/const eveningSearches = !agentOn && /)
    expect(ROUTE).toMatch(/: !agentOn && planningIntent && streamed\.body\s*\?\s*new Response\(planCompletionStream\(/)
  })
  it('the route never scores candidates on the agent path: its agent branch returns before rankCandidates, and code never relaxes a hard constraint', () => {
    const body = ROUTE.slice(ROUTE.indexOf('const rankForModel = '), ROUTE.indexOf('const freezeShoppingEvidence = '))
    expect(body.indexOf('if (agentV2) {')).toBeGreaterThan(0)
    expect(body.indexOf('if (agentV2) {')).toBeLessThan(body.indexOf('rankCandidates('))
    expect(ROUTE).toMatch(/const relax = agentV2 \? \{/)
  })
  it('Luna is the only model of the runtime by default: the vendor fallback is opt-in (HAIKU_FALLBACK, unset in production) — a failed Luna step is retried on Luna', () => {
    expect(haikuFallbackEnabled({})).toBe(false)
    expect(haikuFallbackEnabled({ HAIKU_FALLBACK: '' })).toBe(false)
  })
})

describe('M7 · budgets, deadline and trace contract', () => {
  it('the ceilings are the accepted ones (6 rounds, 8 tool calls, 85 s, 4 page reads)', () => {
    expect(RUNTIME_LIMITS).toMatchObject({ maxModelRounds: 6, maxToolCalls: 8, deadlineMs: 85_000, maxPageReads: 4 })
  })
  it('one turn emits ONE structured trace with every field the observability contract names', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((s: unknown) => { lines.push(String(s)) })
    const trace = new AgentRunTrace({ chatSessionId: '77777777-7777-4777-8777-777777777777', messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
    const steps: RuntimeStep[] = [
      { text: '', finishReason: 'tool-calls', toolCalls: [{ toolCallId: 'c1', toolName: 'search_places', args: { query: 'phở quận 1', why: 'tìm quán' } }], usage: { promptTokens: 1000, completionTokens: 20 }, modelId: 'test-model-id' },
      { text: 'Mình chọn **Phở A**.', finishReason: 'stop', toolCalls: [], usage: { promptTokens: 1200, completionTokens: 30 }, modelId: 'test-model-id' },
    ]
    const r = startAgentRuntimeTurn({
      routeTools: { search_places: { description: 'places', parameters: z.object({ query: z.string() }), execute: async () => ({ results: [{ name: 'Phở A' }, { name: 'Phở B' }] }) } } as never,
      context: { system: 'S', data: null }, serperTurnCredits: 12, messages: [{ role: 'user', content: 'phở ngon quận 1' }], lang: 'vi',
      deadlineAt: Date.now() + 85_000, finalRole: 'agent', maxTokens: 800, canConfirmActions: false, onPendingAction: () => {}, sanitizeQuery: q => ({ query: q, cut: [] }), trace,
      callModel: async () => steps.shift()!,
    })
    await r.toDataStreamResponse().text()
    trace.finish({ delivered: 'Mình chọn Phở A.', cards: 2 })
    const t = JSON.parse(lines.find(l => l.startsWith('{"type":"tappyai_agent_run_trace"'))!) as Record<string, unknown> & { events: Array<Record<string, unknown>>; totals: Record<string, unknown>; research: Record<string, unknown> }
    for (const k of ['trace_id', 'conversation_id', 'task_id', 'message_id', 'model', 'provider', 'status', 'stop_reason', 'final_output_type', 'totals', 'research', 'events']) expect(t, k).toHaveProperty(k)
    expect(t.model).toBe('test-model-id')
    for (const k of ['modelRounds', 'toolCalls', 'promptTokens', 'completionTokens', 'usd', 'errors', 'timeouts', 'elapsed_ms']) expect(t.totals, k).toHaveProperty(k)
    expect(t.research).toHaveProperty('evidence')
    const round = t.events.find(e => e.kind === 'model_round')!
    for (const k of ['round', 'ms', 'decision', 'tokens_in', 'tokens_out', 'usd']) expect(round, k).toHaveProperty(k)
    const call = t.events.find(e => e.kind === 'tool_call')!
    for (const k of ['round', 'tool', 'input_hash', 'query']) expect(call, k).toHaveProperty(k)
    const res = t.events.find(e => e.kind === 'tool_result')!
    for (const k of ['tool', 'ms', 'result_count', 'outcome']) expect(res, k).toHaveProperty(k)
    expect(res.result_count).toBe(2)
    expect(JSON.stringify(t)).not.toContain('phở ngon quận 1') // the user's message itself is never logged
  })
})
