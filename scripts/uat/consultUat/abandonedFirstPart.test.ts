// @vitest-environment node
// Wave 2I · A — CONSULT_ABORT_ABANDONED_FIRST_PART. Run 4 / E18: a model call that gave no first part within firstPartMs was ABANDONED by withFallback (not cancelled, not
// closed), so its spend reservation stayed "held" and the paid-run gate reported NaN. MOCK-ONLY: fake models, fetch stubbed to throw.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import { APICallError } from 'ai'
import { meteredModel } from '@/lib/ai/budget/meteredModel'
import { withFallback } from '@/lib/ai/llm/fallback'
import { runWithSpendGate, ABANDONED_FIRST_PART_REASON } from '@/lib/ai/budget/spendGate'
import { BudgetGuard } from './harness'
import { GuardSpendGate } from './spendGateAdapter'

const USAGE = { promptTokens: 100, completionTokens: 20 }
const FINISH = (usd: number): LanguageModelV1StreamPart => ({ type: 'finish', finishReason: 'stop', usage: USAGE, providerMetadata: { tappy: { cost: { usd } } } as never })
const parts = (usd: number): LanguageModelV1StreamPart[] => [{ type: 'text-delta', textDelta: 'ok' }, FINISH(usd)]
const CALL = { inputFormat: 'messages' as const, mode: { type: 'regular' as const }, prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'xin chào' }] }] } as never

interface Probe { signals: AbortSignal[]; cancelled: number; started: number }
interface FakeOpts { headersMs?: number; firstPartMs?: number; never?: boolean; honourSignal?: boolean; fail?: boolean }
/** A fake provider. headersMs = when doStream resolves; firstPartMs = when the first part is enqueued after that; never = doStream never resolves. */
function fake(o: FakeOpts = {}): { m: LanguageModelV1; probe: Probe } {
  const probe: Probe = { signals: [], cancelled: 0, started: 0 }
  const m: LanguageModelV1 = {
    specificationVersion: 'v1', provider: 'openai.chat', modelId: 'gpt-6-luna', defaultObjectGenerationMode: undefined,
    async doGenerate() { throw new Error('unused') },
    async doStream(opts) {
      probe.started++
      if (opts.abortSignal) probe.signals.push(opts.abortSignal)
      if (o.fail) throw new APICallError({ message: 'server error', url: 'https://example.invalid', requestBodyValues: {}, statusCode: 500, isRetryable: true })
      const wait = (ms: number) => new Promise<void>((res, rej) => {
        const t = setTimeout(res, ms)
        if (o.honourSignal) opts.abortSignal?.addEventListener('abort', () => { clearTimeout(t); rej(opts.abortSignal?.reason ?? new Error('aborted')) }, { once: true })
      })
      if (o.never) { await (o.honourSignal ? wait(60_000) : new Promise<void>(() => {})) }
      if (o.headersMs) await wait(o.headersMs)
      return {
        stream: new ReadableStream<LanguageModelV1StreamPart>({
          async start(c) { if (o.firstPartMs) await new Promise(r => setTimeout(r, o.firstPartMs)); for (const p of parts(0.0004)) c.enqueue(p); c.close() },
          cancel() { probe.cancelled++ },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      }
    },
  }
  return { m, probe }
}

const ENV = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'C2_REQUEST_BUDGET', 'CONSULT_ABORT_ABANDONED_FIRST_PART', 'NODE_ENV', 'VERCEL_ENV']
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k] }
  process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.65'
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED') }))
})
afterEach(() => { vi.unstubAllGlobals(); for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })
const flag = (v: string | undefined) => { if (v === undefined) delete process.env.CONSULT_ABORT_ABANDONED_FIRST_PART; else process.env.CONSULT_ABORT_ABANDONED_FIRST_PART = v }

