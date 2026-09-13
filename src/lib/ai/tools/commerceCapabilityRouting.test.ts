import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { attachCommerceLinks } from './commerce'
import {
  COMMERCE_LINKS_KEY, setCommerceEventWriter, resolveCommerce, parseCommerceRequest, PROVIDER_REGISTRY, getProvider,
  providersForCapability, supportsCapability, depthProfileForCapability, INTENT_CAPABILITY, DOMAIN_CAPABILITIES,
  type CommerceLinkRow,
} from '@/lib/ccp'
import { adaptersFor } from '@/lib/ccp/adapters'
import { validateRegistry } from '@/lib/ccp/registry'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { buildPlacesLiveView } from '@/lib/recommendation/liveView'

// ── Owner correction (13 Sep 2026): DOMAIN ≠ PROVIDER ≠ TRANSACTION TYPE ────
//
// Food & Drink contains food_order / food_delivery (GrabFood, ShopeeFood — L3 +
// login/app) AND table_reservation (PasGo — L5 guest). A request for one must
// never be answered by a provider of the other, and a reservation link must
// never outrank order links on a turn that did not ask for a reservation.

const NOW = new Date('2026-09-13T08:00:00Z')
const links = (row: Record<string, unknown>) => (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []
const pasgoSearch = async () => [{ title: 'Nhà hàng Quá Ngon', link: 'https://pasgo.vn/nha-hang/nha-hang-qua-ngon-1234', snippet: '' }]
const foodRow = () => ({
  name: 'Quá Ngon', address: '306 Lê Văn Sỹ', maps_link: 'https://maps.google.com/?cid=1',
  order_links: [
    { name: 'ShopeeFood', url: 'https://shopeefood.vn/tim-kiem?q=Qu%C3%A1%20Ngon' },
    { name: 'GrabFood', url: 'https://food.grab.com/vn/en/s?searchKeyword=Qu%C3%A1%20Ngon' },
  ],
})

beforeEach(() => setCommerceEventWriter(() => undefined))
afterEach(() => setCommerceEventWriter(null))

describe('capability model in the registry', () => {
  it('validates: every intent is backed by a declared capability and every provider declares commerce_handoff', () => {
    expect(validateRegistry()).toEqual([])
  })

  it('PasGo declares table_reservation and NOT food_order / food_delivery; GrabFood/ShopeeFood the reverse', () => {
    const pasgo = getProvider('pasgo')!
    expect(supportsCapability(pasgo, 'table_reservation')).toBe(true)
    expect(supportsCapability(pasgo, 'food_delivery')).toBe(false)
    expect(supportsCapability(pasgo, 'food_order')).toBe(false)
    for (const id of ['grabfood', 'shopeefood']) {
      const p = getProvider(id)!
      expect(supportsCapability(p, 'food_delivery'), id).toBe(true)
      expect(supportsCapability(p, 'food_order'), id).toBe(true)
      expect(supportsCapability(p, 'table_reservation'), id).toBe(false)
      expect(p.tier, id).toBe('handoff_only')
    }
    expect(providersForCapability('food_drink', 'table_reservation').map(p => p.providerId)).toEqual(['pasgo'])
    expect(providersForCapability('food_drink', 'food_delivery').map(p => p.providerId).sort()).toEqual(['grabfood', 'shopeefood'])
  })

  it('depth is per (provider, capability) — never "Food & Drink = L5"', () => {
    expect(depthProfileForCapability(getProvider('pasgo')!, 'table_reservation')).toMatchObject({ guestDepth: 5, authRequiredAt: 'none' })
    expect(depthProfileForCapability(getProvider('pasgo')!, 'food_delivery')).toBeNull()
    expect(depthProfileForCapability(getProvider('grabfood')!, 'food_delivery')).toMatchObject({ guestDepth: 3, authRequiredAt: 'before_checkout' })
    expect(depthProfileForCapability(getProvider('shopeefood')!, 'food_delivery')).toMatchObject({ guestDepth: 3, authRequiredAt: 'app_only' })
    // The other domains, as the owner listed them.
    expect(depthProfileForCapability(getProvider('tripcom')!, 'hotel_booking')).toMatchObject({ guestDepth: 5 })
    expect(depthProfileForCapability(getProvider('dmx')!, 'product_purchase')).toMatchObject({ guestDepth: 5 })
    expect(depthProfileForCapability(getProvider('cgv')!, 'cinema_ticket')).toMatchObject({ guestDepth: 4, authRequiredAt: 'before_selection' })
    expect(depthProfileForCapability(getProvider('klook')!, 'activity_booking')).toMatchObject({ guestDepth: 4, authRequiredAt: 'before_checkout' })
    expect(depthProfileForCapability(getProvider('klook')!, 'spa_voucher')).toMatchObject({ guestDepth: 4, authRequiredAt: 'before_checkout' })
    expect(depthProfileForCapability(getProvider('cellphones')!, 'product_purchase')).toMatchObject({ guestDepth: 4, authRequiredAt: 'before_checkout' })
  })

  it('every declared capability belongs to the provider\'s domains, and no capability was invented', () => {
    for (const p of PROVIDER_REGISTRY) {
      for (const c of p.commerce) {
        const inDomain = p.domains.some(d => DOMAIN_CAPABILITIES[d].includes(c))
        expect(inDomain, `${p.providerId}: ${c}`).toBe(true)
      }
    }
    // PasGo "availability" is the one non-transactional capability declared beyond discovery/detail
    // (the reservation form reports an unserved slot on the page — audit). Menu is declared by nobody.
    expect(PROVIDER_REGISTRY.filter(p => p.commerce.includes('menu'))).toEqual([])
  })
})

describe('CommerceRequest carries a capability that must agree with its intent', () => {
  it('fills the capability from the intent, and rejects a mismatch', () => {
    const ok = parseCommerceRequest({ domain: 'food_drink', intentType: 'reserve_table', subject: 'x' })
    expect(ok.ok && ok.request.capability).toBe('table_reservation')
    const bad = parseCommerceRequest({ domain: 'food_drink', intentType: 'reserve_table', capability: 'food_delivery', subject: 'x' })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.issues.join(' ')).toMatch(/capability food_delivery does not match intent reserve_table/)
  })

  it('adaptersFor is capability-aware: a delivery request has NO adapter (PasGo excluded), a reservation request has PasGo', () => {
    expect(adaptersFor({ domain: 'food_drink', intentType: 'order_delivery', capability: 'food_delivery', subject: 'x' })).toEqual([])
    expect(adaptersFor({ domain: 'food_drink', intentType: 'reserve_table', capability: 'table_reservation', subject: 'x' }).map(a => a.providerId)).toEqual(['pasgo'])
  })

  it('resolveCommerce for food_delivery never returns PasGo, even with a PasGo page as a hint', () => {
    const r = resolveCommerce(
      { domain: 'food_drink', intentType: 'order_delivery', capability: 'food_delivery', subject: 'Quá Ngon' },
      { enabled: true, now: NOW, hints: [{ url: 'https://pasgo.vn/nha-hang/nha-hang-qua-ngon-1234' }] },
    )
    expect('links' in r && r.links).toEqual([])
    expect('providersQueried' in r && r.providersQueried).toEqual([])
    expect(INTENT_CAPABILITY.order_delivery).toBe('food_delivery')
  })
})

