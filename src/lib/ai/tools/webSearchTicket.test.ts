// @vitest-environment node
// TURN_WEB_TICKET + SEARCH_FALLBACK_GATE (both default OFF, read at call time) — MOCK-ONLY tests. Every fetch is a stub: Serper and DuckDuckGo
// are answered by this file, any other URL THROWS (so a real request can never be made and a test that reaches one fails).
//
// Meanings: SENT = the code CALLS fetch to the provider (after every gate); not_sent / sent_success / sent_empty / sent_error are never
// inferred from an empty or thrown result alone; a ticket is refunded only for not_sent. Order: cache → single-flight → only the LEADER takes
// the ticket, right before fetch; a follower never takes one and is never refused for it. W = the model's web_search, the pre-search
// web_search and their DuckDuckGo fallback. V = maps, images, shopping, a vertical's own /search, and (PLAN B, 23/10/2026) CCP discovery and the
// hotel tool's fallback web search (not limited here; see webSearchTicket.planB.test.ts).
//
// FLAG MATRIX (TURN_WEB_TICKET / SEARCH_FALLBACK_GATE) — the assertions below follow this table:
//   | TICKET | GATE | behaviour                                                                                                              |
//   | OFF    | OFF  | legacy, unchanged: a second search is sent; DuckDuckGo runs when Serper returns empty / failed                         |
//   | ON     | OFF  | the ticket limits every W request incl. DuckDuckGo: Serper SENT → ticket spent → DuckDuckGo refused by the ticket;       |
//   |        |      | Serper NOT sent → ticket free → DuckDuckGo may take it                                                                 |
//   | OFF    | ON   | no ticket; DuckDuckGo only when Serper was NOT sent                                                                     |
//   | ON     | ON   | both: DuckDuckGo only when Serper was NOT sent AND the ticket is free                                                   |
// Each flag alone does NOT restore the old behaviour that the other one removes.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const h = vi.hoisted(() => ({ l2: new Map<string, { rows: unknown; at: string }>() }))
vi.mock('./serperCache', async (orig) => {
  const m = await orig<typeof import('./serperCache')>()
  return {
    ...m,
    serperCacheGetMeta: vi.fn(async (_endpoint: string, query: string) => h.l2.get(query) ?? null),
    serperCacheSet: vi.fn(async (_endpoint: string, query: string, _area: unknown, rows: unknown) => { h.l2.set(query, { rows, at: new Date().toISOString() }) }),
  }
})

import { webSearch, serperSearch, serperShopping, __clearToolCache } from './common'
import { serperPost, __resetSerperAlerts, SERPER_CEILING_KEY } from './serperClient'
import { incrDailyCounter } from '@/lib/security/kvCounter'
import { cachedDiscoverySearch } from './commerceDiscovery'
import {
  createTurnWebTicket, runWithTurnWebTicket, wrapToolsWithTurnWebTicket, takeTurnWebTicket, peekTurnWebTicket, markTurnWebTicketSent, settleTurnWebTicket,
  refundTurnWebTicket, withSerperToolScope, type TurnWebTicket,
} from './serperToolBudget'

// ── stubs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type SerperMode = 'ok' | 'empty' | 'http500' | 'neterr'
const sent = { serper: 0, ddg: 0, serperEndpoints: [] as string[] }
let serperMode: SerperMode = 'ok'
let serperDelayMs = 0
let ddgMode: 'ok' | 'empty' | 'neterr' | 'http403' = 'ok'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function stubFetch() {
  sent.serper = 0; sent.ddg = 0; sent.serperEndpoints = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('google.serper.dev')) {
      sent.serper++; sent.serperEndpoints.push(u.split('/').pop() ?? '')
      if (serperDelayMs) await sleep(serperDelayMs)
      if (serperMode === 'neterr') throw new Error('fetch failed')
      if (serperMode === 'http500') return new Response('{}', { status: 500 })
      const organic = serperMode === 'empty' ? [] : [{ title: 'Serper hit', link: 'https://example.com/s', snippet: 'serper snippet' }]
      return new Response(JSON.stringify({ organic, shopping: [], images: [], credits: 1 }), { status: 200 })
    }
    if (u.includes('duckduckgo.com')) {
      sent.ddg++
      if (ddgMode === 'neterr') throw new Error('ddg down')
      if (ddgMode === 'http403') return new Response('', { status: 403 })
      const html = ddgMode === 'empty' ? '<html></html>' : '<a class="result__a" href="https://example.com/d">DDG hit</a> <a class="result__snippet">ddg snippet</a>'
      return new Response(html, { status: 200 })
    }
    throw new Error(`UNEXPECTED fetch (a real request must never be made): ${u}`)
  }))
}

