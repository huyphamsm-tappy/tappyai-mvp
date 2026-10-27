// @vitest-environment node
// BENCH_SPEND_GATE · every Serper request is reserved (credits × price per credit) BEFORE fetch. MOCK-ONLY: fetch is a stub that answers
// serper.dev and THROWS for any other URL; no key, no network, no credits.
//
// ORDER inside serperPost (tested below):  abort check → [W only] ticket peek → daily/turn credit admit → [W only] ticket take → SPEND RESERVE →
// abort check → fetch.  A refusal at the spend step is "not_sent" and gives back exactly what was held before it: the ticket (refund), the
// scope credits and the daily-counter credits.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { serperPost, SERPER_CEILING_KEY, __resetSerperAlerts } from '../tools/serperClient'
import { createTurnWebTicket, runWithTurnWebTicket, withSerperToolScope, turnCreditsSpent } from '../tools/serperToolBudget'
import { incrDailyCounter } from '@/lib/security/kvCounter'
import { runWithSpendGate, SpendRefusal, type SpendGate, type SpendReservation, type SpendSettleStatus } from './spendGate'

class NumGate implements SpendGate {
  held = 0; spent = 0; next = 1; calls: string[] = []; reservations: SpendReservation[] = []; onReserve?: () => void
  constructor(readonly cap: number) {}
  reserve(label: string, maxUsd: number): SpendReservation {
    this.onReserve?.()
    if (this.held + this.spent + maxUsd > this.cap + 1e-12) { this.calls.push(`refused:${label}`); throw new SpendRefusal('over the cap', 'budget') }
    this.held += maxUsd
    const r = { id: this.next++, maxUsd, label }
    this.reservations.push(r); this.calls.push(`reserve:${label}`)
    return r
  }
  settle(r: SpendReservation, actual: unknown): SpendSettleStatus { this.calls.push(`settle:${String(actual)}`); this.held -= r.maxUsd; if (typeof actual !== 'number' || !(actual >= 0)) return 'invalid'; this.spent += actual; return actual > r.maxUsd + 1e-12 ? 'exceeded' : 'ok' }
  release(r: SpendReservation) { this.calls.push('release'); this.held -= r.maxUsd }
  markUnknown() { this.calls.push('unknown') }
}

