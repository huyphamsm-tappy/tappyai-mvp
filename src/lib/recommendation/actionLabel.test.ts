import { describe, it, expect } from 'vitest'
import { resolveActionLabel, platformOf, actionLabel } from './actionLabel'
import { buildActions } from './actions'
import { translate } from '@/lib/i18n/useTranslation'

// ─────────────────────────────────────────────────────────────────────────────
// THE ACTION URL CONTRACT: a label may not promise more than its URL delivers.
//
// 🚨 THE MEASURED DEFECT. Cards labelled buttons from `kind` alone. A `review`
// action whose URL was a YouTube SEARCH for the venue's name rendered
// "Xem review" — a promise of a review — and opened a search page. The same
// shape mislabelled a Booking.com search as "Đặt phòng".
//
// `urlKind` and `attributed` have been on every Action since the layer was
// built; nothing was missing but the reading of them.
// ─────────────────────────────────────────────────────────────────────────────

const vi = (key: string, vars?: Record<string, string>) => translate('vi', key, vars)
const en = (key: string, vars?: Record<string, string>) => translate('en', key, vars)

const a = (over: Partial<Parameters<typeof resolveActionLabel>[0]>) => ({
  kind: 'website' as const, urlKind: 'direct' as const, url: 'https://example.com', ...over,
})

describe('platformOf — name the site the link actually opens', () => {
  it("prefers the provider's own platform name", () => {
    expect(platformOf({ url: 'https://x.test/a', platform: 'ShopeeFood' })).toBe('ShopeeFood')
  })

  it('reads the host when nothing named it', () => {
    expect(platformOf({ url: 'https://www.youtube.com/results?search_query=x' })).toBe('YouTube')
    expect(platformOf({ url: 'https://www.tiktok.com/@a/video/1' })).toBe('TikTok')
    expect(platformOf({ url: 'https://www.google.com/search?q=x' })).toBe('Google')
    expect(platformOf({ url: 'https://www.booking.com/searchresults.html' })).toBe('Booking.com')
    expect(platformOf({ url: 'https://shopee.vn/x' })).toBe('Shopee')
  })

  it('returns null for something unparseable rather than guessing', () => {
    expect(platformOf({ url: 'not a url' })).toBeNull()
  })
})

describe('🚨 review — attribution decides, not the host', () => {
  it('an ATTRIBUTED TikTok video is a review', () => {
    const r = resolveActionLabel(a({ kind: 'review', url: 'https://www.tiktok.com/@a/video/1', attributed: true }))
    expect(vi(r.key, r.params)).toBe('Review trên TikTok')
    expect(en(r.key, r.params)).toBe('Review on TikTok')
  })

  it('🚨 a YouTube SEARCH is not a review, and must not say it is', () => {
    // The exact travel-card defect: "Xem review" opening a YouTube search.
    const r = resolveActionLabel(a({
      kind: 'review', urlKind: 'search', attributed: false,
      url: 'https://www.youtube.com/results?search_query=hotel+review',
    }))
    expect(vi(r.key, r.params)).toBe('Tìm review trên YouTube')
    expect(en(r.key, r.params)).toBe('Search reviews on YouTube')
    expect(vi(r.key, r.params)).not.toBe('Xem review')
  })

  it('names no platform rather than the wrong one', () => {
    const r = resolveActionLabel(a({ kind: 'review', attributed: false, url: 'not a url' }))
    expect(vi(r.key, r.params)).toBe('Tìm review')
  })
})

describe('🚨 a search destination always says search', () => {
  const cases: Array<[string, Parameters<typeof resolveActionLabel>[0], string, string]> = [
    ['booking', a({ kind: 'booking', urlKind: 'search', url: 'https://www.booking.com/s', platform: 'Booking.com' }),
      'Tìm phòng trên Booking.com', 'Find rooms on Booking.com'],
    ['ticket', a({ kind: 'ticket', urlKind: 'search', url: 'https://ticketbox.vn/search' }),
      'Tìm vé trên Ticketbox', 'Find tickets on Ticketbox'],
    ['order', a({ kind: 'order', urlKind: 'search', url: 'https://shopeefood.vn/tim-kiem?q=x', platform: 'ShopeeFood' }),
      'Tìm trên ShopeeFood', 'Search on ShopeeFood'],
    ['purchase', a({ kind: 'purchase', urlKind: 'search', url: 'https://www.google.com/search?q=x' }),
      'Tìm trên Google', 'Search on Google'],
  ]
  for (const [name, action, viText, enText] of cases) {
    it(`${name} search → names the platform and the act of searching`, () => {
      const r = resolveActionLabel(action)
      expect(vi(r.key, r.params)).toBe(viText)
      expect(en(r.key, r.params)).toBe(enText)
    })
  }

  it('🚨 a DIRECT booking keeps the plain verb', () => {
    const r = resolveActionLabel(a({ kind: 'booking', urlKind: 'direct', url: 'https://hotel.example/room/12' }))
    expect(vi(r.key, r.params)).toBe('Đặt phòng')
    expect(en(r.key, r.params)).toBe('Book')
  })

  it('a direct product link is a product, not a search', () => {
    const r = resolveActionLabel(a({ kind: 'purchase', urlKind: 'direct', url: 'https://shopee.vn/p-i.1.2' }))
    expect(vi(r.key, r.params)).toBe('Xem sản phẩm')
  })
})

