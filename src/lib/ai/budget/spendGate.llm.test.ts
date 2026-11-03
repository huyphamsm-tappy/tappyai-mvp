// @vitest-environment node
// BENCH_SPEND_GATE · every model call is reserved BEFORE it is sent. MOCK-ONLY: the models below are fakes and `fetch` is stubbed to throw,
// so a test that reaches the network fails.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { APICallError, generateText } from 'ai'
import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import { meteredModel } from './meteredModel'
import { RequestBudgetError } from './requestBudget'
import { withFallback } from '../llm/fallback'
import { runWithSpendGate, SpendRefusal, type SpendGate, type SpendReservation, type SpendSettleStatus } from './spendGate'

class NumGate implements SpendGate {
  held = 0; spent = 0; next = 1; calls: string[] = []; reservations: SpendReservation[] = []; heldBefore: number[] = []
  constructor(readonly cap: number, readonly blockAfterUnknown = false) {}
  private blocked = false
  reserve(label: string, maxUsd: number): SpendReservation {
    if (this.blocked) { this.calls.push(`refused:${label}`); throw new SpendRefusal('blocked', 'blocked') }
    if (this.held + this.spent + maxUsd > this.cap + 1e-12) { this.calls.push(`refused:${label}`); throw new SpendRefusal('over the cap', 'budget') }
    this.heldBefore.push(this.held)
    this.held += maxUsd
    const r = { id: this.next++, maxUsd, label }
    this.reservations.push(r)
    this.calls.push(`reserve:${label}`)
    return r
  }
  settle(r: SpendReservation, actual: unknown): SpendSettleStatus { this.calls.push(`settle:${String(actual)}`); this.held -= r.maxUsd; if (typeof actual !== 'number' || !(actual >= 0)) return 'invalid'; this.spent += actual; return actual > r.maxUsd ? 'exceeded' : 'ok' }
  release(r: SpendReservation) { this.calls.push('release'); this.held -= r.maxUsd }
  markUnknown(r: SpendReservation) { this.calls.push('unknown'); if (this.blockAfterUnknown) this.blocked = true; void r }
}

const USAGE = { promptTokens: 100, completionTokens: 20 }
const cost = (usd: number | null) => (usd === null ? {} : { tappy: { cost: { usd } } })
interface FakeOpts { provider?: string; modelId?: string; usd?: number | null; failFirst?: number; hang?: Promise<void> }
function fakeModel(o: FakeOpts = {}) {
  const seen: Array<{ maxTokens?: number }> = []
  let failures = o.failFirst ?? 0
  const m: LanguageModelV1 = {
    specificationVersion: 'v1', provider: o.provider ?? 'openai.chat', modelId: o.modelId ?? 'gpt-6-luna', defaultObjectGenerationMode: undefined,
    async doGenerate(opts) {
      seen.push({ maxTokens: opts.maxTokens })
      if (o.hang) await o.hang
      if (failures > 0) { failures--; throw new APICallError({ message: 'server error', url: 'https://example.invalid', requestBodyValues: {}, statusCode: 500, isRetryable: true }) }
      return { text: 'ok', finishReason: 'stop', usage: USAGE, rawCall: { rawPrompt: null, rawSettings: {} }, providerMetadata: cost(o.usd === undefined ? 0.0004 : o.usd) as never }
    },
    async doStream(opts) {
      seen.push({ maxTokens: opts.maxTokens })
      const parts: LanguageModelV1StreamPart[] = [{ type: 'text-delta', textDelta: 'ok' }, { type: 'finish', finishReason: 'stop', usage: USAGE, providerMetadata: cost(o.usd === undefined ? 0.0004 : o.usd) as never }]
      return { stream: new ReadableStream({ start(c) { for (const p of parts) c.enqueue(p); c.close() } }), rawCall: { rawPrompt: null, rawSettings: {} } }
    },
  }
  return { m, seen }
}

const prompt = (text: string) => [{ role: 'system' as const, content: 'sys' }, { role: 'user' as const, content: [{ type: 'text' as const, text }] }]
const call = (extra: Record<string, unknown> = {}) => ({ inputFormat: 'messages' as const, mode: { type: 'regular' as const }, prompt: prompt('xin chào'), ...extra }) as never

