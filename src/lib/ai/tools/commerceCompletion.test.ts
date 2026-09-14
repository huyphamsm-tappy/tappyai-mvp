import { describe, it, expect, vi } from 'vitest'
import { attachCommerceLinks, type RouteHandoffFacts } from './commerce'
import { COMMERCE_LINKS_KEY, type CommerceLinkRow } from '@/lib/ccp'

// ─────────────────────────────────────────────────────────────────────────────
// Provider Integration Completion Pass (14 Sep 2026) — the SEAM side: flights
// and coaches as route-level handoffs, events and films on entertainment turns,
// the OTAs on hotel rows. Every merchant page here is a fixture; `search` is
// the Serper seam so the tests can count and read every discovery query.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-09-14T08:00:00Z')
type Row = Record<string, unknown>
const links = (row: Row): CommerceLinkRow[] => (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []
const noSearch = vi.fn(async () => [])

describe('flights — get_flight_prices booking links are a CCP projection', () => {
  it('projects Trip.com and Traveloka dated fare lists first, then the airlines; facts travel without URLs; nothing else is left on the result', async () => {
    const result: Row = { flights: [], booking_links: [{ name: 'Traveloka', url: 'https://legacy.example/x' }], origin: 'SGN', destination: 'HAN' }
    await attachCommerceLinks('get_flight_prices', result, { enabled: true, now: NOW, search: noSearch, origin: 'Sài Gòn', destination: 'Hà Nội', departDate: '2026-10-10', passengers: 2 })
    const names = (result.booking_links as Array<{ name: string; url: string }>).map(l => l.name)
    expect(names).toEqual(['Trip.com', 'Traveloka', 'Vietnam Airlines', 'Vietjet'])
    const urls = (result.booking_links as Array<{ name: string; url: string }>).map(l => l.url)
    expect(urls[0]).toBe('https://vn.trip.com/flights/showfarefirst?dcity=sgn&acity=han&ddate=2026-10-10&flighttype=ow&class=y&quantity=2&locale=vi-VN&curr=VND')
    expect(urls[1]).toBe('https://www.traveloka.com/vi-VN/flight/fullsearch?ap=SGN.HAN&dt=10-10-2026.null&ps=2.0.0&sc=ECONOMY')
    expect(urls.some(u => u.includes('legacy.example'))).toBe(false)
    const facts = result._tappy_commerce as RouteHandoffFacts[]
    expect(facts.map(f => [f.providerId, f.kind, f.depth, f.authRequiredAt])).toEqual([
      ['tripcom', 'SEARCH_HANDOFF', 2, 'none'], ['traveloka', 'SEARCH_HANDOFF', 2, 'none'], ['vietnamairlines', 'SEARCH_HANDOFF', 1, 'none'], ['vietjet', 'SEARCH_HANDOFF', 1, 'none'],
    ])
    expect(facts.every(f => f.assumedParams.length === 0 && f.limitations.length > 0)).toBe(true)
    expect(JSON.stringify(facts)).not.toMatch(/https?:/)
    expect(result[COMMERCE_LINKS_KEY]).toBeUndefined()
    expect(noSearch).not.toHaveBeenCalled() // flights compose; they never search
  })

  it('assumes a departure date when the user gave none (recorded as assumed) and keeps the return leg', async () => {
    const result: Row = { error: 'no data', booking_links: [] }
    await attachCommerceLinks('get_flight_prices', result, { enabled: true, now: NOW, search: noSearch, origin: 'Đà Nẵng', destination: 'TP HCM', returnDate: '2026-09-25' })
    const facts = result._tappy_commerce as RouteHandoffFacts[]
    expect(facts[0].assumedParams).toEqual(['departDate'])
    const trip = (result.booking_links as Array<{ url: string }>)[0].url
    expect(trip).toContain('dcity=dad&acity=sgn&ddate=2026-09-21&rdate=2026-09-25&flighttype=rt')
  })

  it('an unmappable city composes no dated grammar: only the airline entry pages remain', async () => {
    const result: Row = { error: 'unknown airport', booking_links: [] }
    await attachCommerceLinks('get_flight_prices', result, { enabled: true, now: NOW, search: noSearch, origin: 'Mù Cang Chải', destination: 'Hà Nội' })
    expect(result.booking_links).toEqual([]) // no IATA for the origin → no CCP request at all; legacy field untouched
    expect(result._tappy_commerce).toBeUndefined()
  })

  it('leaves the result untouched when CCP is off', async () => {
    const result: Row = { booking_links: [{ name: 'Traveloka', url: 'https://www.traveloka.com/vi-VN/flight' }] }
    await attachCommerceLinks('get_flight_prices', result, { enabled: false, now: NOW, origin: 'SGN', destination: 'HAN' })
    expect(result.booking_links).toEqual([{ name: 'Traveloka', url: 'https://www.traveloka.com/vi-VN/flight' }])
  })
})

describe('coaches — get_transport_options vexere_link is a CCP projection', () => {
  it('discovers the Vexere route page for the two places and appends the date; the 404 search grammar never appears', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:vexere.com') ? [{ title: 'Vé xe Sài Gòn đi Đà Lạt | Vexere', link: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html', snippet: '' }] : [])
    const result: Row = { type: 'intercity', vexere_link: 'https://vexere.com/vi-VN' }
    await attachCommerceLinks('get_transport_options', result, { enabled: true, now: NOW, search, origin: 'Sài Gòn', destination: 'Đà Lạt', departDate: '2026-10-10', transportMode: 'intercity' })
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toBe('xe khách Sài Gòn Đà Lạt site:vexere.com/vi-VN')
    expect(result.vexere_link).toBe('https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html?date=10-10-2026')
    const facts = result._tappy_commerce as RouteHandoffFacts[]
    expect(facts.map(f => [f.providerId, f.kind, f.guestDepth, f.authRequiredAt])).toEqual([['vexere', 'SEARCH_HANDOFF', 4, 'none']])
    expect(String(result.vexere_link)).not.toContain('ket-qua-tim-kiem')
  })

  it('a route page for other places is refused and the front door is the fallback; a taxi turn is untouched', async () => {
    const search = vi.fn(async () => [{ title: 'x', link: 'https://vexere.com/vi-VN/ve-xe-khach-tu-ha-noi-di-sa-pa-lao-cai-124t24241.html', snippet: '' }])
    const result: Row = { type: 'intercity', vexere_link: 'x' }
    await attachCommerceLinks('get_transport_options', result, { enabled: true, now: NOW, search, origin: 'Sài Gòn', destination: 'Đà Lạt', transportMode: 'intercity' })
    expect(result.vexere_link).toBe('https://vexere.com/vi-VN')
    const taxi: Row = { type: 'taxi', apps: [] }
    await attachCommerceLinks('get_transport_options', taxi, { enabled: true, now: NOW, search, origin: 'a', destination: 'b', transportMode: 'taxi' })
    expect(taxi).toEqual({ type: 'taxi', apps: [] })
  })
})

