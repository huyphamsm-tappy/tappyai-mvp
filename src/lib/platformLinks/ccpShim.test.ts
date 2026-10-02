import { describe, it, expect } from 'vitest'
import { commerceOwnedHosts, isCommerceOwnedLink, withoutCommerceOwnedLinks, commercePlatformLinks } from './ccpShim'
import { buildTravelLinks } from './travel'
import { buildShoppingLinks } from './shopping'
import { buildFoodOrderLinks } from './food'

// ── Legacy platformLinks ↔ CCP compatibility shim ────────────────────────────

describe('ownership comes from the CCP registry', () => {
  it('the five MVP merchants are owned; handoff-only and legacy platforms are not', () => {
    expect(commerceOwnedHosts()).toEqual(expect.arrayContaining(['www.dienmayxanh.com', 'vn.trip.com', 'www.cgv.vn', 'www.klook.com']))
    expect(isCommerceOwnedLink('https://vn.trip.com/hotels/detail/?hotelId=1')).toBe(true)
    // Booking.com is adapter-backed since the Completion Pass (14 Sep 2026): its registry results
    // grammar stays a legacy projection; a property page is a Commerce Link and is owned.
    expect(isCommerceOwnedLink('https://www.booking.com/searchresults.vi.html?ss=x')).toBe(false)
    expect(isCommerceOwnedLink('https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html')).toBe(true)
    expect(isCommerceOwnedLink('https://www.agoda.com/vi-vn/')).toBe(false)
    expect(isCommerceOwnedLink('https://shopee.vn/search?keyword=x')).toBe(false)
    expect(isCommerceOwnedLink('https://vn.trip.com.evil.example/')).toBe(false)
  })
})

describe('withoutCommerceOwnedLinks', () => {
  it('leaves every legacy builder output untouched (they own no CCP merchant)', () => {
    for (const links of [buildTravelLinks('Khách sạn A', 'Đà Nẵng'), buildShoppingLinks('áo thun'), buildFoodOrderLinks('Quán A', '1 Lê Lợi', 'Quận 1')]) {
      expect(withoutCommerceOwnedLinks(links)).toEqual(links)
    }
  })
  it('would strip a legacy entry that reached into the platform, preserving order', () => {
    const mixed = [{ name: 'Booking.com', url: 'https://www.booking.com/x' }, { name: 'Maps', url: 'https://www.google.com/maps/x' }, { name: 'Trip.com', url: 'https://vn.trip.com/x' }, { name: 'Agoda', url: 'https://www.agoda.com/x' }, { name: 'Grab', url: 'https://www.grab.com/vn/' }]
    expect(withoutCommerceOwnedLinks(mixed).map(l => l.name)).toEqual(['Maps', 'Grab'])
  })
})

describe('commercePlatformLinks', () => {
  it('projects valid row attachments into the legacy {name,url} shape and ignores junk', () => {
    const row = {
      linkId: 'a'.repeat(24), requestId: 'r', url: 'https://vn.trip.com/hotels/detail/?hotelId=1', destinationUrl: 'https://vn.trip.com/hotels/detail/?hotelId=1',
      kind: 'DETAIL_HANDOFF', providerId: 'tripcom', merchantName: 'Trip.com', domain: 'travel', intentType: 'book_hotel', depth: 3, guestDepth: 5,
      authRequiredAt: 'none', expiresAt: null, freshness: { source: 's', retrievedAt: 't', expiresAt: null, freshnessType: 'static', confidence: 1 },
      assumedParams: [], limitations: [], tracked: false,
    }
    expect(commercePlatformLinks([row, null, {}, 'x'])).toEqual([{ name: 'Trip.com', url: 'https://vn.trip.com/hotels/detail/?hotelId=1' }])
    expect(commercePlatformLinks(undefined)).toEqual([])
  })
})
