// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { injectPlaceEnrichment, applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

const IMG = 'https://img.test'
// index of the Nth (1-based) occurrence of `sub` in `s`
const idx = (s: string, sub: string) => s.indexOf(sub)
const count = (s: string, sub: string) => s.split(sub).length - 1

const TEXT_3 = [
  'Đây là 3 quán phở ngon ở Hà Nội:',
  '',
  '**1. Phở Gà Huyền Hương**',
  '4.7⭐ — phở gà thanh ngọt.',
  '',
  '**2. Phở Bát Đàn**',
  'Phở bò truyền thống, xếp hàng tự phục vụ.',
  '',
  '**3. Phở Thìn Lò Đúc**',
  'Phở tái lăn đậm đà.',
].join('\n')

describe('injectPlaceEnrichment — position-aware grouping', () => {
  it('puts each place\'s photo AFTER its own name and BEFORE the next place (multiple places)', () => {
    const places = [
      { name: 'Phở Gà Huyền Hương', photo_url: `${IMG}/ga.jpg` },
      { name: 'Phở Bát Đàn', photo_url: `${IMG}/bd.jpg` },
      { name: 'Phở Thìn Lò Đúc', photo_url: `${IMG}/thin.jpg` },
    ]
    const out = injectPlaceEnrichment(places, TEXT_3)
    // ga.jpg sits between place 1 and place 2
    expect(idx(out, 'ga.jpg')).toBeGreaterThan(idx(out, 'Phở Gà Huyền Hương'))
    expect(idx(out, 'ga.jpg')).toBeLessThan(idx(out, 'Phở Bát Đàn'))
    // bd.jpg between place 2 and place 3
    expect(idx(out, 'bd.jpg')).toBeGreaterThan(idx(out, 'Phở Bát Đàn'))
    expect(idx(out, 'bd.jpg')).toBeLessThan(idx(out, 'Phở Thìn Lò Đúc'))
    // thin.jpg after place 3 (last place → toward the end)
    expect(idx(out, 'thin.jpg')).toBeGreaterThan(idx(out, 'Phở Thìn Lò Đúc'))
    // headers never split
    expect(out).toContain('**2. Phở Bát Đàn**')
    expect(out).toContain('**3. Phở Thìn Lò Đúc**')
  })

  it('emits a place\'s multiple photos as CONSECUTIVE image lines (carousel input)', () => {
    const places = [
      { name: 'Phở Gà Huyền Hương', photo_url: `${IMG}/ga.jpg` },
      { name: 'Phở Bát Đàn', photo_urls: [`${IMG}/bd1.jpg`, `${IMG}/bd2.jpg`, `${IMG}/bd3.jpg`] },
      { name: 'Phở Thìn Lò Đúc', photo_url: `${IMG}/thin.jpg` },
    ]
    const out = injectPlaceEnrichment(places, TEXT_3)
    const carousel = `![Ảnh địa điểm](${IMG}/bd1.jpg)\n![Ảnh địa điểm](${IMG}/bd2.jpg)\n![Ảnh địa điểm](${IMG}/bd3.jpg)`
    expect(out).toContain(carousel)
    // all three still inside place 2's window
    expect(idx(out, 'bd3.jpg')).toBeLessThan(idx(out, 'Phở Thìn Lò Đúc'))
  })

  it('injects a MISSING review (TikTok) link right after its place', () => {
    const places = [
      { name: 'Phở Gà Huyền Hương', photo_url: `${IMG}/ga.jpg` },
      { name: 'Phở Thìn Lò Đúc', tiktok_url: 'https://www.tiktok.com/@phothin' },
    ]
    const text = [
      '**1. Phở Gà Huyền Hương**', 'ngon.', '', '**2. Phở Thìn Lò Đúc**', 'đậm đà.',
    ].join('\n')
    const out = injectPlaceEnrichment(places, text)
    expect(out).toContain('🎵 [Xem review TikTok](https://www.tiktok.com/@phothin)')
    expect(idx(out, 'tiktok.com/@phothin')).toBeGreaterThan(idx(out, 'Phở Thìn Lò Đúc'))
  })

  it('matches places by diacritic-insensitive name (tool "Pho Ga", text "Phở Gà")', () => {
    const places = [{ name: 'Pho Ga Huyen Huong', photo_url: `${IMG}/ga.jpg` }]
    const text = '**Phở Gà Huyền Hương**\n4.7⭐ quán ngon.'
    const out = injectPlaceEnrichment(places, text)
    expect(out).toContain(`![Ảnh địa điểm](${IMG}/ga.jpg)`)
    expect(idx(out, 'ga.jpg')).toBeGreaterThan(idx(out, 'Phở Gà Huyền Hương'))
  })

  it('does NOT duplicate a photo the text already shows inline', () => {
    const places = [{ name: 'Phở Gà Huyền Hương', photo_url: `${IMG}/ga.jpg` }]
    const text = `**Phở Gà Huyền Hương**\n![Ảnh](${IMG}/ga.jpg)\nngon.`
    const out = injectPlaceEnrichment(places, text)
    expect(count(out, 'ga.jpg')).toBe(1)
  })

  it('does NOT duplicate an order link whose domain is already near the place', () => {
    const places = [{
      name: 'Phở Gà Huyền Hương',
      photo_url: `${IMG}/ga.jpg`,
      order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/search?q=pho-ga' }],
    }]
    const text = '**Phở Gà Huyền Hương**\n[ShopeeFood](https://shopeefood.vn/search?q=pho-ga)\nngon.'
    const out = injectPlaceEnrichment(places, text)
    expect(count(out, 'shopeefood.vn')).toBe(1) // link not re-added
    expect(out).toContain(`![Ảnh địa điểm](${IMG}/ga.jpg)`) // photo still injected
  })

  it('injects a MISSING photo when the text omitted it', () => {
    const places = [{ name: 'Phở Bát Đàn', photo_url: `${IMG}/bd.jpg` }]
    const text = '**Phở Bát Đàn**\nPhở bò truyền thống.'
    const out = injectPlaceEnrichment(places, text)
    expect(out).toContain(`![Ảnh địa điểm](${IMG}/bd.jpg)`)
  })

  it('inserts a last place\'s photos BEFORE a trailing CTA_BUTTONS block', () => {
    const places = [{ name: 'Phở Thìn Lò Đúc', photo_url: `${IMG}/thin.jpg` }]
    const text = '**Phở Thìn Lò Đúc**\nđậm đà.\n\n[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]'
    const out = injectPlaceEnrichment(places, text)
    expect(idx(out, 'thin.jpg')).toBeLessThan(idx(out, '[CTA_BUTTONS]'))
    expect(idx(out, 'thin.jpg')).toBeGreaterThan(idx(out, 'Phở Thìn Lò Đúc'))
  })

  it('returns the text unchanged when there are no usable places', () => {
    expect(injectPlaceEnrichment([], 'xin chào')).toBe('xin chào')
    expect(injectPlaceEnrichment([{ name: 'X' }], 'không có ảnh')).toBe('không có ảnh')
  })
})

