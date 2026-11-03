// @vitest-environment node
// Pre-baseline hardening · the Serper callers that sit BEHIND the tool entry points, each run as the REAL function (not a copy) on a stub network that answers only
// google.serper.dev. For every caller: how many requests it sends with the flag OFF (pinned), that a cap holds it, that it sends NOTHING outside a turn or in a closed
// turn or with an invalid value (fail-closed), and that a cap larger than it needs changes nothing. MOCK ONLY: no model, no key, no real network.
// A caller that sends no Serper request at all (flight fares) is pinned as such: the cap has nothing to hold there, and the test says so.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __clearToolCache, serperSearch } from './common'
import { serperPost } from './serperClient'
import { attachCommerceLinks } from './commerce'
import { discoverBySubject, discoverCommerceHints } from './commerceDiscovery'
import { getFlightPrices, getHotelPrices, getTransportOptions } from './travel'
import { searchPlaces } from './food'
import { enrichWithTikTok } from '../../links/tiktokEnrichment'
import { setCommerceEventWriter } from '@/lib/ccp'
import { withSerperToolBudget, withSerperTurnBudget } from './serperToolBudget'
import { __resetRequestCap, beginRequestCapRun, closeRequestCapTurn, createRequestCapTurn, requestCapRunState, requestCapTotals, runWithRequestCapTurn } from './serperRequestCap'

const PLACE = { title: 'Phở Thử Nghiệm Một', address: '12 Lê Lợi, Quận 1, Hồ Chí Minh', latitude: 10.77, longitude: 106.7, rating: 4.5, ratingCount: 321, priceLevel: '₫₫', type: 'Quán phở', types: ['Quán phở'], phoneNumber: '+84 900 000 001', thumbnailUrl: 'https://lh3.googleusercontent.com/x', cid: '111' }
let sent: Array<{ endpoint: string; q: string }>
let mapsRows: boolean
const NOW = new Date('2026-09-13T08:00:00Z')

beforeEach(() => {
  sent = []; mapsRows = false
  __resetRequestCap(); __clearToolCache(); setCommerceEventWriter(() => undefined)
  vi.stubEnv('SERPER_API_KEY', 'test-key-not-real'); vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
  vi.spyOn(console, 'log').mockImplementation(() => undefined); vi.spyOn(console, 'error').mockImplementation(() => undefined); vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: unknown }) => {
    const u = String(input)
    if (!u.includes('google.serper.dev')) throw new Error('network disabled in this test (a real request must never be made): ' + u.slice(0, 80))
    const endpoint = new URL(u).pathname
    let q = ''
    try { q = String((JSON.parse(String(init?.body ?? '{}')) as { q?: string }).q ?? '') } catch { q = '' }
    sent.push({ endpoint, q })
    return new Response(JSON.stringify({ organic: [{ title: 'Serper hit', link: 'https://example.com/s', snippet: 'serper snippet' }], places: endpoint === '/maps' && mapsRows ? [PLACE] : [], images: [], credits: 1 }), { status: 200 })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); setCommerceEventWriter(null) })

