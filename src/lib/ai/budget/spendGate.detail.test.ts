// @vitest-environment node
// BENCH_SPEND_GATE · what the gate is TOLD about a paid call (round 3a, item 4). A benchmark's injected gate may record, for each Serper request, the endpoint,
// the REAL `num` of the body that was sent, the query and whether it was a web ("W") or a vertical ("V") request, and, when the call settles, the credits the
// provider said it charged. MOCK-ONLY: fetch is a stub; no key, no network.
//
// Where this goes: ONLY to the gate that was injected with runWithSpendGate (the benchmark runner). With the flag OFF (the default) reserveSpend returns before
// it looks at the detail: nothing is passed to anyone and nothing is logged. The raw query is never written to a log or a telemetry line by this code.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { serperPost, __resetSerperAlerts } from '../tools/serperClient'
import { reserveSpend, runWithSpendGate, type SpendCallDetail, type SpendGate, type SpendReservation, type SpendSettleDetail, type SpendSettleStatus } from './spendGate'

class RecordingGate implements SpendGate {
  reserved: Array<{ label: string; maxUsd: number; detail?: SpendCallDetail }> = []
  settled: Array<{ actual: unknown; detail?: SpendSettleDetail }> = []
  private next = 1
  reserve(label: string, maxUsd: number, detail?: SpendCallDetail): SpendReservation { this.reserved.push({ label, maxUsd, ...(detail ? { detail } : {}) }); return { id: this.next++, maxUsd, label } }
  settle(_r: SpendReservation, actual: unknown, detail?: SpendSettleDetail): SpendSettleStatus { this.settled.push({ actual, ...(detail ? { detail } : {}) }); return 'ok' }
  release() {}
  markUnknown() {}
}

let reportedCredits: number | undefined = 1
let fetched = 0
function stubFetch() {
  fetched = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!String(url).includes('google.serper.dev')) throw new Error(`UNEXPECTED fetch: ${String(url)}`)
    fetched++
    return new Response(JSON.stringify({ organic: [{ title: 't', link: 'https://example.com', snippet: 's' }], ...(reportedCredits === undefined ? {} : { credits: reportedCredits }) }), { status: 200 })
  }))
}
const KEYS = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'TURN_WEB_TICKET', 'SERPER_USD_PER_CREDIT']
beforeEach(() => { for (const k of KEYS) delete process.env[k]; reportedCredits = 1; __resetSerperAlerts(); stubFetch() })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); for (const k of KEYS) delete process.env[k] })
const on = () => { process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.65' }

describe('flag OFF (default): the detail is never looked at, passed on or logged', () => {
  it('reserveSpend returns null and the injected gate is not touched', () => {
    const g = new RecordingGate()
    const h = runWithSpendGate(g, () => reserveSpend('serper:search', 0.001, { endpoint: 'search', q: 'a question', num: 8, purpose: 'V' }))
    expect(h).toBeNull()
    expect(g.reserved).toEqual([])
  })
  it('serperPost sends the request as before, asks no gate and writes the query to NO console stream', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}))
    const g = new RecordingGate()
    const q = 'RAW-QUERY-MUST-NOT-BE-LOGGED sk-test-SECRET-123'
    const r = await runWithSpendGate(g, () => serperPost('search', 'k-not-real', { q, gl: 'vn', hl: 'vi', num: 8 }, 2000))
    expect(r).not.toBeNull(); expect(fetched).toBe(1)
    expect(g.reserved).toEqual([]); expect(g.settled).toEqual([])
    for (const s of spies) for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toContain('RAW-QUERY-MUST-NOT-BE-LOGGED')
  })
})

describe('flag ON: the injected gate is told what was sent', () => {
  it('a /search request: endpoint, the num of the BODY, the query, purpose V', async () => {
    on(); const g = new RecordingGate()
    await runWithSpendGate(g, () => serperPost('search', 'k-not-real', { q: 'giá tai nghe', gl: 'vn', hl: 'vi', num: 8 }, 2000))
    expect(g.reserved).toHaveLength(1)
    expect(g.reserved[0].label).toBe('serper:search')
    expect(g.reserved[0].detail).toEqual({ endpoint: 'search', num: 8, q: 'giá tai nghe', purpose: 'V' })
  })
  it('a /shopping request carries ITS num (20 here), a W request says W', async () => {
    on(); const g = new RecordingGate()
    await runWithSpendGate(g, async () => {
      await serperPost('shopping', 'k-not-real', { q: 'tai nghe', gl: 'vn', hl: 'vi', num: 20 }, 2000)
      await serperPost('search', 'k-not-real', { q: 'web question', gl: 'vn', hl: 'vi', num: 8 }, 2000, { purpose: 'W' })
    })
    expect(g.reserved.map(r => r.detail)).toEqual([
      { endpoint: 'shopping', num: 20, q: 'tai nghe', purpose: 'V' },
      { endpoint: 'search', num: 8, q: 'web question', purpose: 'W' },
    ])
  })
  it('a body without num says so (num is absent, not invented)', async () => {
    on(); const g = new RecordingGate()
    await runWithSpendGate(g, () => serperPost('maps', 'k-not-real', { q: 'quán cà phê', gl: 'vn', hl: 'vi' }, 2000))
    expect(g.reserved[0].detail).toEqual({ endpoint: 'maps', q: 'quán cà phê', purpose: 'V' })
  })
  it('settle is told the credits the provider reported, next to the USD', async () => {
    on(); const g = new RecordingGate(); reportedCredits = 2
    await runWithSpendGate(g, () => serperPost('shopping', 'k-not-real', { q: 'x', gl: 'vn', hl: 'vi', num: 20 }, 2000))
    expect(g.settled).toEqual([{ actual: 0.002, detail: { credits: 2 } }])
  })
  it('an answer that does not state its credits is not settled with an invented figure (the call is UNKNOWN: no settle at all)', async () => {
    on(); const g = new RecordingGate(); reportedCredits = undefined
    await runWithSpendGate(g, () => serperPost('search', 'k-not-real', { q: 'x', gl: 'vn', hl: 'vi', num: 8 }, 2000))
    expect(g.settled).toEqual([])
  })
})