async function drain(m: LanguageModelV1, abortSignal?: AbortSignal): Promise<string[]> {
  const r = await m.doStream({ ...(CALL as object), ...(abortSignal ? { abortSignal } : {}) } as never)
  const rd = r.stream.getReader(); const got: string[] = []
  for (;;) { const n = await rd.read(); if (n.done) break; got.push(n.value.type) }
  return got
}
const pair = (primary: LanguageModelV1, retry: LanguageModelV1, firstPartMs = 40) =>
  withFallback(meteredModel(primary, 'smart'), meteredModel(retry, 'smart:retry'), { firstPartMs, label: 'smart', fallbackKind: 'luna_retry' })
const turn = () => new GuardSpendGate(new BudgetGuard(0.05))
const states = (g: GuardSpendGate) => g.records.map(r => `${r.label}=${r.state}`)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('A · flag ON: the abandoned call is cancelled and closed as unknown, never left held', () => {
  beforeEach(() => flag('1'))

  it('(i) the primary is slower than firstPartMs, the retry is fast: primary unknown (with the reason), retry settled, nothing held', async () => {
    const g = turn(); const p = fake({ firstPartMs: 400 }); const r = fake()
    const got = await runWithSpendGate(g, () => drain(pair(p.m, r.m)))
    await sleep(500)
    expect(got).toEqual(['text-delta', 'finish'])
    expect(states(g)).toEqual(['llm:smart=unknown', 'llm:smart:retry=settled'])
    expect(g.records[0]?.unknownReason).toBe(ABANDONED_FIRST_PART_REASON)
    expect(g.records.some(x => x.state === 'held')).toBe(false)
    expect(g.guard.blockedBy).toBe('cost-unknown') // fail-closed stays
    expect(g.guard.knownUsd).toBeGreaterThan(0)    // the retry's real cost is still counted
  })

  it('(ii-a) the primary never returns doStream and honours its signal: signal aborted, reservation unknown', async () => {
    const g = turn(); const p = fake({ never: true, honourSignal: true }); const r = fake()
    const got = await runWithSpendGate(g, () => drain(pair(p.m, r.m)))
    expect(got).toEqual(['text-delta', 'finish'])
    expect(p.probe.signals[0]?.aborted).toBe(true)
    expect(states(g)).toEqual(['llm:smart=unknown', 'llm:smart:retry=settled'])
    expect(g.records[0]?.unknownReason).toBe(ABANDONED_FIRST_PART_REASON)
  })

  it('(ii-b) the primary never returns doStream and ignores its signal: the reservation is still closed as unknown', async () => {
    const g = turn(); const p = fake({ never: true }); const r = fake()
    await runWithSpendGate(g, () => drain(pair(p.m, r.m)))
    expect(states(g)).toEqual(['llm:smart=unknown', 'llm:smart:retry=settled'])
    expect(g.records.some(x => x.state === 'held')).toBe(false)
  })

  it('(iii) the primary hands over its stream AFTER the timeout: that stream is cancelled, it never settles, no token reaches the user', async () => {
    const g = turn(); const p = fake({ headersMs: 150 }); const r = fake()
    const got = await runWithSpendGate(g, () => drain(pair(p.m, r.m)))
    await sleep(300)
    expect(got).toEqual(['text-delta', 'finish'])
    expect(p.probe.cancelled).toBe(1)
    expect(g.records[0]?.state).toBe('unknown')
    expect(g.records[0]?.status).toBeUndefined()
  })

  it('(iv) the primary is faster than the timeout: nothing changes (one call, settled, signal not aborted)', async () => {
    const g = turn(); const p = fake({ firstPartMs: 5 }); const r = fake()
    const got = await runWithSpendGate(g, () => drain(pair(p.m, r.m, 500)))
    expect(got).toEqual(['text-delta', 'finish'])
    expect(states(g)).toEqual(['llm:smart=settled'])
    expect(r.probe.started).toBe(0)
    expect(p.probe.signals[0]?.aborted ?? false).toBe(false)
    expect(g.guard.blockedBy).toBeNull()
    expect(g.guard.openReservedUsd).toBe(0)
  })

  it('(v) both calls fail: exactly what the flag-OFF code does (same error, same ledger states), nothing held', async () => {
    const run = async (v: string | undefined) => {
      flag(v)
      const g = turn()
      let err = ''
      try { await runWithSpendGate(g, () => drain(pair(fake({ fail: true }).m, fake({ fail: true }).m))) } catch (e) { err = e instanceof Error ? e.message : String(e) }
      return { err, states: states(g), blocked: g.guard.blockedBy }
    }
    const on = await run('1'); const off = await run(undefined)
    expect(on.err).not.toBe('')
    expect(on).toEqual(off)
    expect(on.states.some(s => s.endsWith('=held'))).toBe(false)
  })

  it('(vii) fail-closed: a turn with an abandoned call still reports its cost as not known; a turn without one is known', async () => {
    const bad = turn()
    await runWithSpendGate(bad, () => drain(pair(fake({ firstPartMs: 400 }).m, fake().m)))
    await sleep(500)
    expect(bad.guard.blockedBy).toBe('cost-unknown')
    expect(bad.guard.openReservedUsd).toBeGreaterThan(0) // reported as unresolved cost, NOT as an upper bound added to the total
    const good = turn()
    await runWithSpendGate(good, () => drain(pair(fake({ firstPartMs: 5 }).m, fake().m, 500)))
    expect(good.guard.blockedBy).toBeNull()
    expect(good.guard.openReservedUsd).toBe(0)
  })

  it('a caller abort is passed through to the primary and ends the call as before', async () => {
    const g = turn(); const p = fake({ never: true, honourSignal: true }); const r = fake()
    const ctl = new AbortController()
    setTimeout(() => ctl.abort(new Error('client_gone')), 10)
    await expect(runWithSpendGate(g, () => drain(pair(p.m, r.m, 5000), ctl.signal))).rejects.toThrow()
    expect(g.records.some(x => x.state === 'held')).toBe(false)
  })
})