let sent = 0
let mode: 'ok' | 'neterr' | 'http500' | 'badbody' = 'ok'
let reportedCredits: number | undefined = 1
function stubFetch() {
  sent = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!String(url).includes('google.serper.dev')) throw new Error(`UNEXPECTED fetch (a real request must never be made): ${String(url)}`)
    sent++
    if (mode === 'neterr') throw new Error('fetch failed')
    if (mode === 'http500') return new Response('{}', { status: 500 })
    if (mode === 'badbody') return new Response('not json', { status: 200 })
    return new Response(JSON.stringify({ organic: [{ title: 't', link: 'https://example.com', snippet: 's' }], ...(reportedCredits === undefined ? {} : { credits: reportedCredits }) }), { status: 200 })
  }))
}
const KEYS = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'TURN_WEB_TICKET', 'SERPER_USD_PER_CREDIT']
beforeEach(() => { for (const k of KEYS) delete process.env[k]; mode = 'ok'; reportedCredits = 1; __resetSerperAlerts(); stubFetch() })
afterEach(() => { vi.unstubAllGlobals(); for (const k of KEYS) delete process.env[k] })
const on = () => { process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.65' }
const post = (endpoint: 'search' | 'maps' | 'shopping' | 'images', opts?: Parameters<typeof serperPost>[4]) => serperPost(endpoint, 'k-not-real', { q: `q ${Math.random()}` }, 2000, opts)
const dailyCount = async () => (await incrDailyCounter(SERPER_CEILING_KEY, 0)).count

describe('2 · the reservation is credits × price per credit, made before fetch', () => {
  // Round 2b (P0-2): `images` is no longer reserved at 1 credit — its credits are "unverified", so with the gate ON it has no bound and is refused
  // (spendGate.serper.bound.test.ts). It is therefore not part of this table any more.
  for (const [endpoint, credits] of [['search', 1], ['maps', 3], ['shopping', 2]] as const) {
    it(`${endpoint}: ${credits} credit(s) = $${credits * 0.001}`, async () => {
      on()
      const g = new NumGate(1)
      let sentAtReserve = -1
      g.onReserve = () => { sentAtReserve = sent }
      reportedCredits = credits
      const r = await runWithSpendGate(g, () => post(endpoint))
      expect(r).not.toBeNull()
      expect(sentAtReserve).toBe(0) // reserved before fetch was called
      expect(g.reservations[0].maxUsd).toBeCloseTo(credits * 0.001, 12)
      expect(g.reservations[0].label).toBe(`serper:${endpoint}`)
      expect(g.calls[g.calls.length - 1]).toBe(`settle:${credits * 0.001}`)
    })
  }
  it('the price per credit is the one in turnCost (SERPER_USD_PER_CREDIT is honoured)', async () => {
    on(); process.env.SERPER_USD_PER_CREDIT = '0.002'
    const g = new NumGate(1)
    await runWithSpendGate(g, () => post('search'))
    expect(g.reservations[0].maxUsd).toBeCloseTo(0.002, 12)
  })
})

describe('2 · not enough budget: nothing is sent, and exactly what was held before is given back', () => {
  it('a plain request: no fetch, null, no reservation open', async () => {
    on()
    const g = new NumGate(0.0005)
    const states: string[] = []
    const r = await runWithSpendGate(g, () => post('search', { report: s => states.push(s) }))
    expect(r).toBeNull(); expect(sent).toBe(0)
    expect(g.held).toBe(0)
    expect(states).toEqual(['not_sent'])
  })
  it('a W request: the ticket goes back (refunded), the scope credits and the daily-counter credits too', async () => {
    on(); process.env.TURN_WEB_TICKET = '1'
    const g = new NumGate(0.0005)
    const ticket = createTurnWebTicket()
    const before = await dailyCount()
    const out = await runWithSpendGate(g, () => runWithTurnWebTicket(ticket, () => withSerperToolScope(8, new AbortController().signal, () => post('search', { purpose: 'W' }))))
    expect(out.value).toBeNull(); expect(sent).toBe(0)
    expect(out.spent).toBe(0) // scope credits released
    expect(await dailyCount()).toBe(before) // daily credits restored
    expect(ticket.used).toBe(0)
    expect(ticket.log.map(e => e.state)).toEqual(['not_sent']) // taken, then refunded: provably never sent
  })
  it('ORDER: when the spend step runs, the credits are admitted and the ticket is already taken', async () => {
    on(); process.env.TURN_WEB_TICKET = '1'
    const g = new NumGate(1)
    const ticket = createTurnWebTicket()
    let seen: { used: number; credits: number; sent: number } | null = null
    g.onReserve = () => { seen = { used: ticket.used, credits: turnCreditsSpent(), sent } }
    await runWithSpendGate(g, () => runWithTurnWebTicket(ticket, () => withSerperToolScope(8, new AbortController().signal, () => post('search', { purpose: 'W' }))))
    expect(seen).toEqual({ used: 1, credits: 1, sent: 0 })
  })
  it('a V request has no ticket to hand back and is still stopped', async () => {
    on(); process.env.TURN_WEB_TICKET = '1'
    const ticket = createTurnWebTicket()
    const r = await runWithSpendGate(new NumGate(0.0005), () => runWithTurnWebTicket(ticket, () => post('maps')))
    expect(r).toBeNull(); expect(sent).toBe(0); expect(ticket.used).toBe(0)
  })
})

describe('3 · two requests at the same time never spend the same remainder', () => {
  it('budget for one: one is sent, the other is not', async () => {
    on()
    const g = new NumGate(0.0015)
    const [a, b] = await runWithSpendGate(g, () => Promise.all([post('search'), post('search')]))
    expect([a, b].filter(x => x !== null)).toHaveLength(1)
    expect(sent).toBe(1)
  })
})

describe('5 · cost reported above the reservation, a failed request, an unreadable answer', () => {
  it('the provider says it charged more credits than reserved → settle reports it (the gate answers "exceeded" and stops the run)', async () => {
    on(); reportedCredits = 2
    const g = new NumGate(1)
    await runWithSpendGate(g, () => post('search'))
    expect(g.calls).toContain('settle:0.002')
  })
  // Wave 4 fix (E18, Owner option A, 27/10): these two tests used to say UNKNOWN. A SENT request whose charge the provider did not state is now settled at the RESERVED
  // worst case (credits × price per credit = the most it can cost): never released, never settled as 0, never below the reservation, and the gate is not blocked.
  // the console spy's calls are read BEFORE mockRestore (which clears them)
  const withLog = async (fn: () => Promise<unknown>): Promise<string[]> => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try { await fn() } catch { /* the caller's business */ }
    const lines = spy.mock.calls.map(c => String(c[0])).filter(l => l.includes('"type":"tappyai_serper_spend"'))
    spy.mockRestore()
    return lines
  }
  it('a request that fails after fetch was called (network error / HTTP error) is settled at the reserved worst case — never released, never 0, never unknown', async () => {
    on()
    for (const [m, why] of [['neterr', 'thrown_after_send'], ['http500', 'http_error']] as const) {
      mode = m
      const g = new NumGate(1)
      const lines = await withLog(() => runWithSpendGate(g, () => post('search')))
      expect(g.calls, m).toEqual(['reserve:serper:search', 'settle:0.001'])
      expect(g.spent, m).toBeCloseTo(g.reservations[0]!.maxUsd, 12)
      expect(lines.map(l => JSON.parse(l)), m).toEqual([{ type: 'tappyai_serper_spend', endpoint: 'search', assumed: 'worst_case', why, usd: 0.001 }])
    }
  })
  it('a 200 answer that cannot be read, or that does not say what it charged, is settled at the reserved worst case (shopping = 2 credits), not at an invented lower figure', async () => {
    on(); mode = 'badbody'
    const g = new NumGate(1)
    await runWithSpendGate(g, () => post('search'))
    expect(g.calls).toEqual(['reserve:serper:search', 'settle:0.001'])
    mode = 'ok'; reportedCredits = undefined
    const g2 = new NumGate(1)
    await runWithSpendGate(g2, () => post('shopping')) // (was 'images' before round 2b: images is refused up front now)
    expect(g2.calls).toEqual(['reserve:serper:shopping', 'settle:0.002'])
  })
  it('a request that TIMES OUT after the send (the measured E18 case) is settled at the worst case, and the next paid call of the turn is allowed', async () => {
    on()
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => { /* never answers */ })))
    const g = new NumGate(1)
    let timedOut = false, nextSent: unknown = null
    const lines = await withLog(() => runWithSpendGate(g, async () => {
      try { await serperPost('search', 'k-not-real', { q: 'q timeout' }, 30) } catch (e) { timedOut = e instanceof Error && e.message === 'timeout' }
      stubFetch(); mode = 'ok'; reportedCredits = 1
      nextSent = await post('search')                                     // the gate was not blocked: the next request is reserved and sent
    }))
    expect(timedOut).toBe(true)
    expect(nextSent).not.toBeNull()
    expect(g.calls).toEqual(['reserve:serper:search', 'settle:0.001', 'reserve:serper:search', 'settle:0.001'])
    expect(lines.map(l => JSON.parse(l).why)).toEqual(['thrown_after_send'])
  })
  it('gate OFF: a failed / credit-less / timed-out request asks no gate and prints no worst-case line (as before)', async () => {
    for (const m of ['neterr', 'http500', 'badbody'] as const) {
      mode = m; sent = 0
      const g = new NumGate(1)
      const lines = await withLog(() => runWithSpendGate(g, () => post('search')))
      expect(sent, m).toBe(1)                                              // the request really was sent (and failed)
      expect(g.calls, m).toEqual([])
      expect(lines, m).toEqual([])
    }
  })
  it('a 200 that states its credits is settled at what the provider stated (no worst-case line) - unchanged', async () => {
    on(); reportedCredits = 1
    const g = new NumGate(1)
    const lines = await withLog(() => runWithSpendGate(g, () => post('shopping')))
    expect(g.calls).toEqual(['reserve:serper:shopping', 'settle:0.001'])
    expect(lines).toEqual([])
  })
  it('a price per credit set BELOW the list price (0.001) is not believed: the gate prices at the list price', async () => {
    on(); process.env.SERPER_USD_PER_CREDIT = '0.0001'
    const g = new NumGate(1)
    await runWithSpendGate(g, () => post('search'))
    expect(g.reservations[0].maxUsd).toBeCloseTo(0.001, 12)
    expect(g.calls[g.calls.length - 1]).toBe('settle:0.001')
  })
})

describe('7 · flag OFF, and flag ON without what it needs', () => {
  it('OFF: no gate is asked and the request goes as before', async () => {
    const g = new NumGate(0)
    const r = await runWithSpendGate(g, () => post('search'))
    expect(r).not.toBeNull(); expect(sent).toBe(1); expect(g.calls).toEqual([])
  })
  it('ON with no injected gate, or with a missing cap: refused, fetch never called', async () => {
    on()
    expect(await post('search')).toBeNull()
    delete process.env.BENCH_SPEND_TURN_CAP_USD
    expect(await runWithSpendGate(new NumGate(1), () => post('search'))).toBeNull()
    expect(sent).toBe(0)
  })
})
