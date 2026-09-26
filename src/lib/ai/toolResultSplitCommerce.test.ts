import { describe, it, expect } from 'vitest'
import { splitToolResult, ENRICHMENT_KEYS } from './toolResultSplit'
import { COMMERCE_LINKS_KEY } from '@/lib/ccp'

// ── The model never sees a Commerce Link; it sees `has_direct_handoff` ───────

const LINK = {
  linkId: 'a'.repeat(24), requestId: '550e8400-e29b-41d4-a716-446655440000',
  url: 'https://vn.trip.com/hotels/detail/?hotelId=10569789&checkIn=2026-10-10&checkOut=2026-10-12&adult=2',
  destinationUrl: 'https://vn.trip.com/hotels/detail/?hotelId=10569789&checkIn=2026-10-10&checkOut=2026-10-12&adult=2',
  kind: 'DIRECT_DEEP_LINK', providerId: 'tripcom', merchantName: 'Trip.com', domain: 'travel', intentType: 'book_hotel',
  depth: 4, guestDepth: 5, authRequiredAt: 'none', expiresAt: null,
  freshness: { source: 'registry:tripcom', retrievedAt: '2026-09-13T08:00:00.000Z', expiresAt: null, freshnessType: 'static', confidence: 1 },
  assumedParams: ['adults'], limitations: ['Chọn phòng trên trang.'], tracked: false,
}

describe('commerce_links is a carved key', () => {
  it('is listed in ENRICHMENT_KEYS', () => {
    expect([...ENRICHMENT_KEYS]).toContain(COMMERCE_LINKS_KEY)
  })

  it('search_results rows: the URL, the merchant name and the limitation prose leave the model payload; the capability arrives', () => {
    const result = { search_results: [{ title: 'Mường Thanh - Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/x.html', [COMMERCE_LINKS_KEY]: [LINK] }] }
    const { model, enrichment } = splitToolResult('get_hotel_prices', result)
    const s = JSON.stringify(model)
    expect(s).not.toContain('commerce_links')
    expect(s).not.toContain('vn.trip.com')
    expect(s).not.toContain('Trip.com')
    expect(s).not.toContain('Chọn phòng')
    expect(s).toContain('"has_direct_handoff":true')
    // The carved side keeps it for the server-owned channels.
    expect(enrichment[0].commerce_links).toEqual([LINK])
  })

  it('search_places rows behave the same, and a row without links gets no capability', () => {
    const result = { results: [{ name: 'Quá Ngon', [COMMERCE_LINKS_KEY]: [LINK] }, { name: 'Khác' }], source: 'Google Maps' }
    const { model } = splitToolResult('search_places', result)
    const rows = (model as { results: Record<string, unknown>[] }).results
    expect(rows[0].has_direct_handoff).toBe(true)
    expect(rows[0].commerce_links).toBeUndefined()
    expect(rows[1].has_direct_handoff).toBeUndefined()
  })
})
