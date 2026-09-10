// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import PlaceDecision from './PlaceDecision'
import { setLocale } from '@/lib/i18n/useTranslation'
import { placeRecommendations, stayRecommendations } from '@/lib/recommendation/fromToolResult'
import { buildPlacesLiveView } from '@/lib/recommendation/liveView'

// ─────────────────────────────────────────────────────────────────────────────
// TRAVEL · SPA · ENTERTAINMENT — the real path to the rendered DOM.
//
// Same shape as the Food projection suite: a tool-shaped result through the real
// `placeRecommendations` / `stayRecommendations` and the real
// `buildPlacesLiveView`, asserted on what a person would read.
//
// These three domains share the place card by design, but they do NOT share an
// information architecture: a hotel has a star CLASS and no guest rating, a spa
// has hours and a phone, an attraction has neither. What each test pins is that
// the card shows what its domain actually has — and says nothing about what it
// does not.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(cleanup)
beforeEach(() => setLocale('vi'))

const shortlist = (rows: Record<string, unknown>[]) =>
  rows.map((r, i) => ({ rank: i, id: String(r.place_id ?? r.name), name: r.name, role: i === 0 ? 'best_overall' : 'value_gem' }))

function renderPlaces(rows: Record<string, unknown>[], domain: string, location = 'Quận 1') {
  const recs = placeRecommendations({
    source: 'Google Maps', count: rows.length, results: rows,
    _tappy_place_domain: domain, _tappy_shortlist: shortlist(rows),
    google_maps_search: 'https://www.google.com/maps/search/x',
  }, location)
  const view = buildPlacesLiveView(recs, { mapsSearchUrl: 'https://www.google.com/maps/search/x' })
  expect(view, 'the projection produced a decision').not.toBeNull()
  render(<PlaceDecision view={view} />)
  return { view: view!, cards: screen.getAllByTestId('place-card') }
}

const hrefs = (el: HTMLElement) => within(el).getAllByRole('link').map(a => a.getAttribute('href') ?? '')
const labels = (el: HTMLElement) => within(el).getAllByRole('link').map(a => (a.textContent ?? '').trim())

// ── TRAVEL ──────────────────────────────────────────────────────────────────