describe('the seam routes by the user\'s words (Food & Drink)', () => {
  it('A · delivery intent → no PasGo link; the legacy order links remain the actions', async () => {
    const row = foodRow()
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search: pasgoSearch, userText: 'Tôi muốn đặt món ăn giao tận nhà.' })
    expect(links(row)).toEqual([])
    const rec = placeRecommendations(result, 'Quận 3')[0]
    expect(rec.entity.actions[0]).toMatchObject({ kind: 'order', urlKind: 'search', platform: 'ShopeeFood' })
    expect(rec.entity.actions.some(a => a.commerce)).toBe(false)
  })

  it('B · reservation intent → PasGo PRIMARY with the sentence\'s party/time/date, L5 hold grammar, leads the actions', async () => {
    const row = foodRow()
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search: pasgoSearch, userText: 'Tôi muốn đặt bàn cho 2 người lúc 19h.' })
    const [l] = links(row)
    expect(l).toMatchObject({ providerId: 'pasgo', capability: 'table_reservation', primary: true, kind: 'CHECKOUT_HANDOFF', depth: 5, guestDepth: 5, authRequiredAt: 'none' })
    const u = new URL(l.destinationUrl)
    expect(u.pathname).toBe('/dat-cho-ngay/1234')
    expect(Object.fromEntries(u.searchParams)).toEqual({ sfAdult: '2', sfChild: '0', sfDateFrom: '13/09/2026', sfTimeFrom: '19:00' })
    expect(l.assumedParams).toEqual(['date'])
    expect(l.expiresAt).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString())
    const rec = placeRecommendations(result, 'Quận 3')[0]
    expect(rec.entity.actions[0]).toMatchObject({ kind: 'reservation', urlKind: 'direct', platform: 'PasGo' })
    expect(rec.entity.actions[0].commerce).toMatchObject({ capability: 'table_reservation', primary: true, loginRequired: false })
    // The order links are still offered, after it.
    expect(rec.entity.actions.some(a => a.kind === 'order')).toBe(true)
    const view = buildPlacesLiveView([rec], {})
    expect(view?.items[0].actions[0].platform).toBe('PasGo')
  })

  it('C · discovery intent → PasGo attached as SECONDARY: offered, but order links and maps lead', async () => {
    const row = foodRow()
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search: pasgoSearch, userText: 'Tìm nhà hàng Nhật gần tôi' })
    const [l] = links(row)
    expect(l).toMatchObject({ providerId: 'pasgo', primary: false, depth: 3 })
    const rec = placeRecommendations(result, 'Quận 3')[0]
    const kinds = rec.entity.actions.map(a => a.kind)
    expect(kinds.slice(0, 2)).toEqual(['order', 'order'])
    expect(kinds.indexOf('reservation')).toBeGreaterThan(kinds.indexOf('maps'))
    expect(rec.entity.actions.find(a => a.kind === 'reservation')?.commerce?.primary).toBe(false)
  })

  it('the two intents cannot collapse: the same row, two sentences, two different leading actions and no cross-talk', async () => {
    const delivery = foodRow(), reservation = foodRow()
    await attachCommerceLinks('search_places', { results: [delivery], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search: pasgoSearch, userText: 'Đặt 2 phần phở giao đến nhà' })
    await attachCommerceLinks('search_places', { results: [reservation], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search: pasgoSearch, userText: 'Đặt bàn nhà hàng Nhật cho 2 người lúc 19h' })
    expect(links(delivery)).toEqual([])
    expect(links(reservation).map(l => l.capability)).toEqual(['table_reservation'])
  })

  it('a reservation intent without party/time falls back to the restaurant page (L3) — nothing is guessed', async () => {
    const row = foodRow()
    await attachCommerceLinks('search_places', { results: [row], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search: pasgoSearch, userText: 'đặt bàn nhà hàng này' })
    expect(links(row)[0]).toMatchObject({ primary: true, depth: 3, kind: 'DETAIL_HANDOFF' })
    expect(new URL(links(row)[0].destinationUrl).search).toBe('')
  })
})