describe('entertainment — events (Ticketbox) and films (CGV) on a places turn', () => {
  it('an event sentence discovers Ticketbox listings by SUBJECT + city as their own rows; the venue row gets no Ticketbox search', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:ticketbox.vn') && q.startsWith('concert')
      ? [
        { title: '[TP.HCM - NTPMM] Những Thành Phố Mơ Màng Summer 2025', link: 'https://ticketbox.vn/tphcm-nhung-thanh-pho-mo-mang-summer-2025-23769', snippet: '' }, // past year → refused
        { title: 'Anh Trai Say Hi Concert 2026 | Ticketbox', link: 'https://ticketbox.vn/anh-trai-say-hi-concert-2026-18234', snippet: '' },
        { title: 'Sự kiện', link: 'https://ticketbox.vn/events', snippet: '' },
      ]
      : [])
    const venue = { name: 'Nhà hát Hòa Bình', address: 'Quận 10' }
    const result: Row = { results: [venue], _tappy_place_domain: 'entertainment', query: 'concert' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, location: 'TP.HCM', query: 'concert', userTexts: ['Có concert nào ở TP.HCM cuối tuần này không?'] })
    expect(links(venue)).toEqual([]) // no "Tìm vé trên Ticketbox" for a venue's name
    const rows = result.results as Row[]
    expect(rows).toHaveLength(2)
    const listing = rows[1]
    expect(listing._tappy_experience).toBe(true)
    expect(listing.name).toBe('Anh Trai Say Hi Concert 2026')
    expect(links(listing).map(l => [l.providerId, l.kind, l.capability, l.authRequiredAt, l.handoff])).toEqual([['ticketbox', 'DETAIL_HANDOFF', 'event_ticket', 'before_selection', 'merchant_login']])
    // Exactly one subject query for Ticketbox; the Klook activity scope is not primary and ran for the venue only.
    expect(search.mock.calls.map(c => c[0]).filter(q => q.includes('ticketbox'))).toEqual(['concert 2026 TP.HCM site:ticketbox.vn'])
  })

  it('a named film discovers its CGV film page (title must match); a cinema row never becomes a film link; no title → no CGV query', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:cgv.vn')
      ? [{ title: 'HOPE: VÙNG TỬ ĐỊA | CGV', link: 'https://www.cgv.vn/default/hope-vung-tu-dia.html', snippet: '' }, { title: 'MƯA ĐỎ | CGV', link: 'https://www.cgv.vn/default/mua-do.html', snippet: '' }]
      : [])
    const cinema = { name: 'CGV Vincom Đồng Khởi', website_uri: 'https://www.cgv.vn/' }
    const result: Row = { results: [cinema], _tappy_place_domain: 'entertainment', query: 'rạp chiếu phim' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, location: 'Quận 1', query: 'rạp chiếu phim', userTexts: ['Mua vé xem phim Hope vùng tử địa tối nay ở Quận 1'] })
    expect(links(cinema)).toEqual([]) // cgv.vn/ is a front door, not a film
    const rows = result.results as Row[]
    expect(rows.map(r => r.name)).toEqual(['CGV Vincom Đồng Khởi', 'HOPE: VÙNG TỬ ĐỊA'])
    expect(links(rows[1]).map(l => [l.providerId, l.kind, l.depth, l.authRequiredAt])).toEqual([['cgv', 'DETAIL_HANDOFF', 3, 'before_selection']])
    expect(search.mock.calls.map(c => c[0])).toContain('Hope vùng tử địa Quận 1 site:cgv.vn/default')

    const search2 = vi.fn(async (_q: string): Promise<Array<{ title: string; link: string; snippet: string }>> => [])
    const result2: Row = { results: [{ name: 'CGV Vincom Đồng Khởi' }], _tappy_place_domain: 'entertainment', query: 'rạp chiếu phim' }
    await attachCommerceLinks('search_places', result2, { enabled: true, now: NOW, search: search2, location: 'Quận 1', query: 'rạp chiếu phim', userTexts: ['Rạp chiếu phim gần tôi'] })
    expect(search2.mock.calls.map(c => c[0]).some(q => q.includes('cgv.vn'))).toBe(false)
    expect((result2.results as Row[]).length).toBe(1)
  })
})

