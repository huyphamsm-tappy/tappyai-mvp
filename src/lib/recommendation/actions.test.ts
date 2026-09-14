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

describe('an order button must land somewhere that names the venue', () => {
  // 🚨 THE MEASURED DEFECT: `buildFoodOrderLinks` returns BeFood as the bare
  // site root for every restaurant, because BeFood publishes no search page. Shown
  // beside ShopeeFood and GrabFood - both of which carry the venue's name in the
  // query - it looked like a third way to order this meal and was a homepage.
  //
  // The rule is about the destination, not the brand: BeFood support stays in the
  // builder and the data, and a venue-specific BeFood URL still shows.

  it('drops a homepage-only order link, and keeps GrabFood (ShopeeFood has no search page — live UAT 14 Sep 2026)', () => {
    const actions = buildActions({ ...FOOD_ROW, order_links: undefined }, 'food')
    const order = actions.filter(a => a.kind === 'order')
    expect(order.map(a => a.platform)).toEqual(['GrabFood'])
    expect(order.every(a => a.url.includes('B%C3%BAn') || a.url.includes('C%C3%B4'))).toBe(true)
    expect(actions.some(a => a.url === 'https://be.com.vn/')).toBe(false)
  })

  it('the builder still offers BeFood — this is visibility, not deletion', () => {
    expect(buildFoodOrderLinks('Bún Bò Huế Cô Ba', '12 Lê Lợi', 'Quận 1').map(l => l.name))
      .toEqual(['GrabFood', 'BeFood'])
    // The GrabFood grammar is the registry's verified one, never the 404 /vn/en/s?searchKeyword= form.
    expect(buildFoodOrderLinks('Bún Bò Huế Cô Ba', '12 Lê Lợi', 'Quận 1')[0].url).toMatch(/^https:\/\/food\.grab\.com\/vn\/vi\/restaurants\?search=/)
  })

  it('shows BeFood when the row carries a venue-specific destination', () => {
    const order = buildActions({
      ...FOOD_ROW,
      order_links: [
        { name: 'ShopeeFood', url: 'https://shopeefood.vn/tim-kiem?q=x' },
        { name: 'BeFood', url: 'https://be.com.vn/olac' },
      ],
    }, 'food').filter(a => a.kind === 'order')
    expect(order.map(a => a.platform)).toEqual(['ShopeeFood', 'BeFood'])
    expect(order.find(a => a.platform === 'BeFood')!.url).toBe('https://be.com.vn/olac')
  })

  it('applies to any platform, and never to a link that does name the venue', () => {
    const order = buildActions({
      ...FOOD_ROW,
      order_links: [
        { name: 'ShopeeFood', url: 'https://shopeefood.vn/' },
        { name: 'GrabFood', url: 'https://food.grab.com/vn/en/s?searchKeyword=x' },
      ],
    }, 'food').filter(a => a.kind === 'order')
    expect(order.map(a => a.platform)).toEqual(['GrabFood'])
  })
})

describe('every URL comes from the application', () => {
  const actions = buildActions(FOOD_ROW, 'food')

  it('produces one list covering order, maps, website, call and review', () => {
    expect(new Set(actions.map(a => a.kind))).toEqual(new Set(['order', 'maps', 'website', 'call', 'review']))
  })

  it('orders by the domain priority table, not by discovery order', () => {
    expect(actions[0].kind).toBe('order')
    const kinds = actions.map(a => a.kind)
    expect(kinds.indexOf('order')).toBeLessThan(kinds.indexOf('maps'))
    expect(kinds.indexOf('maps')).toBeLessThan(kinds.indexOf('website'))
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
  it('a ShopeeFood order link is a SEARCH — the venue may not be listed there', () => {
    const order = buildActions(FOOD_ROW, 'food').find(a => a.kind === 'order')!
    expect(order.urlKind).toBe('search')
  })

  it('a product link is DIRECT — it goes to the product', () => {
    const buy = buildActions({ name: 'MacBook', link: 'https://cellphones.example/mba' }, 'shopping').find(a => a.kind === 'purchase')!
    expect(buy.urlKind).toBe('direct')
  })

  it('a Google Maps link is direct', () => {
    expect(buildActions(FOOD_ROW, 'food').find(a => a.kind === 'maps')!.urlKind).toBe('direct')
  })

  it('a Booking.com link is a search', () => {
    const b = buildActions({ name: 'Hotel X', booking_link: 'https://www.booking.com/searchresults.html?ss=Hotel+X' }, 'travel')
    expect(b.find(a => a.kind === 'booking')!.urlKind).toBe('search')
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
  const order = buildActions(FOOD_ROW, 'food').find(a => a.kind === 'order')!
  it('vi says "tìm", not "đặt", for a search link', () => {
    expect(labelFor(order, 'vi')).toContain('Tìm')
  })
  it('en says "Find", not "Order", for a search link', () => {
    expect(labelFor(order, 'en')).toContain('Find')
  })
  it('a direct purchase still says buy', () => {
    const buy = buildActions({ name: 'X', link: 'https://shop.example/p' }, 'shopping')[0]
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