const KEYS = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'C2_REQUEST_BUDGET']
beforeEach(() => {
  for (const k of KEYS) delete process.env[k]
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED — tests must not reach the network') }))
})
afterEach(() => { vi.unstubAllGlobals(); for (const k of KEYS) delete process.env[k] })
const on = () => { process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.65' }
const inGate = <T,>(g: SpendGate, fn: () => T) => runWithSpendGate(g, fn)

describe('7 · flag OFF: the model is untouched', () => {
  it('meteredModel returns the very same object and no gate is involved', async () => {
    const { m } = fakeModel()
    expect(meteredModel(m, 'consult')).toBe(m)
    const g = new NumGate(1)
    await inGate(g, () => meteredModel(m, 'consult').doGenerate(call()))
    expect(g.calls).toEqual([])
  })
})

describe('1 · a model call is reserved before it is sent', () => {
  it('the reservation exists when the model is called, and equals the worst case (input BYTES, no cache, output cap)', async () => {
    on()
    const { m, seen } = fakeModel()
    const g = new NumGate(1)
    let heldAtCall = -1
    const orig = m.doGenerate.bind(m)
    m.doGenerate = async o => { heldAtCall = g.held; return orig(o) }
    await inGate(g, () => meteredModel(m, 'consult').doGenerate(call({ maxTokens: 1500 })))
    expect(g.reservations).toHaveLength(1)
    expect(heldAtCall).toBeGreaterThan(0) // already held when the model ran
    const bytes = new TextEncoder().encode(JSON.stringify(prompt('xin chào'))).length
    const lower = ((bytes + 512) * 0.125 + 1500 * 0.5) / 1e6 // input at the dearest rate, output at its cap
    expect(g.reservations[0].maxUsd).toBeGreaterThanOrEqual(lower - 1e-12)
    expect(g.reservations[0].maxUsd).toBeLessThan(lower * 2)
    expect(seen[0].maxTokens).toBe(1500)
  })
  it('input is counted in UTF-8 BYTES: the same number of characters in Vietnamese reserves more than in ASCII', async () => {
    on()
    const ascii = new NumGate(1), viet = new NumGate(1)
    const { m } = fakeModel()
    await inGate(ascii, () => meteredModel(m, 'consult').doGenerate(call({ prompt: prompt('a'.repeat(2000)), maxTokens: 100 })))
    await inGate(viet, () => meteredModel(m, 'consult').doGenerate(call({ prompt: prompt('ế'.repeat(2000)), maxTokens: 100 })))
    expect(viet.reservations[0].maxUsd).toBeGreaterThan(ascii.reservations[0].maxUsd)
  })
  it('a call whose worst case does not fit is NOT made: no fetch, no model call, a controlled SpendRefusal, nothing held', async () => {
    on()
    const { m, seen } = fakeModel()
    const g = new NumGate(0.0001)
    await expect(inGate(g, () => meteredModel(m, 'consult').doGenerate(call({ maxTokens: 1500 })))).rejects.toBeInstanceOf(SpendRefusal)
    expect(seen).toHaveLength(0) // the model was never called
    expect(g.held).toBe(0)
    expect(g.calls).toEqual(['refused:llm:consult'])
    expect(fetch).not.toHaveBeenCalled()
  })
  it('the output cap sent with the call is the cap that was priced (an absent or huge cap becomes 4000)', async () => {
    on()
    const { m, seen } = fakeModel()
    const g = new NumGate(1)
    const w = meteredModel(m, 'consult')
    await inGate(g, async () => { await w.doGenerate(call()); await w.doGenerate(call({ maxTokens: 9000 })); await w.doGenerate(call({ maxTokens: 300 })) })
    expect(seen.map(s => s.maxTokens)).toEqual([4000, 4000, 300])
  })
  it('a model with no list price cannot be bounded: refused, not called', async () => {
    on()
    const { m, seen } = fakeModel({ provider: 'anthropic.messages', modelId: 'claude-x' })
    await expect(inGate(new NumGate(1), () => meteredModel(m, 'consult').doGenerate(call()))).rejects.toMatchObject({ reason: 'no_bound' })
    expect(seen).toHaveLength(0)
  })
  it('flag ON with no gate injected, or with a missing cap: refused, not called', async () => {
    on()
    const { m, seen } = fakeModel()
    await expect(meteredModel(m, 'consult').doGenerate(call())).rejects.toMatchObject({ reason: 'no_gate' })
    delete process.env.BENCH_SPEND_RUN_CAP_USD
    await expect(inGate(new NumGate(1), () => meteredModel(m, 'consult').doGenerate(call()))).rejects.toMatchObject({ reason: 'no_caps' })
    expect(seen).toHaveLength(0)
  })
  it('a call whose abort signal is already aborted reserves nothing and sends nothing', async () => {
    on()
    const { m, seen } = fakeModel()
    const g = new NumGate(1)
    const ac = new AbortController(); ac.abort()
    await expect(inGate(g, () => meteredModel(m, 'consult').doGenerate(call({ abortSignal: ac.signal })))).rejects.toThrow()
    expect(g.calls).toEqual([]); expect(seen).toHaveLength(0)
  })
})

describe('review findings', () => {
  it('a call that carries an image or a file has NO upper bound from its bytes (a URL is a short string, a picture costs hundreds of tokens): refused, not called', async () => {
    on()
    const { m, seen } = fakeModel()
    const withImage = { inputFormat: 'messages' as const, mode: { type: 'regular' as const }, prompt: [{ role: 'user' as const, content: [{ type: 'image' as const, image: new URL('https://example.com/a.png') }] }] } as never
    await expect(inGate(new NumGate(1), () => meteredModel(m, 'consult').doGenerate(withImage))).rejects.toMatchObject({ reason: 'no_bound' })
    const withFile = { inputFormat: 'messages' as const, mode: { type: 'regular' as const }, prompt: [{ role: 'user' as const, content: [{ type: 'file' as const, data: 'AAAA', mimeType: 'application/pdf' }] }] } as never
    await expect(inGate(new NumGate(1), () => meteredModel(m, 'consult').doGenerate(withFile))).rejects.toMatchObject({ reason: 'no_bound' })
    expect(seen).toHaveLength(0)
  })
  it('the response format (a schema sent with the call) is part of the input that is priced', async () => {
    on()
    const { m } = fakeModel()
    const plain = new NumGate(1), schema = new NumGate(1)
    await inGate(plain, () => meteredModel(m, 'consult').doGenerate(call({ maxTokens: 100 })))
    await inGate(schema, () => meteredModel(m, 'consult').doGenerate(call({ maxTokens: 100, responseFormat: { type: 'json', schema: { type: 'object', description: 'x'.repeat(4000) } } })))
    expect(schema.reservations[0].maxUsd).toBeGreaterThan(plain.reservations[0].maxUsd)
  })
  it('a stream whose source BREAKS mid-way (network reset) is UNKNOWN, not left held', async () => {
    on()
    const broken: LanguageModelV1 = { ...fakeModel().m, async doStream() { return { stream: new ReadableStream({ start(c) { c.enqueue({ type: 'text-delta', textDelta: 'x' }); c.error(new Error('connection reset')) } }), rawCall: { rawPrompt: null, rawSettings: {} } } } }
    const g = new NumGate(1)
    const r = await inGate(g, () => meteredModel(broken, 'consult').doStream(call()))
    await expect((async () => { for await (const _ of r.stream as unknown as AsyncIterable<unknown>) void _ })()).rejects.toThrow('connection reset')
    expect(g.calls).toEqual(['reserve:llm:consult', 'unknown'])
  })
  it('a refusal raised by the request ledger BEFORE anything is sent gives the reservation back (provably not sent)', async () => {
    on()
    const refusing: LanguageModelV1 = { ...fakeModel().m, async doGenerate() { throw new RequestBudgetError('request_budget_exhausted', 'main') } }
    const g = new NumGate(1)
    await expect(inGate(g, () => meteredModel(refusing, 'consult').doGenerate(call()))).rejects.toBeInstanceOf(RequestBudgetError)
    expect(g.calls).toEqual(['reserve:llm:consult', 'release'])
  })
  it('the flag turned OFF between resolving the model and making the call: the call goes as it always did, with no reservation and no crash', async () => {
    on()
    const { m, seen } = fakeModel()
    const w = meteredModel(m, 'consult')
    delete process.env.BENCH_SPEND_GATE
    const g = new NumGate(1)
    const out = await inGate(g, () => w.doGenerate(call()))
    expect(out.text).toBe('ok'); expect(seen).toHaveLength(1); expect(g.calls).toEqual([])
  })
})

describe('1 · settlement', () => {
  it('the real cost the adapter priced is reported; a missing cost is reported as unusable (the run stops)', async () => {
    on()
    const g = new NumGate(1)
    await inGate(g, () => meteredModel(fakeModel({ usd: 0.0007 }).m, 'consult').doGenerate(call()))
    expect(g.calls).toContain('settle:0.0007')
    const g2 = new NumGate(1)
    await inGate(g2, () => meteredModel(fakeModel({ usd: null }).m, 'consult').doGenerate(call()))
    expect(g2.calls.some(c => c === 'settle:null' || c === 'settle:undefined')).toBe(true)
  })
  it('a failed call is UNKNOWN, never released and never settled as 0', async () => {
    on()
    const g = new NumGate(1)
    await expect(inGate(g, () => meteredModel(fakeModel({ failFirst: 1 }).m, 'consult').doGenerate(call()))).rejects.toThrow()
    expect(g.calls).toEqual(['reserve:llm:consult', 'unknown'])
  })
  it('a stream is settled at its finish part, and an error part / a stream that ends without finish / a cancel is UNKNOWN', async () => {
    on()
    const g = new NumGate(1)
    const r = await inGate(g, () => meteredModel(fakeModel({ usd: 0.0003 }).m, 'consult').doStream(call()))
    for await (const _ of r.stream as unknown as AsyncIterable<unknown>) void _
    expect(g.calls).toEqual(['reserve:llm:consult', 'settle:0.0003'])

    const noFinish: LanguageModelV1 = { ...fakeModel().m, async doStream() { return { stream: new ReadableStream({ start(c) { c.enqueue({ type: 'text-delta', textDelta: 'x' }); c.close() } }), rawCall: { rawPrompt: null, rawSettings: {} } } } }
    const g2 = new NumGate(1)
    const r2 = await inGate(g2, () => meteredModel(noFinish, 'consult').doStream(call()))
    for await (const _ of r2.stream as unknown as AsyncIterable<unknown>) void _
    expect(g2.calls).toEqual(['reserve:llm:consult', 'unknown'])

    const g3 = new NumGate(1)
    const r3 = await inGate(g3, () => meteredModel(fakeModel().m, 'consult').doStream(call()))
    await r3.stream.cancel()
    expect(g3.calls).toEqual(['reserve:llm:consult', 'unknown'])
  })
})

describe('1 · every retry and every fallback request is a new call with its own reservation', () => {
  it('the SDK retry (generateText maxRetries) goes through the gate again: two reservations for two attempts', async () => {
    on()
    const g = new NumGate(1) // does not block after unknown, so the retry is allowed to run
    const { m, seen } = fakeModel({ failFirst: 1 })
    const r = await inGate(g, () => generateText({ model: meteredModel(m, 'consult'), prompt: 'xin chào', maxTokens: 500, maxRetries: 1 }))
    expect(r.text).toBe('ok')
    expect(seen).toHaveLength(2)
    expect(g.calls).toEqual(['reserve:llm:consult', 'unknown', 'reserve:llm:consult', 'settle:0.0004'])
  }, 15000)
  it('after an UNKNOWN cost a blocked gate refuses the retry: the model is called once', async () => {
    on()
    const g = new NumGate(1, true)
    const { m, seen } = fakeModel({ failFirst: 1 })
    // the SDK wraps what its retry loop gives up on in an AI_RetryError; the cause is the gate's refusal
    const err = await inGate(g, () => generateText({ model: meteredModel(m, 'consult'), prompt: 'xin chào', maxTokens: 500, maxRetries: 2 })).catch(e => e)
    expect(err instanceof SpendRefusal || (err as { lastError?: unknown }).lastError instanceof SpendRefusal).toBe(true)
    expect(seen).toHaveLength(1)
  }, 15000)
  it('a primary that is too slow and its fallback are two reservations, both held at the same time (the slow request may still be billing)', async () => {
    on()
    let release!: () => void
    const hang = new Promise<void>(r => { release = r })
    const slow = fakeModel({ hang })
    const quick = fakeModel()
    const g = new NumGate(1)
    const model = withFallback(meteredModel(slow.m, 'consult'), meteredModel(quick.m, 'consult:retry'), { firstPartMs: 20, generateMs: 20, label: 'consult', fallbackKind: 'luna_retry' })
    const out = await inGate(g, () => model.doGenerate(call({ maxTokens: 500 })))
    expect(out.text).toBe('ok')
    expect(g.reservations.map(r => r.label)).toEqual(['llm:consult', 'llm:consult:retry'])
    expect(g.heldBefore[0]).toBe(0)
    expect(g.heldBefore[1]).toBeCloseTo(g.reservations[0].maxUsd, 12) // the slow one is still open when the retry takes its own
    release()
    await new Promise(r => setTimeout(r, 10))
  })
})

describe('3 · two calls at the same time never spend the same remainder', () => {
  it('a budget for exactly one call: of two parallel calls one is made and one is refused', async () => {
    on()
    const { m } = fakeModel()
    const probe = new NumGate(1)
    await inGate(probe, () => meteredModel(m, 'consult').doGenerate(call({ maxTokens: 500 })))
    const one = probe.reservations[0].maxUsd
    const g = new NumGate(one * 1.5)
    const { m: m2, seen } = fakeModel()
    const w = meteredModel(m2, 'consult')
    const res = await inGate(g, () => Promise.allSettled([w.doGenerate(call({ maxTokens: 500 })), w.doGenerate(call({ maxTokens: 500 }))]))
    expect(res.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(res.filter(r => r.status === 'rejected')).toHaveLength(1)
    expect(seen).toHaveLength(1)
  })
})