const combos: ReadonlyArray<readonly [boolean, boolean]> = [[false, false], [true, false], [false, true], [true, true]]
const tag = (t: boolean, g: boolean) => `[ticket=${t ? 'ON' : 'OFF'} gate=${g ? 'ON' : 'OFF'}]`
function setFlags(t: boolean, g: boolean) {
  if (t) process.env.TURN_WEB_TICKET = '1'; else delete process.env.TURN_WEB_TICKET
  if (g) process.env.SEARCH_FALLBACK_GATE = '1'; else delete process.env.SEARCH_FALLBACK_GATE
}
let n = 0
const uq = (s: string) => `${s} ${++n}-${Math.random().toString(36).slice(2, 7)}`
type Res = { source?: string; results?: unknown[]; error?: string; note?: string; provider_status?: string }
const ws = (q: string) => webSearch(q, 'vi') as Promise<Res>
const budgetUsed = (r: Res) => r.error === 'search_budget_used'

const prevKey = process.env.SERPER_API_KEY
beforeEach(() => {
  process.env.SERPER_API_KEY = 'test-key-not-real'
  serperMode = 'ok'; serperDelayMs = 0; ddgMode = 'ok'
  h.l2.clear(); __clearToolCache(); __resetSerperAlerts(); setFlags(false, false); stubFetch()
})
afterEach(() => {
  vi.unstubAllGlobals(); setFlags(false, false)
  if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey
})

// ── the ticket's own rules ────────────────────────────────────────────────────────────────────────────────────────────────────
describe('ticket primitives', () => {
  it('check and mark are ONE synchronous step: exactly `limit` of many same-tick takes win', () => {
    const t = createTurnWebTicket()
    const got = runWithTurnWebTicket(t, () => Array.from({ length: 5 }, () => takeTurnWebTicket('x')))
    expect(got.filter(g => g && g !== 'exhausted')).toHaveLength(1)
    expect(got.filter(g => g === 'exhausted')).toHaveLength(4)
    expect(t.used).toBe(1)
  })
  it('no ticket scope = no limit (null / "none"), and a take there marks nothing', () => {
    expect(peekTurnWebTicket()).toBe('none')
    expect(takeTurnWebTicket('x')).toBeNull()
  })
  it('refund only for not_sent: a TAKEN-but-never-sent entry goes back; a SENT entry never does (cannot prove nothing was sent → no refund)', () => {
    const t = createTurnWebTicket()
    runWithTurnWebTicket(t, () => {
      const e1 = takeTurnWebTicket('a')
      expect(e1).not.toBe('exhausted'); expect(e1).not.toBeNull()
      expect(refundTurnWebTicket(e1 as never)).toBe(true)
      expect(t.used).toBe(0)
      expect((e1 as { state: string }).state).toBe('not_sent')
      const e2 = takeTurnWebTicket('b') as never
      markTurnWebTicketSent(e2)
      expect((e2 as { state: string }).state).toBe('sent_error') // sent, outcome unknown yet → conservative
      expect(refundTurnWebTicket(e2)).toBe(false)
      expect(t.used).toBe(1)
      settleTurnWebTicket(e2, 'sent_empty')
      expect((e2 as { state: string }).state).toBe('sent_empty')
      expect(refundTurnWebTicket(e2)).toBe(false)
    })
  })
})

