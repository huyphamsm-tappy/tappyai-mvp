import { describe, it, expect } from 'vitest'
import { cleanListingTitle, discoverySubject, productIdentityMatch } from './productIdentity'

// ── Product identity & discovery subject (Shopping Marketplace Expansion, 14 Sep 2026) ──

describe('discoverySubject — the product core of a listing title', () => {
  it('drops category nouns, a leading "Apple" before an Apple line, bracket tags, seller suffixes and the colour/condition tail', () => {
    expect(discoverySubject('Điện thoại Apple iPhone 16 Pro Max 256GB Titan Đen')).toBe('iPhone 16 Pro Max 256GB')
    expect(discoverySubject('[Mới 100%] iPhone 16 Pro Max 256GB Quốc tế Mới Fullbox')).toBe('iPhone 16 Pro Max 256GB')
    expect(discoverySubject('iPhone 16 Pro - ChungBlackBerry', 'ChungBlackBerry')).toBe('iPhone 16 Pro')
    expect(discoverySubject('Apple iPhone 16 Pro 128GB')).toBe('iPhone 16 Pro 128GB')
    expect(discoverySubject('iPhone 16 Pro 128Gb | Chính hãng Apple (VNA/ZPA/ZAA/LLA...)')).toBe('iPhone 16 Pro 128Gb')
  })
  it('keeps a brand + model, and a title with no model token, intact', () => {
    expect(discoverySubject('Tai nghe Sony WH-1000XM5')).toBe('Sony WH-1000XM5')
    expect(discoverySubject('Tủ lạnh Samsung RT31 Inverter 300L')).toBe('Samsung RT31 Inverter 300L')
    expect(discoverySubject('Áo thun cotton nam')).toBe('Áo thun cotton nam')
  })
  it('cleanListingTitle removes only a trailing seller / shop segment', () => {
    expect(cleanListingTitle('iPhone 16 Pro - ChungBlackBerry', 'ChungBlackBerry')).toBe('iPhone 16 Pro')
    expect(cleanListingTitle('iPhone 16 Pro Max 256GB - Cũ Trầy Xước', 'CellphoneS')).toBe('iPhone 16 Pro Max 256GB - Cũ Trầy Xước')
    expect(cleanListingTitle('Tai nghe Sony | xoanstore.vn')).toBe('Tai nghe Sony')
  })
})

describe('productIdentityMatch', () => {
  it('accepts the same product across seller decorations and rejects other variants / accessories', () => {
    expect(productIdentityMatch('iPhone 16 Pro Max 256GB', 'iPhone 16 Pro Max 256GB Chính Hãng VN/A [ShopDunk Store]')).toBe('match')
    expect(productIdentityMatch('iPhone 16 Pro Max 256GB', 'Điện thoại iPhone 16 Pro 128GB - TikTok Shop Vietnam')).toBe('mismatch')
    expect(productIdentityMatch('iPhone 16 Pro Max 256GB', 'Điện thoại iPhone 15 Pro Max 256GB - TikTok Shop Vietnam')).toBe('mismatch')
    expect(productIdentityMatch('iPhone 16 Pro Max 256GB', '16 pro max 256gb natural - TikTok Shop Vietnam')).toBe('match')
    expect(productIdentityMatch('iPhone 16 Pro Max 256GB', '17 pro max 256gb ốp - TikTok Shop Vietnam')).toBe('mismatch')
    // Measured live 14 Sep 2026: a pendrive "for iPhone 15 Pro" carried every model token (title truncated before "Max").
    expect(productIdentityMatch('iPhone 15 Pro 128GB', '4 Trong 1 128GB USB Pendrive Ổ Đĩa Phát Sáng Cho iPhone 15 Pro ...')).toBe('mismatch')
    expect(productIdentityMatch('iPhone 15 Pro 128GB', 'Ốp lưng trong suốt dành cho iPhone 15 Pro 128GB')).toBe('mismatch')
    expect(productIdentityMatch('iPhone 15 Pro 128GB', 'Điện thoại Apple iPhone 15 Pro 128GB | Shopee Việt Nam')).toBe('match')
  })
})
