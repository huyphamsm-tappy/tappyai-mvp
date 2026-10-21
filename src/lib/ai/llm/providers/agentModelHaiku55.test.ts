import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateText, tool, type CoreMessage, type LanguageModelV1 } from 'ai'
import { z } from 'zod'

// AGENT_MODEL=haiku55 (owner 2026-10-11): the agent runtime's model can be Claude Haiku 5.5 instead of Luna.
// What is pinned here:
//   1. flag OFF (unset / luna / anything else) = the exact pre-flag resolution, shaping and retry behaviour
//   2. the request Anthropic actually receives: tools, system blocks, cache breakpoints, tool_use / tool_result, thinking off
//   3. pricing from the official rate card, both prompt-length tiers
//   4. an API error is not retried, and is logged by status + type only
//   5. AGENT_MODEL_FALLBACK=luna, and a missing key reported by NAME

const generateSpy = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }))
vi.mock('ai', async importOriginal => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateText: (args: Record<string, unknown>) => {
      if ((args as { __passthrough?: boolean }).__passthrough) return actual.generateText(args as never)
      generateSpy.calls.push(args)
      return Promise.resolve({ text: 'ok', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } })
    },
  }
})

const registry = await import('../registry')
const { AI } = await import('../ai')
const { claudeCallCost, createHaiku55AgentModel } = await import('./claude')
const { withThinkingDisabled, agentTransport } = await import('./anthropicTransport')

beforeEach(() => {
  generateSpy.calls.length = 0
  vi.stubEnv('OPENAI_API_KEY', 'test-openai')
  vi.stubEnv('LLM_PROVIDER', '')
  registry.resetRoutingForTests()
})
afterEach(() => { vi.unstubAllEnvs(); registry.resetRoutingForTests() })

describe('flag OFF = the behaviour before the flag (pinned)', () => {
  for (const v of [undefined, '', 'luna', 'LUNA', 'haiku', 'claude']) {
    it(`AGENT_MODEL=${v === undefined ? '(unset)' : JSON.stringify(v)} → Luna for every runtime call`, () => {
      if (v !== undefined) vi.stubEnv('AGENT_MODEL', v)
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic')
      expect(registry.agentModelChoice()).toBe('luna')
      for (const [role, rt] of [['agent', false], ['agent', true], ['plan', true]] as const) {
        const m = registry.modelForRole(role, { agentRuntime: rt })
        expect(m.provider).toMatch(/^openai/)
        expect(m.modelId).toBe('gpt-6-luna')
        expect(registry.usesAnthropicAgentModel(role, { agentRuntime: rt })).toBe(false)
      }
      expect(registry.roleServing('agent').provider).toBe('openai')
    })
  }

  it('AI.step: no cache markers, SDK-default retries (maxRetries undefined), Luna model', async () => {
    await AI.step({ role: 'agent', systemShared: 'S', system: 's', messages: [{ role: 'user', content: 'hi' }], agentRuntime: true })
    const a = generateSpy.calls[0] as { model: LanguageModelV1; messages: CoreMessage[]; maxRetries?: number }
    expect(a.model.modelId).toBe('gpt-6-luna')
    expect(a.maxRetries).toBeUndefined()
    expect(a.messages.every(m => !(m as { providerOptions?: unknown }).providerOptions)).toBe(true)
  })
})

