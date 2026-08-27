import { describe, it, expect } from 'vitest'
import { guardSnippetPricesInText, pricesFromSnippets } from './snippetPriceGuard'

// A5 evidence boundary for Food/Spa snippet prices. The live audit found the model
// stating "~50.000 VND/tô" from a Serper snippet with no deterministic check. The
// rule: a stated price must TRACE to a price that actually appeared in a retrieved
// snippet; a number in no snippet is fabricated and removed. Pure function → exact
// input→output assertions.

describe('pricesFromSnippets — currency-mandatory extraction', () => {
  it('pulls VND amounts out of snippet text and ignores non-price digits', () => {
    const snips = ['Bún bò Huế 50.000đ - 60.000đ, hotline 0909123456', 'Tô đặc biệt khoảng 65k', 'Địa chỉ 123 Lê Lợi']
    const prices = pricesFromSnippets(snips)
    expect(prices).toContain(50000)
    expect(prices).toContain(60000)
    expect(prices).toContain(65000)
    expect(prices).not.toContain(123) // address number, no currency
    expect(prices).not.toContain(909123456) // phone, no currency
  })
})

describe('snippet price guard — a stated price must trace to a snippet', () => {
  const foodSnips = ['Bún bò Huế Đông Ba 50.000đ/tô, tô đặc biệt 65.000đ']
  const evidence = pricesFromSnippets(foodSnips) // [50000, 65000]

  it('1. a snippet-traceable menu price SURVIVES (framed as reference by the prompt)', () => {
    const out = guardSnippetPricesInText('Quán này tô thường khoảng 50.000đ, tô đặc biệt 65.000đ.', evidence, 'bún bò huế ngon')
    expect(out.text).toMatch(/50\.000|65\.000/)
    expect(out.redacted).toBe(0)
  })

  it('2. a FABRICATED price (in no snippet) is REMOVED', () => {
    const out = guardSnippetPricesInText('Ở đây tô bún bò tầm 120.000đ nhé.', evidence, 'bún bò huế ngon')
    expect(out.text).not.toMatch(/120\.000/)
    expect(out.redacted).toBeGreaterThan(0)
  })

  it('3. no price evidence at all ⇒ any stated price is removed (fail-closed)', () => {
    const out = guardSnippetPricesInText('Món này thường khoảng 45.000đ.', [], 'quán ăn ngon')
    expect(out.text).not.toMatch(/45\.000/)
  })

  it('4. a price the USER stated is never removed', () => {
    const out = guardSnippetPricesInText('Trong tầm 100k của bạn thì có nhiều lựa chọn.', [], 'quán ăn dưới 100k')
    expect(out.text).toMatch(/100k/)
    expect(out.redacted).toBe(0)
  })

  it('5. spa: traceable service price survives, fabricated removed', () => {
    const spa = pricesFromSnippets(['Massage body 90 phút 350.000đ tại Spa X'])
    const ok = guardSnippetPricesInText('Gói massage khoảng 350.000đ.', spa, 'spa massage')
    expect(ok.text).toMatch(/350\.000/)
    const bad = guardSnippetPricesInText('Gói cao cấp lên tới 900.000đ.', spa, 'spa massage')
    expect(bad.text).not.toMatch(/900\.000/)
  })

  it('7. a USD amount cannot trace to VND snippets ⇒ removed', () => {
    const out = guardSnippetPricesInText('About $5 a bowl.', evidence, 'bun bo hue')
    expect(out.text).not.toMatch(/\$5/)
  })

  it('is a no-op when the reply states no price at all', () => {
    const text = 'Quán Bún Bò Huế Đông Ba ở Quận 1 được đánh giá cao, không gian ấm cúng.'
    const out = guardSnippetPricesInText(text, evidence, 'x')
    expect(out.text).toBe(text)
    expect(out.redacted).toBe(0)
  })

  it('a partly-traceable range is judged as a unit (both ends must trace)', () => {
    // "50.000–90.000" — 50k traces, 90k does not ⇒ the whole range claim is unsupported.
    const out = guardSnippetPricesInText('Giá tầm 50.000–90.000đ.', evidence, 'x')
    expect(out.text).not.toMatch(/90\.000/)
  })
})