// ── 1 · two web_search with DIFFERENT queries in parallel ───────────────────────────────────────────────────────────────────
describe('1 · two web_search with different queries in parallel (Promise.all)', () => {
  for (const [t, g] of combos) {
    it(`${tag(t, g)} ${t ? 'one request is sent, the other is stopped with an honest search_budget_used and sends nothing' : 'legacy: both requests are sent'}`, async () => {
      setFlags(t, g)
      const ticket = createTurnWebTicket()
      const [a, b] = await runWithTurnWebTicket(ticket, () => Promise.all([ws(uq('alpha')), ws(uq('beta'))]))
      if (t) {
        expect(sent.serper).toBe(1)
        expect(sent.ddg).toBe(0)
        const blocked = [a, b].filter(budgetUsed)
        expect(blocked).toHaveLength(1)
        expect(blocked[0].note).toEqual(expect.any(String))
        expect(blocked[0].results).toBeUndefined() // nothing invented
        expect([a, b].filter(r => r.source === 'Google (Serper)')).toHaveLength(1)
        expect(ticket.used).toBe(1)
      } else {
        expect(sent.serper).toBe(2)
        expect(budgetUsed(a) || budgetUsed(b)).toBe(false)
      }
    })
  }
})

// ── 2 · SAME query in parallel: single-flight ───────────────────────────────────────────────────────────────────────────────
describe('2 · two web_search with the SAME query in parallel', () => {
  for (const [t, g] of combos) {
    it(`${tag(t, g)} one request is sent; the follower joins the single-flight, shares the result, spends no ticket and is not refused`, async () => {
      setFlags(t, g)
      const ticket = createTurnWebTicket()
      const q = uq('same')
      const [a, b] = await runWithTurnWebTicket(ticket, () => Promise.all([ws(q), ws(q)]))
      expect(sent.serper).toBe(1)
      expect(budgetUsed(a)).toBe(false); expect(budgetUsed(b)).toBe(false)
      expect(a.source).toBe('Google (Serper)'); expect(b.source).toBe('Google (Serper)')
      expect(ticket.used).toBe(t ? 1 : 0)
    })
  }
})

// ── 3 · three sequential calls ──────────────────────────────────────────────────────────────────────────────────────────────
describe('3 · three sequential web_search calls (different queries) in one turn', () => {
  for (const [t, g] of combos) {
    it(`${tag(t, g)} ${t ? 'the 2nd and 3rd are stopped' : 'legacy: all three are sent'}`, async () => {
      setFlags(t, g)
      const ticket = createTurnWebTicket()
      const out: Res[] = []
      await runWithTurnWebTicket(ticket, async () => { for (const s of ['one', 'two', 'three']) out.push(await ws(uq(s))) })
      if (t) {
        expect(sent.serper).toBe(1)
        expect(out.map(budgetUsed)).toEqual([false, true, true])
      } else {
        expect(sent.serper).toBe(3)
        expect(out.some(budgetUsed)).toBe(false)
      }
    })
  }
})

// ── 4 · cache ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('4 · cache hit spends no ticket; a miss spends exactly one (at the leader)', () => {
  it('[ticket=ON] L1 hit: the same query again, even from another turn, sends nothing and spends nothing', async () => {
    setFlags(true, false)
    const q = uq('l1')
    const tA = createTurnWebTicket(); const tB = createTurnWebTicket()
    const a = await runWithTurnWebTicket(tA, () => ws(q))
    const b = await runWithTurnWebTicket(tB, () => ws(q))
    expect(a.source).toBe('Google (Serper)'); expect(b.source).toBe('Google (Serper)')
    expect(sent.serper).toBe(1)
    expect(tA.used).toBe(1) // the miss
    expect(tB.used).toBe(0) // the hit
  })
  it('[ticket=ON] L2 (shared store) hit: nothing is sent, no ticket is taken', async () => {
    setFlags(true, false)
    const q = uq('l2')
    h.l2.set(q, { rows: [{ title: 'From L2', link: 'https://example.com/l2', snippet: 'cached' }], at: new Date().toISOString() })
    const t = createTurnWebTicket()
    const r = await runWithTurnWebTicket(t, () => ws(q))
    expect(r.source).toBe('Google (Serper)')
    expect(sent.serper).toBe(0)
    expect(t.used).toBe(0)
  })
  it('[ticket=ON] a spent ticket does not stop a cache hit (cache is checked before the ticket)', async () => {
    setFlags(true, false)
    const q = uq('hit-after-spent')
    await runWithTurnWebTicket(createTurnWebTicket(), () => ws(q)) // warms L1
    const t = createTurnWebTicket(); t.used = 1
    const r = await runWithTurnWebTicket(t, () => ws(q))
    expect(budgetUsed(r)).toBe(false)
    expect(r.source).toBe('Google (Serper)')
  })
})