describe('the seam routes by the user\'s words (Entertainment)', () => {
  it('a film sentence makes cinema_ticket primary; an attraction sentence makes activity_booking primary', async () => {
    const cinemaRow = { name: 'CGV Vincom Đồng Khởi', website_uri: 'https://www.cgv.vn/default/inside-out-2.html' }
    const klook = async () => [{ title: 'x', link: 'https://www.klook.com/vi/activity/2734-vinwonders/', snippet: '' }]
    await attachCommerceLinks('search_places', { results: [cinemaRow], _tappy_place_domain: 'entertainment' }, { enabled: true, now: NOW, search: klook, userText: 'Tìm vé xem phim CGV tối nay.' })
    const cinema = links(cinemaRow)
    expect(cinema.find(l => l.providerId === 'cgv')?.primary).toBe(true)
    expect(cinema.find(l => l.providerId === 'klook')?.primary).toBe(false)
    const attractionRow = { name: 'VinWonders Nha Trang' }
    await attachCommerceLinks('search_places', { results: [attractionRow], _tappy_place_domain: 'entertainment' }, { enabled: true, now: NOW, search: klook, userText: 'Tìm hoạt động ở VinWonders' })
    expect(links(attractionRow).map(l => [l.providerId, l.primary])).toEqual([['klook', true]])
  })
})
