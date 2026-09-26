import { describe, it, expect } from 'vitest'
import { sellerPlatform } from './sellerPlatform'

describe('sellerPlatform — free-text seller → fixed enum', () => {
  it('buckets the known marketplaces case-insensitively', () => {
    expect(sellerPlatform('Shopee')).toBe('shopee')
    expect(sellerPlatform('shopee vietnam')).toBe('shopee')
    expect(sellerPlatform('Lazada')).toBe('lazada')
    expect(sellerPlatform('Tiki')).toBe('tiki')
    expect(sellerPlatform('Tiki Trading')).toBe('tiki')
    expect(sellerPlatform('TikTok Shop')).toBe('tiktok')
    expect(sellerPlatform('tiktok')).toBe('tiktok')
  })

  it('TikTok is not mis-bucketed as tiki', () => {
    expect(sellerPlatform('TikTok Shop')).not.toBe('tiki')
  })

  it('everything else — and empty/null — is "other" (never the raw string)', () => {
    expect(sellerPlatform('CellphoneS')).toBe('other')
    expect(sellerPlatform('Điện Máy Xanh')).toBe('other')
    expect(sellerPlatform('')).toBe('other')
    expect(sellerPlatform(null)).toBe('other')
    expect(sellerPlatform(undefined)).toBe('other')
  })
})
