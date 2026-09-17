import { describe, it, expect } from 'vitest'
import { resolveCommerce, PROVIDER_REGISTRY, getProvider, providerStatus, monetizationStatus, linkStrategyFor, type CommerceRequest, type CommerceLink } from './index'
import { ADAPTERS, adaptersFor, searchTemplates } from './adapters'
import { PASSTHROUGH_ADAPTERS } from './adapters/handoff'
import { validateRegistry } from './registry'
import { checkCommerceUrl } from './validation/url'
import { deriveKind } from './resolver/resolve'
import { actionKindFor, urlKindFor } from './cta/projection'

// ─────────────────────────────────────────────────────────────────────────────
// Provider Integration Completion Pass (owner directive 14 Sep 2026) — one test
// per provider / capability the FROZEN list supports, plus the negatives: no
// provider outside the list, no fabricated id, no cross-provider contamination,
// affiliate state never gating a direct path, ranking never led by monetisation.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-09-14T08:00:00Z')
const links = (r: ReturnType<typeof resolveCommerce>): CommerceLink[] => ('links' in r ? r.links : [])
const byProvider = (r: ReturnType<typeof resolveCommerce>, id: string) => links(r).find(l => l.providerId === id)

const FROZEN = ['shopee', 'tiktokshop', 'lazada', 'dmx', 'cellphones', 'grabfood', 'shopeefood', 'tripcom', 'booking', 'agoda', 'traveloka', 'vexere', 'vietnamairlines', 'vietjet', 'klook', 'cgv', 'ticketbox']

describe('the frozen provider list is the registry, exactly', () => {
  it('names the 17 approved providers and nobody else — PasGo, Tiki, TGDD, California Fitness stay out', () => {
    expect(PROVIDER_REGISTRY.map(p => p.providerId).sort()).toEqual([...FROZEN].sort())
    for (const gone of ['pasgo', 'tiki', 'tgdd', 'californiafitness', 'befood']) expect(getProvider(gone)).toBeNull()
    expect(validateRegistry()).toEqual([])
  })

  it('every provider has an adapter (grammar or passthrough), a link strategy per intent and a derived status', () => {
    const backed = new Set([...ADAPTERS, ...PASSTHROUGH_ADAPTERS].map(a => a.providerId))
    for (const p of PROVIDER_REGISTRY) {
      expect(backed.has(p.providerId), p.providerId).toBe(true)
      for (const intent of p.intents) expect(linkStrategyFor(p, intent).length, `${p.providerId}/${intent}`).toBeGreaterThan(0)
      expect(['ACTIVE', 'ACTIVE_DIRECT', 'HANDOFF_ONLY']).toContain(providerStatus(p))
    }
  })

  it('affiliate state is a monetisation fact, never availability: every pending merchant is ACTIVE_DIRECT', () => {
    const pending = PROVIDER_REGISTRY.filter(p => monetizationStatus(p) === 'PENDING')
    expect(pending.map(p => p.providerId).sort()).toEqual(['dmx', 'lazada', 'shopee', 'vexere'])
    for (const p of pending) expect(providerStatus(p)).toBe(p.tier === 'mvp' ? 'ACTIVE_DIRECT' : 'HANDOFF_ONLY')
    expect(providerStatus(getProvider('tiktokshop')!)).toBe('ACTIVE')
    expect(providerStatus(getProvider('booking')!)).toBe('ACTIVE_DIRECT')
    expect(monetizationStatus(getProvider('vietjet')!)).toBe('NOT_APPLICABLE')
  })

  it('Shopee and TikTok Shop remain first-class; Shopee marketplace and ShopeeFood never share a host or a transactional capability', () => {
    for (const id of ['shopee', 'tiktokshop']) expect(getProvider(id)!.tier).toBe('mvp')
    const shopee = getProvider('shopee')!, food = getProvider('shopeefood')!
    expect(shopee.allowedHosts.some(h => food.allowedHosts.includes(h))).toBe(false)
    expect(shopee.commerce.filter(c => c !== 'commerce_handoff').some(c => food.commerce.includes(c))).toBe(false)
  })
})