describe('applyPlaceEnrichmentStreamFilter — stream transform', () => {
  const line0 = (s: string) => '0:' + JSON.stringify(s)

  async function runFilter(inputLines: string[]): Promise<string> {
    const input = inputLines.join('\n') + '\n'
    const filtered = applyPlaceEnrichmentStreamFilter(new Response(input))
    return await new Response(filtered.body).text()
  }

  it('streams pre-tool intro live, then re-emits the buffered place text with the photo grouped', async () => {
    const place = { name: 'Phở Gà', photo_url: `${IMG}/ga.jpg` }
    const out = await runFilter([
      'f:{"messageId":"m1"}',
      line0('Mình tìm nhé. '),
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      `a:{"toolCallId":"t1","result":{"results":[${JSON.stringify(place)}]}}`,
      line0('**Phở Gà**\n4.7 sao ngon.'),
      'd:{"finishReason":"stop"}',
    ])
    // intro streamed live, BEFORE the tool-call line
    expect(out).toContain('Mình tìm nhé. ')
    expect(out.indexOf('Mình tìm nhé. ')).toBeLessThan(out.indexOf('9:'))
    // photo injected into the buffered place text, after the place name
    expect(out).toContain('ga.jpg')
    expect(out.indexOf('Phở Gà')).toBeLessThan(out.lastIndexOf('ga.jpg'))
    // finish frame preserved
    expect(out).toContain('d:{"finishReason":"stop"}')
  })

  it('passes plain chitchat through unchanged (no place tool → no buffering)', async () => {
    const out = await runFilter([line0('Chào bạn! '), line0('Mình là Tappy.'), 'd:{"finishReason":"stop"}'])
    expect(out).toContain(line0('Chào bạn! '))
    expect(out).toContain(line0('Mình là Tappy.'))
    expect(out).not.toContain('Ảnh địa điểm')
  })
})