// ── 5 · two users' turns ────────────────────────────────────────────────────────────────────────────────────────────────────
describe('5 · two turns at the same time never share a limit', () => {
  it('[ticket=ON] different queries: each turn sends its own request and spends its own ticket', async () => {
    setFlags(true, false)
    const tA = createTurnWebTicket(); const tB = createTurnWebTicket()
    const [a, b] = await Promise.all([runWithTurnWebTicket(tA, () => ws(uq('userA'))), runWithTurnWebTicket(tB, () => ws(uq('userB')))])
    expect(sent.serper).toBe(2)
    expect(budgetUsed(a)).toBe(false); expect(budgetUsed(b)).toBe(false)
    expect(tA.used).toBe(1); expect(tB.used).toBe(1)
  })
  it('[ticket=ON] same query: the other turn FOLLOWS the single-flight — shares the result, spends nothing, is not refused', async () => {
    setFlags(true, false)
    const q = uq('shared')
    const tA = createTurnWebTicket(); const tB = createTurnWebTicket()
    const [a, b] = await Promise.all([runWithTurnWebTicket(tA, () => ws(q)), runWithTurnWebTicket(tB, () => ws(q))])
    expect(sent.serper).toBe(1)
    expect(a.source).toBe('Google (Serper)'); expect(b.source).toBe('Google (Serper)')
    expect(tA.used).toBe(1); expect(tB.used).toBe(0)
  })
  it('[ticket=ON] a follower of a leader that was REFUSED by its own spent ticket is not refused: it becomes the leader with its own ticket', async () => {
    setFlags(true, false)
    const q = uq('denied-leader')
    const tA = createTurnWebTicket(); tA.used = 1 // A already spent its ticket
    const tB = createTurnWebTicket()
    const pA = runWithTurnWebTicket(tA, () => ws(q)) // A starts first and becomes the leader of the flight
    const pB = runWithTurnWebTicket(tB, () => ws(q)) // B joins A's flight in the same tick
    const [a, b] = await Promise.all([pA, pB])
    expect(budgetUsed(a)).toBe(true)
    expect(budgetUsed(b)).toBe(false)
    expect(b.source).toBe('Google (Serper)')
    expect(sent.serper).toBe(1)
    expect(tB.used).toBe(1)
  })
})

// ── 6 · sent_error ──────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('6 · sent_error (network error / HTTP error AFTER fetch was called)', () => {
  for (const mode of ['neterr', 'http500'] as const) {
    for (const [t, g] of combos) {
      it(`${tag(t, g)} ${mode}: the ticket stays spent (no refund), nothing is retried${t || g ? ', DuckDuckGo is NOT used' : '; legacy still falls back to DuckDuckGo'}`, async () => {
        setFlags(t, g); serperMode = mode
        const ticket = createTurnWebTicket()
        const r = await runWithTurnWebTicket(ticket, () => ws(uq('err')))
        expect(sent.serper).toBe(1) // no retry
        if (t || g) {
          expect(sent.ddg).toBe(0)
          expect(budgetUsed(r)).toBe(false) // the search was made; it is not "budget used"
          expect(r.provider_status).toBe('error')
          expect(r.note).toEqual(expect.any(String))
        } else {
          expect(sent.ddg).toBe(1)
          expect(r.source).toBe('DuckDuckGo')
        }
        if (t) {
          expect(ticket.used).toBe(1)
          expect(ticket.log.map(e => e.state)).toEqual(['sent_error'])
        }
      })
    }
  }
})

