import { describe, it, expect } from 'vitest'
import { buildActions, type Action } from './actions'
import { resolveActionLabel, actionLabel } from './actionLabel'
import { capabilitiesOf } from './capabilities'
import { buildCtaButtons, ctaTypeFor, labelFor } from './cta'
import { vi as VI, en as EN } from '@/lib/i18n/w5/placeDecision'
import type { CommerceLinkRow } from '@/lib/ccp'
import type { Recommendation } from './recommendation'
import type { CanonicalEntity } from './entity'

// ── CommerceLink → Action (owner decision P6-B) ──────────────────────────────

const NOW = '2026-09-13T08:00:00.000Z'

function row(over: Partial<CommerceLinkRow> = {}): CommerceLinkRow {
  return {
    linkId: 'a'.repeat(24),
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    url: 'https://vn.trip.com/hotels/detail/?hotelId=10569789&checkIn=2026-10-10&checkOut=2026-10-12&adult=2',
    destinationUrl: 'https://vn.trip.com/hotels/detail/?hotelId=10569789&checkIn=2026-10-10&checkOut=2026-10-12&adult=2',
    kind: 'DIRECT_DEEP_LINK',
    providerId: 'tripcom',
    merchantName: 'Trip.com',
    domain: 'travel',
    intentType: 'book_hotel',
    capability: 'hotel_booking',
    depth: 4,
    guestDepth: 5,
    authenticatedDepth: 5,
    authRequiredAt: 'none',
    handoff: 'guest',
    expiresAt: '2026-10-09T17:00:00.000Z',
    freshness: { source: 'registry:tripcom', retrievedAt: NOW, expiresAt: null, freshnessType: 'static', confidence: 1 },
    assumedParams: ['adults'],
    limitations: [],
    tracked: false,
    ...over,
  }
}

const t = (key: string, vars?: Record<string, string>) => {
  const s = VI[key] ?? key
  return vars ? s.replace('{platform}', vars.platform) : s
}

