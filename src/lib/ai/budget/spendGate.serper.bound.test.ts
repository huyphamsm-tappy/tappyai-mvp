// @vitest-environment node
// BENCH_SPEND_GATE · a Serper request whose cost cannot be bounded from the price list is REFUSED (reason `no_bound`) and everything it held is
// given back. MOCK-ONLY: fetch is a stub that answers serper.dev and THROWS for any other URL; no key, no network, no credits.
//
// Unbounded = an endpoint whose credits are 'unverified' (images) or a request parameter the observed credit figures do not cover (page,
// autocorrect, tbs, type, location…, or `num` above what was observed). With the gate OFF nothing changes.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { serperPost, SERPER_CEILING_KEY, __resetSerperAlerts } from '../tools/serperClient'
import { createTurnWebTicket, runWithTurnWebTicket, withSerperToolScope } from '../tools/serperToolBudget'
import { incrDailyCounter } from '@/lib/security/kvCounter'
import { runWithSpendGate, type SpendGate, type SpendReservation, type SpendSettleStatus } from './spendGate'

class OpenGate implements SpendGate {
  held = 0; next = 1; calls: string[] = []; reservations: SpendReservation[] = []
  reserve(label: string, maxUsd: number): SpendReservation { this.held += maxUsd; const r = { id: this.next++, maxUsd, label }; this.reservations.push(r); this.calls.push(`reserve:${label}`); return r }
  settle(r: SpendReservation, actual: unknown): SpendSettleStatus { this.calls.push(`settle:${String(actual)}`); this.held -= r.maxUsd; return 'ok' }
  release(r: SpendReservation) { this.calls.push('release'); this.held -= r.maxUsd }
  markUnknown() { this.calls.push('unknown') }
}

