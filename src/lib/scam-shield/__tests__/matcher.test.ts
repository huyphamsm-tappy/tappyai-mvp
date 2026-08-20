import { describe, it, expect } from 'vitest'
import { findMatchingBrand } from '../directory/matcher'
import type { OfficialEntity } from '../types'

const directory: OfficialEntity[] = [
  { id: 'vcb', brand: 'Vietcombank', category: 'bank', domains: ['vietcombank.com.vn'], website: 'https://vietcombank.com.vn', hotline: '1900 545413' },
  { id: 'momo', brand: 'MoMo', category: 'ewallet', domains: ['momo.vn'], website: 'https://momo.vn', hotline: '1900 5454 41' },
  { id: 'shopee', brand: 'Shopee', category: 'ecommerce', domains: ['shopee.vn'], website: 'https://shopee.vn', hotline: '1900 1221' },
  { id: 'acb', brand: 'ACB', category: 'bank', domains: ['acb.com.vn'], website: 'https://acb.com.vn' },
]

describe('findMatchingBrand', () => {
  it('matches exact domain', () => {
    const result = findMatchingBrand('vietcombank.com.vn', directory)
    expect(result?.id).toBe('vcb')
  })

  it('matches domain case-insensitively', () => {
    const result = findMatchingBrand('VIETCOMBANK.COM.VN', directory)
    expect(result?.id).toBe('vcb')
  })

  it('matches brand substring in domain (slug >= 4 chars)', () => {
    const result = findMatchingBrand('vietcombank-fake.com', directory)
    expect(result?.id).toBe('vcb')
  })

  it('matches shopee substring', () => {
    const result = findMatchingBrand('shopee-deals.vn', directory)
    expect(result?.id).toBe('shopee')
  })

  it('matches a 3-letter brand when it stands as a whole token', () => {
    // ⚠️ CHANGED IN B01, and the change is the fix rather than an accommodation to it.
    //
    // This case previously asserted `acb-phishing.com` → null, under the heading "does NOT match
    // short brand slugs (< 4 chars)". The old matcher required a slug of 4+ characters for its
    // substring rule, so ACB — and equally VIB, SHB, MSB — could not be detected as impersonated
    // at ALL, and this test pinned that hole in place as though it were the specification.
    //
    // The length rule existed for a real reason: a bare 3-character substring match would flag
    // `beacba.com`. `classifyBrand` keeps that protection by requiring a short brand to appear as
    // a COMPLETE token rather than any substring — so `acb-phishing.com` is caught and
    // `beacba.com` still is not, which is asserted directly below.
    const result = findMatchingBrand('acb-phishing.com', directory)
    expect(result?.id).toBe('acb')
  })

  it('still does NOT match a short brand buried inside a longer token', () => {
    expect(findMatchingBrand('beacba.com', directory)).toBeNull()
  })

  it('does NOT match MoMo substring (slug "momo" = 4 chars)', () => {
    const result = findMatchingBrand('momo-scam.xyz', directory)
    expect(result?.id).toBe('momo')
  })

  it('returns null for unknown domain', () => {
    const result = findMatchingBrand('unknown-site.com', directory)
    expect(result).toBeNull()
  })

  it('prefers exact match over substring match', () => {
    const result = findMatchingBrand('shopee.vn', directory)
    expect(result?.id).toBe('shopee')
  })

  it('returns null for empty directory', () => {
    const result = findMatchingBrand('shopee.vn', [])
    expect(result).toBeNull()
  })
})