describe('buildActions with commerce_links', () => {
  it('maps a hotel link to a direct booking action that sorts FIRST and carries the commerce facts', () => {
    const actions = buildActions({ name: 'Mường Thanh', booking_link: 'https://www.booking.com/searchresults.html?ss=x', commerce_links: [row()] }, 'travel')
    expect(actions[0]).toMatchObject({ kind: 'booking', urlKind: 'direct', platform: 'Trip.com', priority: -1 })
    expect(actions[0].commerce).toEqual({
      linkId: 'a'.repeat(24), requestId: '550e8400-e29b-41d4-a716-446655440000', providerId: 'tripcom',
      depth: 4, guestDepth: 5, authenticatedDepth: 5, authRequiredAt: 'none', loginRequired: false, handoff: 'guest', freshnessType: 'static',
      expiresAt: '2026-10-09T17:00:00.000Z', tracked: false, capability: 'hotel_booking', primary: true,
    })
    // The legacy Booking.com search handoff is still offered, after it.
    expect(actions[1]).toMatchObject({ kind: 'booking', urlKind: 'search', platform: 'Booking.com' })
  })

  it('intent → kind: product/spa voucher = purchase · table = reservation · ticket/activity = ticket · delivery = delivery', () => {
    const cases: Array<[CommerceLinkRow['intentType'], CommerceLinkRow['domain'], Action['kind']]> = [
      ['buy_product', 'shopping', 'purchase'],
      ['buy_spa_voucher', 'spa', 'purchase'],
      ['reserve_table', 'food_drink', 'reservation'],
      ['order_delivery', 'food_drink', 'delivery'],
      ['buy_ticket', 'entertainment', 'ticket'],
      ['book_activity', 'entertainment', 'ticket'],
    ]
    for (const [intentType, domain, kind] of cases) {
      const a = buildActions({ name: 'x', commerce_links: [row({ intentType, domain, url: 'https://www.klook.com/vi/activity/1/', destinationUrl: 'https://www.klook.com/vi/activity/1/' })] }, 'spa')
      expect(a[0].kind, intentType).toBe(kind)
    }
  })

  it('a SEARCH_HANDOFF is an honest search; every other kind is direct', () => {
    const search = buildActions({ commerce_links: [row({ kind: 'SEARCH_HANDOFF' })] }, 'travel')[0]
    expect(search.urlKind).toBe('search')
    for (const kind of ['DIRECT_DEEP_LINK', 'AFFILIATE_DEEP_LINK', 'TRACKED_DEEP_LINK', 'DETAIL_HANDOFF', 'CONFIGURED_HANDOFF', 'CHECKOUT_HANDOFF'] as const) {
      expect(buildActions({ commerce_links: [row({ kind })] }, 'travel')[0].urlKind, kind).toBe('direct')
    }
  })

  it('the login boundary is data on the action: CGV before selection, Klook before checkout, DMX OTP at order is NOT a login', () => {
    const cgv = buildActions({ commerce_links: [row({ providerId: 'cgv', merchantName: 'CGV', intentType: 'buy_ticket', domain: 'entertainment', authRequiredAt: 'before_selection', guestDepth: 4, depth: 3, url: 'https://www.cgv.vn/default/x.html', destinationUrl: 'https://www.cgv.vn/default/x.html' })] }, 'entertainment')[0]
    expect(cgv.commerce?.loginRequired).toBe(true)
    const klook = buildActions({ commerce_links: [row({ providerId: 'klook', merchantName: 'Klook', intentType: 'book_activity', domain: 'entertainment', authRequiredAt: 'before_checkout', guestDepth: 4, depth: 3 })] }, 'entertainment')[0]
    expect(klook.commerce?.loginRequired).toBe(true)
    const dmx = buildActions({ commerce_links: [row({ providerId: 'dmx', merchantName: 'Điện Máy Xanh', intentType: 'buy_product', domain: 'shopping', authRequiredAt: 'at_order', depth: 3, url: 'https://www.dienmayxanh.com/tu-lanh/x', destinationUrl: 'https://www.dienmayxanh.com/tu-lanh/x' })] }, 'shopping')[0]
    expect(dmx.commerce?.loginRequired).toBe(false)
  })

  it('a row whose own link IS the commerce destination is not shown twice (DMX product found by Google Shopping)', () => {
    const dest = 'https://www.dienmayxanh.com/tu-lanh/samsung-rt31'
    const wrapped = 'https://go.isclix.com/deep_link/1/2?url=' + encodeURIComponent(dest)
    const actions = buildActions({ name: 'x', link: dest + '/', commerce_links: [row({ providerId: 'dmx', merchantName: 'Điện Máy Xanh', intentType: 'buy_product', domain: 'shopping', kind: 'AFFILIATE_DEEP_LINK', url: wrapped, destinationUrl: dest, tracked: true })] }, 'shopping')
    expect(actions.filter(a => a.kind === 'purchase')).toHaveLength(1)
    expect(actions[0].url).toBe(wrapped)
    expect(actions[0].commerce?.tracked).toBe(true)
  })

  it('a different row link (another seller) stays', () => {
    const actions = buildActions({ name: 'x', link: 'https://shopee.vn/p-i.1.2', commerce_links: [row({ providerId: 'dmx', merchantName: 'Điện Máy Xanh', intentType: 'buy_product', domain: 'shopping', url: 'https://www.dienmayxanh.com/tu-lanh/x', destinationUrl: 'https://www.dienmayxanh.com/tu-lanh/x' })] }, 'shopping')
    expect(actions.filter(a => a.kind === 'purchase').map(a => a.url)).toEqual(['https://www.dienmayxanh.com/tu-lanh/x', 'https://shopee.vn/p-i.1.2'])
  })

  it('unsafe or malformed commerce rows drop out; nothing is repaired', () => {
    const bad = [
      row({ url: 'http://vn.trip.com/x' }),
      row({ url: 'https://127.0.0.1/' }),
      row({ url: 'javascript:alert(1)' }),
      { linkId: 'x' } as unknown as CommerceLinkRow,
      null as unknown as CommerceLinkRow,
    ]
    expect(buildActions({ commerce_links: bad }, 'travel').filter(a => a.commerce)).toEqual([])
  })

  it('two commerce links keep CCP ranking order and both precede the table', () => {
    const a = buildActions({ maps_link: 'https://maps.google.com/?cid=1', commerce_links: [row({ linkId: '1'.repeat(24) }), row({ linkId: '2'.repeat(24), url: 'https://vn.trip.com/hotels/detail/?hotelId=2', destinationUrl: 'https://vn.trip.com/hotels/detail/?hotelId=2' })] }, 'travel')
    expect(a.slice(0, 2).map(x => x.commerce?.linkId)).toEqual(['1'.repeat(24), '2'.repeat(24)])
    expect(a[2].kind).toBe('maps')
  })
})

