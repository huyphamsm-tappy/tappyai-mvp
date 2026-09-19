// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent, act } from '@testing-library/react'
import PlaceDecision, { PHOTO_RETRY_DELAY_MS, PHOTO_RETRY_SUFFIX } from './PlaceDecision'
import { PLACES_ANNOTATION_KIND, type PlacesLiveView, type LivePlace } from '@/lib/recommendation/liveView'

// ─────────────────────────────────────────────────────────────────────────────
// The approved Food composition, asserted as behaviour.
//
// The measured defect it replaces: every fact a place turn retrieved — rating,
// review count, address, hours, price band, distance, the order link — reached
// the user only if the model wrote it into a sentence, and then the app injected
// the same photo and the same links underneath it a second time.
//
// What the approved design fixes, and therefore what these tests pin:
//
//   · THREE ranked cards, not one card plus dead text rows;
//   · #1 visibly the lead, #2/#3 still complete and actionable;
//   · a field renders ONLY when the payload carries it — no zeros, no dashes,
//     no placeholder invented at the view layer;
//   · a filter chip exists only where the data can actually satisfy it;
//   · the map block appears only with a real destination.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(cleanup)

const action = (over: Partial<LivePlace['actions'][number]> = {}) => ({
  kind: 'maps' as const,
  urlKind: 'direct' as const,
  url: 'https://maps.google.com/?q=1',
  labelKey: 'v3.action.maps',
  ...over,
})

const place = (name: string, over: Partial<LivePlace> = {}): LivePlace => ({
  id: `place:google:${name}`,
  domain: 'food',
  kind: 'place',
  name,
  rank: 0,
  actions: [action()],
  ...over,
})

const lead: LivePlace = place('Cà Phê AnAn', {
  image: 'https://img/anan.jpg',
  address: '22 Phố Lý Quốc Sư, Quận 1',
  rating: 4.8,
  ratingCount: 320,
  openingHours: '08:00 – 22:30',
  openNow: true,
  priceLevel: 2,
  distanceKm: 1.2,
  recommended: true,
  flags: ['wifi'],
  categories: ['coffee shop'],
  tradeOff: { attribute: 'distance', evidence: 'xa trung tâm hơn khoảng 1,5km' },
  actions: [
    action(),
    action({ kind: 'order', urlKind: 'search', url: 'https://shopeefood.vn/tim-kiem?q=AnAn', labelKey: 'v3.action.order', platform: 'ShopeeFood' }),
    action({ kind: 'review', url: 'https://www.tiktok.com/@x/video/1', labelKey: 'v3.action.review', attributed: true }),
  ],
})

const view = (over: Partial<PlacesLiveView> = {}): PlacesLiveView => ({
  kind: PLACES_ANNOTATION_KIND,
  v: 1,
  domain: 'food',
  items: [
    lead,
    place('The Running Bean', { rank: 1, rating: 4.6, ratingCount: 185, openNow: true, address: 'Quận 1' }),
    place('L’Usine', { rank: 2, rating: 4.5, ratingCount: 420, openNow: false, address: 'Dong Khoi, District 1' }),
  ],
  mapsSearchUrl: 'https://www.google.com/maps/search/cafe+quan+1',
  ...over,
})

