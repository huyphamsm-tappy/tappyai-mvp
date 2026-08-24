// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { shoppingViewOf, stripProductImages } from './ChatInterface'
import type { SynthesisView } from '@/lib/ai/consultative/synthesisView'

// ── Phase 9 — the wiring that makes the UI consume `_tappy_synthesis_view` ───

const VIEW: SynthesisView = {
  v: 1,
  entities: [{ key: 'm1', config: 'M1 · 32GB · 512GB', matchesRequest: 'khop', recommended: true, priceLow: 25_800_000, priceHigh: 27_500_000, offers: [] }],
  recommendation: null,
}

describe('shoppingViewOf — reads the backend view off the tool result', () => {
  it('returns the view from a finished search_products result', () => {
    const msg = { toolInvocations: [{ toolName: 'search_products', state: 'result', result: { search_results: [], _tappy_synthesis_view: VIEW } }] }
    expect(shoppingViewOf(msg)?.entities[0].config).toBe('M1 · 32GB · 512GB')
  })

  it('ignores a result that carries no view (non-shopping / older turn)', () => {
    expect(shoppingViewOf({ toolInvocations: [{ toolName: 'search_places', state: 'result', result: { results: [] } }] })).toBeNull()
    expect(shoppingViewOf({ toolInvocations: [{ toolName: 'search_products', state: 'result', result: { search_results: [] } }] })).toBeNull()
  })

  it('ignores a tool call that has not produced a result yet', () => {
    expect(shoppingViewOf({ toolInvocations: [{ toolName: 'search_products', state: 'call' }] })).toBeNull()
  })

  it('ignores an empty view (no entities) — falls back to plain text', () => {
    const empty: SynthesisView = { v: 1, entities: [], recommendation: null }
    expect(shoppingViewOf({ toolInvocations: [{ toolName: 'search_products', state: 'result', result: { _tappy_synthesis_view: empty } }] })).toBeNull()
  })

  it('no toolInvocations at all → null', () => {
    expect(shoppingViewOf({})).toBeNull()
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
