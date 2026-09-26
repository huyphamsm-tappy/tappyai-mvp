import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildActions } from './actions'
import { buildFoodOrderLinks } from '@/lib/platformLinks/food'
import { capabilitiesOf } from './capabilities'
import { buildCtaButtons, stripModelCta, labelFor } from './cta'
import { buildPlaceEntity } from './buildEntity'
import { buildRecommendations } from './recommendation'

// ── PARTS 6 & 7 — one URL authority, and booleans instead of links ──────────

const FOOD_ROW = {
  name: 'Bún Bò Huế Cô Ba',
  address: '12 Lê Lợi, Quận 1',
  place_id: 'ChIJ_bb',
  maps_link: 'https://maps.google.com/?cid=9',
  website_uri: 'https://cobahue.example',
  phone: '+84 28 3822 1234',
  order_links: [
    { name: 'ShopeeFood', url: 'https://shopeefood.vn/tim-kiem?q=B%C3%BAn+B%C3%B2' },
    { name: 'GrabFood', url: 'https://food.grab.com/vn/en/s?searchKeyword=B%C3%BAn+B%C3%B2' },
  ],
  review_actions: [
    { kind: 'tiktok_verified' as const, label: 'x', url: 'https://www.tiktok.com/@a/video/1', attributed: true },
    { kind: 'youtube_search_fallback' as const, label: 'y', url: 'https://www.youtube.com/results?search_query=x', attributed: false },
  ],
  tiktok_review_url: 'https://www.tiktok.com/@a/video/1',
  has_tiktok_review: true,
}