describe('labels — the merchant is named and the login boundary is stated', () => {
  const direct = buildActions({ commerce_links: [row()] }, 'travel')[0]
  const login = buildActions({ commerce_links: [row({ providerId: 'cgv', merchantName: 'CGV', intentType: 'buy_ticket', domain: 'entertainment', authRequiredAt: 'before_selection', url: 'https://www.cgv.vn/default/x.html', destinationUrl: 'https://www.cgv.vn/default/x.html' })] }, 'entertainment')[0]
  const search = buildActions({ commerce_links: [row({ kind: 'SEARCH_HANDOFF' })] }, 'travel')[0]

  it('resolves platform-bearing keys, with a LoginOn variant for a login boundary', () => {
    expect(resolveActionLabel(direct)).toEqual({ key: 'v3.action.bookingOn', params: { platform: 'Trip.com' } })
    expect(resolveActionLabel(login)).toEqual({ key: 'v3.action.ticketLoginOn', params: { platform: 'CGV' } })
    // A search handoff is still a search — commerce facts do not upgrade the promise.
    expect(resolveActionLabel(search)).toEqual({ key: 'v3.action.bookingSearch', params: { platform: 'Trip.com' } })
  })

  it('renders finished strings in both languages, and every new key exists in both dictionaries', () => {
    expect(actionLabel(direct, t)).toBe('Đặt phòng trên Trip.com')
    expect(actionLabel(login, t)).toBe('Mua vé trên CGV · cần đăng nhập')
    for (const kind of ['purchase', 'booking', 'reservation', 'ticket', 'order', 'delivery']) {
      for (const suffix of ['On', 'LoginOn']) {
        const key = `v3.action.${kind}${suffix}`
        expect(VI[key], key).toBeTruthy()
        expect(EN[key], key).toBeTruthy()
        expect(VI[key]).toContain('{platform}')
        expect(EN[key]).toContain('{platform}')
      }
    }
    expect(Object.keys(VI).sort()).toEqual(Object.keys(EN).sort())
  })
})

describe('model-facing capability', () => {
  it('has_direct_handoff is derived from the presence of commerce_links and nothing else', () => {
    expect(capabilitiesOf({ commerce_links: [row()] }).has_direct_handoff).toBe(true)
    expect(capabilitiesOf({ commerce_links: [] }).has_direct_handoff).toBeUndefined()
    expect(capabilitiesOf({ link: 'https://www.dienmayxanh.com/x' }).has_direct_handoff).toBeUndefined()
  })
})

describe('[CTA_BUTTONS] projection (inert while SERVER_AUTHORED_CTA is off)', () => {
  const entity = (actions: Action[]): CanonicalEntity => ({ identity: { name: 'Mường Thanh', sourceRefs: [] }, actions } as unknown as CanonicalEntity)
  const rec = (actions: Action[]): Recommendation => ({ entity: entity(actions), rank: 0, shortlistPosition: 1, role: 'best_overall', recommended: true, matchVerdict: null, reasons: [], tradeOff: null, contextualActions: actions })

  it('keeps the wire vocabulary: a direct commerce purchase is website, a booking stays booking; the login note rides in the label', () => {
    const purchase = buildActions({ commerce_links: [row({ providerId: 'dmx', merchantName: 'Điện Máy Xanh', intentType: 'buy_product', domain: 'shopping', url: 'https://www.dienmayxanh.com/tu-lanh/x', destinationUrl: 'https://www.dienmayxanh.com/tu-lanh/x' })] }, 'shopping')[0]
    expect(ctaTypeFor(purchase)).toBe('website')
    const booking = buildActions({ commerce_links: [row()] }, 'travel')[0]
    expect(ctaTypeFor(booking)).toBe('booking')
    const cgv = buildActions({ commerce_links: [row({ providerId: 'cgv', merchantName: 'CGV', intentType: 'buy_ticket', domain: 'entertainment', authRequiredAt: 'before_selection', url: 'https://www.cgv.vn/default/x.html', destinationUrl: 'https://www.cgv.vn/default/x.html' })] }, 'entertainment')[0]
    expect(labelFor(cgv, 'vi')).toBe('🎟️ Mua vé — CGV (cần đăng nhập)')
    expect(labelFor(cgv, 'en')).toBe('🎟️ Tickets — CGV (login required)')
    const buttons = buildCtaButtons([rec([booking])], 'vi')
    expect(buttons).toEqual([{ label: '🏨 Đặt phòng — Trip.com', type: 'booking', url: booking.url, primary: true }])
    for (const b of buttons) expect(['maps', 'call', 'zalo', 'website', 'booking', 'search', 'internal_booking']).toContain(b.type)
  })
})