// ── Shopping ─────────────────────────────────────────────────────────────────
describe('Shopping — Shopee · TikTok Shop · Lazada · Điện Máy Xanh · CellphoneS', () => {
  const req: CommerceRequest = { domain: 'shopping', intentType: 'buy_product', subject: 'iPhone 16 Pro Max 256GB' }
  const hints = [
    { url: 'https://shopee.vn/iPhone-16-Pro-Max-256GB-i.88201679.29337485130' },
    { url: 'https://shop.tiktok.com/vn/pdp/iphone-16-pro-max/1729554738295738410' },
    { url: 'https://www.lazada.vn/products/iphone-16-pro-max-256gb-i2916521905.html' },
    { url: 'https://www.dienmayxanh.com/dien-thoai/iphone-16-pro-max' },
    { url: 'https://cellphones.com.vn/iphone-16-pro-max.html' },
    { url: 'https://tiki.vn/iphone-16-pro-max-p2000.html' }, // not a provider — must vanish
  ]
  const r = resolveCommerce(req, { hints, now: NOW, enabled: true })

  it('every shopping provider resolves its own product page and nothing else; Tiki is refused', () => {
    expect(links(r).map(l => l.providerId).sort()).toEqual(['cellphones', 'dmx', 'lazada', 'shopee', 'tiktokshop'])
    expect(links(r).some(l => /tiki/.test(l.url))).toBe(false)
    for (const l of links(r)) expect(checkCommerceUrl(l.directUrl, getProvider(l.providerId)!).ok, l.providerId).toBe(true)
  })

  it('carries the verified auth boundaries: Shopee login before selection, TikTok Shop / Lazada / CellphoneS before checkout, DMX at order', () => {
    expect(byProvider(r, 'shopee')!.authRequiredAt).toBe('before_selection')
    expect(byProvider(r, 'tiktokshop')!.authRequiredAt).toBe('before_checkout')
    expect(byProvider(r, 'lazada')!.authRequiredAt).toBe('before_checkout')
    expect(byProvider(r, 'cellphones')!.authRequiredAt).toBe('before_checkout')
    expect(byProvider(r, 'dmx')!.authRequiredAt).toBe('at_order')
    expect(byProvider(r, 'dmx')!.depthProfile.guestDepth).toBe(5)
  })

  it('DMX (verified L5 guest) ranks first; the tracked TikTok Shop link never outranks it by monetisation', () => {
    expect(links(r)[0].providerId).toBe('dmx')
  })

  it('falls back to an honest search only where a composable grammar exists (Shopee, Lazada, DMX, CellphoneS) — TikTok Shop composes nothing', () => {
    const none = resolveCommerce(req, { hints: [], now: NOW, enabled: true })
    expect(links(none).map(l => [l.providerId, l.kind]).sort()).toEqual([['cellphones', 'SEARCH_HANDOFF'], ['dmx', 'SEARCH_HANDOFF'], ['lazada', 'SEARCH_HANDOFF'], ['shopee', 'SEARCH_HANDOFF']])
    expect(byProvider(none, 'dmx')!.directUrl).toBe('https://www.dienmayxanh.com/tim-kiem?key=iPhone%2016%20Pro%20Max%20256GB')
    expect(links(none).every(l => l.paramsDropped.includes('productRef'))).toBe(true)
  })
})