describe('flag ON (AGENT_MODEL=haiku55)', () => {
  beforeEach(() => { vi.stubEnv('AGENT_MODEL', 'haiku55'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic') })

  it('routes role agent and the runtime’s final plan step to Claude Haiku 5.5; other plan calls stay on Luna', () => {
    expect(registry.modelForRole('agent').modelId).toBe('claude-haiku-5-5')
    expect(registry.modelForRole('agent', { structured: true }).modelId).toBe('claude-haiku-5-5')
    expect(registry.modelForRole('plan', { agentRuntime: true }).modelId).toBe('claude-haiku-5-5')
    expect(registry.modelForRole('plan').modelId).toBe('gpt-6-luna')
    expect(registry.modelForRole('fast').modelId).toBe('gpt-6-luna')
    expect(registry.roleServing('agent')).toEqual({ provider: 'anthropic', effort: 'thinking_off' })
  })

  it('AI.step: cache breakpoints on the static system block and the last user message, and NO SDK retry', async () => {
    await AI.step({ role: 'agent', systemShared: 'STATIC', system: 'dynamic', messages: [{ role: 'user', content: 'data' }, { role: 'user', content: 'q' }] })
    const a = generateSpy.calls[0] as { model: LanguageModelV1; messages: Array<CoreMessage & { providerOptions?: unknown }>; maxRetries?: number }
    expect(a.model.modelId).toBe('claude-haiku-5-5')
    expect(a.maxRetries).toBe(0)
    const mark = { anthropic: { cacheControl: { type: 'ephemeral' } } }
    expect(a.messages.map(m => m.providerOptions ?? null)).toEqual([mark, null, null, mark])
  })
})

describe('the request Anthropic receives (tool / message format conversion)', () => {
  const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

  it('tools, system blocks, tool_use / tool_result history, cache_control, thinking off — and the reply parsed back', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic')
    const seen: Array<{ url: string; body: Record<string, unknown> }> = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return okResponse({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'tool_use',
        content: [{ type: 'text', text: 'Mình tra nhé.' }, { type: 'tool_use', id: 'toolu_2', name: 'web_search', input: { queries: ['giá xăng hôm nay'] } }],
        usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
      })
    })
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    const model = createHaiku55AgentModel({ fetchImpl })
    const { claudeDecorateMessages } = await import('./claude')
    const history: CoreMessage[] = [
      { role: 'system', content: 'STATIC RULES' },
      { role: 'system', content: 'per-turn context' },
      { role: 'user', content: 'giá xăng?' },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'toolu_1', toolName: 'get_news', args: { topic: 'xăng' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'toolu_1', toolName: 'get_news', result: { rows: [] } }] },
    ]
    const r = await generateText({
      __passthrough: true,
      model,
      maxRetries: 0,
      messages: claudeDecorateMessages(history),
      tools: {
        web_search: tool({ description: 'Search the web', parameters: z.object({ queries: z.array(z.string()) }) }),
        get_news: tool({ description: 'News', parameters: z.object({ topic: z.string() }) }),
      },
    } as never)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const { url, body } = seen[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(body.model).toBe('claude-haiku-5-5')
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('top_p')
    // tools → {name, description, input_schema}
    const tools = body.tools as Array<{ name: string; description: string; input_schema: { properties: Record<string, unknown> } }>
    expect(tools.map(t => t.name)).toEqual(['web_search', 'get_news'])
    expect(tools[0].description).toBe('Search the web')
    expect(Object.keys(tools[0].input_schema.properties)).toEqual(['queries'])
    // two system blocks; the breakpoint on the first (it also covers the tool definitions, which render before system)
    const system = body.system as Array<{ type: string; text: string; cache_control?: unknown }>
    expect(system.map(s => s.text)).toEqual(['STATIC RULES', 'per-turn context'])
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(system[1].cache_control).toBeUndefined()
    // history: tool-call → tool_use, tool-result → tool_result (in a user turn)
    const msgs = body.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(msgs[1].content[0]).toMatchObject({ type: 'tool_use', id: 'toolu_1', name: 'get_news', input: { topic: 'xăng' } })
    expect(msgs[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' })
    // the last user message ("giá xăng?") carries the second breakpoint
    expect(msgs[0].content[0]).toMatchObject({ type: 'text', text: 'giá xăng?', cache_control: { type: 'ephemeral' } })

    // reply parsed back into neutral tool calls
    expect(r.text).toBe('Mình tra nhé.')
    expect(r.toolCalls).toEqual([expect.objectContaining({ toolCallId: 'toolu_2', toolName: 'web_search', args: { queries: ['giá xăng hôm nay'] } })])
    // priced at the ≤100K card: 120 × 0.10 + 9000 × 0.01 + 40 × 0.50 per million
    const cost = (r.providerMetadata as { tappy: { cost: { usd: number; cachedInputTokens: number; provider: string } } }).tappy.cost
    expect(cost.provider).toBe('anthropic')
    expect(cost.cachedInputTokens).toBe(9000)
    expect(cost.usd).toBeCloseTo((120 * 0.10 + 9000 * 0.01 + 40 * 0.50) / 1e6, 10)
    const line = logs.mock.calls.map(c => String(c[0])).find(l => l.includes('tappyai_agent_model_cost'))
    expect(JSON.parse(line!)).toMatchObject({ model: 'claude-haiku-5-5', tokens_in: 120, tokens_out: 40, cache_read: 9000, cache_write: 0 })
    expect(line).not.toContain('test-anthropic')
    logs.mockRestore()
  })

  it('an API error (429) is NOT retried and is logged by status + type only', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic')
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }), { status: 429, headers: { 'content-type': 'application/json' } }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const model = createHaiku55AgentModel({ fetchImpl })
    await expect(generateText({ __passthrough: true, model, maxRetries: 0, messages: [{ role: 'user', content: 'x' }] } as never)).rejects.toThrow()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const line = warn.mock.calls.map(c => String(c[0])).find(l => l.includes('tappyai_agent_model_error'))
    expect(JSON.parse(line!)).toMatchObject({ status: 429, error_type: 'rate_limit_error', model: 'claude-haiku-5-5' })
    expect(line).not.toContain('slow down')
    warn.mockRestore()
  })
})