describe('events on a web-search turn — event_links are a CCP projection', () => {
  it('an event question answered by web_search gets validated Ticketbox listings (current year, no past editions, no search page); a non-event query is untouched', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:ticketbox.vn')
      ? [
        { title: '[TP.HCM] Những Thành Phố Mơ Màng Summer 2025', link: 'https://ticketbox.vn/tphcm-nhung-thanh-pho-mo-mang-summer-2025-23769', snippet: '' },
        { title: 'U-KNOW PROJECT 26 : SCENE#1 in HO CHI MINH CITY | Ticketbox', link: 'https://ticketbox.vn/u-know-project-26-scene1-in-hcm-26405', snippet: '' },
        { title: 'Tìm kiếm', link: 'https://ticketbox.vn/search?q=concert', snippet: '' },
      ]
      : [])
    const result: Row = { results: [{ title: 'x', link: 'https://news.example/concert', snippet: '' }], search_url: 'https://duckduckgo.com/?q=concert' }
    await attachCommerceLinks('web_search', result, { enabled: true, now: NOW, search, query: 'concert TP.HCM tuần tới', location: 'TP.HCM', userTexts: ['Có concert nào ở TP.HCM cuối tuần này không?', 'Tuần tới cũng được, nhạc Việt hoặc K-pop'] })
    expect(search.mock.calls.map(c => c[0])).toEqual(['concert TP.HCM tuần tới 2026 TP.HCM site:ticketbox.vn'])
    expect(result.event_links).toEqual([{ name: 'U-KNOW PROJECT 26 : SCENE#1 in HO CHI MINH CITY', platform: 'Ticketbox', url: 'https://ticketbox.vn/u-know-project-26-scene1-in-hcm-26405' }])
    const facts = result._tappy_commerce as RouteHandoffFacts[]
    expect(facts.map(f => [f.providerId, f.kind, f.guestDepth, f.authRequiredAt])).toEqual([['ticketbox', 'DETAIL_HANDOFF', 4, 'before_selection']])
    expect(result.results).toHaveLength(1) // the web results themselves are untouched

    const plain: Row = { results: [] }
    await attachCommerceLinks('web_search', plain, { enabled: true, now: NOW, search, query: 'tỷ giá USD hôm nay', userTexts: ['Tỷ giá USD hôm nay?'] })
    expect(plain).toEqual({ results: [] })
  })
})

