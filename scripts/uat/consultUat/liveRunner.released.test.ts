// @vitest-environment node
// Round 3b-2 · Việc 3: a request that was RESERVED and then RELEASED (provably never sent) is counted apart. The existing fields keep their
// values and meaning: `requests` still counts every request the gate let through (released included), and `serperCalls` still lists them.
// The new fields are `sentRequests` (every request EXCEPT a released one) and `notSent` (the released ones). `sentRequests` is an upper
// bound of what was sent: a held or unknown request may or may not have left the process. MOCK-ONLY: fetch throws, nothing is requested.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { reserveSpend } from '@/lib/ai/budget/spendGate'
import { __resetBenchProcessGuardForTests, BENCH_FLAG_NAMES, runBench, type ChatTransport } from './liveRunner'
import { GOOD_ENV, options } from './liveRunner.testkit'
import type { UatTurn } from './questions'

const stubBenchEnv = () => {
  for (const k of BENCH_FLAG_NAMES) vi.stubEnv(k, undefined)
  for (const [k, v] of Object.entries(GOOD_ENV)) vi.stubEnv(k, v)
}
beforeEach(() => { __resetBenchProcessGuardForTests(); stubBenchEnv(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED') })) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })
const ONE: readonly UatTurn[] = [{ id: 'R1', conversation: 'R1', turn: 1, text: 'câu một' }]
const OK = '0:"x"\nd:{"finishReason":"stop"}\n'

describe('a released request is listed as before, but counted apart as notSent', () => {
  it('reserve then release: requests stays 1 (old meaning), notSent = 1, sentRequests = 0; the list still shows it as released', async () => {
    const chat: ChatTransport = async () => {
      const s = reserveSpend('serper:search', 0.001, { endpoint: 'search', num: 8, q: 'never sent', purpose: 'V' })!
      s.release() // provably not sent: nothing left the process
      return { raw: OK }
    }
    const { opts } = options({ chat, turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { serperCalls: Array<{ state: string }>; requestTotals: { serper: Record<string, number> } }
    expect(rec.serperCalls.map(c => c.state)).toEqual(['released'])
    expect(rec.requestTotals.serper.requests).toBe(1)
    expect(rec.requestTotals.serper.notSent).toBe(1)
    expect(rec.requestTotals.serper.sentRequests).toBe(0)
  })

  it('a settled request counts as sent and not as notSent', async () => {
    const chat: ChatTransport = async () => {
      const s = reserveSpend('serper:search', 0.001, { endpoint: 'search', num: 8, q: 'sent', purpose: 'V' })!
      s.settle(0.001, { credits: 1 })
      return { raw: OK }
    }
    const { opts } = options({ chat, turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { requestTotals: { serper: Record<string, number> } }
    expect(rec.requestTotals.serper.requests).toBe(1)
    expect(rec.requestTotals.serper.sentRequests).toBe(1)
    expect(rec.requestTotals.serper.notSent).toBe(0)
  })

  it('an LLM call released before the send is counted the same way', async () => {
    const chat: ChatTransport = async () => {
      reserveSpend('llm:consult', 0.004)!.release()
      const ok = reserveSpend('llm:intent', 0.004)!; ok.settle(0.0002, { tokensIn: 10, tokensOut: 2, cachedIn: 0 })
      return { raw: OK }
    }
    const { opts } = options({ chat, turns: ONE }, process.env)
    const rec = (await runBench(opts)).records[0] as unknown as { requestTotals: { llm: Record<string, number> } }
    expect(rec.requestTotals.llm.requests).toBe(2)
    expect(rec.requestTotals.llm.notSent).toBe(1)
    expect(rec.requestTotals.llm.sentRequests).toBe(1)
  })
})
