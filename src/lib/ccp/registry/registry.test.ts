import { describe, it, expect } from 'vitest'
import { PROVIDER_REGISTRY, getProvider, isAllowedHost, providersFor, validateRegistry } from './index'
import { MVP_ADAPTERS } from '../adapters'
import { validateWeights } from '../ranking/weights'

describe('provider registry', () => {
  it('is structurally valid (every entry has a dated, evidenced depth profile per intent)', () => {
    expect(validateRegistry()).toEqual([])
  })

  it('contains exactly the five MVP adapters (owner decision D10) and they agree with the adapter list', () => {
    const mvp = PROVIDER_REGISTRY.filter(p => p.tier === 'mvp').map(p => p.providerId).sort()
    expect(mvp).toEqual(['cgv', 'dmx', 'klook', 'pasgo', 'tripcom'])
    expect(MVP_ADAPTERS.map(a => a.providerId).sort()).toEqual(mvp)
  })

  it('transcribes the audited depth profiles verbatim', () => {
    expect(getProvider('dmx')!.depth.buy_product).toMatchObject({ guestDepth: 5, authenticatedDepth: 5, authRequiredAt: 'at_order' })
    expect(getProvider('tripcom')!.depth.book_hotel).toMatchObject({ guestDepth: 5, authRequiredAt: 'none' })
    expect(getProvider('pasgo')!.depth.reserve_table).toMatchObject({ guestDepth: 5, authRequiredAt: 'none' })
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
