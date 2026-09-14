import { describe, it, expect } from 'vitest'
import { PROVIDER_REGISTRY, getProvider, isAllowedHost, providersFor, validateRegistry } from './index'
import { ADAPTERS, MVP_ADAPTERS } from '../adapters'
import { validateWeights } from '../ranking/weights'

describe('provider registry', () => {
  it('is structurally valid (every entry has a dated, evidenced depth profile per intent)', () => {
    expect(validateRegistry()).toEqual([])
  })

  it('contains the five MVP adapters (D10) plus the three shopping marketplaces (14 Sep 2026), and they agree with the adapter list', () => {
    const mvp = PROVIDER_REGISTRY.filter(p => p.tier === 'mvp').map(p => p.providerId).sort()
    expect(mvp).toEqual(['cgv', 'dmx', 'klook', 'lazada', 'shopee', 'tiktokshop', 'tripcom'])
    expect(ADAPTERS.map(a => a.providerId).sort()).toEqual(mvp)
    expect(MVP_ADAPTERS.map(a => a.providerId).sort()).toEqual(['cgv', 'dmx', 'klook', 'tripcom'])
  })

  it('Shopee and TikTok Shop are first-class shopping providers with the verified boundaries (owner decision 14 Sep 2026)', () => {
    for (const id of ['shopee', 'tiktokshop']) {
      const p = getProvider(id)!
      expect(p.tier).toBe('mvp')
      expect(p.segment).toBe('marketplace')
      expect(p.domains).toEqual(['shopping'])
      expect(p.commerce).toEqual(['product_discovery', 'product_detail', 'product_purchase', 'commerce_handoff'])
    }
    // Web guests meet Shopee's login wall before the detail; TikTok Shop shows the detail and asks for the account at checkout.
    expect(getProvider('shopee')!.depth.buy_product).toMatchObject({ guestDepth: 2, authenticatedDepth: 5, authRequiredAt: 'before_selection' })
    expect(getProvider('tiktokshop')!.depth.buy_product).toMatchObject({ guestDepth: 3, authenticatedDepth: 5, authRequiredAt: 'before_checkout' })
    // Shopee marketplace and ShopeeFood are different providers with disjoint capabilities.
    const shopee = getProvider('shopee')!, shopeefood = getProvider('shopeefood')!
    expect(shopee.allowedHosts.some(h => shopeefood.allowedHosts.includes(h))).toBe(false)
    const transactional = (p: typeof shopee) => p.commerce.filter(c => c !== 'commerce_handoff')
    expect(transactional(shopee).some(c => transactional(shopeefood).includes(c))).toBe(false)
    // Affiliate is a monetisation layer, not a prerequisite: Shopee's campaign is pending and it is still a provider.
    expect(getProvider('shopee')!.tracking?.approval).toBe('pending')
    expect(getProvider('tiktokshop')!.tracking?.approval).toBe('approved')
  })

  it('transcribes the audited depth profiles verbatim', () => {
    expect(getProvider('dmx')!.depth.buy_product).toMatchObject({ guestDepth: 5, authenticatedDepth: 5, authRequiredAt: 'at_order' })
    expect(getProvider('tripcom')!.depth.book_hotel).toMatchObject({ guestDepth: 5, authRequiredAt: 'none' })
    // PasGo removed from active scope (owner decision 14 Sep 2026): no provider declares table_reservation.
    expect(getProvider('pasgo')).toBeNull()
    expect(getProvider('cgv')!.depth.buy_ticket).toMatchObject({ guestDepth: 4, authenticatedDepth: 5, authRequiredAt: 'before_selection' })
    expect(getProvider('klook')!.depth.book_activity).toMatchObject({ guestDepth: 4, authRequiredAt: 'before_checkout' })
    expect(getProvider('klook')!.depth.buy_spa_voucher).toMatchObject({ guestDepth: 4, authRequiredAt: 'before_checkout' })
    expect(getProvider('cellphones')!.depth.buy_product).toMatchObject({ guestDepth: 4, authRequiredAt: 'before_checkout' })
  })

  it('keeps ACCESSTRADE feed merchants link-only until written data rights (D7)', () => {
    for (const id of ['dmx', 'cellphones']) {
      const r = getProvider(id)!.rights
      expect(r.displayOk).toBe(false)
      expect(r.priceOk).toBe(false)
      expect(r.imageOk).toBe(false)
    }
  })

  it('marks the Product Link tool unsafe for Trip.com and allows only the deep_link wrapper (D4)', () => {
    const t = getProvider('tripcom')!.tracking!
    expect(t.safeWrapper).toBe('deep_link')
    expect(t.unsafeWrappers).toContain('product_link')
  })

  it('Booking.com can never enter a price comparison or carry coupons', () => {
    expect(getProvider('booking')!.rights.comparisonOk).toBe(false)
    expect(getProvider('booking')!.rights.couponOk).toBe(false)
  })

  it('host allow-list is exact match only', () => {
    const dmx = getProvider('dmx')!
    expect(isAllowedHost(dmx, 'www.dienmayxanh.com')).toBe(true)
    expect(isAllowedHost(dmx, 'evil.dienmayxanh.com')).toBe(false)
    expect(isAllowedHost(dmx, 'dienmayxanh.com.attacker.example')).toBe(false)
  })

  it('routes intents to providers', () => {
    expect(providersFor('spa', 'buy_spa_voucher').map(p => p.providerId)).toEqual(['klook'])
    expect(providersFor('travel', 'book_hotel').map(p => p.providerId).sort()).toEqual(['booking', 'tripcom'])
  })

  it('ranking weights are versioned, sum to 1 and cap monetisation at 0.05 (D3)', () => {
    expect(validateWeights()).toEqual([])
    expect(validateWeights({ intentExactness: 0.25, realtime: 0.15, freshness: 0.1, depth: 0.15, deepLinkPrecision: 0.1, reliability: 0.08, authFriction: 0.07, monetisation: 0.1 })).not.toEqual([])
  })
})