// ── 7 · sent_empty ──────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('7 · sent_empty (sent, answered with no rows)', () => {
  for (const [t, g] of combos) {
    it(`${tag(t, g)} the ticket stays spent, nothing is retried${t || g ? ', DuckDuckGo is NOT used' : '; legacy still falls back to DuckDuckGo'}`, async () => {
      setFlags(t, g); serperMode = 'empty'
      const ticket = createTurnWebTicket()
      const r = await runWithTurnWebTicket(ticket, () => ws(uq('empty')))
      expect(sent.serper).toBe(1)
      if (t || g) {
        expect(sent.ddg).toBe(0)
        expect(budgetUsed(r)).toBe(false)
        expect(r.results).toEqual([])
        expect(r.provider_status).toBeUndefined() // an empty answer is not a provider failure
      } else {
        expect(sent.ddg).toBe(1)
        expect(r.source).toBe('DuckDuckGo')
      }
      if (t) { expect(ticket.used).toBe(1); expect(ticket.log.map(e => e.state)).toEqual(['sent_empty']) }
    })
  }
  it('[ticket=ON] a sent_success is recorded as sent_success', async () => {
    setFlags(true, false)
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, () => ws(uq('success')))
    expect(ticket.log.map(e => e.state)).toEqual(['sent_success'])
  })
})

// ── 8 · not_sent ────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('8 · not_sent (no key / budget refusal / cancelled before fetch): nothing is sent, no ticket is spent for Serper; DuckDuckGo is then allowed in every row', () => {
  const noKey = () => { delete process.env.SERPER_API_KEY }
  for (const [t, g] of combos) {
    it(`${tag(t, g)} no Serper key → Serper not sent; DuckDuckGo runs (taking the ticket when the ticket is ON)`, async () => {
      setFlags(t, g); noKey()
      const ticket = createTurnWebTicket()
      const r = await runWithTurnWebTicket(ticket, () => ws(uq('nokey')))
      expect(sent.serper).toBe(0)
      expect(sent.ddg).toBe(1)
      expect(r.source).toBe('DuckDuckGo')
      if (t) { expect(ticket.used).toBe(1); expect(ticket.log.map(e => `${e.label}:${e.state}`)).toEqual(['duckduckgo:sent_success']) }
    })
    it(`${tag(t, g)} a spent Serper tool budget refuses before fetch → Serper not sent; DuckDuckGo runs`, async () => {
      setFlags(t, g)
      const ticket = createTurnWebTicket()
      const r = await runWithTurnWebTicket(ticket, async () => (await withSerperToolScope(0, new AbortController().signal, () => ws(uq('budget')))).value)
      expect(sent.serper).toBe(0)
      expect(sent.ddg).toBe(1)
      expect(r.source).toBe('DuckDuckGo')
      if (t) expect(ticket.used).toBe(1) // only DuckDuckGo's own
    })
  }
  it('[ticket=ON] cancelled before fetch → nothing sent and the ticket is not spent', async () => {
    setFlags(true, false)
    const ac = new AbortController(); ac.abort()
    const ticket = createTurnWebTicket()
    const rows = await runWithTurnWebTicket(ticket, async () => (await withSerperToolScope(8, ac.signal, () => serperSearch(uq('cancelled'), { purpose: 'W' }))).value)
    expect(rows).toBeNull()
    expect(sent.serper).toBe(0)
    expect(ticket.used).toBe(0)
  })
})

// ── 10 / 11 · the paths that share the ticket ──────────────────────────────────────────────────────────────────────────────────
describe('10 · pre-search web_search, then the model\'s web_search → one request in total', () => {
  for (const [t, g] of combos) {
    it(`${tag(t, g)} through the wrapped tool object (the same object the route runs before and during the model)`, async () => {
      setFlags(t, g)
      const ticket = createTurnWebTicket()
      const tools = wrapToolsWithTurnWebTicket({ web_search: { execute: async (a: { query: string }) => ws(a.query) } }, ticket)
      const pre = await tools.web_search.execute({ query: uq('film pre') })
      const model = await tools.web_search.execute({ query: uq('model') })
      expect(budgetUsed(pre)).toBe(false)
      expect(budgetUsed(model)).toBe(t)
      expect(sent.serper).toBe(t ? 1 : 2)
    })
  }
})

