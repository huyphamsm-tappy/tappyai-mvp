import { describe, it, expect } from 'vitest'
import { buildShoppingLinks, withoutMerchantNames } from './shopping'

// 30/10 localhost: the model searched "iPhone 15 256GB Điện Máy Xanh giá mua" and the Shopee / Lazada buttons
// searched for that whole phrase - a merchant's own name in a search on ANOTHER merchant finds nothing useful.

describe('merchant names are not part of a product search on a marketplace', () => {
  it('removes a registry merchant name (and its spellings) from the query', () => {
    expect(withoutMerchantNames('iPhone 15 256GB Điện Máy Xanh')).toBe('iPhone 15 256GB')
    expect(withoutMerchantNames('Shopee nồi chiên Philips 6 lít')).toBe('nồi chiên Philips 6 lít')
    expect(withoutMerchantNames('máy lạnh Daikin dienmayxanh')).toBe('máy lạnh Daikin')
  })
  it('leaves a query with no merchant name untouched, and never empties it', () => {
    expect(withoutMerchantNames('nồi chiên Philips 6 lít')).toBe('nồi chiên Philips 6 lít')
    expect(withoutMerchantNames('Shopee')).toBe('Shopee')
  })
  it('does not cut a word that merely contains a merchant name', () => {
    expect(withoutMerchantNames('Lazadaxyz phone case')).toBe('Lazadaxyz phone case')
  })
  it('the marketplace links carry the cleaned query', () => {
    const links = buildShoppingLinks('iPhone 15 256GB Điện Máy Xanh')
    expect(links.length).toBeGreaterThan(0)
    for (const l of links) {
      expect(decodeURIComponent(l.url)).toContain('iPhone 15 256GB')
      expect(decodeURIComponent(l.url)).not.toMatch(/Điện Máy Xanh/i)
    }
  })
})