describe('A · the E18 chain of run 4 (7 model calls, 3 Serper requests, one first-part timeout on call 6)', () => {
  const chain = async (v: string | undefined) => {
    flag(v)
    const g = turn()
    await runWithSpendGate(g, async () => {
      const okModel = () => fake({ firstPartMs: 2 }).m
      await drain(meteredModel(okModel(), 'intent'))
      for (let i = 0; i < 4; i++) {
        const s = g.reserve('serper:search', 0.001, { endpoint: 'search', purpose: 'W' }); g.settle(s, 0.001, { credits: 1 }) // a web_search of the loop (the 4th was refused by a guard, as in the log)
        await drain(meteredModel(okModel(), 'smart'))
      }
      await drain(pair(fake({ never: true }).m, okModel())) // call 6 is abandoned after 40 ms, call 7 (smart:retry) answers
    })
    await sleep(120)
    return g
  }
  it('flag ON: no reservation is left held, call 6 is unknown with the reason, call 7 settled, the turn cost is NOT known (the paid-run gate still stops)', async () => {
    const g = await chain('1')
    expect(g.records.filter(r => r.state === 'held')).toEqual([])
    const llm = g.records.filter(r => r.label.startsWith('llm:'))
    expect(llm.map(r => `${r.label}=${r.state}`)).toEqual(['llm:intent=settled', 'llm:smart=settled', 'llm:smart=settled', 'llm:smart=settled', 'llm:smart=settled', 'llm:smart=unknown', 'llm:smart:retry=settled'])
    expect(llm[5]?.unknownReason).toBe(ABANDONED_FIRST_PART_REASON)
    // the liveRunner rule: a turn's cost is known only when nothing is blocked, nothing is open and a total exists
    const costKnown = g.guard.blockedBy === null && g.guard.openReservedUsd === 0 && g.guard.knownUsd !== null
    expect(costKnown).toBe(false)
    expect(g.guard.blockedBy).toBe('cost-unknown')
  })
  it('flag OFF: call 6 stays held (the run-4 state)', async () => {
    const g = await chain(undefined)
    expect(g.records.filter(r => r.label === 'llm:smart' && r.state === 'held').length).toBe(1)
  })
})