// PLAN B (owner decision 23/10/2026, round 3a): CCP discovery is a vertical ("V") request and no longer takes the turn's web ticket; the ticket is kept for the
// model's web_search. The two ticket=ON tests below were CHANGED by that decision, and by nothing else (the matching new tests are in webSearchTicket.planB.test.ts):
//   · "discovery first, then web_search"   was: the web_search is stopped, total 1   -> now: BOTH are sent, total 2, the ticket is spent by the web_search alone
//   · "web_search first, then discovery"   was: discovery gets null and sends nothing -> now: discovery IS sent (V) and returns its rows, total 2
// The ticket=OFF test is unchanged (legacy: both are sent), and so is every other test in this file.
describe('11 · CCP discovery is V (Plan B) and does not take the ticket that web_search keeps', () => {
  it('[ticket=ON] discovery first, then web_search: BOTH are sent (discovery is V); total 2, the ticket is spent by the web_search alone', async () => {
    setFlags(true, false)
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, async () => {
      const rows = await cachedDiscoverySearch(uq('klook site:klook.com'))
      expect(rows).toEqual([expect.objectContaining({ title: 'Serper hit' })])
      expect(ticket.used).toBe(0)
      expect(budgetUsed(await ws(uq('after ccp')))).toBe(false)
    })
    expect(sent.serper).toBe(2)
    expect(ticket.used).toBe(1)
  })
  it('[ticket=ON] web_search first, then discovery: discovery is sent (V) and returns its rows; total 2', async () => {
    setFlags(true, false)
    const ticket = createTurnWebTicket()
    const q = uq('klook venue site:klook.com')
    await runWithTurnWebTicket(ticket, async () => {
      expect(budgetUsed(await ws(uq('first')))).toBe(false)
      expect(await cachedDiscoverySearch(q)).toEqual([expect.objectContaining({ title: 'Serper hit' })])
    })
    expect(sent.serper).toBe(2)
    expect(ticket.denied).toEqual([])
  })
  it('[ticket=OFF] discovery and web_search are both sent (legacy)', async () => {
    setFlags(false, false)
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, async () => { await cachedDiscoverySearch(uq('klook site:klook.com')); await ws(uq('plain')) })
    expect(sent.serper).toBe(2)
  })
})

// 12 · the product-search fallback (toolState.ts) is only wired in the agent runtime (agent/runtime/index.ts, loop.ts), not in the legacy route — verified
// by the import graph. The legacy hotel fallback webSearch (travel.ts) is a V search since PLAN B (it passes { vertical: true }): it is covered by
// webSearchTicket.planB.test.ts (sections B, D and the wiring test E); tests 3 and 10 here cover the model's own (W) web_search.

// ── 13 · the DuckDuckGo door takes the ticket ──────────────────────────────────────────────────────────────────────────────────
describe('13 · the DuckDuckGo gate takes the ticket (no way round it when the ticket is ON)', () => {
  it('[ticket=ON] Serper not sent → DuckDuckGo takes the ticket → a later web_search is stopped and DuckDuckGo is not called again', async () => {
    setFlags(true, false); delete process.env.SERPER_API_KEY
    const ticket = createTurnWebTicket()
    const [first, second] = await runWithTurnWebTicket(ticket, async () => [await ws(uq('ddg one')), await ws(uq('ddg two'))] as const)
    expect(first.source).toBe('DuckDuckGo')
    expect(budgetUsed(second)).toBe(true)
    expect(sent.ddg).toBe(1)
  })
  it('[ticket=ON] a ticket already spent by an earlier request refuses DuckDuckGo even though Serper was not sent for this call', async () => {
    setFlags(true, false); delete process.env.SERPER_API_KEY
    const ticket = createTurnWebTicket(); ticket.used = 1
    const r = await runWithTurnWebTicket(ticket, () => ws(uq('ddg refused')))
    expect(budgetUsed(r)).toBe(true)
    expect(sent.ddg).toBe(0)
  })
  it('[ticket=OFF gate=OFF] legacy: DuckDuckGo is not counted at all', async () => {
    setFlags(false, false); delete process.env.SERPER_API_KEY
    await runWithTurnWebTicket(createTurnWebTicket(), async () => { await ws(uq('l1')); await ws(uq('l2')) })
    expect(sent.ddg).toBe(2)
  })
})

