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

  it('does NOT match short brand slugs (< 4 chars)', () => {
    const result = findMatchingBrand('acb-phishing.com', directory)
    expect(result).toBeNull()
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
