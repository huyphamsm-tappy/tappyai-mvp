import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
/** A search that would find a PasGo page — a reservation sentence must never even run it (owner decision 14 Sep 2026). */
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

  it('table_reservation has NO active provider (owner decision 14 Sep 2026); GrabFood/ShopeeFood declare food_order / food_delivery only', () => {
    expect(getProvider('pasgo')).toBeNull()
    for (const id of ['grabfood', 'shopeefood']) {
      const p = getProvider(id)!
      expect(supportsCapability(p, 'food_delivery'), id).toBe(true)
      expect(supportsCapability(p, 'food_order'), id).toBe(true)
      expect(supportsCapability(p, 'table_reservation'), id).toBe(false)
      expect(p.tier, id).toBe('handoff_only')
    }
    expect(providersForCapability('food_drink', 'table_reservation')).toEqual([])
    expect(providersForCapability('food_drink', 'food_delivery').map(p => p.providerId).sort()).toEqual(['grabfood', 'shopeefood'])
  })

  it('depth is per (provider, capability) — never "Food & Drink = L5"', () => {
    expect(depthProfileForCapability(getProvider('grabfood')!, 'food_delivery')).toMatchObject({ guestDepth: 3, authRequiredAt: 'before_checkout' })
    expect(depthProfileForCapability(getProvider('shopeefood')!, 'food_delivery')).toMatchObject({ guestDepth: 3, authRequiredAt: 'app_only' })
    expect(depthProfileForCapability(getProvider('grabfood')!, 'table_reservation')).toBeNull()
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

  it('adaptersFor is capability-aware: a delivery request gets only the delivery platforms; a reservation request has NO adapter at all', () => {
    expect(adaptersFor({ domain: 'food_drink', intentType: 'order_delivery', capability: 'food_delivery', subject: 'x' }).map(a => a.providerId)).toEqual(['grabfood', 'shopeefood'])
    expect(adaptersFor({ domain: 'food_drink', intentType: 'reserve_table', capability: 'table_reservation', subject: 'x' })).toEqual([])
  })

  it('resolveCommerce for food_delivery never returns PasGo, even with a PasGo page as a hint', () => {
    const r = resolveCommerce(
      { domain: 'food_drink', intentType: 'order_delivery', capability: 'food_delivery', subject: 'Quá Ngon' },
      { enabled: true, now: NOW, hints: [{ url: 'https://pasgo.vn/nha-hang/nha-hang-qua-ngon-1234' }] },
    )
    expect('links' in r && r.links).toEqual([])
    // The delivery platforms are asked (and find nothing in a PasGo page); PasGo itself is never asked.
    expect('providersQueried' in r && r.providersQueried).not.toContain('pasgo')
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

  it('B · reservation intent → NO commerce request, no provider, no link; the venue actions stand (owner decision 14 Sep 2026)', async () => {
    const row = foodRow()
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    const search = vi.fn(pasgoSearch)
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, userText: 'Tôi muốn đặt bàn cho 2 người lúc 19h tối nay.' })
    expect(links(row)).toEqual([])
    expect(search).not.toHaveBeenCalled()
    const rec = placeRecommendations(result, 'Quận 3')[0]
    expect(rec.entity.actions.some(a => a.commerce)).toBe(false)
    expect(rec.entity.actions.some(a => a.kind === 'reservation')).toBe(false)
  })

  it('C · discovery intent → no commerce request; order links and maps lead', async () => {
    const row = foodRow()
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    const search = vi.fn(pasgoSearch)
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, userText: 'Tìm nhà hàng Nhật gần tôi' })
    expect(links(row)).toEqual([])
    expect(search).not.toHaveBeenCalled()
    const kinds = placeRecommendations(result, 'Quận 3')[0].entity.actions.map(a => a.kind)
    expect(kinds.slice(0, 2)).toEqual(['order', 'order'])
  })

  it('the two intents cannot collapse: a reservation sentence never yields a delivery link, and a delivery sentence never a reservation', async () => {
    const delivery = foodRow(), reservation = foodRow()
    const shopeefood = async () => [{ title: 'Quá Ngon - ShopeeFood', link: 'https://shopeefood.vn/ho-chi-minh/qua-ngon-le-van-sy', snippet: '' }]
    await attachCommerceLinks('search_places', { results: [delivery], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search: shopeefood, userText: 'Đặt 2 phần phở giao đến nhà' })
    await attachCommerceLinks('search_places', { results: [reservation], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search: shopeefood, userText: 'Đặt bàn nhà hàng Nhật cho 2 người lúc 19h ngày mai' })
    expect(links(delivery).map(l => l.capability)).toEqual(['food_delivery'])
    expect(links(reservation)).toEqual([])
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
