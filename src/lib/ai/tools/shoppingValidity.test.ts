import { describe, it, expect } from 'vitest'
import { isValidShoppingResult, isRelevant, filterShoppingResults } from './shoppingValidity'

// ── Phase 1 — bad input must not become advice ──────────────────────────────
//
// Every INVALID fixture below is a VERBATIM title captured from production
// (bd89c5d) when `search_products("mac pro")` fell through to the organic path.
// The links are the plausible real hosts for each (organic rows carry a link).
// The VALID fixtures are realistic listings — a direct product URL, a priced
// row, a credible shop page without a parsed price.
//
// 🚨 Not tidied up. #172 shipped green because its fixtures were cleaner than
// production; these keep the real punctuation, the real "Tiki news" noise, and
// the real bare-URL row.

const Q = 'mac pro'

// ── the four measured junk classes ──────────────────────────────────────────
const TIKI_ARTICLE = { title: 'Từng là giấc mơ kỳ lân tỷ đô, Tiki giờ được định giá chỉ bằng…', link: 'https://cafef.vn/tung-la-giac-mo-ky-lan.chn' }
const MASK_PROMO = { title: 'Lên LAZADA, SHOPEE, TIKI mua 100 Hộp khẩu trang Y Tế giá rẻ', link: 'https://vnexpress.net/lazada-shopee-tiki-khau-trang.html' }
const PANDEMIC_ARTICLE = { title: 'Mua hàng Tiki, Lazada, Shopee tăng cao mùa dịch', link: 'https://dantri.com.vn/mua-hang-tang-cao-mua-dich.htm' }
const GENERIC_SALE = { title: 'Lazada 8.8 Sale - App Store - Apple', link: 'https://apps.apple.com/vn/app/lazada' }
const BARE_URL = { title: 'https://s.shopee.vn/8V1PKuAXsn', link: 'https://s.shopee.vn/8V1PKuAXsn' }
const DISCOUNT_ARTICLE = { title: 'Chơi Mã giảm giá Shopee Lazada Tiki trên PC và Mac', link: 'https://blogspot.com/ma-giam-gia.html' }

// ── category / search pages (on-topic words, but not a specific product) ─────
const CATEGORY_SHOPEE = { title: 'Mua Mac Pro Pc Giá Tốt, Giao Nhanh', link: 'https://shopee.vn/search?keyword=mac%20pro' }
const CATEGORY_TIKI = { title: 'macbook pro giá tốt Tháng 8, 2026 | Mua ngay', link: 'https://tiki.vn/search?q=macbook+pro' }

// ── genuine listings ─────────────────────────────────────────────────────────
const DIRECT_SHOPEE = { title: 'MacBook Pro 14 M1 Pro 16GB 512GB Chính Hãng', link: 'https://shopee.vn/macbook-pro-14-m1-pro-i.123456.789012' }
const PRICED_TIKI = { title: 'Laptop MacBook Pro M1 32GB 512GB 2021', link: 'https://tiki.vn/macbook-pro-m1-p123456789.html', price: '25.800.000₫' }
const SHOP_NO_PRICE = { title: 'MacBook Pro 14 inch M1 Pro 2021', link: 'https://cellphones.com.vn/macbook-pro-14-inch-m1-pro-2021.html' }

describe('isValidShoppingResult — the four measured junk classes are rejected', () => {
  it('1. a Tiki news article is not a listing', () => {
    expect(isValidShoppingResult(Q, TIKI_ARTICLE)).toBe(false)
  })
  it('2. a mask/accessory promo is not a MacBook listing', () => {
    expect(isValidShoppingResult(Q, MASK_PROMO)).toBe(false)
  })
  it('3. a generic pandemic-shopping article is rejected', () => {
    expect(isValidShoppingResult(Q, PANDEMIC_ARTICLE)).toBe(false)
  })
  it('4. a generic sale / app page is rejected', () => {
    expect(isValidShoppingResult(Q, GENERIC_SALE)).toBe(false)
  })
  it('5. a bare URL as the title is not a listing', () => {
    expect(isValidShoppingResult(Q, BARE_URL)).toBe(false)
  })
  it('6. a discount-code article (mentions "Mac") on a blog host is rejected', () => {
    // The residual edge: the title contains the word "Mac", so relevance alone
    // cannot drop it — the non-commerce host check is what does.
    expect(isValidShoppingResult(Q, DISCOUNT_ARTICLE)).toBe(false)
  })
})

describe('isValidShoppingResult — category/search pages are rejected', () => {
  it('7. a Shopee search page is not a specific product', () => {
    expect(isValidShoppingResult(Q, CATEGORY_SHOPEE)).toBe(false)
  })
  it('8. a Tiki search page is not a specific product', () => {
    expect(isValidShoppingResult(Q, CATEGORY_TIKI)).toBe(false)
  })
})