describe('transport', () => {
  it('adds thinking:disabled and removes sampling settings — only on a JSON request for the agent model', () => {
    expect(JSON.parse(withThinkingDisabled(JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 5, temperature: 0, top_p: 0.9, top_k: 5 }), 'claude-haiku-5-5') as string)).toEqual({ model: 'claude-haiku-5-5', max_tokens: 5, thinking: { type: 'disabled' } })
    const other = JSON.stringify({ model: 'claude-haiku-4-5-20251001', temperature: 0 })
    expect(withThinkingDisabled(other, 'claude-haiku-5-5')).toBe(other)
    const explicit = JSON.stringify({ model: 'claude-haiku-5-5', thinking: { type: 'adaptive' } })
    expect(JSON.parse(withThinkingDisabled(explicit, 'claude-haiku-5-5') as string)).toEqual({ model: 'claude-haiku-5-5', thinking: { type: 'adaptive' } })
    expect(withThinkingDisabled('not json', 'claude-haiku-5-5')).toBe('not json')
  })
  it('refuses any origin but api.anthropic.com before a request is made', async () => {
    const base = vi.fn()
    await expect(agentTransport('claude-haiku-5-5', base as never)('https://169.254.169.254/latest', { method: 'POST' })).rejects.toThrow('anthropic_transport_refused_origin')
    expect(base).not.toHaveBeenCalled()
  })
})

describe('pricing — official rate card (platform.claude.com/docs/en/about-claude/pricing, read 2026-10-11)', () => {
  it('≤ 100K prompt tokens: $0.10 in · $0.125 5-min write · $0.01 read · $0.50 out', () => {
    const c = claudeCallCost('claude-haiku-5-5', { input: 40_000, cacheWrite: 40_000, cacheRead: 20_000, output: 10_000 })!
    expect(c.inputTokens).toBe(100_000) // exactly at the threshold: still the low card
    expect(c.usd).toBeCloseTo((40_000 * 0.10 + 40_000 * 0.125 + 20_000 * 0.01 + 10_000 * 0.50) / 1e6, 10)
  })
  it('the tier is chosen by input + cache reads + cache writes', () => {
    const low = claudeCallCost('claude-haiku-5-5', { input: 10_000, cacheWrite: 20_000, cacheRead: 60_000, output: 1_000 })!
    expect(low.usd).toBeCloseTo((10_000 * 0.10 + 20_000 * 0.125 + 60_000 * 0.01 + 1_000 * 0.50) / 1e6, 10)
    const high = claudeCallCost('claude-haiku-5-5', { input: 10_000, cacheWrite: 20_000, cacheRead: 80_000, output: 1_000 })!
    expect(high.usd).toBeCloseTo((10_000 * 0.50 + 20_000 * 0.625 + 80_000 * 0.05 + 1_000 * 2.50) / 1e6, 10)
    expect(high.inputTokens).toBe(110_000)
  })
  it('a model with no price row is not priced', () => {
    expect(claudeCallCost('claude-opus-5-5', { input: 1, cacheWrite: 0, cacheRead: 0, output: 1 })).toBeNull()
  })
})

