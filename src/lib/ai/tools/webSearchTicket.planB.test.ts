// @vitest-environment node
// TURN_WEB_TICKET - PLAN B (owner decision 23/10/2026): CCP discovery and the legacy hotel-fallback web search are VERTICAL ("V") requests and no longer
// take the turn's web ticket; the ticket stays for the model's web_search, the pre-search web_search and needs_fresh_info (not done here). MOCK-ONLY: every
// fetch is a stub, any other URL THROWS. The ticket is read at call time and is OFF by default.
//
// What these tests separate (round 3a, item 3):
//   · SENDING behaviour: how many requests leave, to which endpoint, with which query, and what the caller gets back. With the ticket OFF it must be
//     EXACTLY what it was before Plan B (section A).
//   · the INTERNAL W/V label: which request takes the ticket. Changing it for CCP discovery and the hotel fallback is the intended design change; it only
//     has an effect when the ticket is ON (sections B-E).
// The ticket does NOT limit V requests (that is a product decision left to the owner; this round only measures it).
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

import { webSearch, __clearToolCache } from './common'
import { __resetSerperAlerts } from './serperClient'
import { cachedDiscoverySearch } from './commerceDiscovery'
import { createTurnWebTicket, runWithTurnWebTicket } from './serperToolBudget'

type Mode = 'ok' | 'empty'
const sent: Array<{ host: 'serper' | 'ddg'; endpoint: string; q: string }> = []
let serperMode: Mode = 'ok'
let ddgMode: Mode = 'ok'
function stubFetch() {
  sent.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    const u = String(url)
    if (u.includes('google.serper.dev')) {
      const q = String(JSON.parse(init?.body ?? '{}').q ?? '')
      sent.push({ host: 'serper', endpoint: u.split('/').pop() ?? '', q })
      const organic = serperMode === 'empty' ? [] : [{ title: 'Serper hit', link: 'https://example.com/s', snippet: 'serper snippet' }]
      return new Response(JSON.stringify({ organic, shopping: [], images: [], credits: 1 }), { status: 200 })
    }
    if (u.includes('duckduckgo.com')) {
      sent.push({ host: 'ddg', endpoint: 'html', q: decodeURIComponent(u.split('q=')[1] ?? '') })
      const html = ddgMode === 'empty' ? '<html></html>' : '<a class="result__a" href="https://example.com/d">DDG hit</a> <a class="result__snippet">ddg snippet</a>'
      return new Response(html, { status: 200 })
    }
    throw new Error(`UNEXPECTED fetch (a real request must never be made): ${u}`)
  }))
}
function setTicket(on: boolean) { if (on) process.env.TURN_WEB_TICKET = '1'; else delete process.env.TURN_WEB_TICKET }
let n = 0
const uq = (s: string) => `${s} ${++n}-${Math.random().toString(36).slice(2, 7)}`
type Res = { source?: string; results?: Array<{ title: string }>; error?: string; note?: string }
const model = (q: string) => webSearch(q, 'vi') as Promise<Res>                                 // the model's web_search: W
const hotelFallback = (q: string) => webSearch(q, 'vi', { vertical: true }) as Promise<Res>     // travel.ts hotel fallback: V (Plan B)
const budgetUsed = (r: Res) => r.error === 'search_budget_used'
const serperSent = () => sent.filter(s => s.host === 'serper')

const prevKey = process.env.SERPER_API_KEY
beforeEach(() => {
  process.env.SERPER_API_KEY = 'test-key-not-real'
  serperMode = 'ok'; ddgMode = 'ok'
  h.l2.clear(); __clearToolCache(); __resetSerperAlerts(); setTicket(false); delete process.env.SEARCH_FALLBACK_GATE; stubFetch()
})
afterEach(() => {
  vi.unstubAllGlobals(); setTicket(false)
  if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey
})