describe('events — the merchant page states the schedule (Final local live UAT, 14 Sep 2026)', () => {
  const PAGE = (start: string, end: string) => `<html><head><script type="application/ld+json">{"@type":"Event","startDate":"${start}","endDate":"${end}"}</script></head></html>`
  it('a past event (2023 page, no date in the index) is refused; an upcoming one carries facts.schedule from the merchant page; the read is bounded to registry hosts', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:ticketbox.vn')
      ? [
        { title: 'Chương trình âm nhạc thính phòng "Tuyển tập âm nhạc Pháp" | Ticketbox', link: 'https://ticketbox.vn/chuong-trinh-am-nhac-thinh-phong-tuyen-tap-am-nhac-phap-87737-87737', snippet: 'Nhà hát Thành phố' },
        { title: 'Chào Show - The Sound of Vietnam | Ticketbox', link: 'https://ticketbox.vn/chao-show2026-25472', snippet: '' },
      ]
      : [])
    const fetchText = vi.fn(async (url: string) => url.includes('87737') ? PAGE('2023-07-12T13:00:00Z', '2023-07-12T15:00:00Z') : PAGE('2026-09-15T12:00:00Z', '2026-09-30T14:00:00Z'))
    const result: Row = { results: [] }
    await attachCommerceLinks('web_search', result, { enabled: true, now: NOW, search, fetchText, query: 'sự kiện âm nhạc TP.HCM', location: 'TP.HCM', userTexts: ['Tìm sự kiện âm nhạc ở TP.HCM trên Ticketbox'] })
    expect((result.event_links as Array<{ url: string }>).map(l => l.url)).toEqual(['https://ticketbox.vn/chao-show2026-25472'])
    const facts = result._tappy_commerce as RouteHandoffFacts[]
    expect(facts[0].schedule).toEqual({ date: '2026-09-15', time: '12:00' })
    expect(fetchText).toHaveBeenCalledTimes(2)
    expect(fetchText.mock.calls.every(c => c[0].startsWith('https://ticketbox.vn/'))).toBe(true)
  })
})