describe('PlaceDecision — the approved ranked composition', () => {
  it('renders three ranked cards, #1 first and marked as the lead', () => {
    render(<PlaceDecision view={view()} />)
    const cards = screen.getAllByTestId('place-card')
    expect(cards).toHaveLength(3)
    expect(cards.map(c => c.getAttribute('data-rank'))).toEqual(['1', '2', '3'])
    expect(cards[0].getAttribute('data-lead')).toBe('true')
    expect(cards[1].getAttribute('data-lead')).toBeNull()
    expect(within(cards[0]).getByText('Cà Phê AnAn')).toBeTruthy()
    expect(within(cards[2]).getByText('L’Usine')).toBeTruthy()
  })

  it('shows the scannable facts on the lead card', () => {
    render(<PlaceDecision view={view()} />)
    const card = screen.getAllByTestId('place-card')[0]
    expect(within(card).getByText('4.8')).toBeTruthy()
    expect(within(card).getByText(/320/)).toBeTruthy()
    expect(within(card).getByText(/Lý Quốc Sư/)).toBeTruthy()
    expect(within(card).getByText(/08:00 – 22:30/)).toBeTruthy()
    expect(within(card).getByText(/1\.2 km/)).toBeTruthy()
    expect(card.querySelector('img')?.getAttribute('src')).toBe('https://img/anan.jpg')
    // The engine's own trade-off, not one written at render time.
    expect(within(card).getByText(/xa trung tâm hơn/)).toBeTruthy()
  })

  it('🚨 keeps #2 and #3 complete — an alternative is a card, not a dead row', () => {
    render(<PlaceDecision view={view()} />)
    const second = screen.getAllByTestId('place-card')[1]
    expect(within(second).getByText('4.6')).toBeTruthy()
    expect(within(second).getByText(/Quận 1/)).toBeTruthy()
    expect(within(second).getAllByRole('link').length).toBeGreaterThan(0)
  })

  it('marks the lead as popular only when the review count carries it', () => {
    render(<PlaceDecision view={view()} />)
    expect(screen.getAllByTestId('popular-badge')).toHaveLength(1)
    cleanup()
    // 12 ratings is not popularity, and nothing else may promote it.
    render(<PlaceDecision view={view({ items: [{ ...lead, ratingCount: 12 }] })} />)
    expect(screen.queryByTestId('popular-badge')).toBeNull()
  })

  it('renders every action with a real destination, opening off-site links safely', () => {
    render(<PlaceDecision view={view()} />)
    const card = screen.getAllByTestId('place-card')[0]
    const hrefs = within(card).getAllByRole('link').map(a => a.getAttribute('href'))
    expect(hrefs).toContain('https://maps.google.com/?q=1')
    expect(hrefs).toContain('https://shopeefood.vn/tim-kiem?q=AnAn')
    expect(hrefs).toContain('https://www.tiktok.com/@x/video/1')
    for (const a of within(card).getAllByRole('link')) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
    }
  })

  it('🚨 omits every fact the payload does not carry', () => {
    render(<PlaceDecision view={view({ items: [place('Corner Spot')], mapsSearchUrl: undefined })} />)
    const card = screen.getByTestId('place-card')
    expect(within(card).getByText('Corner Spot')).toBeTruthy()
    expect(card.querySelector('img')).toBeNull()
    expect(card.textContent).not.toMatch(/undefined|null|NaN|chưa rõ|unknown/i)
    expect(screen.queryByTestId('place-map-explore')).toBeNull()
  })

  it('renders nothing at all without a view or without items', () => {
    const { container } = render(<PlaceDecision view={null} />)
    expect(container.firstChild).toBeNull()
    cleanup()
    const empty = render(<PlaceDecision view={view({ items: [] })} />)
    expect(empty.container.firstChild).toBeNull()
  })
})

