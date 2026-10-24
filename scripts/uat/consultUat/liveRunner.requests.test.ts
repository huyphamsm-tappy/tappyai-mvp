// @vitest-environment node
// Round 3a, item 4 · the per-REQUEST detail of a turn: serperCalls[] (order, endpoint, the REAL num of the body that was sent, the query - at most 200 characters,
// redacted - the credits the provider reported, the ledger USD, W/V), llmCalls[] (role, tokens in / out / cache, USD) and the totals by kind. It is a RECORD of what
// was sent: it concludes nothing (for example about `num` 40 vs 20). MOCK-ONLY: the transport is fake and spends only through the spend gate; fetch throws.
// The fake keys sk-test-SECRET-123 / serper-SECRET-456 must not reach the JSONL, the result file, the summary or the console.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { reserveSpend } from '@/lib/ai/budget/spendGate'
import { __resetBenchProcessGuardForTests, BENCH_FLAG_NAMES, runBench, type ChatTransport } from './liveRunner'
import { GOOD_ENV, finalFile, jsonlLines, options } from './liveRunner.testkit'
import type { UatTurn } from './questions'

const KEYS = { OPENAI_API_KEY: 'sk-test-SECRET-123', SERPER_API_KEY: 'serper-SECRET-456' }
const stubBenchEnv = (over: Record<string, string | undefined> = {}) => {
  for (const k of BENCH_FLAG_NAMES) vi.stubEnv(k, undefined)
  for (const [k, v] of Object.entries({ ...GOOD_ENV, ...KEYS, ...over })) vi.stubEnv(k, v)
}
beforeEach(() => { __resetBenchProcessGuardForTests(); stubBenchEnv(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED') })) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })
const ONE: readonly UatTurn[] = [{ id: 'A1', conversation: 'A1', turn: 1, text: 'câu một' }]

/** A fake turn that spends like the real code does: reserve(label, max, detail) then settle(usd, detail). */
function transport(): ChatTransport {
  return async () => {
    const llm1 = reserveSpend('llm:intent', 0.004)!; llm1.settle(0.000226, { tokensIn: 1464, tokensOut: 86, cachedIn: 0 })
    const shop = reserveSpend('serper:shopping', 0.002, { endpoint: 'shopping', num: 20, q: 'chính sách Shopee sk-test-SECRET-123', purpose: 'V' })!; shop.settle(0.002, { credits: 2 })
    const s1 = reserveSpend('serper:search', 0.001, { endpoint: 'search', num: 8, q: 'x'.repeat(190) + 'serper-SECRET-456' + 'y'.repeat(50), purpose: 'W' })!; s1.settle(0.001, { credits: 1 })
    const s2 = reserveSpend('serper:search', 0.001, { endpoint: 'search', num: 8, q: 'tên sản phẩm site:shopee.vn', purpose: 'V' })!; s2.settle(0.001, { credits: 1 })
    const llm2 = reserveSpend('llm:consult', 0.004)!; llm2.settle(0.0009, { tokensIn: 10671, tokensOut: 136, cachedIn: 4388, reasoning: 0 })
    return { raw: '0:"Trả lời"\nd:{"finishReason":"stop"}\n' }
  }
}

describe('the per-request detail is recorded in the turn record and the JSONL', () => {
  it('serperCalls: order, endpoint, the num of the BODY, the query, credits, ledger USD, W/V', async () => {
    const { opts, fs } = options({ chat: transport(), turns: ONE }, process.env)
    const r = await runBench(opts)
    const rec = r.records[0] as unknown as { serperCalls: Array<Record<string, unknown>> }
    expect(rec.serperCalls.map(c => [c.n, c.endpoint, c.num, c.credits, c.usd, c.purpose])).toEqual([
      [1, 'shopping', 20, 2, 0.002, 'V'], [2, 'search', 8, 1, 0.001, 'W'], [3, 'search', 8, 1, 0.001, 'V'],
    ])
    expect(rec.serperCalls[2].q).toBe('tên sản phẩm site:shopee.vn')
    expect(jsonlLines(fs)[0].serperCalls).toEqual(rec.serperCalls) // the same detail is on disk
  })
  it('llmCalls: role, tokens in / out / cache, USD, in the order the calls were made', async () => {
    const { opts } = options({ chat: transport(), turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { llmCalls: Array<Record<string, unknown>> }
    expect(rec.llmCalls.map(c => [c.n, c.role, c.tokensIn, c.tokensOut, c.cachedIn, c.usd])).toEqual([
      [1, 'intent', 1464, 86, 0, 0.000226], [2, 'consult', 10671, 136, 4388, 0.0009],
    ])
  })
  it('the totals are kept apart: requests, credits and USD, by kind and by W/V (the request count is NOT the credit count)', async () => {
    const { opts } = options({ chat: transport(), turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { requestTotals: Record<string, any> }
    expect(rec.requestTotals.serper).toMatchObject({ requests: 3, credits: 4, usd: 0.004 })
    expect(rec.requestTotals.serper.W).toEqual({ requests: 1, credits: 1, usd: 0.001 })
    expect(rec.requestTotals.serper.V).toEqual({ requests: 2, credits: 3, usd: 0.003 })
    expect(rec.requestTotals.llm).toMatchObject({ requests: 2 })
    expect(rec.requestTotals.llm.usd).toBeCloseTo(0.001126, 9)
  })
  it('the existing fields are unchanged (the counts the old records had)', async () => {
    const { opts } = options({ chat: transport(), turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0]
    expect(rec).toMatchObject({ llmRequests: 2, serperRequests: 3, refusals: 0, photoSkips: 0, degraded: false })
  })
})

describe('the query is redacted BEFORE it is cut to 200 characters, and no key reaches a file or the console', () => {
  it('a key that straddles the 200th character is gone whole; the stored query is at most 200 characters', async () => {
    const { opts } = options({ chat: transport(), turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { serperCalls: Array<{ q: string }> }
    expect(rec.serperCalls[1].q.length).toBeLessThanOrEqual(200)
    expect(rec.serperCalls[1].q).not.toMatch(/serper-S|SECRET/i)
  })
  it('neither fake key is in the JSONL, the result file, the report or anything printed', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}))
    const { opts, fs } = options({ chat: transport(), turns: ONE }, process.env)
    const r = await runBench(opts)
    const everything = [...fs.files.values()].join('\n') + JSON.stringify(r)
    expect(everything).not.toMatch(/SECRET/i)
    expect(everything).toContain('chính sách Shopee ***') // the query is kept, only the key is gone
    for (const s of spies) for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toMatch(/SECRET/i)
    expect(finalFile(fs)!.json.turns[0].serperCalls).toHaveLength(3)
  })
})

describe('a call that is unknown or has no detail is still shown, with what is known; a REFUSED call is not listed (it is counted as a refusal)', () => {
  it('review: the totals say how many calls have no USD (unknownCalls), so a sum that left them out is not mistaken for a complete one', async () => {
    const chat: ChatTransport = async () => {
      const a = reserveSpend('serper:search', 0.001, { endpoint: 'search', num: 8, q: 'a', purpose: 'V' })!; a.settle(0.001, { credits: 1 })
      const b = reserveSpend('serper:search', 0.001, { endpoint: 'search', num: 8, q: 'b', purpose: 'W' })!; b.markUnknown() // an unknown cost blocks the gate: nothing more is reserved
      return { raw: '0:"x"\nd:{"finishReason":"stop"}\n' }
    }
    const { opts } = options({ chat, turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { requestTotals: Record<string, any> }
    expect(rec.requestTotals.serper).toMatchObject({ requests: 2, credits: 1, usd: 0.001, unknownCalls: 1 })
    expect(rec.requestTotals.llm).toMatchObject({ requests: 0, unknownCalls: 0 })
  })
  it('review: the same for a model call whose cost is unknown', async () => {
    const chat: ChatTransport = async () => {
      const ok = reserveSpend('llm:intent', 0.004)!; ok.settle(0.0002, { tokensIn: 10, tokensOut: 2, cachedIn: 0 })
      const l = reserveSpend('llm:consult', 0.004)!; l.markUnknown()
      return { raw: '0:"x"\nd:{"finishReason":"stop"}\n' }
    }
    const { opts } = options({ chat, turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { requestTotals: Record<string, any> }
    expect(rec.requestTotals.llm).toMatchObject({ requests: 2, usd: 0.0002, unknownCalls: 1 })
  })
  it('review: a request refused by the cap is not in serperCalls (it is counted in `refusals`, the turn is degraded)', async () => {
    const chat: ChatTransport = async () => {
      const ok = reserveSpend('serper:search', 0.001, { endpoint: 'search', num: 8, q: 'ok', purpose: 'V' })!; ok.settle(0.001, { credits: 1 })
      try { reserveSpend('serper:shopping', 0.06, { endpoint: 'shopping', num: 20, q: 'too dear', purpose: 'V' }) } catch { /* refused by the cap: nothing sent */ }
      return { raw: '0:"x"\nd:{"finishReason":"stop"}\n' }
    }
    const { opts } = options({ chat, turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { serperCalls: Array<{ q: string }>; refusals: number; degraded: boolean }
    expect(rec.serperCalls.map(c => c.q)).toEqual(['ok'])
    expect(rec.refusals).toBe(1); expect(rec.degraded).toBe(true)
  })
  it('a Serper request whose answer states no credits: credits null, usd null, state unknown', async () => {
    const chat: ChatTransport = async () => {
      const s = reserveSpend('serper:search', 0.001, { endpoint: 'search', num: 8, q: 'q', purpose: 'V' })!; s.markUnknown()
      return { raw: '0:"x"\nd:{"finishReason":"stop"}\n' }
    }
    const { opts } = options({ chat, turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { serperCalls: Array<Record<string, unknown>>; cost: { state: string } }
    expect(rec.serperCalls[0]).toMatchObject({ n: 1, endpoint: 'search', credits: null, usd: null, state: 'unknown' })
    expect(rec.cost.state).toBe('unknown')
  })
  it('a call made without any detail (an older code path) is listed with nulls, never with invented values', async () => {
    const chat: ChatTransport = async () => { const s = reserveSpend('serper:maps', 0.003)!; s.settle(0.003); return { raw: '0:"x"\nd:{"finishReason":"stop"}\n' } }
    const { opts } = options({ chat, turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { serperCalls: Array<Record<string, unknown>> }
    expect(rec.serperCalls[0]).toMatchObject({ n: 1, endpoint: 'maps', num: null, q: null, credits: null, purpose: null, usd: 0.003 })
  })
})