describe('a NAMED merchant narrows the whole turn (Final local live UAT, 14 Sep 2026)', () => {
  it('"… trên Agoda": Agoda rows get their link, Booking.com rows and the Booking.com "see more" links step aside, a wrong-city slug is refused', async () => {
    const rows = [
      { title: 'Golden Holiday Hotel - Hoi An - Booking.com', link: 'https://www.booking.com/hotel/vn/golden-holiday-hotel-spa.html', snippet: '' },
      { title: 'Sunflower Hotel Phu Yen in Tuy Hòa', link: 'https://www.agoda.com/vi-vn/sunflower-hotel-phu-yen/hotel/tuy-hoa-phu-yen-vn.html', snippet: '' },
      { title: 'Bed Station Hostel Hoi An', link: 'https://www.agoda.com/vi-vn/bed-station-hostel/hotel/hoi-an-vn.html', snippet: '' },
    ]
    const result: Row = { search_results: rows, booking_link: 'https://www.booking.com/searchresults.vi.html?ss=Hoi+An', agoda_link: 'https://www.agoda.com/vi-vn/' }
    await attachCommerceLinks('get_hotel_prices', result, { enabled: true, now: NOW, search: noSearch, location: 'Hội An', checkIn: '2026-10-10', checkOut: '2026-10-12', userTexts: ['Tìm khách sạn ở Hội An trên Agoda từ 10 đến 12 tháng 10 cho 2 người'] })
    const kept = result.search_results as Row[]
    expect(kept.map(r => r.title)).toEqual(['Golden Holiday Hotel - Hoi An - Booking.com', 'Bed Station Hostel Hoi An']) // Phú Yên refused
    expect(links(kept[0])).toEqual([]) // a Booking.com row gets no Booking.com link under an Agoda request
    expect(links(kept[1]).map(l => [l.providerId, l.kind])).toEqual([['agoda', 'DIRECT_DEEP_LINK']])
    expect(kept.every(r => r._tappy_requested_provider === 'agoda')).toBe(true)
    expect(result.booking_link).toBeUndefined()
    expect(result.agoda_link).toBe('https://www.agoda.com/vi-vn/')
  })

  it('"… qua ShopeeFood": the legacy GrabFood order link leaves the row; ShopeeFood\'s restaurant page is the handoff', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:shopeefood.vn') ? [{ title: 'Phở 24 - ShopeeFood', link: 'https://shopeefood.vn/ho-chi-minh/pho-24-nguyen-tri-phuong', snippet: '' }] : [])
    const row = { name: 'Phở 24', address: 'Quận 1', order_links: [{ name: 'GrabFood', url: 'https://food.grab.com/vn/vi/restaurants?search=Ph%E1%BB%9F%2024' }, { name: 'BeFood', url: 'https://be.com.vn/' }] }
    await attachCommerceLinks('search_places', { results: [row], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search, location: 'Quận 1', userTexts: ['Đặt phở giao tận nhà qua ShopeeFood ở Quận 1'] })
    expect((row.order_links as Array<{ name: string }>).map(l => l.name)).toEqual(['BeFood'])
    expect(links(row).map(l => [l.providerId, l.kind, l.authRequiredAt])).toEqual([['shopeefood', 'DETAIL_HANDOFF', 'app_only']])
  })

  it('"… trên Klook" on an attraction turn (generic place domain, even with no venue rows) discovers Klook activities as their own rows', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:klook.com') ? [{ title: 'Vé Công Viên Nước Mikazuki tại Đà Nẵng - Klook', link: 'https://www.klook.com/vi/activity/69492-mikazuki-water-park-ticket-in-da-nang/', snippet: '' }] : [])
    const result: Row = { results: [], _tappy_place_domain: 'place', place_search_status: 'empty' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, location: 'Đà Nẵng', query: 'hoạt động vui chơi giải trí', userTexts: ['Tìm hoạt động vui chơi ở Đà Nẵng trên Klook'] })
    const rows = result.results as Row[]
    expect(rows.map(r => r.name)).toEqual(['Vé Công Viên Nước Mikazuki tại Đà Nẵng'])
    expect(links(rows[0]).map(l => [l.providerId, l.kind, l.authRequiredAt])).toEqual([['klook', 'DETAIL_HANDOFF', 'before_checkout']])
    expect(search.mock.calls.map(c => c[0])).toEqual(['hoạt động vui chơi giải trí Đà Nẵng site:klook.com/vi/activity'])
  })

  it('"… trên TikTok Shop": a discovered TikTok Shop page is the only link; a toy that names the product is never mapped to the product page', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:shop.tiktok.com')
      ? [{ title: 'iPhone 16 Pro 128GB Chính hãng | TikTok Shop', link: 'https://shop.tiktok.com/vn/pdp/iphone-16-pro-128gb/1730877187765799516', snippet: '' }]
      : [])
    const phone = { title: 'iPhone 16 Pro 128GB Chính hãng VN/A', link: 'https://shop.example/x', source: 'Điện Thoại Hay' }
    const toy = { title: 'iphone 16 pro cam vũ trụ, gấu bông xịn xò', link: 'https://shop.example/y', source: 'Shopee' }
    await attachCommerceLinks('search_products', { search_results: [phone, toy] }, { enabled: true, now: NOW, search, userTexts: ['Mua iPhone 16 Pro trên TikTok Shop'] })
    expect(links(phone).map(l => [l.providerId, l.kind])).toEqual([['tiktokshop', 'DETAIL_HANDOFF']])
    expect(links(toy)).toEqual([])
    expect(search.mock.calls.every(c => !/shopee\.vn|lazada|dienmayxanh|cellphones/.test(c[0]))).toBe(true)
  })
})