let sent = 0
const sentBodies: Array<Record<string, unknown>> = []
function stubFetch() {
  sent = 0; sentBodies.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    if (!String(url).includes('google.serper.dev')) throw new Error(`UNEXPECTED fetch (a real request must never be made): ${String(url)}`)
    sent++; sentBodies.push(JSON.parse(init?.body ?? '{}'))
    return new Response(JSON.stringify({ organic: [{ title: 't', link: 'https://example.com', snippet: 's' }], credits: 1 }), { status: 200 })
  }))
}
const KEYS = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'TURN_WEB_TICKET', 'SERPER_USD_PER_CREDIT']
beforeEach(() => { for (const k of KEYS) delete process.env[k]; __resetSerperAlerts(); stubFetch() })
afterEach(() => { vi.unstubAllGlobals(); for (const k of KEYS) delete process.env[k] })
const on = () => { process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.65' }
const dailyCount = async () => (await incrDailyCounter(SERPER_CEILING_KEY, 0)).count
const q = () => `q ${Math.random()}`

describe('P0-2 · images (credits "unverified") with the gate ON: refused, nothing sent, everything given back', () => {
  it('no fetch, null, no reservation reaches the gate, scope credits and daily-counter credits are exactly as before', async () => {
    on()
    const g = new OpenGate()
    const before = await dailyCount()
    const states: string[] = []
    const out = await runWithSpendGate(g, () => withSerperToolScope(8, new AbortController().signal, async () =>
      serperPost('images', 'k-not-real', { q: q(), gl: 'vn', hl: 'vi', num: 8 }, 2000, { report: s => states.push(s) })))
    expect(out.value).toBeNull()
    expect(sent).toBe(0)
    expect(g.calls).toEqual([]) // the gate was never asked to hold anything
    expect(g.held).toBe(0)
    expect(out.spent).toBe(0) // scope credits released
    expect(await dailyCount()).toBe(before) // daily credits restored
    expect(states).toEqual(['not_sent'])
  })
  it('the refusal is a SpendRefusal with reason no_bound (logged as such)', async () => {
    on()
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
    try { await runWithSpendGate(new OpenGate(), () => serperPost('images', 'k-not-real', { q: q() }, 2000)) } finally { spy.mockRestore() }
    expect(logs.some(l => l.includes('tappyai_spend_gate') && l.includes('no_bound'))).toBe(true)
  })
  it('flag OFF: images is sent exactly as before and the gate is not asked', async () => {
    const g = new OpenGate()
    const r = await runWithSpendGate(g, () => serperPost('images', 'k-not-real', { q: q(), gl: 'vn', hl: 'vi', num: 8 }, 2000))
    expect(r).not.toBeNull(); expect(sent).toBe(1); expect(g.calls).toEqual([])
  })
})

describe('P0-2 · a request parameter the credit figures do not cover has no bound either', () => {
  const unbounded: Array<[string, Record<string, unknown>]> = [
    ['search', { q: 'x', page: 2 }],
    ['search', { q: 'x', autocorrect: false }],
    ['search', { q: 'x', tbs: 'qdr:d' }],
    ['search', { q: 'x', type: 'news' }],
    ['search', { q: 'x', location: 'Vietnam' }],
    ['search', { q: 'x', num: 50 }],
    ['search', { q: 'x', num: 100 }],
    ['search', { q: 'x', num: '8' }],
    ['search', { q: 'x', num: 0 }],
    ['shopping', { q: 'x', num: 100 }],
    ['shopping', { q: 'x', page: 3 }],
    ['maps', { q: 'x', page: 2 }],
    ['maps', { q: 'x', num: 100 }],
  ]
  for (const [endpoint, body] of unbounded) {
    it(`${endpoint} ${JSON.stringify(body)} → refused when the gate is ON, sent when OFF`, async () => {
      on()
      const g = new OpenGate()
      const r = await runWithSpendGate(g, () => serperPost(endpoint as 'search', 'k-not-real', { gl: 'vn', hl: 'vi', ...body, q: q() }, 2000))
      expect(r).toBeNull(); expect(sent).toBe(0); expect(g.calls).toEqual([])
      delete process.env.BENCH_SPEND_GATE
      stubFetch()
      const r2 = await serperPost(endpoint as 'search', 'k-not-real', { gl: 'vn', hl: 'vi', ...body, q: q() }, 2000)
      expect(r2).not.toBeNull(); expect(sent).toBe(1)
    })
  }
  const bounded: Array<[string, Record<string, unknown>]> = [
    ['search', { q: 'x', gl: 'vn', hl: 'vi', num: 8 }],
    ['search', { q: 'x', gl: 'vn', hl: 'vi', num: 10 }],
    ['search', { q: 'x', gl: 'vn', hl: 'vi', num: 5 }],
    ['shopping', { q: 'x', gl: 'vn', hl: 'vi', num: 12 }],
    ['shopping', { q: 'x', gl: 'vn', hl: 'vi', num: 20 }],
    ['maps', { q: 'x', gl: 'vn', hl: 'vi' }],
    ['maps', { q: 'x', gl: 'vn', hl: 'vi', ll: '@10.77,106.70,14z' }],
  ]
  for (const [endpoint, body] of bounded) {
    it(`${endpoint} ${JSON.stringify(body)} → still reserved and sent (the shapes the app really sends)`, async () => {
      on()
      const g = new OpenGate()
      const r = await runWithSpendGate(g, () => serperPost(endpoint as 'search', 'k-not-real', { ...body, q: q() }, 2000))
      expect(r).not.toBeNull(); expect(sent).toBe(1)
      expect(g.calls[0]).toBe(`reserve:serper:${endpoint}`)
    })
  }
  it('a W request refused for an unbounded parameter gives the ticket back too', async () => {
    on(); process.env.TURN_WEB_TICKET = '1'
    const ticket = createTurnWebTicket()
    const before = await dailyCount()
    const g = new OpenGate()
    const out = await runWithSpendGate(g, () => runWithTurnWebTicket(ticket, () => withSerperToolScope(8, new AbortController().signal, () =>
      serperPost('search', 'k-not-real', { q: q(), gl: 'vn', hl: 'vi', page: 2 }, 2000, { purpose: 'W' }))))
    expect(out.value).toBeNull(); expect(sent).toBe(0)
    expect(ticket.used).toBe(0)
    expect(ticket.log.map(e => e.state)).toEqual(['not_sent'])
    expect(out.spent).toBe(0)
    expect(await dailyCount()).toBe(before)
  })
})