describe('TRAVEL — a stay card shows what a stay actually has', () => {
  const stayResult = {
    search_results: [
      { title: 'TTR Skypool Boutique Hotel - Da Nang - Booking.com', name: 'TTR Skypool Boutique Hotel', stars: 4, address: '246 Vo Nguyen Giap, Da Nang', photo_url: 'https://img/ttr.jpg', lat: 16.06, lng: 108.24 },
      { title: 'Sala Danang Beach Hotel - Booking.com', name: 'Sala Danang Beach Hotel', stars: 5, address: '36-38 Lam Hoanh, Da Nang', lat: 16.07, lng: 108.24 },
    ],
    booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang',
    agoda_link: 'https://www.agoda.com/search?city=danang',
  }

  const renderStays = () => {
    const recs = stayRecommendations(stayResult, { name: 'TTR Skypool Boutique Hotel', reasons: [], tradeOff: null })
    const view = buildPlacesLiveView(recs)
    expect(view).not.toBeNull()
    render(<PlaceDecision view={view} />)
    return { view: view!, cards: screen.getAllByTestId('place-card') }
  }

  it('🚨 shows the hotel STAR CLASS, which never reached the card before', () => {
    const { cards } = renderStays()
    expect(within(cards[0]).getByTestId('stay-stars').textContent).toContain('4')
    expect(within(cards[1]).getByTestId('stay-stars').textContent).toContain('5')
  })

  it('🚨 never presents a star class as a guest rating', () => {
    // `buildStayEntity` leaves rating/ratingCount UNKNOWN on purpose: Booking and
    // Agoda guest scores are not extracted, and inventing one would be a fact
    // nobody published.
    const { view, cards } = renderStays()
    expect(view.items[0].rating).toBeUndefined()
    expect(view.items[0].ratingCount).toBeUndefined()
    expect(cards[0].textContent).not.toMatch(/đánh giá|reviews/i)
  })

  it('shows the address the provider gave, and no invented hours or price', () => {
    const { cards } = renderStays()
    expect(cards[0].textContent).toContain('Vo Nguyen Giap')
    expect(cards[0].textContent).not.toMatch(/đang mở|đang đóng/)
    expect(cards[0].textContent).not.toMatch(/₫/)
    expect(cards[0].textContent).not.toMatch(/undefined|null|NaN/)
  })

  it('🚨 a Booking.com SEARCH is labelled as a search, not as "Đặt phòng"', () => {
    // The measured travel defect in its other half: a room-search URL wearing a
    // "book this room" label.
    const { cards } = renderStays()
    const booking = within(cards[0]).getAllByRole('link').find(a => (a.getAttribute('href') ?? '').includes('booking.com'))
    expect(booking, 'the stay carries the booking link the tool returned').toBeTruthy()
    expect(booking!.textContent).toContain('Tìm phòng trên Booking.com')
    expect(booking!.textContent).not.toBe('Đặt phòng')
  })

  it('🚨 a review fallback says it is a search — never "Xem review"', () => {
    const { cards } = renderStays()
    const review = within(cards[0]).getAllByRole('link').find(a => (a.getAttribute('href') ?? '').includes('youtube.com'))
    if (review) {
      expect(review.textContent).toContain('Tìm review trên YouTube')
      expect(review.textContent).not.toContain('Xem review')
    }
    // No YouTube link is also acceptable — the ladder only falls back when
    // nothing attributed exists. What must never happen is a review PROMISE.
    for (const l of labels(cards[0])) expect(l).not.toBe('Xem review')
  })

  it('every rendered destination came from the tool result', () => {
    const { cards } = renderStays()
    for (const h of hrefs(cards[0])) {
      expect(h).toMatch(/^https?:\/\//)
      expect(h).not.toContain('undefined')
    }
  })
})

// ── SPA ─────────────────────────────────────────────────────────────────────

describe('SPA — merchant facts, and nothing invented about treatments', () => {
  const spaRows = [
    { place_id: 'spa1', name: 'Sen Spa & Massage', address: '10 Lê Thánh Tôn, Quận 1', rating_value: 4.7, rating_count: 210, opening_hours: '09:00 – 22:00', open_now: true, phone: '028 3822 9999', website_uri: 'https://senspa.vn', maps_link: 'https://www.google.com/maps/place/?q=place_id:spa1', photo_url: 'https://img/sen.jpg', price_level: 3, distance_km: 0.8 },
    { place_id: 'spa2', name: 'An Spa', address: '2 Đồng Khởi, Quận 1', maps_link: 'https://www.google.com/maps/place/?q=place_id:spa2' },
  ]

  it('renders the merchant facts the provider stated', () => {
    const { cards } = renderPlaces(spaRows, 'spa')
    const card = cards[0]
    expect(within(card).getByText('4.7')).toBeTruthy()
    expect(within(card).getByText(/210/)).toBeTruthy()
    expect(within(card).getByText(/09:00 – 22:00/)).toBeTruthy()
    expect(within(card).getByText(/đang mở/i)).toBeTruthy()
    expect(within(card).getByText('₫₫₫')).toBeTruthy()
    expect(within(card).getByText(/Lê Thánh Tôn/)).toBeTruthy()
  })

  it('🚨 offers call and website only because they are real', () => {
    const { cards } = renderPlaces(spaRows, 'spa')
    const first = hrefs(cards[0])
    expect(first.some(h => h.startsWith('tel:'))).toBe(true)
    expect(first.some(h => h.includes('senspa.vn'))).toBe(true)
    // The second spa states neither, so neither is offered.
    const second = hrefs(cards[1])
    expect(second.some(h => h.startsWith('tel:'))).toBe(false)
    expect(second.some(h => h.includes('senspa.vn'))).toBe(false)
  })

  it('🚨 fabricates no booking destination when none exists', () => {
    const { cards } = renderPlaces(spaRows, 'spa')
    for (const card of cards) {
      for (const l of labels(card)) {
        expect(l, 'a spa with no booking URL must not offer one').not.toMatch(/Đặt chỗ|Đặt phòng|Reserve/)
      }
    }
  })

  it('🚨 a spa with no hours, rating or price says none of them', () => {
    const { cards } = renderPlaces(spaRows, 'spa')
    const bare = cards[1]
    expect(bare.textContent).toContain('An Spa')
    expect(bare.textContent).not.toMatch(/⭐|đánh giá|đang mở|đang đóng|₫/)
    expect(bare.textContent).not.toMatch(/undefined|null|NaN/)
  })
})

// ── ENTERTAINMENT ───────────────────────────────────────────────────────────

describe('ENTERTAINMENT — venues and activities, without invented showtimes', () => {
  const funRows = [
    { place_id: 'ent1', name: 'CGV Vincom Center', address: '72 Lê Thánh Tôn, Quận 1', rating_value: 4.4, rating_count: 3120, opening_hours: '09:00 – 23:00', open_now: true, website_uri: 'https://www.cgv.vn', maps_link: 'https://www.google.com/maps/place/?q=place_id:ent1', place_types: ['movie_theater'] },
    { place_id: 'ent2', name: 'Thảo Cầm Viên Sài Gòn', address: '2 Nguyễn Bỉnh Khiêm, Quận 1', rating_value: 4.2, rating_count: 15800, maps_link: 'https://www.google.com/maps/place/?q=place_id:ent2', place_types: ['zoo'] },
  ]

  it('renders venue facts and the provider category', () => {
    const { cards } = renderPlaces(funRows, 'entertainment')
    expect(within(cards[0]).getByText('4.4')).toBeTruthy()
    expect(within(cards[0]).getByText(/09:00 – 23:00/)).toBeTruthy()
    expect(cards[0].textContent).toMatch(/movie_theater/)
  })

  it('🚨 never invents a showtime, a ticket price or availability', () => {
    const { cards, view } = renderPlaces(funRows, 'entertainment')
    for (const card of cards) {
      expect(card.textContent).not.toMatch(/suất chiếu|showtime|\d{1,2}h\d{2}\s*·/i)
      expect(card.textContent).not.toMatch(/undefined|null|NaN/)
    }
    // No provider field carries ticketing, so no ticket action may exist.
    for (const item of view.items) {
      expect(item.actions.some(a => a.kind === 'ticket')).toBe(false)
    }
  })

  it('🚨 the official website is offered as a website, not as a booking', () => {
    const { cards } = renderPlaces(funRows, 'entertainment')
    const site = within(cards[0]).getAllByRole('link').find(a => (a.getAttribute('href') ?? '').includes('cgv.vn'))
    expect(site).toBeTruthy()
    expect(site!.textContent).toContain('Website')
    expect(site!.textContent).not.toMatch(/Mua vé|Tickets/)
  })

  it('a venue with no hours shows none, and still gets its map', () => {
    const { cards } = renderPlaces(funRows, 'entertainment')
    expect(cards[1].textContent).not.toMatch(/đang mở|đang đóng/)
    expect(hrefs(cards[1]).some(h => h.includes('google.com/maps'))).toBe(true)
  })
})

// ── SHARED CONTRACT ─────────────────────────────────────────────────────────

describe('every domain obeys the same honesty contract', () => {
  const cases: Array<[string, Record<string, unknown>[]]> = [
    ['spa', [{ place_id: 'a', name: 'Spa A', maps_link: 'https://maps.google.com/?q=1' }, { place_id: 'b', name: 'Spa B', maps_link: 'https://maps.google.com/?q=2' }]],
    ['entertainment', [{ place_id: 'c', name: 'Rạp C', maps_link: 'https://maps.google.com/?q=3' }, { place_id: 'd', name: 'Công viên D', maps_link: 'https://maps.google.com/?q=4' }]],
    ['food', [{ place_id: 'e', name: 'Quán E', maps_link: 'https://maps.google.com/?q=5' }, { place_id: 'f', name: 'Quán F', maps_link: 'https://maps.google.com/?q=6' }]],
  ]

  for (const [domain, rows] of cases) {
    it(`${domain}: no raw i18n keys, no placeholders, no dead labels`, () => {
      const { cards } = renderPlaces(rows, domain)
      for (const card of cards) {
        expect(card.textContent).not.toMatch(/v3\.action\.|placeDecision\./)
        expect(card.textContent).not.toMatch(/\{platform\}|\{count\}/)
        for (const a of within(card).getAllByRole('link')) {
          expect((a.textContent ?? '').trim().length, 'every button has a label').toBeGreaterThan(0)
          expect(a.getAttribute('href')).toBeTruthy()
        }
      }
    })
  }

  it('English renders English labels across domains', () => {
    setLocale('en')
    const { cards } = renderPlaces(
      [{ place_id: 'a', name: 'Sen Spa', maps_link: 'https://maps.google.com/?q=1', website_uri: 'https://senspa.vn' },
        { place_id: 'b', name: 'An Spa', maps_link: 'https://maps.google.com/?q=2' }],
      'spa',
    )
    expect(cards[0].textContent).toContain('Website')
    expect(cards[0].textContent).not.toMatch(/Xem bản đồ|Gọi/)
  })
})

describe('TRAVEL — the useful destination comes first', () => {
  it("🚨 a hotel's OWN page outranks a city-wide search on the same site", () => {
    // Measured: "Tìm phòng trên Booking.com" (a Da Nang-wide search) sat above
    // "Đặt phòng" (booking.com/hotel/vn/<this hotel>) on every travel card.
    const recs = stayRecommendations({
      search_results: [
        { title: 'DA NANG BAY HOTEL - Booking.com', name: 'DA NANG BAY HOTEL', link: 'https://www.booking.com/hotel/vn/da-nang-bay.vi.html' },
        { title: 'Minh Quan Hotel - Booking.com', name: 'Minh Quan Hotel', link: 'https://www.booking.com/hotel/vn/minh-quan.vi.html' },
      ],
      booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang',
      agoda_link: 'https://www.agoda.com/search?city=danang',
    }, { name: 'DA NANG BAY HOTEL', reasons: [], tradeOff: null })
    const view = buildPlacesLiveView(recs)!
    const bookings = view.items[0].actions.filter(a => a.kind === 'booking')
    expect(bookings.length).toBeGreaterThan(1)
    expect(bookings[0].urlKind, 'the direct hotel page leads').toBe('direct')
    expect(bookings[0].url).toContain('/hotel/vn/')

    render(<PlaceDecision view={view} />)
    const card = screen.getAllByTestId('place-card')[0]
    const labels = within(card).getAllByRole('link').map(a => (a.textContent ?? '').trim())
    expect(labels).toContain('Đặt phòng')
    expect(labels.indexOf('Đặt phòng')).toBeLessThan(
      labels.findIndex(l => l.startsWith('Tìm phòng')),
    )
  })
})
