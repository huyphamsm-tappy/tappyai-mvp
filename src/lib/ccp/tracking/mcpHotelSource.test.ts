import { describe, it, expect } from 'vitest'
import { agodaHotelProvider, MCP_HOTEL_SOURCE } from './mcpHotelSource'
import { hotelAdapter } from '@/lib/mcp/providers'
import type { HttpPost } from '@/lib/providers/realtime/types'

// The gateway's hotel source, on the chat's own Agoda Lite adapter. No network: every call goes through the injected HttpPost; the env values are throwaway test values.
const NOW = new Date('2026-11-22T10:00:00+07:00')
const ENV = { CCP_REALTIME_AGODA_LITE: '1', AGODA_LITE_SITE_ID: '111', AGODA_LITE_API_KEY: 'test-key' }
const LANDING = 'https://www.agoda.com/partners/partnersearch.aspx?cid=1974819&hid=463019&currency=VND&checkin=2026-12-01&checkout=2026-12-03&NumberofAdults=2&NumberofChildren=0&Rooms=1'
const RESULTS = { results: [
  { hotelId: 463019, hotelName: 'Hoi An Riverside Hotel', dailyRate: 850000, currency: 'VND', starRating: 4, reviewScore: 8.6, reviewCount: 1234, landingURL: LANDING },
  { hotelId: 1144213, hotelName: 'Old Town Homestay', dailyRate: 420000, currency: 'VND', starRating: 2.5, landingURL: 'https://evil.example/phish' },
] }
const q = (over: Record<string, unknown> = {}) => ({ location: 'Hội An', checkIn: '2026-12-01', checkOut: '2026-12-03', limit: 10, lang: 'vi' as const, ...over })

describe('MCP hotel source (Agoda Lite through the chat adapter)', () => {
  it('is configured only with the flag on and both credentials present', () => {
    expect(MCP_HOTEL_SOURCE.isConfigured(ENV)).toBe(true)
    for (const env of [{}, { CCP_REALTIME_AGODA_LITE: '1' }, { ...ENV, AGODA_LITE_API_KEY: ' ' }, { AGODA_LITE_SITE_ID: '1', AGODA_LITE_API_KEY: 'k' }, { ...ENV, CCP_REALTIME_AGODA_LITE: '0' }]) expect(MCP_HOTEL_SOURCE.isConfigured(env), JSON.stringify(Object.keys(env))).toBe(false)
  })
  it('returns the real nightly rate and Agoda\'s tracked landing link; a landing URL off Agoda\'s hosts is dropped, the hotel is still listed', async () => {
    let sent: { body: Record<string, unknown> } | null = null
    const http: HttpPost = async (_u, init) => { sent = { body: init.body as Record<string, unknown> }; return { status: 200, json: RESULTS } }
    const offers = await agodaHotelProvider(ENV, { http, now: () => NOW }).search(q())
    expect(offers.map(o => o.name)).toEqual(['Hoi An Riverside Hotel', 'Old Town Homestay'])
    expect(offers[0]).toMatchObject({ pricePerNight: 850000, currency: 'VND', url: LANDING })
    expect(offers[1].url).toBeUndefined()
    expect(JSON.stringify(sent!.body)).toContain('"checkInDate":"2026-12-01"')
  })
  it('without both dates nothing is searched and nothing is invented', async () => {
    let calls = 0
    const http: HttpPost = async () => { calls++; return { status: 200, json: RESULTS } }
    const p = agodaHotelProvider(ENV, { http, now: () => NOW })
    expect(await p.search(q({ checkIn: undefined }))).toEqual([])
    expect(await p.search(q({ checkOut: undefined }))).toEqual([])
    expect(calls).toBe(0)
  })
  it('a provider error or an empty answer is an empty list, never a made-up hotel', async () => {
    for (const json of [{ error: { id: 911, message: 'no result' } }, { error: { id: 500 } }, 'garbage']) {
      const http: HttpPost = async () => ({ status: 200, json })
      expect(await agodaHotelProvider(ENV, { http, now: () => NOW }).search(q())).toEqual([])
    }
    const down: HttpPost = async () => ({ status: 503, json: null })
    expect(await agodaHotelProvider(ENV, { http: down, now: () => NOW }).search(q())).toEqual([])
  })
  it('the gateway adapter turns the offers into the rows the DTO mapper reads', async () => {
    const http: HttpPost = async () => ({ status: 200, json: RESULTS })
    const out = await hotelAdapter(agodaHotelProvider(ENV, { http, now: () => NOW }))({ query: 'khách sạn', location: 'Hội An', checkIn: '2026-12-01', checkOut: '2026-12-03', limit: 5, lang: 'vi' } as never)
    expect(out.rows[0]).toMatchObject({ name: 'Hoi An Riverside Hotel', price_per_night: 850000, currency: 'VND', link: LANDING })
  })
})