describe('isValidShoppingResult — genuine listings survive', () => {
  it('9. a direct Shopee product URL survives', () => {
    expect(isValidShoppingResult(Q, DIRECT_SHOPEE)).toBe(true)
  })
  it('10. a priced Tiki product survives', () => {
    expect(isValidShoppingResult(Q, PRICED_TIKI)).toBe(true)
  })
  it('11. a credible shop page WITHOUT a parsed price still survives (price is not required)', () => {
    expect(isValidShoppingResult(Q, SHOP_NO_PRICE)).toBe(true)
  })
  it('survives for the specific MacBook query too — "mac" matches "macbook"', () => {
    const q2 = 'MacBook Pro 14 M1 32GB 512GB'
    expect(isValidShoppingResult(q2, DIRECT_SHOPEE)).toBe(true)
    expect(isValidShoppingResult(q2, PRICED_TIKI)).toBe(true)
  })
})

describe('isRelevant — the token bar', () => {
  it('"mac" matches "macbook" (title starts with query token)', () => {
    expect(isRelevant('mac pro', 'MacBook Pro 14 M1')).toBe(true)
  })
  it('the noise word "Mã" does not satisfy "mac"', () => {
    // Only title-startsWith-query counts, never the reverse, so "ma" ≠ "mac".
    expect(isRelevant('mac pro', 'Mã giảm giá Shopee Lazada Tiki')).toBe(false) // "Mã" → "ma", no standalone "Mac"
    expect(isRelevant('mac pro', 'Chơi Mã giảm giá trên PC và Mac')).toBe(true) // has standalone "Mac"
  })
  it('a mask promo shares no product token with "mac pro"', () => {
    expect(isRelevant('mac pro', 'mua 100 Hộp khẩu trang Y Tế giá rẻ')).toBe(false)
  })
  it('an all-stopword query does not veto (host/path checks still apply)', () => {
    expect(isRelevant('giá tốt', 'bất kỳ tiêu đề nào')).toBe(true)
  })
})

// ── the pipeline behaviour the route depends on ─────────────────────────────

describe('filterShoppingResults — the mixed real-production batch', () => {
  it('9. empty /shopping + all-bad organic → nothing survives (route then tells the truth)', () => {
    const badBatch = [TIKI_ARTICLE, MASK_PROMO, PANDEMIC_ARTICLE, GENERIC_SALE, BARE_URL, DISCOUNT_ARTICLE]
    expect(filterShoppingResults(Q, badBatch)).toEqual([])
  })

  it('10. empty /shopping + a valid organic listing → that listing survives', () => {
    expect(filterShoppingResults(Q, [SHOP_NO_PRICE])).toEqual([SHOP_NO_PRICE])
  })

  it('8. mixed valid + invalid → only the valid listings remain, order preserved', () => {
    const mixed = [TIKI_ARTICLE, DIRECT_SHOPEE, MASK_PROMO, PRICED_TIKI, CATEGORY_SHOPEE, SHOP_NO_PRICE, BARE_URL]
    expect(filterShoppingResults(Q, mixed)).toEqual([DIRECT_SHOPEE, PRICED_TIKI, SHOP_NO_PRICE])
  })

  it('handles null/undefined without throwing', () => {
    expect(filterShoppingResults(Q, null)).toEqual([])
    expect(filterShoppingResults(Q, undefined)).toEqual([])
    expect(filterShoppingResults(Q, [])).toEqual([])
  })

  it('the exact production "mac pro" organic batch collapses to empty', () => {
    // This is the whole point: the batch that shipped as 6 cards must yield 0.
    const production = [
      { title: 'Từng là giấc mơ kỳ lân tỷ đô, Tiki giờ được định giá chỉ bằng…', link: 'https://cafef.vn/x.chn' },
      { title: 'Lên LAZADA, SHOPEE, TIKI mua 100 Hộp khẩu trang Y Tế…', link: 'https://vnexpress.net/x.html' },
      { title: 'Mua hàng Tiki, Lazada, Shopee tăng cao mùa dịch', link: 'https://dantri.com.vn/x.htm' },
      { title: 'Chơi Mã giảm giá Shopee Lazada Tiki trên PC và Mac', link: 'https://blogspot.com/x.html' },
      { title: 'https://s.shopee.vn/8V1PKuAXsn', link: 'https://s.shopee.vn/8V1PKuAXsn' },
      { title: 'Lazada 8.8 Sale - App Store - Apple', link: 'https://apps.apple.com/vn/app/lazada' },
    ]
    expect(filterShoppingResults('mac pro', production)).toEqual([])
  })
})
