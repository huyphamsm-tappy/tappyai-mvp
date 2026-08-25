// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { stripProductImages } from './ChatInterface'
import { renderShoppingMarker, parseShoppingMarker } from '@/lib/ai/consultative/synthesisView'
import type { SynthesisView } from '@/lib/ai/consultative/synthesisView'

// ── Phase 9 — the DURABLE delivery: a text marker, parsed client-side ────────
//
// The decision must survive reload, so it rides in the message TEXT (like
// [TAPPY_PLAN]) — not a tool-result field, which is gone after persistence.

const VIEW: SynthesisView = {
  v: 1,
  entities: [{ key: 'm1', config: 'M1 · 32GB · 512GB', matchesRequest: 'khop', recommended: true, priceLow: 25_800_000, priceHigh: 27_500_000, offers: [{ seller: 'Zin100', url: 'https://shop/zin', price: 25_800_000, currency: 'VND', condition: null }] }],
  recommendation: null,
}

describe('renderShoppingMarker / parseShoppingMarker — the persistent channel', () => {
  it('round-trips the view through a marker embedded in reply text', () => {
    const reply = 'Mình gợi ý cấu hình này.\n\n' + renderShoppingMarker(VIEW)
    const { text, view } = parseShoppingMarker(reply)
    expect(view?.entities[0].config).toBe('M1 · 32GB · 512GB')
    expect(view?.entities[0].offers[0].url).toBe('https://shop/zin')
    // The marker is stripped from what the user reads.
    expect(text).toBe('Mình gợi ý cấu hình này.')
    expect(text).not.toContain('TAPPY_SHOPPING')
  })

  it('a reply with no marker returns the text unchanged and no view', () => {
    const { text, view } = parseShoppingMarker('Chỉ là văn bản thường.')
    expect(view).toBeNull()
    expect(text).toBe('Chỉ là văn bản thường.')
  })

  it('an empty-entities view is treated as no decision (falls back to text)', () => {
    const reply = 'x ' + renderShoppingMarker({ v: 1, entities: [], recommendation: null })
    expect(parseShoppingMarker(reply).view).toBeNull()
  })

  it('malformed marker JSON never throws — degrades to no view, marker still stripped', () => {
    const reply = 'Trước.[TAPPY_SHOPPING]{not json[/TAPPY_SHOPPING]Sau.'
    const { text, view } = parseShoppingMarker(reply)
    expect(view).toBeNull()
    expect(text).not.toContain('TAPPY_SHOPPING')
  })
})

describe('stripProductImages — replaces the raw photo flood, keeps prose + links', () => {
  it('removes every injected product image and keeps the first as the hero', () => {
    const text = 'Mình gợi ý cấu hình này.\n![](https://cdn/a.jpg)\n![](https://cdn/b.jpg)\n![](https://cdn/c.jpg)\nGiá tốt.'
    const { text: out, firstImage } = stripProductImages(text)
    expect(firstImage).toBe('https://cdn/a.jpg')
    expect(out).not.toContain('![](')
    expect(out).not.toContain('cdn/b.jpg')
    expect(out).toContain('Mình gợi ý cấu hình này.')
    expect(out).toContain('Giá tốt.')
  })

  it('never strips ordinary markdown LINKS (no leading !)', () => {
    const text = 'Xem tại [Shopee](https://shopee.vn/x) và [Tiki](https://tiki.vn/y).\n![](https://cdn/a.jpg)'
    const { text: out } = stripProductImages(text)
    expect(out).toContain('[Shopee](https://shopee.vn/x)')
    expect(out).toContain('[Tiki](https://tiki.vn/y)')
    expect(out).not.toContain('cdn/a.jpg')
  })

  it('a reply with no images is returned unchanged, hero null', () => {
    const { text: out, firstImage } = stripProductImages('Không có ảnh ở đây.')
    expect(out).toBe('Không có ảnh ở đây.')
    expect(firstImage).toBeNull()
  })
})