describe('A3.3 / A3.6 (owner, 2026-09-20): an order CTA is the venue\'s OWN page on the platform — never a search, never a front door', () => {
  // Superseded here: the 14 Sep 2026 rule that a delivery platform\'s SEARCH for the venue\'s name
  // was an honest order button. The owner\'s rule is absolute — the deepest merchant page or
  // nothing — so `order_links` (GrabFood search + BeFood homepage) are not emitted at all, and
  // GrabFood / ShopeeFood reach the card only as the venue\'s page (entity-scoped evidence or a
  // Commerce Link). Prose never carries them (streamEnrichment: the card owns enrichment).
  it('the legacy search / homepage order links produce NO order action', () => {
    expect(buildActions({ ...FOOD_ROW, order_links: undefined }, 'food').filter(a => a.kind === 'order')).toEqual([])
    expect(buildActions(FOOD_ROW, 'food').filter(a => a.kind === 'order')).toEqual([])
    const actions = buildActions({ ...FOOD_ROW, order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/' }, { name: 'GrabFood', url: 'https://food.grab.com/vn/en/s?searchKeyword=x' }] }, 'food')
    expect(actions.some(a => a.kind === 'order')).toBe(false)
    expect(actions.some(a => a.url === 'https://be.com.vn/')).toBe(false)
  })

  it('the builder still exists for the legacy prose surfaces — it is no longer an action source', () => {
    expect(buildFoodOrderLinks('Bún Bò Huế Cô Ba', '12 Lê Lợi', 'Quận 1').map(l => l.name)).toEqual(['GrabFood', 'BeFood'])
  })

  it('the venue\'s OWN page on a platform (entity-scoped evidence) IS the order CTA, direct and attributed', () => {
    const order = buildActions({
      ...FOOD_ROW,
      order_links: undefined,
      order_search_results: [{ title: 'Bún Bò Huế Cô Ba - ShopeeFood', link: 'https://shopeefood.vn/ho-chi-minh/bun-bo-hue-co-ba-12-le-loi' }],
    }, 'food').filter(a => a.kind === 'order')
    expect(order).toHaveLength(1)
    expect(order[0]).toMatchObject({ urlKind: 'direct', attributed: true, url: 'https://shopeefood.vn/ho-chi-minh/bun-bo-hue-co-ba-12-le-loi' })
  })
})

describe('every URL comes from the application', () => {
  const actions = buildActions(FOOD_ROW, 'food')

  it('produces one list covering maps, website, call and review (no order: the row carries only search links)', () => {
    expect(new Set(actions.map(a => a.kind))).toEqual(new Set(['maps', 'website', 'call', 'review']))
  })

  it('orders by the domain priority table, not by discovery order', () => {
    const kinds = actions.map(a => a.kind)
    expect(kinds.indexOf('maps')).toBeLessThan(kinds.indexOf('review'))
    expect(kinds.indexOf('review')).toBeLessThan(kinds.indexOf('website'))
  })

  it('rejects anything that is not a safe https URL', () => {
    const bad = buildActions({ name: 'X', maps_link: 'javascript:alert(1)', website_uri: 'http://insecure.example' }, 'food')
    expect(bad.some(a => a.url.startsWith('javascript:'))).toBe(false)
    expect(bad.some(a => a.url.startsWith('http://'))).toBe(false)
  })

  it('shows one destination once, even when two builders produced it', () => {
    const dup = buildActions(
      { name: 'X', maps_link: 'https://maps.google.com/?cid=1', platform_links: [{ name: 'Google Maps', url: 'https://maps.google.com/?cid=1' }] },
      'spa',
    )
    expect(dup.filter(a => a.url === 'https://maps.google.com/?cid=1')).toHaveLength(1)
  })

  it('an unavailable action is ABSENT, never present-and-disabled', () => {
    const noSite = buildActions({ name: 'X', maps_link: 'https://maps.google.com/?cid=1' }, 'entertainment')
    expect(noSite.some(a => a.kind === 'website')).toBe(false)
  })
})

describe('urlKind separates a destination from a search', () => {
  it('a product link is DIRECT — it goes to the product', () => {
    const buy = buildActions({ name: 'MacBook', link: 'https://cellphones.example/macbook-air-m3-13-inch' }, 'shopping').find(a => a.kind === 'purchase')!
    expect(buy.urlKind).toBe('direct')
  })

  it('A3.3: a Google Shopping row link (the `ibp=oshop` intermediary), a merchant search page and a front door are never a purchase', () => {
    for (const link of [
      'https://www.google.com/search?q=macbook&ibp=oshop&prds=pid:123',
      'https://www.google.com/shopping/product/123',
      'https://shopee.vn/search?keyword=macbook',
      'https://www.lazada.vn/',
      'https://www.lazada.vn/vi/',
    ]) {
      expect(buildActions({ name: 'MacBook', link }, 'shopping').some(a => a.kind === 'purchase'), link).toBe(false)
    }
  })

  it('a Google Maps link is direct', () => {
    expect(buildActions(FOOD_ROW, 'food').find(a => a.kind === 'maps')!.urlKind).toBe('direct')
  })

  it('A3.3: the Booking.com results page and the Agoda front door are NOT booking actions; a hotel\'s own OTA page is', () => {
    const b = buildActions({ name: 'Hotel X', booking_link: 'https://www.booking.com/searchresults.html?ss=Hotel+X', agoda_link: 'https://www.agoda.com/vi-vn/' }, 'travel')
    expect(b.some(a => a.kind === 'booking')).toBe(false)
    const own = buildActions({ name: 'Hotel X', link: 'https://www.booking.com/hotel/vn/hotel-x.vi.html' }, 'travel')
    expect(own.find(a => a.kind === 'booking')).toMatchObject({ urlKind: 'direct' })
  })

  it('the verified review is direct and the YouTube fallback is a search', () => {
    const reviews = buildActions(FOOD_ROW, 'food').filter(a => a.kind === 'review')
    expect(reviews.find(r => r.url.includes('tiktok'))!.urlKind).toBe('direct')
    expect(reviews.find(r => r.url.includes('youtube'))!.urlKind).toBe('search')
  })

  it('keeps the attributed flag that says which is real content', () => {
    const reviews = buildActions(FOOD_ROW, 'food').filter(a => a.kind === 'review')
    expect(reviews.find(r => r.url.includes('tiktok'))!.attributed).toBe(true)
    expect(reviews.find(r => r.url.includes('youtube'))!.attributed).toBe(false)
  })
})

describe('the copy follows urlKind, so a search never reads as a booking', () => {
  it('a review search says search, never a destination verb', () => {
    const yt = buildActions(FOOD_ROW, 'food').find(a => a.kind === 'review' && a.urlKind === 'search')!
    expect(labelFor(yt, 'en')).toMatch(/Search|Find/)
  })
  it('a direct purchase still says buy', () => {
    const buy = buildActions({ name: 'X', link: 'https://shop.example/p/iphone-15-256gb' }, 'shopping')[0]
    expect(labelFor(buy, 'en')).toContain('Buy')
  })
})

describe('capability booleans tell the model what is possible, never how to reach it', () => {
  const caps = capabilitiesOf(FOOD_ROW)

  it('reports ordering without handing over an order URL', () => {
    expect(caps.has_order).toBe(true)
    expect(JSON.stringify(caps)).not.toContain('shopeefood')
    expect(JSON.stringify(caps)).not.toContain('http')
  })

  it('distinguishes a verified review from a mere search', () => {
    expect(caps.has_reviews).toBe('verified')
    expect(capabilitiesOf({ name: 'X', maps_link: 'https://maps.google.com/?cid=1' }).has_reviews).toBe('search')
    expect(capabilitiesOf({}).has_reviews).toBeUndefined()
  })

  it('emits nothing for an absent capability rather than false', () => {
    const bare = capabilitiesOf({ name: 'X' })
    expect('has_order' in bare).toBe(false)
    expect(bare.has_photo).toBeUndefined()
  })

  it('counts a photo resource name as evidence a photo exists', () => {
    expect(capabilitiesOf({ photo_names: ['places/x/photos/y'] }).has_photo).toBe(true)
  })
})

describe('the model-facing payload carries no URL it could copy', () => {
  it('capabilities are derived from the carved values, so they cannot over-claim', () => {
    // No order links → no ordering capability, even though the row is a food row.
    const noOrder = capabilitiesOf({ name: 'Quán X', maps_link: 'https://maps.google.com/?cid=2' })
    expect(noOrder.has_order).toBeUndefined()
  })
})

describe('server-authored CTA', () => {
  const recs = buildRecommendations([buildPlaceEntity(FOOD_ROW, { domain: 'food', source: 'google_places' })])

  it('builds buttons from the deterministic action list', () => {
    const buttons = buildCtaButtons(recs, 'vi')
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons[0].primary).toBe(true)
    for (const b of buttons) expect(b.url.startsWith('https://') || b.url.startsWith('tel:')).toBe(true)
  })

  it('emits the same wire shape the three existing parsers already read', () => {
    const b = buildCtaButtons(recs, 'vi')[0]
    expect(Object.keys(b).sort()).toEqual(['label', 'primary', 'type', 'url'])
  })

  it('offers nothing when there is nothing actionable', () => {
    expect(buildCtaButtons([], 'vi')).toEqual([])
  })

  it('strips a CTA block the model wrote, in all four shapes', () => {
    expect(stripModelCta('Ngon lắm.\n[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]')).toBe('Ngon lắm.')
    expect(stripModelCta('Ngon lắm.\n[CTA_BUTTONS]{"buttons":[]}')).toBe('Ngon lắm.')
    expect(stripModelCta('Ngon lắm.\n[/CTA_BUTTONS]')).toBe('Ngon lắm.')
    expect(stripModelCta('Ngon lắm.')).toBe('Ngon lắm.')
  })
})

describe('the flags that gate all of this are OFF', () => {
  // 🚨 Both changes are staged, and shipped behaviour must be unchanged until
  // their prerequisites land. A flag flipped by accident is exactly the kind of
  // thing a review misses and a test does not.
  const CFG = readFileSync(resolve(process.cwd(), 'src/lib/config/product.ts'), 'utf8')

  it('EMIT_TAPPY_PLACES is false — Android and iOS cannot strip the marker yet', () => {
    expect(CFG).toMatch(/export const EMIT_TAPPY_PLACES = false/)
  })

  it('SERVER_AUTHORED_CTA is false — the prompt still tells the model to write one', () => {
    expect(CFG).toMatch(/export const SERVER_AUTHORED_CTA = false/)
  })
})