// ── Food & Drink ─────────────────────────────────────────────────────────────
describe('Food & Drink — GrabFood · ShopeeFood (delivery); table_reservation NOT_REQUIRED', () => {
  const req: CommerceRequest = { domain: 'food_drink', intentType: 'order_delivery', subject: 'Phở 24' }
  it('restaurant pages pass through at L3 with the app / login boundary; a search page on the platform is refused', () => {
    const r = resolveCommerce(req, { hints: [
      { url: 'https://shopeefood.vn/ho-chi-minh/pho-24-nguyen-tri-phuong' },
      { url: 'https://food.grab.com/vn/vi/restaurant/pho-24-delivery/5-C2YAVZ3AN3TTN2' },
      { url: 'https://shopeefood.vn/ho-chi-minh/tim-kiem' },
    ], now: NOW, enabled: true })
    expect(links(r).map(l => l.providerId).sort()).toEqual(['grabfood', 'shopeefood'])
    expect(byProvider(r, 'shopeefood')!.authRequiredAt).toBe('app_only')
    expect(byProvider(r, 'grabfood')!.authRequiredAt).toBe('before_checkout')
    expect(links(r).every(l => l.depth === 3 && l.kind === 'DETAIL_HANDOFF')).toBe(true)
  })
  it('a reservation request finds no provider, no link and no search page', () => {
    const r = resolveCommerce({ domain: 'food_drink', intentType: 'reserve_table', subject: 'x' }, { hints: [{ url: 'https://pasgo.vn/nha-hang/x-1' }], now: NOW, enabled: true })
    expect(links(r)).toEqual([])
    expect(adaptersFor({ domain: 'food_drink', intentType: 'reserve_table', subject: 'x' })).toEqual([])
  })
})