// ── 14 · V is not limited ───────────────────────────────────────────────────────────────────────────────────────────────────
describe('14 · V requests (maps, images, shopping, a vertical\'s own /search) are not blocked by the ticket', () => {
  for (const [t, g] of combos) {
    it(`${tag(t, g)} with the ticket already spent`, async () => {
      setFlags(t, g)
      const ticket = createTurnWebTicket(); ticket.used = 1
      const out = await runWithTurnWebTicket(ticket, async () => ({
        maps: await serperPost('maps', 'k', { q: uq('m') }, 2000),
        images: await serperPost('images', 'k', { q: uq('i') }, 2000),
        shopping: await serperPost('shopping', 'k', { q: uq('s') }, 2000),
        vertical: await serperSearch(uq('vertical own')), // no purpose = V
        shoppingRows: await serperShopping(uq('sh')),
      }))
      expect(out.maps).not.toBeNull(); expect(out.images).not.toBeNull(); expect(out.shopping).not.toBeNull()
      expect(out.vertical).toEqual([expect.objectContaining({ title: 'Serper hit' })])
      expect(sent.serper).toBe(5)
      expect(ticket.used).toBe(1) // untouched
    })
  }
})

// ── 15 · the two flags are independent ──────────────────────────────────────────────────────────────────────────────────────
describe('15 · the flags are independent (the matrix)', () => {
  it('after a SENT Serper request: DuckDuckGo runs only in OFF/OFF', async () => {
    const ran: Record<string, number> = {}
    for (const [t, g] of combos) {
      setFlags(t, g); serperMode = 'empty'; __clearToolCache(); h.l2.clear(); stubFetch()
      await runWithTurnWebTicket(createTurnWebTicket(), () => ws(uq('matrix')))
      ran[`${t ? 'T' : 't'}${g ? 'G' : 'g'}`] = sent.ddg
    }
    expect(ran).toEqual({ tg: 1, Tg: 0, tG: 0, TG: 0 })
  })
  it('a FOLLOWER of a sent_empty flight (another turn sent it): ticket-only lets DuckDuckGo run on the follower\'s OWN ticket; the gate blocks it', async () => {
    const dd: Record<string, number> = {}
    for (const [t, g] of [[true, false], [false, true], [true, true]] as const) {
      setFlags(t, g); serperMode = 'empty'; serperDelayMs = 5; __clearToolCache(); h.l2.clear(); stubFetch()
      const q = uq('follow')
      const tA = createTurnWebTicket(); const tB = createTurnWebTicket()
      await Promise.all([runWithTurnWebTicket(tA, () => ws(q)), runWithTurnWebTicket(tB, () => ws(q))])
      dd[`${t ? 'T' : 't'}${g ? 'G' : 'g'}`] = sent.ddg
    }
    // ticket only: both turns get the same empty answer; the leader's ticket is spent so ITS DuckDuckGo is refused, the follower's own ticket is free
    expect(dd).toEqual({ Tg: 1, tG: 0, TG: 0 })
  })
})

