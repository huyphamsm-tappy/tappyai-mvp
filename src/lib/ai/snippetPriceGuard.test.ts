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

// F-094 (owner 2026-09-25): v1 removes the WHOLE sentence. Golden post-egress-f086 T1 t3 showed the
// clause cut leaving "**Tổng ước tính, mua sắm, hoặc nâng cấp." — a headless, unclosed-bold fragment.
describe('F-094 — v1 removes the whole sentence, never a clipped fragment', () => {
  const user = 'Mình đi Đà Nẵng 2 ngày 1 đêm, 2 người, ngân sách 20 triệu'
  it('the golden T1 t3 sentence goes whole; the next sentence is untouched', () => {
    const text = 'Khách sạn sát biển Mỹ Khê. **Tổng ước tính: ~8.500.000 VND** cho 2 người, còn dư khoảng 11.500.000 VND cho ăn uống, mua sắm, hoặc nâng cấp. Chúc bạn vui!'
    const out = guardSnippetPricesInText(text, [], user)
    expect(out.text).toBe('Khách sạn sát biển Mỹ Khê. Chúc bạn vui!')
  })
  it('the user budget restated as a total (F-086) also goes whole', () => {
    const out = guardSnippetPricesInText('**Tổng ước tính: khoảng 20 triệu cho 2 người**, đã gồm vé máy bay, khách sạn. Chúc bạn vui!', [], user)
    expect(out.text).toBe('Chúc bạn vui!')
  })
  it('a traceable price and the budget named as a budget are still kept', () => {
    const out = guardSnippetPricesInText('Phở ở đây khoảng 50.000đ/tô. Với ngân sách 20 triệu, bạn thoải mái.', [50000], user)
    expect(out.text).toBe('Phở ở đây khoảng 50.000đ/tô. Với ngân sách 20 triệu, bạn thoải mái.')
  })
})

// F-094, measured on golden post-f094b T3 t2 with the pre-guard capture: whole-sentence removal
// deleted the pick's own list line and left a stray " 🤔".
describe('F-094 — list lines keep their item; nothing non-prose is left behind', () => {
  const user = 'chọn quán rẻ tiền thôi, 50-60k thôi'
  it('a list line keeps the place and loses only the amount clause', () => {
    const text = 'Có 2 quán:\n\n• **Cơm Ngon Hà Nội** (4.9⭐, 283 đánh giá) - khoảng giá lên tới 100k\n• **Hàng Dương Quán** (4.5⭐, 721 đánh giá) - chưa xác nhận giá\n\nBạn chọn quán nào?'
    const out = guardSnippetPricesInText(text, [], user).text
    expect(out).toContain('• **Cơm Ngon Hà Nội** (4.9⭐, 283 đánh giá)')
    expect(out).not.toContain('100k')
    expect(out).toContain('• **Hàng Dương Quán**')
  })
  it('the emoji after a removed question goes with it', () => {
    const out = guardSnippetPricesInText('Không có quán nào đủ rẻ. Bạn có muốn nâng ngân sách lên khoảng 70-80k không? 🤔\n\nMình chờ bạn nhé.', [], user).text
    expect(out).toBe('Không có quán nào đủ rẻ.\n\nMình chờ bạn nhé.')
  })
})
