// @vitest-environment node
// BENCH_SPEND_GATE · CHARACTERIZATION through the REAL OpenAI adapter (createOpenAIProvider → meteredModel). MOCK-ONLY: `fetch` is a stub that
// answers api.openai.com/v1/chat/completions with canned JSON / SSE and THROWS for any other URL; the key is a dummy set in this test only.
//
// Why it exists: the mocks in spendGate.llm.test.ts put `tappy.cost` into the finish part THEMSELVES, so they never prove that the layer which
// really attaches the cost (lunaModel.withCost in providers/openai.ts, fed by the @ai-sdk/openai usage parse) hands the gate a usable number —
// nor what happens when the provider sends no usage at all. This file closes that blind spot without touching the old tests.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createOpenAIProvider } from '../llm/providers/openai'
import { meteredModel } from './meteredModel'
import { runWithSpendGate, SpendRefusal, type SpendGate, type SpendReservation, type SpendSettleStatus } from './spendGate'

class NumGate implements SpendGate {
  held = 0; spent = 0; next = 1; calls: string[] = []; reservations: SpendReservation[] = []; blocked = false
  constructor(readonly cap: number) {}
  reserve(label: string, maxUsd: number): SpendReservation {
    if (this.blocked) { this.calls.push(`refused:${label}`); throw new SpendRefusal('blocked', 'blocked') }
    if (this.held + this.spent + maxUsd > this.cap + 1e-12) { this.calls.push(`refused:${label}`); throw new SpendRefusal('over the cap', 'budget') }
    this.held += maxUsd
    const r = { id: this.next++, maxUsd, label }
    this.reservations.push(r); this.calls.push(`reserve:${label}`)
    return r
  }
  settle(r: SpendReservation, actual: unknown): SpendSettleStatus {
    this.calls.push(`settle:${String(actual)}`); this.held -= r.maxUsd
    if (typeof actual !== 'number' || !(actual >= 0)) { this.blocked = true; return 'invalid' }
    this.spent += actual
    return actual > r.maxUsd + 1e-12 ? 'exceeded' : 'ok'
  }
  release(r: SpendReservation) { this.calls.push('release'); this.held -= r.maxUsd }
  markUnknown() { this.calls.push('unknown'); this.blocked = true }
}

let urls: string[] = []
let withUsage = true
const USAGE = { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 }
// gpt-6-luna list price: uncached input priced at the cache-write rate by the adapter (0.125/M), output 0.50/M
const EXPECTED_USD = (1000 * 0.125 + 200 * 0.5) / 1e6

function chunk(o: Record<string, unknown>) { return `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...o })}\n\n` }
function sse(): string {
  return chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'xin chào' }, finish_reason: null }] })
    + chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
    + (withUsage ? chunk({ choices: [], usage: USAGE }) : '')
    + 'data: [DONE]\n\n'
}
function stubFetch() {
  urls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    urls.push(u)
    if (!u.startsWith('https://api.openai.com/v1/chat/completions')) throw new Error(`UNEXPECTED fetch (a real request must never be made): ${u}`)
    return new Response(sse(), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }))
}
function stubFetchJson(body: unknown) {
  urls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    urls.push(u)
    if (!u.startsWith('https://api.openai.com/v1/chat/completions')) throw new Error(`UNEXPECTED fetch (a real request must never be made): ${u}`)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
}

const KEYS = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'C2_REQUEST_BUDGET', 'OPENAI_API_KEY', 'LLM_OPENAI_API']
beforeEach(() => {
  for (const k of KEYS) delete process.env[k]
  process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key'
  process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.65'
  withUsage = true
})
afterEach(() => { vi.unstubAllGlobals(); for (const k of KEYS) delete process.env[k] })

const prompt = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'xin chào' }] }]
const callOpts = { inputFormat: 'messages' as const, mode: { type: 'regular' as const }, prompt, maxTokens: 500 } as never
const model = () => meteredModel(createOpenAIProvider({}).model('consult'), 'consult')

async function drain(stream: ReadableStream<unknown>) { const r = stream.getReader(); const parts: Array<{ type: string }> = []; for (;;) { const n = await r.read(); if (n.done) return parts; parts.push(n.value as { type: string }) } }

describe('R1 · doStream through the real adapter', () => {
  it('the provider reports usage → the adapter (not the test) attaches tappy.cost to the finish part → the gate settles that exact USD', async () => {
    stubFetch()
    const g = new NumGate(1)
    const parts = await runWithSpendGate(g, async () => drain((await model().doStream(callOpts)).stream))
    expect(parts.some(p => p.type === 'finish')).toBe(true)
    expect(urls).toEqual(['https://api.openai.com/v1/chat/completions'])
    expect(g.calls[0]).toBe('reserve:llm:consult')
    expect(g.calls[1]).toMatch(/^settle:/)
    expect(Number(g.calls[1].slice('settle:'.length))).toBeCloseTo(EXPECTED_USD, 7)
    expect(g.held).toBe(0); expect(g.blocked).toBe(false)
  })
  it('the provider sends NO usage → the SDK reports NaN → the cost is not a usable number → settle is invalid and the gate is blocked (the next call is refused)', async () => {
    withUsage = false
    stubFetch()
    const g = new NumGate(1)
    await runWithSpendGate(g, async () => { await drain((await model().doStream(callOpts)).stream) })
    expect(g.calls[0]).toBe('reserve:llm:consult')
    expect(g.calls[1]).toMatch(/^settle:(null|NaN|undefined)$/)
    expect(g.blocked).toBe(true)
    await expect(runWithSpendGate(g, async () => model().doStream(callOpts))).rejects.toBeInstanceOf(SpendRefusal)
    expect(urls).toHaveLength(1) // the second call never reached fetch
  })
})

describe('R1 · doGenerate through the real adapter', () => {
  const completion = (usage?: unknown) => ({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content: 'xin chào' }, finish_reason: 'stop' }], ...(usage ? { usage } : {}) })
  it('usage present → settle with the adapter-priced USD', async () => {
    stubFetchJson(completion(USAGE))
    const g = new NumGate(1)
    await runWithSpendGate(g, async () => { await model().doGenerate(callOpts) })
    expect(Number(g.calls[1].slice('settle:'.length))).toBeCloseTo(EXPECTED_USD, 7)
    expect(g.blocked).toBe(false)
  })
  it('usage absent → no usable cost → settle invalid, gate blocked', async () => {
    stubFetchJson(completion())
    const g = new NumGate(1)
    await runWithSpendGate(g, async () => { await model().doGenerate(callOpts) })
    expect(g.calls[1]).toMatch(/^settle:(null|NaN|undefined)$/)
    expect(g.blocked).toBe(true)
  })
})