describe('A · the non-streamed call (doGenerate) has the same gap and the same cure', () => {
  const gen = (ms: number): LanguageModelV1 => ({
    specificationVersion: 'v1', provider: 'openai.chat', modelId: 'gpt-6-luna', defaultObjectGenerationMode: undefined,
    async doStream() { throw new Error('unused') },
    async doGenerate() { await new Promise(r => setTimeout(r, ms)); return { text: 'ok', finishReason: 'stop', usage: USAGE, rawCall: { rawPrompt: null, rawSettings: {} }, providerMetadata: { tappy: { cost: { usd: 0.0004 } } } as never } },
  })
  const call = (g: GuardSpendGate) => runWithSpendGate(g, () => withFallback(meteredModel(gen(400), 'smart'), meteredModel(gen(0), 'smart:retry'), { firstPartMs: 40, label: 'smart', fallbackKind: 'luna_retry' }).doGenerate(CALL))

  it('flag ON: the slow primary is closed as unknown with the reason, the retry still answers and settles', async () => {
    flag('1')
    const g = turn(); const out = await call(g); await sleep(500)
    expect(out.text).toBe('ok')
    expect(states(g)).toEqual(['llm:smart=unknown', 'llm:smart:retry=settled'])
    expect(g.records[0]?.unknownReason).toBe(ABANDONED_FIRST_PART_REASON)
  })

  it('role agent (abortPrimaryOnTimeout) keeps its Phase 8 order with the flag ON: the primary is aborted BEFORE the retry is called', async () => {
    flag('1')
    const order: string[] = []
    const primary: LanguageModelV1 = { ...gen(0), async doGenerate(o) { o.abortSignal?.addEventListener('abort', () => order.push('primary_aborted')); return new Promise(() => {}) } }
    const retry: LanguageModelV1 = { ...gen(0), async doGenerate() { order.push('retry_called'); return { text: 'ok', finishReason: 'stop', usage: USAGE, rawCall: { rawPrompt: null, rawSettings: {} } } } }
    await withFallback(primary, retry, { firstPartMs: 30, generateMs: 30, label: 'agent', fallbackKind: 'luna_retry', abortPrimaryOnTimeout: true }).doGenerate(CALL)
    expect(order).toEqual(['primary_aborted', 'retry_called'])
  })

  it('flag OFF: the abandoned primary is not closed while it is abandoned (it books itself only when it finally returns)', async () => {
    flag(undefined)
    const g = turn(); await call(g)
    expect(states(g)).toEqual(['llm:smart=held', 'llm:smart:retry=settled'])
  })
})

describe('A · flag OFF (and every value that is not exactly "1"): the old behaviour, including the held reservation', () => {
  for (const v of [undefined, '0', 'true', ' 1', '1 ', 'on']) {
    it(`value ${JSON.stringify(v)}: the abandoned primary stays held, is not cancelled and gets no signal`, async () => {
      flag(v)
      const g = turn(); const p = fake({ never: true }); const r = fake()
      const got = await runWithSpendGate(g, () => drain(pair(p.m, r.m)))
      expect(got).toEqual(['text-delta', 'finish'])
      expect(states(g)).toEqual(['llm:smart=held', 'llm:smart:retry=settled'])
      expect(p.probe.signals.length).toBe(0)
      expect(g.records[0]?.unknownReason).toBeUndefined()
      expect(g.guard.openReservedUsd).toBeGreaterThan(0)
    })
  }

  it('a production runtime reads the flag as OFF even when it is "1"', async () => {
    flag('1'); process.env.VERCEL_ENV = 'production'
    const g = turn(); const p = fake({ never: true }); const r = fake()
    await runWithSpendGate(g, () => drain(pair(p.m, r.m)))
    expect(states(g)).toEqual(['llm:smart=held', 'llm:smart:retry=settled'])
    expect(p.probe.signals.length).toBe(0)
  })
})
