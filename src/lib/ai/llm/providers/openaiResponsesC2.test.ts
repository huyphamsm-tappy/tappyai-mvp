// C2 Phase 2/3 — the Responses adapter levers: reasoning headroom on top of the answer budget (C2_REASONING_HEADROOM_TOKENS) and the per-step
// effort (AI.step `effort` → providerMetadata.tappy.effort). Fetch is stubbed; the key is a dummy. No network, no cost.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createOpenAIProvider, buildResponsesRequest, reasoningHeadroomTokens, __resetResponsesStateForTests } from './openai'
import { resetRoutingForTests } from '../registry'

const KEY = 'sk-test-DUMMYKEY-0123456789abcdef'
const TOOL = { type: 'function' as const, name: 'lookup_price', description: 'price', parameters: { type: 'object', properties: {} } }
const U = (text: string) => ({ role: 'user' as const, content: [{ type: 'text' as const, text }] })
const withTools = (extra: Record<string, unknown> = {}) => ({ inputFormat: 'messages', mode: { type: 'regular', tools: [TOOL], toolChoice: { type: 'auto' } }, prompt: [U('q')], ...extra }) as never
const MSG = { id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }
const ENV = ['LLM_OPENAI_API', 'OPENAI_API_KEY', 'LLM_RESPONSES_PROCESS_BUDGET_USD', 'LLM_AGENT_REASONING', 'C2_REASONING_HEADROOM_TOKENS', 'LLM_FALLBACK_DISABLED']

let sent: Array<Record<string, any>>
beforeEach(() => {
  __resetResponsesStateForTests(); resetRoutingForTests()
  sent = []
  for (const k of ENV) delete process.env[k]
  process.env.LLM_OPENAI_API = 'responses'; process.env.OPENAI_API_KEY = KEY; process.env.LLM_RESPONSES_PROCESS_BUDGET_USD = '1'; process.env.LLM_FALLBACK_DISABLED = '1'
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body?: string }) => {
    sent.push(init?.body ? JSON.parse(init.body) : {})
    return new Response(JSON.stringify({ id: 'r', model: 'gpt-6-luna', status: 'completed', output: [MSG], usage: { input_tokens: 10, output_tokens: 5, output_tokens_details: { reasoning_tokens: 0 } } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); for (const k of ENV) delete process.env[k] })

describe('A1 · reasoning headroom (default off)', () => {
  it('unset / 0 / junk → no headroom: max_output_tokens is the answer budget exactly', () => {
    for (const v of [undefined, '0', 'abc', '-100']) {
      if (v === undefined) delete process.env.C2_REASONING_HEADROOM_TOKENS; else process.env.C2_REASONING_HEADROOM_TOKENS = v
      expect(buildResponsesRequest('m', 'medium', withTools({ maxTokens: 1500 })).body.max_output_tokens, String(v)).toBe(1500)
    }
  })
  it('n > 0 → answer budget + n when reasoning is on; capped at 8000; effort none gets no headroom', () => {
    process.env.C2_REASONING_HEADROOM_TOKENS = '2500'
    expect(buildResponsesRequest('m', 'medium', withTools({ maxTokens: 1500 })).body.max_output_tokens).toBe(4000)
    expect(buildResponsesRequest('m', 'low', withTools({ maxTokens: 1500 })).body.max_output_tokens).toBe(4000)
    expect(buildResponsesRequest('m', 'none', withTools({ maxTokens: 1500 })).body.max_output_tokens).toBe(1500)
    process.env.C2_REASONING_HEADROOM_TOKENS = '99999'
    expect(reasoningHeadroomTokens()).toBe(8000)
    expect(buildResponsesRequest('m', 'high', withTools({ maxTokens: 1500 })).body.max_output_tokens).toBe(9500)
  })
  it('no answer budget → no max_output_tokens field at all (headroom never invents one)', () => {
    process.env.C2_REASONING_HEADROOM_TOKENS = '2500'
    expect(buildResponsesRequest('m', 'medium', withTools()).body).not.toHaveProperty('max_output_tokens')
  })
})

describe('A2 · per-step effort', () => {
  it('without a step effort the role effort is sent (unchanged)', async () => {
    process.env.LLM_AGENT_REASONING = 'medium'
    await createOpenAIProvider({}).model('agent' as never).doGenerate(withTools())
    expect(sent[0].reasoning).toEqual({ effort: 'medium' })
  })
  it('a step effort wins for that call only; an unknown value is ignored', async () => {
    process.env.LLM_AGENT_REASONING = 'medium'
    const m = createOpenAIProvider({}).model('agent' as never)
    await m.doGenerate(withTools({ providerMetadata: { tappy: { effort: 'low' } } }))
    await m.doGenerate(withTools())
    await m.doGenerate(withTools({ providerMetadata: { tappy: { effort: 'xhigh-bogus' } } }))
    expect(sent.map(b => b.reasoning.effort)).toEqual(['low', 'medium', 'medium'])
  })
  it('the step effort and parallel tools travel together', async () => {
    await createOpenAIProvider({}).model('agent' as never).doGenerate(withTools({ providerMetadata: { tappy: { effort: 'high', parallelTools: true } } }))
    expect(sent[0]).toMatchObject({ reasoning: { effort: 'high' }, parallel_tool_calls: true })
  })
})