describe('A · ticket OFF: the SENDING behaviour is exactly what it was (the W/V label is not consulted)', () => {
  it('discovery, the model\'s web_search and the hotel fallback each send ONE /search request with their own query, in order, and return their rows', async () => {
    const q1 = uq('klook site:klook.com'), q2 = uq('model question'), q3 = uq('khach san gia')
    const ticket = createTurnWebTicket()
    const out = await runWithTurnWebTicket(ticket, async () => [await cachedDiscoverySearch(q1), await model(q2), await hotelFallback(q3)] as const)
    expect(sent).toEqual([{ host: 'serper', endpoint: 'search', q: q1 }, { host: 'serper', endpoint: 'search', q: q2 }, { host: 'serper', endpoint: 'search', q: q3 }])
    expect(out[0]).toEqual([expect.objectContaining({ title: 'Serper hit' })])
    expect(out[1].results).toEqual([expect.objectContaining({ title: 'Serper hit' })])
    expect(out[2].results).toEqual([expect.objectContaining({ title: 'Serper hit' })])
    expect(ticket.log).toEqual([]); expect(ticket.used).toBe(0); expect(ticket.denied).toEqual([]) // nothing consulted the ticket
  })
  it('an EMPTY Serper answer still falls back to DuckDuckGo for the hotel fallback and the model\'s search (legacy), and discovery returns [] without a fallback', async () => {
    serperMode = 'empty'
    const q2 = uq('model empty'), q3 = uq('hotel empty'), q1 = uq('klook empty site:klook.com')
    expect(await cachedDiscoverySearch(q1)).toEqual([])
    const m = await model(q2), hf = await hotelFallback(q3)
    expect(sent.map(s => s.host)).toEqual(['serper', 'serper', 'ddg', 'serper', 'ddg'])
    expect(m.results).toEqual([expect.objectContaining({ title: 'DDG hit' })]); expect(hf.results).toEqual([expect.objectContaining({ title: 'DDG hit' })])
  })
  it('the 3rd argument of webSearch changes nothing but the label: same query, same cache entry (a second identical call is served from the 5-minute cache, nothing is sent)', async () => {
    const q = uq('same query')
    await model(q)
    expect(serperSent()).toHaveLength(1)
    const again = await hotelFallback(q)
    expect(serperSent()).toHaveLength(1)
    expect(again.results).toEqual([expect.objectContaining({ title: 'Serper hit' })])
  })
})

describe('B · ticket ON: a request sent BEFORE the model\'s web_search does not take its ticket', () => {
  it('CCP discovery first, then web_search: BOTH are sent; the ticket is taken by the web_search only (used 1)', async () => {
    setTicket(true)
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, async () => {
      const rows = await cachedDiscoverySearch(uq('klook site:klook.com'))
      expect(rows).toEqual([expect.objectContaining({ title: 'Serper hit' })])
      expect(ticket.used).toBe(0) // discovery is V
      expect(budgetUsed(await model(uq('after ccp')))).toBe(false)
    })
    expect(serperSent()).toHaveLength(2)
    expect(ticket.used).toBe(1)
    expect(ticket.log.map(e => e.label)).toEqual(['serper:search'])
  })
  it('the legacy hotel fallback first, then web_search: BOTH are sent; the ticket is taken by the web_search only', async () => {
    setTicket(true)
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, async () => {
      const hf = await hotelFallback(uq('khach san'))
      expect(hf.results).toEqual([expect.objectContaining({ title: 'Serper hit' })])
      expect(ticket.used).toBe(0) // the hotel fallback is V
      expect(budgetUsed(await model(uq('model')))).toBe(false)
    })
    expect(serperSent()).toHaveLength(2)
    expect(ticket.used).toBe(1)
  })
  it('web_search first, then discovery and the hotel fallback: all three are sent (V is not limited); the ticket was spent by the web_search alone', async () => {
    setTicket(true)
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, async () => {
      expect(budgetUsed(await model(uq('first')))).toBe(false)
      expect(await cachedDiscoverySearch(uq('klook site:klook.com'))).toEqual([expect.objectContaining({ title: 'Serper hit' })])
      expect((await hotelFallback(uq('khach san'))).results).toEqual([expect.objectContaining({ title: 'Serper hit' })])
    })
    expect(serperSent()).toHaveLength(3)
    expect(ticket.used).toBe(1); expect(ticket.denied).toEqual([])
  })
})