describe('direct utility actions are unchanged', () => {
  it('maps, website and call keep their plain labels', () => {
    expect(vi(resolveActionLabel(a({ kind: 'maps', url: 'https://maps.google.com/?q=1' })).key)).toBe('Xem bản đồ')
    expect(vi(resolveActionLabel(a({ kind: 'website', url: 'https://x.vn' })).key)).toBe('Website')
    expect(vi(resolveActionLabel(a({ kind: 'call', url: 'tel:0900' })).key)).toBe('Gọi')
  })
})

describe('🚨 end to end from the real action builder', () => {
  it('a place with NO attributed review gets a search label, never a review promise', () => {
    // No maps page and no website: the ladder's last rung is a public YouTube
    // search, which is exactly the shape that used to render as "Xem review".
    const actions = buildActions({ name: 'Khách sạn Biển Xanh' }, 'travel')
    const review = actions.find(x => x.kind === 'review')
    expect(review, 'the ladder falls back to a YouTube search').toBeTruthy()
    expect(review!.attributed).toBe(false)
    expect(review!.url).toContain('youtube.com/results')
    expect(actionLabel(review!, vi)).toBe('Tìm review trên YouTube')
    expect(actionLabel(review!, vi)).not.toContain('Xem review')
  })

  it('a place WITH an attributed TikTok review says review', () => {
    const actions = buildActions({
      name: 'Cà Phê AnAn',
      maps_link: 'https://maps.google.com/?cid=2',
      tiktok_review_url: 'https://www.tiktok.com/@an/video/9',
      has_tiktok_review: true,
    }, 'food')
    const review = actions.find(x => x.kind === 'review' && x.attributed)
    expect(review).toBeTruthy()
    expect(actionLabel(review!, vi)).toBe('Review trên TikTok')
  })

  it('🚨 food order platforms are labelled as the searches they are', () => {
    const actions = buildActions({ name: 'Bún Bò Cô Ba', address: '12 Lê Lợi' }, 'food')
    const order = actions.filter(x => x.kind === 'order')
    expect(order.length).toBeGreaterThan(0)
    for (const o of order) {
      expect(o.urlKind).toBe('search')
      expect(actionLabel(o, vi)).toMatch(/^Tìm trên /)
    }
  })

  it('every label resolves to real copy — no raw keys reach a button', () => {
    const actions = buildActions({
      name: 'Sen Spa', maps_link: 'https://maps.google.com/?cid=3',
      website_uri: 'https://senspa.vn', phone: '+84 28 1234 5678',
    }, 'spa')
    expect(actions.length).toBeGreaterThan(0)
    for (const x of actions) {
      for (const t of [vi, en]) {
        const label = actionLabel(x, t)
        expect(label, `${x.kind} produced a raw key`).not.toMatch(/^v3\.action\./)
        expect(label.trim().length).toBeGreaterThan(0)
        expect(label).not.toContain('{platform}')
      }
    }
  })
})

describe("🚨 a row's own link means different things in different domains", () => {
  it("a hotel's Booking.com page is a BOOKING, not a product", () => {
    // Measured: every travel card carried "Xem sản phẩm" pointing at
    // booking.com/hotel/vn/<hotel>.vi.html — that hotel's own page.
    const actions = buildActions(
      { name: 'DA NANG BAY HOTEL', link: 'https://www.booking.com/hotel/vn/da-nang-bay.vi.html' },
      'travel',
    )
    const own = actions.find(x => x.url.includes('/hotel/vn/'))!
    expect(own.kind).toBe('booking')
    expect(own.urlKind).toBe('direct')
    expect(actionLabel(own, vi)).toBe('Đặt phòng')
    expect(actions.some(x => x.kind === 'purchase')).toBe(false)
  })

  it('an unknown host is a website, never guessed into a booking', () => {
    const actions = buildActions({ name: 'Homestay X', link: 'https://homestay-x.vn/rooms' }, 'travel')
    const own = actions.find(x => x.url.includes('homestay-x'))!
    expect(own.kind).toBe('website')
    expect(actionLabel(own, vi)).toBe('Website')
  })

  it('shopping keeps `purchase` — there a link really is the product', () => {
    const actions = buildActions({ name: 'Ốp lưng', link: 'https://shopee.vn/op-i.1.2' }, 'shopping')
    const buy = actions.find(x => x.kind === 'purchase')!
    expect(buy.urlKind).toBe('direct')
    expect(actionLabel(buy, vi)).toBe('Xem sản phẩm')
  })

  it('a spa/entertainment venue link stays a website', () => {
    for (const domain of ['spa', 'entertainment']) {
      const actions = buildActions({ name: 'Sen', link: 'https://sen.vn/gioi-thieu' }, domain)
      expect(actions.find(x => x.url.includes('sen.vn'))!.kind).toBe('website')
    }
  })
})
