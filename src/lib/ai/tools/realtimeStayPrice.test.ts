import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachCommerceLinks } from './commerce'
import { stayRecommendations } from '@/lib/recommendation/fromToolResult'
import { buildPlacesLiveView } from '@/lib/recommendation/liveView'
import { stayOfferLine } from '@/lib/recommendation/stayOffer'
import { translate } from '@/lib/i18n/useTranslation'
import type { HttpPost } from '@/lib/providers/realtime/types'

// 19/11 (owner): the hotel card states the recommended hotel's price - the provider's structured nightly rate with the platform and the check time -
// only when the SAME turn's realtime layer returned a fresh offer for that hotel. Never computed, never guessed.

const NOW = new Date('2026-11-19T14:47:00+07:00')
type Row = Record<string, unknown>
const noSearch = vi.fn(async () => [])
const LITE_ENV = { CCP_REALTIME_AGODA_LITE: '1', AGODA_LITE_SITE_ID: '1', AGODA_LITE_API_KEY: 'secret-key-value' }
const LANDING = 'https://www.agoda.com/partners/partnersearch.aspx?cid=1&hid=4942635&checkin=2026-12-20&checkout=2026-12-22&adults=2&rooms=1'
const liteJson = { results: [{ hotelId: 4942635, hotelName: 'The Luxe Hotel Da Lat', dailyRate: 231_481, currency: 'VND', landingURL: LANDING }] }
const httpOk = (json: unknown): HttpPost => async () => ({ status: 200, json })
const ctx = (realtime: Row, now: Date = NOW): never => ({ enabled: true, now, search: noSearch, location: 'Đà Lạt', checkIn: '2026-12-20', checkOut: '2026-12-22', passengers: 2, realtime }) as never
const hotels = (): Row => ({ search_results: [], hotel_list: [
  { name: 'The Luxe Hotel Da Lat', address: '1 Tran Phu', lat: 11.94, lng: 108.44, rating_value: 4.5, maps_link: 'https://maps.google.com/?cid=1' },
  { name: 'Another Hotel', address: '2 Tran Phu', lat: 11.95, lng: 108.45, rating_value: 4.1, maps_link: 'https://maps.google.com/?cid=2' },
] })
const t = (locale: 'vi' | 'en') => (k: string, v?: Record<string, string>) => translate(locale, k, v)

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