describe('C · ticket ON: the old invariant still holds - at most ONE W request is SENT per turn', () => {
  it('two model web_searches: the second is stopped, whatever V requests surround them', async () => {
    setTicket(true)
    const ticket = createTurnWebTicket()
    const res = await runWithTurnWebTicket(ticket, async () => [
      await cachedDiscoverySearch(uq('klook a site:klook.com')), await model(uq('w1')), await hotelFallback(uq('hotel')), await model(uq('w2')), await cachedDiscoverySearch(uq('klook b site:klook.com')),
    ] as const)
    expect(budgetUsed(res[1] as Res)).toBe(false); expect(budgetUsed(res[3] as Res)).toBe(true)
    expect(serperSent()).toHaveLength(4) // 3 V + 1 W
    expect(ticket.log.filter(e => e.state !== 'not_sent')).toHaveLength(1)
    expect(ticket.used).toBe(1)
  })
  it('concurrent: two discoveries, a hotel fallback and two model searches at once -> exactly one W is sent, the other W is refused, every V is sent', async () => {
    setTicket(true)
    const ticket = createTurnWebTicket()
    const res = await runWithTurnWebTicket(ticket, () => Promise.all([
      cachedDiscoverySearch(uq('d1 site:klook.com')), model(uq('m1')), hotelFallback(uq('h1')), model(uq('m2')), cachedDiscoverySearch(uq('d2 site:klook.com')),
    ]))
    const models = [res[1], res[3]] as Res[]
    expect(models.filter(budgetUsed)).toHaveLength(1)
    expect(serperSent()).toHaveLength(4) // 3 V + 1 W
    expect(ticket.log.filter(e => e.state !== 'not_sent')).toHaveLength(1)
  })
})

describe('E · the WIRING: the real hotel tool\'s fallback is V (reverting the `{ vertical: true }` in travel.ts turns this red)', () => {
  it('[ticket=ON] getHotelPrices with every Serper answer empty reaches its web fallback and takes NO ticket; a model web_search afterwards still gets it', async () => {
    setTicket(true)
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      const u = String(url)
      if (u.includes('google.serper.dev')) {
        sent.push({ host: 'serper', endpoint: u.split('/').pop() ?? '', q: String(JSON.parse(init?.body ?? '{}').q ?? '') })
        return new Response(JSON.stringify({ organic: [], places: [], shopping: [], images: [], credits: 1 }), { status: 200 })
      }
      if (u.includes('duckduckgo.com')) { sent.push({ host: 'ddg', endpoint: 'html', q: '' }); return new Response('<a class="result__a" href="https://example.com/d">DDG hit</a> <a class="result__snippet">ddg snippet</a>', { status: 200 }) }
      if (/overpass|maps\.mail\.ru|nominatim/.test(u)) return new Response(JSON.stringify(u.includes('nominatim') ? [] : { elements: [] }), { status: 200 })
      throw new Error(`UNEXPECTED fetch (a real request must never be made): ${u}`)
    }))
    const { getHotelPrices } = await import('./travel')
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, async () => {
      await getHotelPrices(uq('Da Nang wiring-probe'))
      expect(sent.some(s => s.host === 'ddg')).toBe(true) // the fallback really ran
      expect(ticket.used).toBe(0) // ... as a V search: it did not touch the ticket
      expect(budgetUsed(await model(uq('model after the hotel tool')))).toBe(false)
    })
    expect(ticket.used).toBe(1)
  })
})

describe('D · ticket ON: the DuckDuckGo fallback of the V hotel search is V too (it does not take the ticket); the model\'s one stays W', () => {
  it('Serper empty: hotel fallback sends Serper then DuckDuckGo, the ticket is untouched; a later model web_search still gets its ticket', async () => {
    setTicket(true); serperMode = 'empty'
    const ticket = createTurnWebTicket()
    await runWithTurnWebTicket(ticket, async () => {
      const hf = await hotelFallback(uq('khach san trong'))
      expect(hf.results).toEqual([expect.objectContaining({ title: 'DDG hit' })])
      expect(ticket.used).toBe(0)
      serperMode = 'ok'
      expect(budgetUsed(await model(uq('model later')))).toBe(false)
    })
    expect(sent.map(s => s.host)).toEqual(['serper', 'ddg', 'serper'])
    expect(ticket.used).toBe(1)
  })
  it('the model\'s own empty search still spends the ticket on Serper, so its DuckDuckGo fallback is refused (unchanged rule)', async () => {
    setTicket(true); serperMode = 'empty'
    const ticket = createTurnWebTicket()
    const r = await runWithTurnWebTicket(ticket, () => model(uq('model empty')))
    expect(sent.map(s => s.host)).toEqual(['serper'])
    expect(r.results ?? []).toEqual([])
    expect(ticket.used).toBe(1)
  })
})