describe('hotels — the OTA rows become subject links with the stay; no landing page ever lands on a row', () => {
  it('a Booking.com row carries its dated property link and the discovered Trip.com link; Agoda / Traveloka front doors are not attached', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:vn.trip.com/hotels') ? [{ title: 'Muong Thanh Luxury Da Nang', link: 'https://vn.trip.com/hotels/da-nang-hotel-detail-10569789/muong-thanh-luxury/', snippet: '' }] : [])
    const row = { title: 'Mường Thanh Luxury Đà Nẵng - Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html', snippet: '' }
    await attachCommerceLinks('get_hotel_prices', { search_results: [row] }, { enabled: true, now: NOW, search, location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12' })
    const got = links(row)
    expect(got.map(l => l.providerId)).toEqual(['tripcom', 'booking'])
    expect(got[1].destinationUrl).toBe('https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html?checkin=2026-10-10&checkout=2026-10-12&group_adults=2&no_rooms=1&group_children=0')
    expect(got[1].assumedParams).toEqual(['adults'])
    expect(got.every(l => l.depth >= 2 && l.kind !== 'SEARCH_HANDOFF')).toBe(true)
  })

  it('an Agoda row gets its property link labelled as a look (guest L3, no boundary), never a booking promise', async () => {
    const row = { title: 'Dai Long Hotel | Hoi An', link: 'https://www.agoda.com/vi-vn/dai-long-hotel/hotel/hoi-an-vn.html', snippet: '' }
    await attachCommerceLinks('get_hotel_prices', { search_results: [row] }, { enabled: true, now: NOW, search: noSearch, location: 'Hội An' })
    const got = links(row)
    expect(got.map(l => [l.providerId, l.kind, l.guestDepth, l.authenticatedDepth, l.handoff])).toEqual([['agoda', 'DETAIL_HANDOFF', 3, null, 'guest']])
  })
})