describe('stay price line on the hotel card (Agoda offer matched by name)', () => {
  it('a matched fresh offer: the row carries the structured price, the entity and the live place carry it, and the line names Agoda and the check time', async () => {
    const r = hotels()
    await attachCommerceLinks('get_hotel_prices', r, ctx({ env: LITE_ENV, http: httpOk(liteJson), now: () => NOW }))
    const [matched, other] = r.hotel_list as Row[]
    expect(matched.agoda_offer_price).toEqual({ platform: 'Agoda', amount: 231_481, currency: 'VND', unit: 'per_night', nights: 2, guests: 2, checkedAt: NOW.toISOString() })
    expect(matched.agoda_offer_url).toBe(LANDING)
    expect(other.agoda_offer_price).toBeUndefined()
    expect(other.agoda_offer_url).toBeUndefined()

    const recs = stayRecommendations(r)
    expect((recs[0].entity.ext as { stayOffer?: unknown }).stayOffer).toMatchObject({ amount: 231_481, platform: 'Agoda' })
    expect((recs[1].entity.ext as { stayOffer?: unknown }).stayOffer).toBeUndefined()

    const view = buildPlacesLiveView(recs, {})
    const items = (view?.items ?? []) as Array<{ name: string; stayOffer?: unknown }>
    expect(items.find(i => i.name === 'The Luxe Hotel Da Lat')?.stayOffer).toMatchObject({ amount: 231_481, unit: 'per_night', platform: 'Agoda' })
    expect(items.find(i => i.name === 'Another Hotel')?.stayOffer).toBeUndefined()

    expect(stayOfferLine(matched.agoda_offer_price as never, t('vi'), 'vi')).toBe('Giá tham khảo: 231.481đ/đêm cho 2 người, chưa gồm thuế và phí; Agoda kiểm tra lúc 14:47 ngày 19/11/2026. Bấm nút đặt phòng để xem giá cuối cùng.')
    expect(stayOfferLine(matched.agoda_offer_price as never, t('en'), 'en')).toBe('Reference price: 231,481 VND/night for 2 guests, excluding taxes and fees; checked on Agoda at 14:47 on 19/11/2026. Open the booking page for the final price.')
  })

  // 19/11 (review): the match was a substring test, so "X Hotel" took the page and price of "X Hotel Annex"
  it('a row never takes the offer of a different hotel whose name merely contains or extends its own', async () => {
    const annex = { results: [{ hotelId: 1, hotelName: 'Sunrise Hotel Da Lat Annex', dailyRate: 500_000, currency: 'VND', landingURL: LANDING }] }
    const r: Row = { search_results: [], hotel_list: [{ name: 'Sunrise Hotel Da Lat', address: '1 Tran Phu', lat: 11.94, lng: 108.44, rating_value: 4.5, maps_link: 'https://maps.google.com/?cid=1' }] }
    await attachCommerceLinks('get_hotel_prices', r, ctx({ env: LITE_ENV, http: httpOk(annex), now: () => NOW }))
    const [row] = r.hotel_list as Row[]
    expect(row.agoda_offer_url).toBeUndefined()
    expect(row.agoda_offer_price).toBeUndefined()
  })
  it('the same hotel written with a generic word or a different order still matches (the distinctive words are the same set)', async () => {
    const lite = { results: [{ hotelId: 2, hotelName: 'Luxe Da Lat Hotel', dailyRate: 231_481, currency: 'VND', landingURL: LANDING }] }
    const r: Row = { search_results: [], hotel_list: [{ name: 'The Luxe Hotel Da Lat', address: '1 Tran Phu', lat: 11.94, lng: 108.44, rating_value: 4.5, maps_link: 'https://maps.google.com/?cid=1' }] }
    await attachCommerceLinks('get_hotel_prices', r, ctx({ env: LITE_ENV, http: httpOk(lite), now: () => NOW }))
    expect((r.hotel_list as Row[])[0].agoda_offer_url).toBe(LANDING)
  })
  // final UAT 19/11: the card "Khach san X Center" and the offer "Khach san X Center - 08 Y Street" are one hotel (an address suffix on one side); the strict match had dropped the price and the Agoda button
  it('a hotel named with an address suffix after a dash on one side still meets its offer', async () => {
    const lite = { results: [{ hotelId: 3, hotelName: 'Khach san Quy Nhon Center - 08 Tran Doc', dailyRate: 231_481, currency: 'VND', landingURL: LANDING }] }
    const r: Row = { search_results: [], hotel_list: [{ name: 'Khach san Quy Nhon Center', address: '51 Hoang Dieu', lat: 13.7, lng: 109.2, rating_value: 4.2, maps_link: 'https://maps.google.com/?cid=1' }] }
    await attachCommerceLinks('get_hotel_prices', r, ctx({ env: LITE_ENV, http: httpOk(lite), now: () => NOW }))
    const [row] = r.hotel_list as Row[]
    expect(row.agoda_offer_url).toBe(LANDING)
    expect(row.agoda_offer_price).toMatchObject({ amount: 231_481, platform: 'Agoda' })
  })
  it('no offer for the turn (provider off): no price on any row and no line', async () => {
    const r = hotels()
    await attachCommerceLinks('get_hotel_prices', r, ctx({ env: {} }))
    for (const h of r.hotel_list as Row[]) expect(h.agoda_offer_price).toBeUndefined()
    for (const rec of stayRecommendations(r)) expect((rec.entity.ext as { stayOffer?: unknown }).stayOffer).toBeUndefined()
    expect(stayOfferLine(undefined, t('vi'), 'vi')).toBeNull()
  })

  it('a stale offer (older than the price TTL): the URL may stay, but no price is attached and no line is shown', async () => {
    const r = hotels()
    // the provider was asked at NOW; the card is built 30 minutes later, past the fare TTL
    await attachCommerceLinks('get_hotel_prices', r, ctx({ env: LITE_ENV, http: httpOk(liteJson), now: () => NOW }, new Date(NOW.getTime() + 30 * 60_000)))
    const [matched] = r.hotel_list as Row[]
    expect(matched.agoda_offer_price).toBeUndefined()
    expect(stayRecommendations(r).every(x => (x.entity.ext as { stayOffer?: unknown }).stayOffer === undefined)).toBe(true)
  })

  it('a memoised result: a second attach with no offer removes the earlier price (idempotent, nothing stale leaks)', async () => {
    const r = hotels()
    await attachCommerceLinks('get_hotel_prices', r, ctx({ env: LITE_ENV, http: httpOk(liteJson), now: () => NOW }))
    expect((r.hotel_list as Row[])[0].agoda_offer_price).toBeDefined()
    await attachCommerceLinks('get_hotel_prices', r, ctx({ env: {} }))
    expect((r.hotel_list as Row[])[0].agoda_offer_price).toBeUndefined()
  })

  it('malformed or unit-less data draws no line (only structured numbers are shown)', () => {
    const bad = [{ amount: 0, currency: 'VND', unit: 'per_night', platform: 'Agoda', checkedAt: NOW.toISOString() }, { amount: 100, currency: 'EUR', unit: 'per_night', platform: 'Agoda', checkedAt: NOW.toISOString() }, { amount: 100, currency: 'VND', unit: 'per_night', platform: 'Agoda', checkedAt: 'x' }, { amount: 100, currency: 'VND', platform: 'Agoda', checkedAt: NOW.toISOString() }]
    for (const b of bad) expect(stayOfferLine(b as never, t('vi'), 'vi')).toBeNull()
  })
})
