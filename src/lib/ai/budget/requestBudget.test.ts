// C2 P2 · the request budget (requestBudget.ts) and its provider-level meter (meteredModel.ts). No network, no key: models are fakes.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { APICallError, type LanguageModelV1 } from 'ai'
import { RequestBudget, REQUEST_LIMITS, startRequestBudget, currentBudget, withRequestBudget, estimateTokens, promptChars, requestBudgetOn, reasoningHeadroomTokens } from './requestBudget'
import { meteredModel, usageFrom } from './meteredModel'
import { withFallback } from '../llm/fallback'
import { buildResponsesRequest } from '../llm/providers/openai'

const ENV = ['C2_REQUEST_BUDGET', 'C2_REASONING_HEADROOM_TOKENS']
beforeEach(() => { for (const k of ENV) delete process.env[k]; vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { for (const k of ENV) delete process.env[k]; vi.restoreAllMocks() })

const U = (text: string) => ({ role: 'user' as const, content: [{ type: 'text' as const, text }] })
const opts = (text: string, extra: Record<string, unknown> = {}) => ({ inputFormat: 'messages', mode: { type: 'regular' }, prompt: [U(text)], ...extra }) as never
const usage = (input: number, cached: number, output: number, reasoning = 0, usd = 0.001) => ({ usage: { promptTokens: input, completionTokens: output }, providerMetadata: { tappy: { cost: { inputTokens: input, cachedInputTokens: cached, outputTokens: output, reasoningTokens: reasoning, usd } } } })

function fakeModel(behaviour: (o: any) => any, calls: any[] = []): LanguageModelV1 {
  return {
    specificationVersion: 'v1', provider: 'fake', modelId: 'fake-1', defaultObjectGenerationMode: 'json', supportsImageUrls: false,
    async doGenerate(o: any) { calls.push(o); const b = await behaviour(o); return { text: 'ok', finishReason: 'stop', rawCall: { rawPrompt: null, rawSettings: {} }, ...b } },
    async doStream(o: any) {
      calls.push(o)
      const b = await behaviour(o)
      return { rawCall: { rawPrompt: null, rawSettings: {} }, stream: new ReadableStream({ start(c) { c.enqueue({ type: 'text-delta', textDelta: 'xin ' }); c.enqueue({ type: 'text-delta', textDelta: 'chào' }); c.enqueue({ type: 'finish', finishReason: 'stop', usage: b.usage, providerMetadata: b.providerMetadata }); c.close() } }) }
    },
  } as unknown as LanguageModelV1
}

describe('B0 · flag OFF = nothing changes', () => {
  it('no ledger is started; the meter returns the very same model object (no wrapper, no spread)', () => {
    expect(requestBudgetOn()).toBe(false)
    expect(startRequestBudget()).toBeNull()
    expect(currentBudget()).toBeNull()
    const m = fakeModel(() => usage(1, 0, 1))
    expect(meteredModel(m, 'agent')).toBe(m)
  })
  it('outside a request ledger (flag on, but e.g. a cron) the meter calls straight through, unchanged options', async () => {
    process.env.C2_REQUEST_BUDGET = '1'
    const calls: any[] = []
    const m = meteredModel(fakeModel(() => usage(10, 0, 5), calls), 'agent')
    await m.doGenerate(opts('x', { maxTokens: 9000 }))
    expect(calls[0].maxTokens).toBe(9000)
  })
  it('the Responses request keeps its old max_output_tokens outside a ledger', () => {
    process.env.C2_REASONING_HEADROOM_TOKENS = '2500'
    expect(buildResponsesRequest('m', 'medium', opts('x', { maxTokens: 7000 })).body.max_output_tokens).toBe(9500)
  })
})

describe('B1 · the ledger', () => {
  it('reserve is synchronous: two calls started together can never both take the same remainder', () => {
    const b = new RequestBudget({ ...REQUEST_LIMITS, tokens: 10_000 })
    const a = b.reserve('a', 'main', 3_000, 4_000)
    const c = b.reserve('c', 'aux', 3_000, 4_000)
    expect(a).not.toBeNull()
    expect(c).toBeNull()
    expect(b.records.find(r => r.label === 'c')).toMatchObject({ outcome: 'refused' })
  })
  it('settle releases the reservation and charges REAL uncached input + output (cache excluded, reasoning included)', () => {
    const b = new RequestBudget()
    const t = b.reserve('a', 'main', 8_000, 4_000)!
    expect(b.committed()).toBe(12_000)
    b.settle(t, { inputTokens: 8_000, cachedInputTokens: 6_000, outputTokens: 1_200, reasoningTokens: 900, usd: 0.002 })
    expect(b.committed()).toBe(2_000 + 1_200)
    expect(b.records[0]).toMatchObject({ outcome: 'ok', charged: 3_200, actual: { uncached: 2_000, cached: 6_000, output: 1_200, reasoning: 900 } })
  })
  it('estimate: first call all uncached; later calls new part uncached + repeated part at the measured cache ratio', () => {
    const b = new RequestBudget()
    expect(b.estimateUncached(8_000)).toBe(8_000)
    b.settle(b.reserve('a', 'main', 8_000, 100)!, { inputTokens: 8_000, cachedInputTokens: 6_000, outputTokens: 10, reasoningTokens: 0, usd: 0 })
    expect(b.estimateUncached(10_000)).toBe(2_000 + Math.ceil(8_000 * 0.25))
  })
  it('a real uncached input above its estimate is recorded as over_estimate (the estimate is not presented as exact)', () => {
    const b = new RequestBudget()
    b.settle(b.reserve('a', 'main', 100, 100)!, { inputTokens: 500, cachedInputTokens: 0, outputTokens: 10, reasoningTokens: 0, usd: 0 })
    expect(b.records[0].over_estimate).toBe(400)
  })
  it('a 4xx failure is not billed; any other failure is charged its estimated input', () => {
    const b = new RequestBudget()
    b.fail(b.reserve('a', 'main', 1_000, 4_000)!, false)
    expect(b.spentTokens()).toBe(0)
    b.fail(b.reserve('b', 'main', 1_000, 4_000)!, true)
    expect(b.spentTokens()).toBe(1_000)
    expect(b.committed()).toBe(1_000)
  })
  it('soft targets (1 500 visible / 2 500 reasoning) are only WARNED about', () => {
    const b = new RequestBudget()
    b.settle(b.reserve('a', 'main', 10, 4_000)!, { inputTokens: 10, cachedInputTokens: 0, outputTokens: 3_900, reasoningTokens: 3_000, usd: 0 })
    expect(b.records[0].warn).toEqual(['reasoning_over_soft_target'])
    b.settle(b.reserve('b', 'main', 10, 4_000)!, { inputTokens: 10, cachedInputTokens: 0, outputTokens: 2_000, reasoningTokens: 100, usd: 0 })
    expect(b.records[1].warn).toEqual(['visible_over_soft_target'])
  })
})

describe('B2 · planning a round (final answer always reserved; 30 s / 45 s)', () => {
  const at = (ms: number) => { let t = 1_000; const b = new RequestBudget(REQUEST_LIMITS, () => t, 1_000); t = 1_000 + ms; return b }
  it('a lookup round is allowed only when it AND the final answer fit', () => {
    const b = at(1_000)
    expect(b.planRound({ lookupInputTokens: 5_000, finalInputTokens: 5_500, outCap: 4_000, minStepMs: 4_000 })).toEqual({ verdict: 'ok', reason: 'lookup_and_final_fit' })
    expect(b.planRound({ lookupInputTokens: 7_000, finalInputTokens: 7_500, outCap: 4_000, minStepMs: 4_000 })).toEqual({ verdict: 'final_only', reason: 'request_budget' })
  })
  it('no room even for the final answer → stop', () => {
    const b = at(1_000)
    expect(b.planRound({ lookupInputTokens: null, finalInputTokens: 17_000, outCap: 4_000, minStepMs: 4_000 })).toEqual({ verdict: 'stop', reason: 'request_budget' })
  })
  it('after ~30 s no new lookup round; at the 45 s deadline (minus one step) stop', () => {
    expect(at(30_000).planRound({ lookupInputTokens: 10, finalInputTokens: 10, outCap: 100, minStepMs: 4_000 })).toEqual({ verdict: 'final_only', reason: 'lookup_cutoff' })
    expect(at(29_999).planRound({ lookupInputTokens: 10, finalInputTokens: 10, outCap: 100, minStepMs: 4_000 }).verdict).toBe('ok')
    expect(at(41_500).planRound({ lookupInputTokens: null, finalInputTokens: 10, outCap: 100, minStepMs: 4_000 })).toEqual({ verdict: 'stop', reason: 'deadline' })
  })
  it('the deadline is 45 s from when the server received the request', () => {
    const b = new RequestBudget(REQUEST_LIMITS, () => 5_000, 1_000)
    expect(b.deadlineAt()).toBe(46_000)
    expect(b.lookupCutoffAt()).toBe(31_000)
  })
})

describe('B3 · the provider-level meter', () => {
  beforeEach(() => { process.env.C2_REQUEST_BUDGET = '1' })
  it('every upstream call reserves and is charged its real usage; output capped at 4 000', async () => {
    const b = new RequestBudget()
    const calls: any[] = []
    const m = meteredModel(fakeModel(() => usage(3_000, 1_000, 800, 500), calls), 'agent')
    await withRequestBudget(b, () => m.doGenerate(opts('hello', { maxTokens: 7_000 })))
    expect(calls[0].maxTokens).toBe(4_000)
    expect(b.spentTokens()).toBe(2_000 + 800)
    expect(b.committed()).toBe(b.spentTokens())
  })
  it('a refused call never reaches the provider (RequestBudgetError)', async () => {
    const b = new RequestBudget({ ...REQUEST_LIMITS, tokens: 100 })
    const calls: any[] = []
    const m = meteredModel(fakeModel(() => usage(1, 0, 1), calls), 'agent')
    await expect(withRequestBudget(b, () => m.doGenerate(opts('hello', { maxTokens: 4_000 })))).rejects.toMatchObject({ name: 'RequestBudgetError' })
    expect(calls).toHaveLength(0)
  })
  it('a FALLBACK is a second upstream call: both are reserved and recorded', async () => {
    const b = new RequestBudget()
    const primary = meteredModel(fakeModel(() => { throw new APICallError({ message: 'down', url: 'x', requestBodyValues: {}, statusCode: 503, isRetryable: true }) }), 'agent')
    const retry = meteredModel(fakeModel(() => usage(2_000, 0, 300)), 'agent:retry')
    const m = withFallback(primary, retry, { firstPartMs: 5_000, label: 'agent' })
    await withRequestBudget(b, () => m.doGenerate(opts('hello', { maxTokens: 1_500 })))
    expect(b.records.map(r => [r.label, r.outcome])).toEqual([['agent', 'error_usage_unknown'], ['agent:retry', 'ok']])
    expect(b.spentTokens()).toBe(estimateTokens(promptChars([U('hello')])) + 2_300)
  })
  it('a 4xx refusal is recorded unbilled', async () => {
    const b = new RequestBudget()
    const m = meteredModel(fakeModel(() => { throw new APICallError({ message: 'bad', url: 'x', requestBodyValues: {}, statusCode: 400, isRetryable: false }) }), 'agent')
    await expect(withRequestBudget(b, () => m.doGenerate(opts('x', { maxTokens: 100 })))).rejects.toBeTruthy()
    expect(b.records[0]).toMatchObject({ outcome: 'error_unbilled', charged: 0 })
  })
  it('a stream is charged at its finish part; a cancelled stream releases its reservation and is charged its estimate', async () => {
    const b = new RequestBudget()
    const m = meteredModel(fakeModel(() => usage(1_000, 0, 50)), 'agent')
    const r = await withRequestBudget(b, () => m.doStream(opts('x', { maxTokens: 100 })))
    const reader = r.stream.getReader(); while (!(await reader.read()).done) { /* drain */ }
    expect(b.records[0]).toMatchObject({ outcome: 'ok', charged: 1_050 })
    const r2 = await withRequestBudget(b, () => m.doStream(opts('y', { maxTokens: 100 })))
    await r2.stream.cancel('client gone')
    expect(b.records[1]).toMatchObject({ outcome: 'error_usage_unknown' })
    expect(b.committed()).toBe(b.spentTokens())
  })
  it('two requests never share a ledger (AsyncLocalStorage scope)', async () => {
    const b1 = new RequestBudget(), b2 = new RequestBudget()
    const m = meteredModel(fakeModel(async () => { await new Promise(r => setTimeout(r, 5)); return usage(100, 0, 10) }), 'agent')
    await Promise.all([withRequestBudget(b1, () => m.doGenerate(opts('a', { maxTokens: 10 }))), withRequestBudget(b2, () => Promise.all([m.doGenerate(opts('b', { maxTokens: 10 })), m.doGenerate(opts('c', { maxTokens: 10 }))]))])
    expect(b1.records).toHaveLength(1)
    expect(b2.records).toHaveLength(2)
  })
  it('the Responses request is capped at 4 000 output tokens (reasoning + text) inside a ledger', () => {
    process.env.C2_REASONING_HEADROOM_TOKENS = '2500'
    const b = new RequestBudget()
    expect(withRequestBudget(b, () => buildResponsesRequest('m', 'medium', opts('x', { maxTokens: 1_500 })).body.max_output_tokens)).toBe(4_000)
    expect(withRequestBudget(b, () => buildResponsesRequest('m', 'medium', opts('x', { maxTokens: 7_000 })).body.max_output_tokens)).toBe(4_000)
    expect(withRequestBudget(b, () => buildResponsesRequest('m', 'none', opts('x', { maxTokens: 1_500 })).body.max_output_tokens)).toBe(1_500)
    expect(reasoningHeadroomTokens()).toBe(2_500)
  })
  it('usageFrom reads the adapter cost block, else the SDK usage (all input then treated as uncached)', () => {
    expect(usageFrom({ promptTokens: 10, completionTokens: 2 }, { tappy: { cost: { inputTokens: 10, cachedInputTokens: 4, outputTokens: 2, reasoningTokens: 1, usd: 0.1 } } })).toEqual({ inputTokens: 10, cachedInputTokens: 4, outputTokens: 2, reasoningTokens: 1, usd: 0.1 })
    expect(usageFrom({ promptTokens: 10, completionTokens: 2 }, undefined)).toEqual({ inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, reasoningTokens: null, usd: null })
  })
})