// ── findings of the independent review (each fixed, each pinned) ───────────────────────────────────────────────────────────────
describe('review findings', () => {
  it('M1 · a V caller that follows a flight whose W leader was refused by its own spent ticket is NOT refused: it leads and gets the rows', async () => {
    setFlags(true, false)
    const q = uq('v-follower')
    const spent = createTurnWebTicket(); spent.used = 1
    const pW = runWithTurnWebTicket(spent, () => ws(q)) // W leader, refused
    const pV = serperSearch(q) // V caller (no purpose, no ticket scope) joins the same flight in the same tick
    const [w, v] = await Promise.all([pW, pV])
    expect(budgetUsed(w)).toBe(true)
    expect(v).toEqual([expect.objectContaining({ title: 'Serper hit' })])
    expect(sent.serper).toBe(1)
  })
  it('M1 · a W follower with a free ticket behind TWO refused leaders still gets its own request (it leads under its own flight key)', async () => {
    setFlags(true, false)
    const q = uq('two-denied')
    const a = createTurnWebTicket(); a.used = 1
    const b = createTurnWebTicket(); b.used = 1
    const c = createTurnWebTicket()
    const pA = runWithTurnWebTicket(a, () => ws(q))
    const pB = runWithTurnWebTicket(b, () => ws(q)) // follower of A, then re-leads as a refused leader of its own retry flight
    const pC = runWithTurnWebTicket(c, () => ws(q)) // follower of A
    const [ra, rb, rc] = await Promise.all([pA, pB, pC])
    expect(budgetUsed(ra)).toBe(true); expect(budgetUsed(rb)).toBe(true)
    expect(budgetUsed(rc)).toBe(false)
    expect(rc.source).toBe('Google (Serper)')
    expect(sent.serper).toBe(1)
    expect(c.used).toBe(1)
  })
  it('L1 · a "searched, nothing usable" answer produced because THIS turn\'s ticket is spent is not cached for other turns', async () => {
    setFlags(true, false); serperMode = 'empty'
    const q = uq('no-cache')
    const first = createTurnWebTicket()
    const r1 = await runWithTurnWebTicket(first, () => ws(q))
    expect(r1.results).toEqual([]); expect(sent.serper).toBe(1); expect(sent.ddg).toBe(0)
    const second = createTurnWebTicket()
    await runWithTurnWebTicket(second, () => ws(q))
    expect(sent.serper).toBe(2) // read from no cache: the second turn asked again
  })
  it('L2 · a request refused AFTER its credits were reserved gives them back on the shared daily counter too (and is counted as refused)', async () => {
    setFlags(true, false)
    const before = (await incrDailyCounter(SERPER_CEILING_KEY, 0)).count
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, () => Promise.all([ws(uq('p1')), ws(uq('p2')), ws(uq('p3'))]))
    const after = (await incrDailyCounter(SERPER_CEILING_KEY, 0)).count
    expect(sent.serper).toBe(1)
    expect(after - before).toBe(1) // one request sent = one credit; the refused ones left nothing behind
  })
  it('L3 · a DuckDuckGo HTTP error is recorded as sent_error, not as an empty answer', async () => {
    setFlags(true, false); delete process.env.SERPER_API_KEY; ddgMode = 'http403'
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, () => ws(uq('ddg403')))
    expect(sent.ddg).toBe(1)
    expect(ticket.log.map(e => `${e.label}:${e.state}`)).toEqual(['duckduckgo:sent_error'])
  })
  it('L4 · every refusal is recorded on the ticket, including the one before any credit is reserved', async () => {
    setFlags(true, false)
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, async () => { await ws(uq('first')); await ws(uq('second')) })
    expect(ticket.denied.length).toBeGreaterThanOrEqual(1)
    expect(ticket.log.map(e => e.state)).toEqual(['sent_success'])
  })
})

// ── legacy guard: with both flags OFF nothing about the new code path is observable ─────────────────────────────────────────────
describe('both flags OFF = legacy', () => {
  it('a ticket scope is ignored: no ticket is taken, nothing is logged, nothing is refused', async () => {
    setFlags(false, false)
    const ticket: TurnWebTicket = createTurnWebTicket()
    const outs = await runWithTurnWebTicket(ticket, () => Promise.all([ws(uq('a')), ws(uq('b')), ws(uq('c'))]))
    expect(outs.some(budgetUsed)).toBe(false)
    expect(sent.serper).toBe(3)
    expect(ticket.used).toBe(0)
    expect(ticket.log).toEqual([])
    expect(ticket.denied).toEqual([])
  })
})
