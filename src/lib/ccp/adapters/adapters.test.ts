import { describe, it, expect } from 'vitest'
import type { CommerceRequest } from '../domain/types'
import { dmxAdapter } from './dmx'
import { tripcomAdapter } from './tripcom'
import { pasgoAdapter } from './pasgo'
import { cgvAdapter } from './cgv'
import { klookAdapter } from './klook'
import { adaptersFor, ADAPTERS, MVP_ADAPTERS } from './index'

const now = new Date('2026-09-13T10:00:00+07:00')

describe('adapter grammars — golden URLs from the Transaction Depth Audit', () => {
  it('DMX: product page is the direct link; variant/quantity are page-only; L5 is one tap away', () => {
    const req: CommerceRequest = { domain: 'shopping', intentType: 'buy_product', subject: 'iPhone 15 256GB', configuration: { kind: 'shopping', productRef: 'iphone-15-256gb', quantity: 1 } }
    const offer = dmxAdapter.toOffer(req, { url: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb/' }, now)!
    expect(offer.canonicalUrl).toBe('https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb')
    expect(offer.price).toBeUndefined() // D7: no feed data without display rights
    const b = dmxAdapter.buildDirectLink(offer, req.configuration, now)!
    expect(b.url).toBe(offer.canonicalUrl)
    expect(b.depth).toBe(3)
    expect(b.paramsPageOnly).toEqual(['variant', 'quantity'])
    expect(offer.depthProfile.guestDepth).toBe(5)
    expect(b.limitations.join(' ')).toMatch(/OTP/)
  })

  it('DMX: refuses non-product paths and foreign hosts', () => {
    const req: CommerceRequest = { domain: 'shopping', intentType: 'buy_product', subject: 'x' }
    expect(dmxAdapter.toOffer(req, { url: 'https://www.dienmayxanh.com/cart' }, now)).toBeNull()
    expect(dmxAdapter.toOffer(req, { url: 'https://cellphones.com.vn/iphone-15.html' }, now)).toBeNull()
  })

  it('DMX: attaches feed price ONLY when display is enabled', () => {
    const req: CommerceRequest = { domain: 'shopping', intentType: 'buy_product', subject: 'x' }
    const feedItem = { sku: '1', name: 'iPhone 15 256GB', url: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb', price: 21990000, discount: 21990000, image: null, description: null, category: null, feedFile: 'dienmayxanh.com.csv' }
    const off = dmxAdapter.toOffer(req, { url: feedItem.url, feedItem, feedDisplayEnabled: false }, now)!
    expect(off.price).toBeUndefined()
    expect(off.title).toBe('x')
    const on = dmxAdapter.toOffer(req, { url: feedItem.url, feedItem, feedDisplayEnabled: true }, now)!
    expect(on.price?.listPrice).toBe(21990000)
    expect(on.price?.freshnessType).toBe('near_realtime')
    expect(on.availability?.state).toBe('UNKNOWN')
  })

  it('Trip.com: carries hotelId + dates + guests exactly as verified', () => {
    const req: CommerceRequest = {
      domain: 'travel',
      intentType: 'book_hotel',
      subject: 'Nordic Resort',
      configuration: { kind: 'hotel', propertyRef: '10569789', cityRef: '42599', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2, children: 0, rooms: 1 },
    }
    const offer = tripcomAdapter.toOffer(req, { subjectRef: '10569789' }, now)!
    const b = tripcomAdapter.buildDirectLink(offer, req.configuration, now)!
    const u = new URL(b.url)
    expect(u.origin + u.pathname).toBe('https://vn.trip.com/hotels/detail/')
    expect(Object.fromEntries(u.searchParams)).toEqual({ cityId: '42599', hotelId: '10569789', checkIn: '2026-10-10', checkOut: '2026-10-12', adult: '2', children: '0', crn: '1', curr: 'VND', locale: 'vi-VN' })
    expect(b.paramsPreserved).toEqual(expect.arrayContaining(['propertyRef', 'checkIn', 'checkOut', 'adults']))
    expect(b.depth).toBe(4)
    expect(b.expiresAt).toBe(new Date('2026-10-10T00:00:00+07:00').toISOString())
  })

  it('Trip.com: without dates falls back to the detail page and says so', () => {
    const req: CommerceRequest = { domain: 'travel', intentType: 'book_hotel', subject: 'x' }
    const offer = tripcomAdapter.toOffer(req, { url: 'https://vn.trip.com/hotels/detail/?hotelId=10569789&cityId=42599&checkIn=2026-10-10' }, now)!
    const b = tripcomAdapter.buildDirectLink(offer, undefined, now)!
    expect(b.depth).toBe(3)
    expect(b.paramsPageOnly).toContain('checkIn')
    expect(tripcomAdapter.toOffer(req, { subjectRef: 'not-a-number' }, now)).toBeNull()
  })

  it('PasGo: reservation URL carries party size, date (DD/MM/YYYY) and time; hold expiry set', () => {
    const req: CommerceRequest = { domain: 'food_drink', intentType: 'reserve_table', subject: 'Chả Cá Hàng Sơn', configuration: { kind: 'reservation', restaurantRef: '4815', date: '2026-09-13', time: '19:00', adults: 2, children: 0 } }
    const offer = pasgoAdapter.toOffer(req, { url: 'https://pasgo.vn/nha-hang/cha-ca-hang-son-huynh-thuc-khang-4815', verified: { bookable: true, checkedAt: now.toISOString(), source: 'merchant_page' } }, now)!
    expect(offer.subjectRef).toBe('4815')
    const b = pasgoAdapter.buildDirectLink(offer, req.configuration, now)!
    expect(b.url).toBe('https://pasgo.vn/dat-cho-ngay/4815?returnUrl=%2Fnha-hang%2Fcha-ca-hang-son-huynh-thuc-khang-4815&sfAdult=2&sfChild=0&sfDateFrom=13%2F09%2F2026&sfTimeFrom=19%3A00')
    expect(new URL(b.url).searchParams.get('sfDateFrom')).toBe('13/09/2026')
    expect(b.depth).toBe(5)
    expect(b.expiresAt).toBe(new Date(now.getTime() + 5 * 60_000).toISOString())
  })

  it('CGV: film page is the verified link; a session URL is built ONLY from caller-supplied ids and labelled observed', () => {
    const base: CommerceRequest = { domain: 'entertainment', intentType: 'buy_ticket', subject: 'HOPE Vùng Tử Địa', configuration: { kind: 'cinema', filmRef: 'hope-vung-tu-dia', date: '2026-09-13', showtime: '21:00' } }
    const offer = cgvAdapter.toOffer(base, { url: 'https://www.cgv.vn/default/hope-vung-tu-dia.html' }, now)!
    const film = cgvAdapter.buildDirectLink(offer, base.configuration, now)!
    expect(film.url).toBe('https://www.cgv.vn/default/hope-vung-tu-dia.html')
    expect(film.depth).toBe(3)
    expect(film.grammar).toBe('verified')
    expect(film.limitations.join(' ')).toMatch(/đăng nhập/)

    const withSession = cgvAdapter.buildDirectLink(offer, { kind: 'cinema', filmRef: 'hope-vung-tu-dia', cinemaRef: '006', sessionRef: '14998369', date: '2026-09-13' }, now)!
    expect(withSession.url).toBe('https://www.cgv.vn/default/cinemas/booking/tickets/site/006/seq/14998369/dy/20260913/')
    expect(withSession.depth).toBe(4)
    expect(withSession.grammar).toBe('observed')
    // A partial session (no site code) must NOT fabricate a booking URL.
    const partial = cgvAdapter.buildDirectLink(offer, { kind: 'cinema', filmRef: 'hope-vung-tu-dia', sessionRef: '14998369', date: '2026-09-13' }, now)!
    expect(partial.url).toBe('https://www.cgv.vn/default/hope-vung-tu-dia.html')
    expect(cgvAdapter.toOffer(base, { url: 'https://www.cgv.vn/default/movies/now-showing.html' }, now)).toBeNull()
  })

  it('Klook: one adapter serves attractions and spa; package/date/quantity are page-only; login before checkout', () => {
    const act: CommerceRequest = { domain: 'entertainment', intentType: 'book_activity', subject: 'VinWonders', configuration: { kind: 'activity', activityRef: '11988', date: '2026-09-16', quantity: 1 } }
    const spa: CommerceRequest = { domain: 'spa', intentType: 'buy_spa_voucher', subject: 'Ha Spa', configuration: { kind: 'spa', activityRef: '43345', quantity: 1 } }
    expect(klookAdapter.supports(act)).toBe(true)
    expect(klookAdapter.supports(spa)).toBe(true)
    const o1 = klookAdapter.toOffer(act, { url: 'https://www.klook.com/vi/activity/11988-vinwonders-nha-trang-ticket/' }, now)!
    const b1 = klookAdapter.buildDirectLink(o1, act.configuration, now)!
    expect(b1.url).toBe('https://www.klook.com/vi/activity/11988-vinwonders-nha-trang-ticket/')
    expect(b1.paramsPageOnly).toEqual(['packageRef', 'date', 'quantity'])
    const o2 = klookAdapter.toOffer(spa, { subjectRef: '43345' }, now)!
    const b2 = klookAdapter.buildDirectLink(o2, spa.configuration, now)!
    expect(b2.url).toBe('https://www.klook.com/vi/activity/43345/')
    expect(b2.limitations.join(' ')).toMatch(/voucher/)
    expect(o2.depthProfile.authRequiredAt).toBe('before_checkout')
  })

  it('adaptersFor honours per-adapter flags and intent support', () => {
    const req: CommerceRequest = { domain: 'spa', intentType: 'buy_spa_voucher', subject: 'x' }
    expect(adaptersFor(req).map(a => a.providerId)).toEqual(['klook'])
    const flags = { CCP_ADAPTER_DMX: true, CCP_ADAPTER_TRIPCOM: true, CCP_ADAPTER_PASGO: true, CCP_ADAPTER_CGV: true, CCP_ADAPTER_KLOOK: false, CCP_ADAPTER_SHOPEE: true, CCP_ADAPTER_TIKTOKSHOP: true, CCP_ADAPTER_LAZADA: true, CCP_HANDOFF_ONLY: true } as const
    expect(adaptersFor(req, flags)).toEqual([])
    expect(MVP_ADAPTERS).toHaveLength(5)
    // Owner decision 14 Sep 2026: the three shopping marketplaces are adapter-backed too.
    expect(ADAPTERS.map(a => a.providerId)).toEqual(['dmx', 'tripcom', 'pasgo', 'cgv', 'klook', 'shopee', 'tiktokshop', 'lazada'])
  })
})

// ── Phase 6: discovery returns Trip.com's SEO path; only the id is taken, the emitted grammar is the verified one ──
describe('tripcom — SEO path hint (Phase 6 discovery)', () => {
  const req = { domain: 'travel', intentType: 'book_hotel', subject: 'Mường Thanh' } as const
  it('extracts hotelId from /hotels/<city>-hotel-detail-<id>/… and rebuilds the verified detail URL', () => {
    const offer = tripcomAdapter.toOffer(req, { url: 'https://vn.trip.com/hotels/da-nang-hotel-detail-10569789/muong-thanh-luxury/' })
    expect(offer?.subjectRef).toBe('10569789')
    expect(offer?.canonicalUrl).toBe('https://vn.trip.com/hotels/detail/?hotelId=10569789&locale=vi-VN')
  })
  it('refuses a non-detail path, a non-numeric id and a look-alike host', () => {
    expect(tripcomAdapter.toOffer(req, { url: 'https://vn.trip.com/hotels/list?city=da-nang' })).toBeNull()
    expect(tripcomAdapter.toOffer(req, { url: 'https://vn.trip.com/hotels/da-nang-hotel-detail-abc/x/' })).toBeNull()
    expect(tripcomAdapter.toOffer(req, { url: 'https://vn.trip.com.evil.example/hotels/da-nang-hotel-detail-10569789/x/' })).toBeNull()
  })
})