// ── Travel — hotels ──────────────────────────────────────────────────────────
describe('Travel — hotels: Trip.com · Booking.com · Agoda · Traveloka', () => {
  const stay = { kind: 'hotel' as const, propertyRef: 'muong-thanh', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 }
  const req: CommerceRequest = { domain: 'travel', intentType: 'book_hotel', subject: 'Mường Thanh Luxury Đà Nẵng', configuration: stay, constraints: { city: 'Đà Nẵng' } }
  const r = resolveCommerce(req, { hints: [
    { url: 'https://vn.trip.com/hotels/da-nang-hotel-detail-10569789/muong-thanh-luxury/' },
    { url: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html' },
    { url: 'https://www.agoda.com/vi-vn/muong-thanh-luxury-da-nang-hotel/hotel/da-nang-vn.html' },
    { url: 'https://www.traveloka.com/vi-vn/hotel/vietnam/muong-thanh-luxury-da-nang-hotel-1000000254912' },
  ], now: NOW, enabled: true })

  it('all four OTAs resolve the property with the stay applied where the grammar carries it', () => {
    expect(links(r).map(l => l.providerId).sort()).toEqual(['agoda', 'booking', 'traveloka', 'tripcom'])
    expect(byProvider(r, 'tripcom')!.directUrl).toContain('hotelId=10569789&checkIn=2026-10-10&checkOut=2026-10-12&adult=2')
    expect(byProvider(r, 'booking')!.directUrl).toBe('https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html?checkin=2026-10-10&checkout=2026-10-12&group_adults=2&no_rooms=1&group_children=0')
    expect(byProvider(r, 'booking')!.paramsPreserved).toEqual(['propertyRef', 'checkIn', 'checkOut', 'adults', 'rooms', 'children'])
    expect(byProvider(r, 'agoda')!.directUrl).toBe('https://www.agoda.com/vi-vn/muong-thanh-luxury-da-nang-hotel/hotel/da-nang-vn.html?checkIn=2026-10-10&checkOut=2026-10-12&adults=2&rooms=1&children=0')
    expect(byProvider(r, 'agoda')!.validation.status).toBe('grammar_unverified') // dates observed, not verified applied
    expect(byProvider(r, 'traveloka')!.directUrl).toBe('https://www.traveloka.com/vi-vn/hotel/vietnam/muong-thanh-luxury-da-nang-hotel-1000000254912')
  })

  it('Trip.com (guest L5, dated grammar) leads; Booking.com (L4) precedes the L3 property pages', () => {
    const order = links(r).map(l => l.providerId)
    expect(order[0]).toBe('tripcom')
    expect(order.indexOf('booking')).toBeLessThan(order.indexOf('agoda'))
  })

  it('without a property: Booking.com composes a dated results page; Agoda / Traveloka fall back to their front doors (query dropped — verified); Trip.com composes nothing', () => {
    const none = resolveCommerce(req, { hints: [], now: NOW, enabled: true })
    expect(links(none).map(l => l.providerId).sort()).toEqual(['agoda', 'booking', 'traveloka'])
    expect(byProvider(none, 'booking')!.directUrl).toBe('https://www.booking.com/searchresults.vi.html?ss=%C4%90%C3%A0+N%E1%BA%B5ng&checkin=2026-10-10&checkout=2026-10-12&group_adults=2&no_rooms=1&group_children=0')
    expect(byProvider(none, 'booking')!.kind).toBe('SEARCH_HANDOFF')
    expect(byProvider(none, 'agoda')!.directUrl).toBe('https://www.agoda.com/vi-vn/')
    expect(byProvider(none, 'agoda')!.depth).toBe(0)
    expect(byProvider(none, 'traveloka')!.directUrl).toBe('https://www.traveloka.com/vi-vn/hotel')
    expect(links(none)[0].providerId).toBe('booking') // the one that keeps the intent ranks first
  })

  it('Booking.com and Agoda are barred from price comparison (contractual)', () => {
    expect(getProvider('booking')!.rights.comparisonOk).toBe(false)
    expect(getProvider('agoda')!.rights.comparisonOk).toBe(false)
  })
})

// ── Travel — flights ─────────────────────────────────────────────────────────
describe('Travel — flights: Trip.com · Traveloka · Vietnam Airlines · Vietjet', () => {
  const flight = { kind: 'transport' as const, originRef: 'SGN', destinationRef: 'HAN', departDate: '2026-10-10', passengers: 2, mode: 'flight' as const }
  const req: CommerceRequest = { domain: 'travel', intentType: 'book_flight', subject: 'Sài Gòn → Hà Nội', configuration: flight }
  const r = resolveCommerce(req, { hints: [], now: NOW, enabled: true })

  it('composes the verified dated fare searches (Trip.com, Traveloka) and the airlines\' entry pages; nothing deeper is invented', () => {
    expect(links(r).map(l => l.providerId).sort()).toEqual(['traveloka', 'tripcom', 'vietjet', 'vietnamairlines'])
    expect(byProvider(r, 'tripcom')!.directUrl).toBe('https://vn.trip.com/flights/showfarefirst?dcity=sgn&acity=han&ddate=2026-10-10&flighttype=ow&class=y&quantity=2&locale=vi-VN&curr=VND')
    expect(byProvider(r, 'tripcom')!.paramsPreserved).toEqual(['originRef', 'destinationRef', 'departDate', 'passengers'])
    expect(byProvider(r, 'traveloka')!.directUrl).toBe('https://www.traveloka.com/vi-VN/flight/fullsearch?ap=SGN.HAN&dt=10-10-2026.null&ps=2.0.0&sc=ECONOMY')
    expect(byProvider(r, 'vietnamairlines')!.directUrl).toBe('https://www.vietnamairlines.com/vn/vi/buy-tickets-other-products/booking-and-manage-bookings/book-tickets')
    expect(byProvider(r, 'vietnamairlines')!.paramsDropped).toEqual(['originRef', 'destinationRef', 'departDate', 'returnDate', 'passengers', 'cabin'])
    expect(byProvider(r, 'vietjet')!.directUrl).toBe('https://www.vietjetair.com/vi')
    expect(links(r).every(l => l.kind === 'SEARCH_HANDOFF' && l.depth <= 2)).toBe(true)
  })

  it('a round trip carries the return date on both dated grammars; a non-economy cabin is observed, not verified', () => {
    const rt = resolveCommerce({ ...req, configuration: { ...flight, returnDate: '2026-10-15', cabin: 'business' } }, { hints: [], now: NOW, enabled: true })
    expect(byProvider(rt, 'tripcom')!.directUrl).toContain('rdate=2026-10-15&flighttype=rt&class=c')
    expect(byProvider(rt, 'tripcom')!.validation.status).toBe('grammar_unverified')
    // Traveloka ignores a second date in `dt=` (live UAT 14 Sep 2026: "Một chiều"): the return leg is page-only, never claimed.
    expect(byProvider(rt, 'traveloka')!.directUrl).toContain('dt=10-10-2026.null&ps=2.0.0&sc=BUSINESS')
    expect(byProvider(rt, 'traveloka')!.paramsPageOnly).toEqual(['returnDate'])
  })

  it('the dated fare lists (intent carried) outrank the airline entry pages (intent dropped); Trip.com is tracked without changing that order', () => {
    const order = links(r).map(l => l.providerId)
    expect(order.slice(0, 2).sort()).toEqual(['traveloka', 'tripcom'])
    expect(order.slice(2).sort()).toEqual(['vietjet', 'vietnamairlines'])
  })

  it('a flight request never yields a hotel page and city names (not IATA) compose no Trip.com / Traveloka URL', () => {
    expect(links(r).some(l => /hotel/.test(l.url))).toBe(false)
    const named = resolveCommerce({ ...req, configuration: { ...flight, originRef: 'sai-gon', destinationRef: 'ha-noi' } }, { hints: [], now: NOW, enabled: true })
    expect(links(named).map(l => l.providerId).sort()).toEqual(['vietjet', 'vietnamairlines'])
  })
})

// ── Travel — coaches ─────────────────────────────────────────────────────────
describe('Travel — coaches: Vexere', () => {
  // Place refs are SLUGS (the request schema refuses whitespace — the injection surface); the seam slugifies the user's words.
  const bus = { kind: 'transport' as const, originRef: 'sai-gon', destinationRef: 'da-lat', departDate: '2026-10-10', mode: 'bus' as const }
  const req: CommerceRequest = { domain: 'travel', intentType: 'book_transport', subject: 'Sài Gòn → Đà Lạt', configuration: bus }

  it('a discovered route page that names both places gets the date appended (verified grammar)', () => {
    const r = resolveCommerce(req, { hints: [{ url: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html' }], now: NOW, enabled: true })
    expect(links(r)).toHaveLength(1)
    expect(links(r)[0].directUrl).toBe('https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html?date=10-10-2026')
    expect(links(r)[0].paramsPreserved).toEqual(['originRef', 'destinationRef', 'departDate'])
    expect(links(r)[0].depthProfile.guestDepth).toBe(4)
    expect(links(r)[0].authRequiredAt).toBe('none')
  })

  it('a route page for another pair of places is refused; HCMC aliases map to Vexere\'s "sai-gon"', () => {
    const wrong = resolveCommerce(req, { hints: [{ url: 'https://vexere.com/vi-VN/ve-xe-khach-tu-ha-noi-di-sa-pa-lao-cai-124t24241.html' }], now: NOW, enabled: true })
    expect(links(wrong).map(l => l.kind)).toEqual(['SEARCH_HANDOFF'])
    const alias = resolveCommerce({ ...req, configuration: { ...bus, originRef: 'tp-hcm' } }, { hints: [{ url: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html' }], now: NOW, enabled: true })
    expect(links(alias)[0].directUrl).toContain('129t23991.html?date=10-10-2026')
  })

  it('with no route page, the front door is the honest fallback — the 404 search grammar is never composed', () => {
    const r = resolveCommerce(req, { hints: [], now: NOW, enabled: true })
    expect(links(r).map(l => l.directUrl)).toEqual(['https://vexere.com/vi-VN'])
    expect(links(r)[0].paramsDropped).toContain('departDate')
    expect(searchTemplates().some(t => t.template.includes('ket-qua-tim-kiem'))).toBe(false)
  })
})

// ── Entertainment ────────────────────────────────────────────────────────────
describe('Entertainment — Klook activities · CGV films · Ticketbox events', () => {
  it('Klook: activity page at L3, login before checkout; Klook is never a hotel or a flight', () => {
    const r = resolveCommerce({ domain: 'entertainment', intentType: 'book_activity', subject: 'VinWonders' }, { hints: [{ url: 'https://www.klook.com/vi/activity/11988-vinwonders-nha-trang-ticket/' }], now: NOW, enabled: true })
    expect(links(r).map(l => [l.providerId, l.depth, l.authRequiredAt])).toEqual([['klook', 3, 'before_checkout']])
    expect(adaptersFor({ domain: 'travel', intentType: 'book_hotel', subject: 'x' }).some(a => a.providerId === 'klook')).toBe(false)
  })

  it('CGV: a film page is the boundary (film_detail); showtime_discovery is declared by nobody and no session URL is composed', () => {
    const r = resolveCommerce({ domain: 'entertainment', intentType: 'buy_ticket', subject: 'Hope vùng tử địa', configuration: { kind: 'cinema', filmRef: 'hope-vung-tu-dia', date: '2026-10-10', showtime: '21:00' } }, { hints: [{ url: 'https://www.cgv.vn/default/hope-vung-tu-dia.html' }], now: NOW, enabled: true })
    expect(links(r)).toHaveLength(1)
    expect(links(r)[0].directUrl).toBe('https://www.cgv.vn/default/hope-vung-tu-dia.html')
    expect(links(r)[0].paramsPageOnly).toEqual(['city', 'cinemaRef', 'date', 'showtime', 'format'])
    expect(links(r)[0].authRequiredAt).toBe('before_selection')
    expect(getProvider('cgv')!.commerce).toContain('film_detail')
    expect(PROVIDER_REGISTRY.some(p => p.commerce.includes('showtime_discovery'))).toBe(false)
  })

  it('Ticketbox: an event page resolves at L3 with login before selection; a listing / reserved path does not; the search page is the fallback', () => {
    const req: CommerceRequest = { domain: 'entertainment', intentType: 'buy_event_ticket', subject: 'Anh Trai Say Hi concert' }
    const r = resolveCommerce(req, { hints: [{ url: 'https://ticketbox.vn/anh-trai-say-hi-concert-2026-18234' }, { url: 'https://ticketbox.vn/search' }, { url: 'https://ticketbox.vn/events' }], now: NOW, enabled: true })
    expect(links(r).map(l => [l.providerId, l.kind, l.depth, l.authRequiredAt])).toEqual([['ticketbox', 'DETAIL_HANDOFF', 3, 'before_selection']])
    const none = resolveCommerce(req, { hints: [], now: NOW, enabled: true })
    expect(links(none).map(l => l.directUrl)).toEqual(['https://ticketbox.vn/search?q=Anh%20Trai%20Say%20Hi%20concert'])
    expect(links(none)[0].kind).toBe('SEARCH_HANDOFF')
    expect(actionKindFor('buy_event_ticket')).toBe('ticket')
    expect(urlKindFor(links(none)[0].kind)).toBe('search')
  })
})

// ── Spa ──────────────────────────────────────────────────────────────────────
describe('Spa — Klook (primary and only active spa provider)', () => {
  it('a spa package resolves at L3 with the voucher limitation and login before checkout; California Fitness does not exist', () => {
    const r = resolveCommerce({ domain: 'spa', intentType: 'buy_spa_voucher', subject: 'Ha Spa' }, { hints: [{ url: 'https://www.klook.com/vi/activity/43345-ha-spa-massage-ho-chi-minh/' }], now: NOW, enabled: true })
    expect(links(r).map(l => [l.providerId, l.depth, l.authRequiredAt])).toEqual([['klook', 3, 'before_checkout']])
    expect(links(r)[0].limitations.join(' ')).toMatch(/voucher/)
    expect(getProvider('californiafitness')).toBeNull()
  })
})

// ── Cross-cutting ────────────────────────────────────────────────────────────
describe('cross-cutting guarantees', () => {
  it('no adapter accepts a look-alike host or an http URL, for any provider', () => {
    for (const a of [...ADAPTERS, ...PASSTHROUGH_ADAPTERS]) {
      const host = a.entry.allowedHosts[0]
      const req: CommerceRequest = { domain: a.entry.domains[0], intentType: a.entry.intents[0], subject: 'x' }
      expect(a.toOffer(req, { url: `https://${host}.evil.example/x/y-123` }), a.providerId).toBeNull()
      expect(a.toOffer(req, { url: `http://${host}/x/y-123` }), a.providerId).toBeNull()
    }
  })

  it('every emitted link validates against its own provider allow-list and carries its depth profile, auth boundary and limitations', () => {
    const cases: Array<[CommerceRequest, { url: string }[]]> = [
      [{ domain: 'travel', intentType: 'book_flight', subject: 'x', configuration: { kind: 'transport', originRef: 'SGN', destinationRef: 'DAD', departDate: '2026-10-10', mode: 'flight' } }, []],
      [{ domain: 'travel', intentType: 'book_hotel', subject: 'x', configuration: { kind: 'hotel', propertyRef: 'p', checkIn: '2026-10-10', checkOut: '2026-10-11', adults: 1 } }, [{ url: 'https://www.booking.com/hotel/vn/abc.vi.html' }]],
      [{ domain: 'entertainment', intentType: 'buy_event_ticket', subject: 'concert' }, []],
    ]
    for (const [req, hints] of cases) {
      for (const l of links(resolveCommerce(req, { hints, now: NOW, enabled: true }))) {
        expect(checkCommerceUrl(l.url, getProvider(l.providerId)!).ok, l.providerId).toBe(true)
        expect(l.depthProfile.verifiedOn).toMatch(/^2026-09-1[34]$/)
        expect(l.limitations.length, l.providerId).toBeGreaterThan(0)
        expect(l.facts).toBeUndefined() // no realtime source is activated in this pass
      }
    }
  })

  it('composable search templates exist only for merchants whose search page keeps the query (Shopee, Lazada, DMX, CellphoneS, GrabFood, Booking.com, Ticketbox) or whose front door is the only page (Agoda, Vexere)', () => {
    expect(searchTemplates().map(t => t.providerId).sort()).toEqual(['agoda', 'booking', 'cellphones', 'dmx', 'grabfood', 'lazada', 'shopee', 'ticketbox', 'vexere'])
    // ShopeeFood and TikTok Shop have none (their search URLs drop the query / are app shells).
    expect(searchTemplates().some(t => t.providerId === 'shopeefood' || t.providerId === 'tiktokshop')).toBe(false)
  })

  it('a tracked SEARCH page is still a search (live UAT 14 Sep 2026): CellphoneS catalogue search under an approved wrapper is SEARCH_HANDOFF with affiliate tracking on the link', () => {
    const r = resolveCommerce({ domain: 'shopping', intentType: 'buy_product', subject: 'iPhone 16 Pro', constraints: { merchantAllowList: ['cellphones'] } }, { hints: [], now: NOW, enabled: true })
    // (the wrapper itself needs the publisher id from the environment; the KIND must not depend on it)
    expect(links(r).map(l => [l.providerId, l.kind])).toEqual([['cellphones', 'SEARCH_HANDOFF']])
    expect(urlKindFor(links(r)[0].kind)).toBe('search')
    expect(deriveKind(2, { mode: 'affiliate', network: 'accesstrade', campaignId: '1', subIds: {}, utm: {} }, false)).toBe('SEARCH_HANDOFF')
  })

  it('a NAMED merchant narrows the request to it (live UAT 14 Sep 2026): the allow-list yields only that merchant, never a silent fallback to another', () => {
    const req: CommerceRequest = { domain: 'shopping', intentType: 'buy_product', subject: 'iPhone 16 Pro Max 256GB', constraints: { merchantAllowList: ['dienmayxanh'] } }
    const r = resolveCommerce(req, { hints: [{ url: 'https://shopee.vn/iPhone-16-Pro-Max-256GB-i.88201679.29337485130' }], now: NOW, enabled: true })
    expect(links(r).map(l => [l.providerId, l.kind])).toEqual([['dmx', 'SEARCH_HANDOFF']])
    const tiktok = resolveCommerce({ ...req, constraints: { merchantAllowList: ['tiktokshop'] } }, { hints: [], now: NOW, enabled: true })
    expect(links(tiktok)).toEqual([]) // no page, no grammar → nothing, honestly
  })
})