describe('PlaceDecision — filters come from the data, and only filter', () => {
  it('offers a chip only when some rows match it and some do not', () => {
    render(<PlaceDecision view={view()} />)
    const chips = within(screen.getByTestId('place-filters')).getAllByRole('button').map(b => b.textContent)
    // Two of three are open, so "open now" discriminates; every row is in Quận 1
    // and no provider field says "quiet", so no such chip is offered.
    expect(chips.some(c => /Đang mở|Open now/i.test(c ?? ''))).toBe(true)
    expect(chips.some(c => /yên tĩnh|quiet/i.test(c ?? ''))).toBe(false)
    expect(chips[0]).toMatch(/\(3\)/)
  })

  it('🚨 filtering narrows the set and never reorders it', () => {
    render(<PlaceDecision view={view()} />)
    const openChip = within(screen.getByTestId('place-filters'))
      .getAllByRole('button').find(b => /Đang mở|Open now/i.test(b.textContent ?? ''))!
    fireEvent.click(openChip)
    const names = screen.getAllByTestId('place-card').map(c => within(c).getByRole('heading').textContent)
    expect(names).toEqual(['Cà Phê AnAn', 'The Running Bean'])
    // The rank badge still reports the ENGINE's position, not the position in
    // the filtered list — the ranking is never re-derived here.
    expect(screen.getAllByTestId('place-card').map(c => c.getAttribute('data-rank'))).toEqual(['1', '2'])
  })

  it('is a horizontal snap carousel carrying every admitted card, in the engine order', () => {
    // Owner decision 2026-09-17: a swipeable carousel on web AND Android. Nothing is cut at three
    // any more — the next card peeks in and the row scrolls; the chip row still shows the count.
    const many = Array.from({ length: 8 }, (_, i) => place(`Quán ${i}`, { rank: i, ...(i === 0 ? { recommended: true as const } : {}) }))
    render(<PlaceDecision view={view({ items: many })} />)
    const rail = screen.getByTestId('place-carousel')
    expect(rail.className).toMatch(/snap-x/)
    expect(rail.className).toMatch(/overflow-x-auto/)
    expect(screen.getAllByTestId('place-card')).toHaveLength(8)
    expect(screen.getAllByTestId('place-card').map(c => c.getAttribute('data-rank'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
    expect(within(screen.getByTestId('place-filters')).getAllByRole('button')[0].textContent).toMatch(/\(8\)/)
  })
})

describe('PlaceDecision — the map block', () => {
  it('links to the destination the provider returned', () => {
    render(<PlaceDecision view={view()} />)
    const map = screen.getByTestId('place-map-explore')
    expect(map.getAttribute('href')).toBe('https://www.google.com/maps/search/cafe+quan+1')
    expect(map.getAttribute('target')).toBe('_blank')
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// 🚨 AN UNRANKED SET IS SHOWN, BUT NEVER NUMBERED.
//
// Measured on localhost 2026-09-08: "Trung tâm mua sắm lớn Sài Gòn" retrieved 10
// real malls and "rạp chiếu phim ở TP.HCM" retrieved 4 real cinemas, and both
// rendered as the OLD prose-plus-loose-image layout because the card declined
// whenever the ranker had nothing to score. The places now render here — and a
// "#1" badge would assert a decision nobody made, so the badges go instead.
// ─────────────────────────────────────────────────────────────────────────────

describe('🚨 unranked results render as a card, without rank claims', () => {
  it('shows every retrieved place', () => {
    render(<PlaceDecision view={view({ ranked: false })} />)
    expect(screen.getAllByTestId('place-card').length).toBeGreaterThan(0)
  })

  it('🚨 prints no position badge and marks no lead', () => {
    render(<PlaceDecision view={view({ ranked: false })} />)
    for (const card of screen.getAllByTestId('place-card')) {
      expect(card.getAttribute('data-rank')).toBeNull()
      expect(card.getAttribute('data-lead')).toBeNull()
    }
    expect(screen.queryByText('#1')).toBeNull()
  })

  it('🚨 A.4: `pickUnmatched` (the reply named venues, none matched a row) renders like an unranked set and is surfaced on the root', () => {
    render(<PlaceDecision view={view({ pickUnmatched: true })} />)
    expect(screen.getByTestId('place-decision').getAttribute('data-pick-unmatched')).toBe('true')
    for (const card of screen.getAllByTestId('place-card')) {
      expect(card.getAttribute('data-rank')).toBeNull()
      expect(card.getAttribute('data-lead')).toBeNull()
    }
    expect(screen.queryByText('#1')).toBeNull()
  })

  it('a RANKED set is unchanged — badges and lead stay', () => {
    render(<PlaceDecision view={view()} />)
    const cards = screen.getAllByTestId('place-card')
    expect(cards[0].getAttribute('data-rank')).toBe('1')
    expect(cards[0].getAttribute('data-lead')).toBe('true')
  })

  it('a payload with no `ranked` field is treated as ranked', () => {
    const legacy = view()
    delete (legacy as { ranked?: boolean }).ranked
    render(<PlaceDecision view={legacy} />)
    expect(screen.getAllByTestId('place-card')[0].getAttribute('data-rank')).toBe('1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Item 2 (owner decision 2026-09-19): THREE cards above the fold — the model's picks first — and
// the rest behind "Xem thêm", a client action that is never a new turn or a new search. The filter
// row still counts every row; the map link still opens the provider's full search.
// ─────────────────────────────────────────────────────────────────────────────

describe('item 2 — three cards, picks first, the rest behind "Xem thêm"', () => {
  const many = Array.from({ length: 8 }, (_, i) => place(`Quán ${i}`, { rank: i, ...(i === 0 ? { recommended: true as const } : {}) }))
  const ids = many.map(p => p.id)

  it('renders the three picked cards (prose order), then reveals the other five on tap', () => {
    render(<PlaceDecision view={view({ items: many, picked: [ids[4], ids[1]], shown: 3 })} />)
    const names = () => screen.getAllByTestId('place-card').map(c => within(c).getByRole('heading').textContent)
    expect(names()).toEqual(['Quán 4', 'Quán 1', 'Quán 0'])
    expect(screen.getAllByTestId('place-card').map(c => c.getAttribute('data-rank'))).toEqual(['1', '2', '3'])
    expect(within(screen.getByTestId('place-filters')).getAllByRole('button')[0].textContent).toMatch(/\(8\)/)
    const more = screen.getByTestId('place-show-more')
    expect(more.textContent).toBe('Xem thêm 5 chỗ')
    fireEvent.click(more)
    expect(screen.getAllByTestId('place-card')).toHaveLength(8)
    expect(names().slice(0, 3)).toEqual(['Quán 4', 'Quán 1', 'Quán 0'])
    expect(screen.getByTestId('place-show-more').textContent).toBe('Thu gọn')
    expect(screen.getByTestId('place-map-explore').getAttribute('href')).toBe('https://www.google.com/maps/search/cafe+quan+1')
  })

  it('a payload without `shown` renders every card (older servers) and no "Xem thêm"', () => {
    render(<PlaceDecision view={view({ items: many })} />)
    expect(screen.getAllByTestId('place-card')).toHaveLength(8)
    expect(screen.queryByTestId('place-show-more')).toBeNull()
  })

  it('a filter chip shows every admitted row, folded or not', () => {
    const mixed = many.map((p, i) => ({ ...p, openNow: i % 2 === 0 }))
    render(<PlaceDecision view={view({ items: mixed, shown: 3 })} />)
    fireEvent.click(within(screen.getByTestId('place-filters')).getByText('Đang mở cửa'))
    expect(screen.getAllByTestId('place-card')).toHaveLength(4)
    expect(screen.queryByTestId('place-show-more')).toBeNull()
  })
})

// ── pre-release A.4 — the card photo retries ONCE (size suffix, distinct URL), then collapses ──
describe('A.4 — card photo: one proportionate retry, then the documented fallback', () => {
  const LH3 = 'https://lh3.googleusercontent.com/gps-cs-s/AHRPTWabc123'
  it('a Google Places photo that errors is retried once after a delay with the size suffix, and collapses only on the second error', () => {
    vi.useFakeTimers()
    try {
      render(<PlaceDecision view={view({ items: [place('AnAn', { image: LH3 })] })} />)
      const card = screen.getByTestId('place-card')
      const img = card.querySelector('img') as HTMLImageElement
      expect(img.getAttribute('src')).toBe(LH3)
      fireEvent.error(img)
      // not yet: the retry waits
      expect(card.querySelector('img')?.getAttribute('src')).toBe(LH3)
      act(() => { vi.advanceTimersByTime(PHOTO_RETRY_DELAY_MS + 10) })
      const retried = card.querySelector('img') as HTMLImageElement
      expect(retried.getAttribute('src')).toBe(LH3 + PHOTO_RETRY_SUFFIX)
      expect(retried.getAttribute('data-attempt')).toBe('1')
      fireEvent.error(retried)
      expect(card.querySelector('img')).toBeNull()
      expect(within(card).getByTestId('place-photo-failed')).toBeTruthy()
    } finally { vi.useRealTimers() }
  })
  it('a non-Google photo, or one that already carries a size suffix, is not retried — it collapses on the first error', () => {
    render(<PlaceDecision view={view({ items: [place('AnAn', { image: 'https://img/anan.jpg' })] })} />)
    const img = screen.getByTestId('place-card').querySelector('img') as HTMLImageElement
    fireEvent.error(img)
    expect(screen.getByTestId('place-card').querySelector('img')).toBeNull()
  })
  it('a photo that loads is left exactly as given (no suffix, no referrer policy attribute)', () => {
    render(<PlaceDecision view={view({ items: [place('AnAn', { image: LH3 })] })} />)
    const img = screen.getByTestId('place-card').querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(LH3)
    expect(img.getAttribute('referrerpolicy')).toBeNull()
  })
})