describe('fallback and missing key', () => {
  const fakeModel = (id: string, impl: () => Promise<unknown>): LanguageModelV1 & { calls: number } => {
    const m = { specificationVersion: 'v1', provider: id, modelId: id, defaultObjectGenerationMode: 'tool', supportsImageUrls: false, calls: 0,
      doGenerate: async () => { m.calls++; return impl() }, doStream: async () => { throw new Error('no stream') } }
    return m as never
  }
  const answer = { text: 'luna answer', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, rawCall: { rawPrompt: null, rawSettings: {} } }
  const waits = { firstPartMs: 5000, generateMs: 5000 }

  it('Anthropic fails + AGENT_MODEL_FALLBACK=luna → Luna answers once, marked fellBack; Haiku called once', async () => {
    const haiku = fakeModel('haiku', () => Promise.reject(Object.assign(new Error('overloaded'), { statusCode: 529 })))
    const luna = fakeModel('luna', () => Promise.resolve(answer))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = registry.buildAgentModel({ configured: true, fallbackToLuna: true, haiku: () => haiku, luna: () => luna, waits, label: 'agent' })
    const r = await m.doGenerate({} as never)
    expect(r.text).toBe('luna answer')
    expect((r.providerMetadata as { tappy: { fellBack: boolean } }).tappy.fellBack).toBe(true)
    expect(haiku.calls).toBe(1)
    expect(luna.calls).toBe(1)
  })

  it('Anthropic fails, no fallback flag → the error surfaces; Luna is never built or called', async () => {
    const haiku = fakeModel('haiku', () => Promise.reject(new Error('credit balance too low')))
    const lunaFactory = vi.fn(() => fakeModel('luna', () => Promise.resolve(answer)))
    const m = registry.buildAgentModel({ configured: true, fallbackToLuna: false, haiku: () => haiku, luna: lunaFactory, waits, label: 'agent' })
    await expect(m.doGenerate({} as never)).rejects.toThrow('credit balance too low')
    expect(haiku.calls).toBe(1)
    expect(lunaFactory).not.toHaveBeenCalled()
  })

  it('missing key, no fallback → every call fails naming ANTHROPIC_API_KEY (the variable, never a value); nothing is sent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const haikuFactory = vi.fn()
    const m = registry.buildAgentModel({ configured: false, fallbackToLuna: false, haiku: haikuFactory as never, luna: () => fakeModel('luna', () => Promise.resolve(answer)), waits, label: 'agent' })
    await expect(m.doGenerate({} as never)).rejects.toThrow(/set ANTHROPIC_API_KEY/)
    expect(haikuFactory).not.toHaveBeenCalled()
    const line = warn.mock.calls.map(c => String(c[0])).find(l => l.includes('tappyai_agent_model_config'))
    expect(JSON.parse(line!)).toMatchObject({ type: 'tappyai_agent_model_config', missing: 'ANTHROPIC_API_KEY', fallback: null })
  })

  it('missing key + fallback flag → Luna serves the call', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = registry.buildAgentModel({ configured: false, fallbackToLuna: true, haiku: () => { throw new Error('must not build') }, luna: () => fakeModel('luna', () => Promise.resolve(answer)), waits, label: 'agent' })
    expect((await m.doGenerate({} as never)).text).toBe('luna answer')
  })

  it('end to end through the registry: AGENT_MODEL=haiku55 with no key and no fallback flag fails the step', async () => {
    vi.stubEnv('AGENT_MODEL', 'haiku55')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(registry.modelForRole('agent').doGenerate({} as never)).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })
})