const capOn = (perTurn: string | null = '50') => { vi.stubEnv('CONSULT_REQUEST_CAP', '1'); if (perTurn !== null) vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', perTurn) }

interface Caller { name: string; run: () => Promise<unknown>; off: number; maps?: boolean; kind: RegExp }
const CALLERS: Caller[] = [
  {
    name: 'vendor-link discovery on a shopping row (attachCommerceLinks, default search)',
    run: () => attachCommerceLinks('search_products', { search_results: [{ title: 'Tủ lạnh Samsung RT31', link: 'https://www.dienmayxanh.com/tu-lanh/samsung-rt31', price_vnd: 8990000 }] }, { enabled: true, now: NOW, feedHints: null }),
    off: 4, kind: /^\/search$/,
  },
  {
    name: 'CCP discovery on a hotel row (attachCommerceLinks, default search)',
    run: () => attachCommerceLinks('get_hotel_prices', { search_results: [{ title: 'Mường Thanh Luxury Đà Nẵng - Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html', snippet: '' }], booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang' }, { enabled: true, now: NOW, location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12' }),
    off: 1, kind: /^\/search$/,
  },
  {
    name: 'CCP discovery by subject (discoverBySubject, coach route)',
    run: () => discoverBySubject('travel', 'book_transport', 'xe khách Hà Nội Vinh', undefined),
    off: 1, kind: /^\/search$/,
  },
  {
    name: 'CCP discovery by venue names (discoverCommerceHints, three shopping subjects)',
    run: () => discoverCommerceHints('shopping', 'buy_product', [{ id: '0', subject: 'Tai nghe Alpha X1' }, { id: '1', subject: 'Tai nghe Beta Y2' }, { id: '2', subject: 'Tai nghe Gamma Z3' }]),
    off: 3, kind: /^\/search$/, // MAX_QUERIES_PER_TURN bounds it: three subjects, three scopes each → three queries
  },
  {
    name: 'TikTok review lookup (enrichWithTikTok, one batch)',
    run: () => enrichWithTikTok(['Phở Thử Nghiệm Một', 'Bún Chả Hương Liên'], 'Quận 1', serperSearch),
    off: 1, kind: /^\/search$/,
  },
  {
    name: 'hotel tool, /maps answers nothing → the snippet fallback searches (getHotelPrices)',
    run: () => getHotelPrices('Đà Lạt', '2026-10-10', '2026-10-12', undefined, 'vi'),
    off: 4, kind: /^\/(maps|search|images)$/, // /maps, two snippet searches, one photo lookup
  },
  {
    name: 'hotel tool, /maps answers (getHotelPrices): the structured request only',
    run: () => getHotelPrices('Đà Lạt', '2026-10-10', '2026-10-12', undefined, 'vi'),
    off: 1, maps: true, kind: /^\/maps$/,
  },
  {
    name: 'coach/train search (getTransportOptions, intercity)',
    run: () => getTransportOptions('Hà Nội', 'Vinh', 'coach', 'vi'),
    off: 2, kind: /^\/search$/,
  },
  {
    name: 'food search with a price question (searchPlaces: /maps then the price-detail /search)',
    run: () => searchPlaces('giá quán bún bò ngon', 'TP.HCM', undefined, 'vi', { lat: 10.7756, lng: 106.7019 }),
    off: 2, maps: true, kind: /^\/(maps|search)$/,
  },
]
const inTurn = async <T,>(fn: () => Promise<T>, turn = createRequestCapTurn()!) => runWithRequestCapTurn(turn, fn)
const reset = () => { sent = []; __clearToolCache(); __resetRequestCap() }

describe('callers behind the tool entry points · the request cap holds each of them', () => {
  for (const c of CALLERS) {
    describe(c.name, () => {
      it(`flag OFF: sends exactly ${c.off} request(s) with no scope at all (the old behaviour; nothing counted)`, async () => {
        mapsRows = !!c.maps
        await c.run()
        process.stdout.write('CALLER_OFF ' + JSON.stringify({ name: c.name.slice(0, 40), n: sent.length, q: sent.map(s => `${s.endpoint}:${s.q.slice(0, 40)}`) }) + '\n')
        expect(sent).toHaveLength(c.off)
        expect(sent.every(s => c.kind.test(s.endpoint))).toBe(true)
        expect(requestCapTotals()).toEqual({ reserved: 0, refused: {} })
      })

      it('flag ON, a cap larger than it needs: the same number is sent, nothing is refused', async () => {
        mapsRows = !!c.maps
        capOn('50')
        const turn = createRequestCapTurn()!
        await inTurn(c.run, turn)
        expect(sent).toHaveLength(c.off)
        expect(turn.sent).toBe(c.off)
        expect(requestCapTotals().refused).toEqual({})
      })

      it(c.off > 1 ? `flag ON, cap ${c.off - 1}: exactly ${c.off - 1} are sent, the rest are refused for the CAP` : 'flag ON, the one slot already used by an earlier request of the turn: this caller sends nothing, refused for the CAP', async () => {
        mapsRows = !!c.maps
        const cap = c.off > 1 ? c.off - 1 : 1
        capOn(String(cap))
        const turn = createRequestCapTurn()!
        await inTurn(async () => { if (c.off === 1) await serperPost('search', 'k', { q: 'an earlier request of the turn' }, 2000); await c.run() }, turn)
        const mine = c.off > 1 ? sent.length : sent.filter(s => s.q !== 'an earlier request of the turn').length
        expect(mine).toBe(c.off > 1 ? cap : 0)
        expect(turn.sent).toBe(cap)
        expect(Object.keys(requestCapTotals().refused)).toEqual(['turn_cap'])
      })

      it('flag ON, NO turn object (a caller nobody wrapped): nothing is sent, every request is refused as no_turn_scope', async () => {
        mapsRows = !!c.maps
        capOn('50')
        await c.run()
        expect(sent).toHaveLength(0)
        const refused = requestCapTotals().refused
        expect(Object.keys(refused)).toEqual(['no_turn_scope'])
        expect(refused.no_turn_scope).toBeGreaterThanOrEqual(1)
      })

      it('flag ON, the turn is already CLOSED: nothing is sent, refused as turn_closed', async () => {
        mapsRows = !!c.maps
        capOn('50')
        const turn = createRequestCapTurn()!
        closeRequestCapTurn(turn)
        await inTurn(c.run, turn)
        expect(sent).toHaveLength(0)
        expect(Object.keys(requestCapTotals().refused)).toEqual(['turn_closed'])
      })

      it.each([[null, 'missing'], ['0', 'zero'], ['x', 'not a number'], ['7.5', 'fractional'], ['101', 'above the validation bound']])('flag ON, per-turn value %j (%s): nothing is sent (fail-closed)', async (value, _why) => {
        mapsRows = !!c.maps
        capOn(value as string | null)
        const turn = createRequestCapTurn()!
        await inTurn(c.run, turn)
        expect(sent).toHaveLength(0)
        expect(Object.keys(requestCapTotals().refused)).toEqual(['config_invalid'])
      })
    })
  }
})

describe('a caller that sends no Serper request at all', () => {
  it('getFlightPrices builds its links from code: with the flag OFF, ON, ON outside a turn and ON with a bad value it sends nothing, and nothing is refused (the cap has nothing to hold there)', async () => {
    await getFlightPrices('Hà Nội', 'Đà Nẵng', 'vi', '2026-10-10'); expect(sent).toHaveLength(0)
    reset(); capOn('3')
    await inTurn(() => getFlightPrices('Hà Nội', 'Đà Lạt', 'vi', '2026-10-11')); expect(sent).toHaveLength(0)
    reset(); capOn('3')
    await getFlightPrices('Hà Nội', 'Phú Quốc', 'vi', '2026-10-12'); expect(sent).toHaveLength(0)
    reset(); capOn('abc')
    await inTurn(() => getFlightPrices('Hà Nội', 'Cần Thơ', 'vi', '2026-10-13')); expect(sent).toHaveLength(0)
    expect(requestCapTotals().refused).toEqual({})
  })
})

describe('the caps interplay across callers of ONE turn: the count is shared, not per caller', () => {
  it('a hotel search (1) + a coach search (2) + TikTok (1) in one turn with cap 3: exactly 3 are sent in total, the 4th is refused', async () => {
    mapsRows = true
    capOn('3')
    const turn = createRequestCapTurn()!
    await inTurn(async () => {
      await getHotelPrices('Đà Lạt', '2026-10-10', '2026-10-12', undefined, 'vi')
      await getTransportOptions('Hà Nội', 'Vinh', 'coach', 'vi')
      await enrichWithTikTok(['Phở Thử Nghiệm Một'], 'Quận 1', serperSearch)
    }, turn)
    expect(sent).toHaveLength(3)
    expect(turn.sent).toBe(3)
    expect(requestCapTotals().refused.turn_cap).toBe(1)
  })
})
