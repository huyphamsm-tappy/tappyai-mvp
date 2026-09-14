import { describe, it, expect, vi } from 'vitest'
import { discoverCommerceHints, MAX_QUERIES_PER_TURN } from './commerceDiscovery'
import { discoveryScopesFor, providerOwning } from '@/lib/ccp'

// ── Discovery: scoped web search, registry-owned hosts, hard budget ──────────

const hotelScopes = () => discoveryScopesFor('travel', 'book_hotel')

describe('discovery scopes come from the registry', () => {
  it('names one scope per enabled MVP adapter for the domain/intent, and none for handoff-only or unknown intents', () => {
    expect(discoveryScopesFor('travel', 'book_hotel').map(s => s.providerId)).toEqual(['tripcom'])
    // Shopping (14 Sep 2026): the retailers and the three marketplaces are all discoverable; CellphoneS via passthrough.
    expect(discoveryScopesFor('shopping', 'buy_product').map(s => s.providerId)).toEqual(['dmx', 'shopee', 'tiktokshop', 'lazada', 'cellphones'])
    expect(discoveryScopesFor('food_drink', 'reserve_table').map(s => s.providerId)).toEqual(['pasgo'])
    expect(discoveryScopesFor('entertainment', 'book_activity').map(s => s.providerId)).toEqual(['klook'])
    expect(discoveryScopesFor('spa', 'buy_spa_voucher').map(s => s.providerId)).toEqual(['klook'])
    // CGV has no film tool to discover from: film pages are only used when a row already carries one.
    expect(discoveryScopesFor('entertainment', 'buy_ticket')).toEqual([])
    expect(discoveryScopesFor('travel', 'book_flight')).toEqual([])
  })

  it('respects the per-adapter product flags', () => {
    expect(discoveryScopesFor('travel', 'book_hotel', { CCP_ADAPTER_TRIPCOM: false })).toEqual([])
  })

  it('providerOwning is an exact-host, https-only match against the allow-lists', () => {
    expect(providerOwning('https://vn.trip.com/hotels/detail/?hotelId=1')).toBe('tripcom')
    expect(providerOwning('https://www.dienmayxanh.com/tu-lanh/x')).toBe('dmx')
    expect(providerOwning('https://pasgo.vn/nha-hang/x-1')).toBe('pasgo')
    expect(providerOwning('http://vn.trip.com/')).toBeNull()
    expect(providerOwning('https://vn.trip.com.attacker.example/')).toBeNull()
    expect(providerOwning('https://evil.vn.trip.com/')).toBeNull()
    expect(providerOwning('not a url')).toBeNull()
  })
})

describe('discoverCommerceHints', () => {
  it('composes "<subject>" <locality> site:<scope> and accepts only links the scope provider owns', async () => {
    const search = vi.fn(async (_q: string) => [
      { title: 'a', link: 'https://vn.trip.com/hotels/da-nang-hotel-detail-1/x/', snippet: '' },
      { title: 'b', link: 'https://www.booking.com/hotel/vn/x.html', snippet: '' },
      { title: 'c', link: 'https://vn.trip.com.evil.example/hotels/detail/?hotelId=2', snippet: '' },
      { title: 'd', link: 'https://vn.trip.com/hotels/detail/?hotelId=3', snippet: '' },
      { title: 'e', link: 'https://vn.trip.com/hotels/detail/?hotelId=4', snippet: '' },
    ])
    const hints = await discoverCommerceHints('travel', 'book_hotel', [{ id: 'r0', subject: 'Mường Thanh', locality: 'Đà Nẵng' }], { search })
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toBe('"Mường Thanh" Đà Nẵng site:vn.trip.com/hotels')
    // Up to four per provider (14 Sep 2026), owned hosts only, in result order.
    expect(hints.map(h => h.url)).toEqual(['https://vn.trip.com/hotels/da-nang-hotel-detail-1/x/', 'https://vn.trip.com/hotels/detail/?hotelId=3', 'https://vn.trip.com/hotels/detail/?hotelId=4'])
    expect(hints.every(h => h.providerId === 'tripcom' && h.subjectId === 'r0')).toBe(true)
  })

  it('skips the search for a subject whose known URLs already include the provider', async () => {
    const search = vi.fn(async (_q: string) => [])
    const hints = await discoverCommerceHints('shopping', 'buy_product', [
      { id: 'a', subject: 'Tủ lạnh', knownUrls: ['https://www.dienmayxanh.com/tu-lanh/x'] },
      { id: 'b', subject: 'Máy giặt', knownUrls: ['https://shopee.vn/x'] },
    ], { search })
    // Query groups per subject (14 Sep 2026): each marketplace alone, retailers paired; the scope a subject
    // already owns is left out. The default budget (3) is spent on the first subject's groups.
    expect(search).toHaveBeenCalledTimes(3)
    const qs = search.mock.calls.map(c => c[0])
    expect(qs.every(q => q.includes('Tủ lạnh'))).toBe(true) // marketplace groups are unquoted, the retailer pair quoted
    expect(qs.some(q => q.includes('site:dienmayxanh.com'))).toBe(false)
    expect(qs.some(q => q.includes('site:shopee.vn'))).toBe(true)
    expect(qs.some(q => q.includes('site:shop.tiktok.com/vn'))).toBe(true)
    expect(hints).toEqual([])
  })

  it('never exceeds the per-turn budget, and a throwing search yields no hint rather than an error', async () => {
    const search = vi.fn(async (_q: string) => { throw new Error('boom') })
    const subjects = Array.from({ length: 10 }, (_, i) => ({ id: String(i), subject: `Hotel ${i}` }))
    const hints = await discoverCommerceHints('travel', 'book_hotel', subjects, { search, scopes: hotelScopes() })
    expect(search).toHaveBeenCalledTimes(MAX_QUERIES_PER_TURN)
    expect(hints).toEqual([])
  })

  it('ignores blank subjects and quotes away characters that would break the query', async () => {
    const search = vi.fn(async (_q: string) => [])
    await discoverCommerceHints('travel', 'book_hotel', [{ id: 'x', subject: '   ' }, { id: 'y', subject: 'A "quoted"\nname' }], { search })
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toBe('"A  quoted  name" site:vn.trip.com/hotels')
  })
})
