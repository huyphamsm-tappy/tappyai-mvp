// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ShoppingDecision from './ShoppingDecision'
import { setLocale } from '@/lib/i18n/useTranslation'
import type { SynthesisView, SynthesisEntityView } from '@/lib/ai/consultative/synthesisView'

afterEach(cleanup)
// Labels are localised; pin Vietnamese so the assertions are deterministic. A
// dedicated case below proves the English edition renders English.
beforeEach(() => setLocale('vi'))

// ── Phase 9 — the decision UI renders exactly what the view says ─────────────
//
// It groups nothing and invents nothing: one recommended configuration leads,
// the rest stay as compact alternative rows, missing numbers read as "chưa rõ",
// and every offer keeps its own link.

function ent(p: Partial<SynthesisEntityView>): SynthesisEntityView {
  return {
    key: p.key ?? 'k', config: p.config ?? 'M1 · 32GB · 512GB · 14 inch',
    matchesRequest: p.matchesRequest ?? 'khop', recommended: p.recommended ?? false,
    priceLow: p.priceLow ?? 25_800_000, priceHigh: p.priceHigh ?? 27_500_000,
    image: p.image ?? null,
    offers: p.offers ?? [{ seller: 'Zin100.vn', url: 'https://shop/zin', price: 25_800_000, currency: 'VND', condition: null }],
  }
}

const REC_VIEW: SynthesisView = {
  v: 1,
  entities: [
    ent({ key: 'm1', recommended: true, matchesRequest: 'khop', offers: [
      { seller: 'Zin100.vn', url: 'https://shop/zin', price: 25_800_000, currency: 'VND', condition: null },
      { seller: 'Tín Phát', url: 'https://shop/tin', price: 27_500_000, currency: 'VND', condition: null },
    ] }),
    ent({ key: 'm1pro16', config: 'M1 Pro · 16GB · 512GB', matchesRequest: 'khac', priceLow: 24_999_000, priceHigh: 24_999_000,
      offers: [{ seller: 'Lâm Phong', url: 'https://shop/lam', price: 24_999_000, currency: 'VND', condition: null }] }),
  ],
  recommendation: {
    entityKey: 'm1', seller: 'Zin100.vn',
    reasons: [{ attribute: 'rating', evidence: 'đánh giá 4.7/5' }],
    tradeOff: { attribute: 'gia', evidence: 'Tín Phát rẻ hơn' },
    conditional: false,
  },
}

describe('ShoppingDecision', () => {
  it('renders ONE recommended entity with its config, price range and reason', () => {
    const { getByTestId, container } = render(<ShoppingDecision view={REC_VIEW} />)
    const rec = getByTestId('recommended-entity')
    expect(rec.textContent).toContain('M1 · 32GB · 512GB')
    expect(rec.textContent).toContain('Nên chọn')
    expect(rec.textContent).toContain('triệu')                 // price range formatted
    expect(rec.textContent).toContain('đánh giá 4.7/5')        // grounded reason
    expect(rec.textContent).toContain('Đánh đổi')              // trade-off surfaced
    expect(container.querySelectorAll('[data-testid="recommended-entity"]').length).toBe(1)
  })

  it('features the recommended offer AND lists the other offer of that entity', () => {
    const { getByTestId } = render(<ShoppingDecision view={REC_VIEW} />)
    const rec = getByTestId('recommended-entity')
    expect(rec.textContent).toContain('Zin100.vn')
    expect(rec.textContent).toContain('Tín Phát')
    const links = rec.querySelectorAll('a[href]')
    expect(links.length).toBe(2)                               // both offers keep their link
    expect(links[0].getAttribute('href')).toBe('https://shop/zin')
    expect(links[0].getAttribute('target')).toBe('_blank')
    expect(links[0].getAttribute('rel')).toContain('noopener')
  })

  it('shows OTHER configurations as compact rows — never as full product cards', () => {
    const { container } = render(<ShoppingDecision view={REC_VIEW} />)
    expect(container.textContent).toContain('Lựa chọn khác')
    expect(container.textContent).toContain('M1 Pro · 16GB · 512GB')
    expect(container.textContent).toContain('Khác cấu hình')   // match badge on the alternative
    // The flood we are replacing: at most ONE image (the hero), never a grid.
    expect(container.querySelectorAll('img').length).toBeLessThanOrEqual(1)
  })

  it("uses the recommended entity's OWN image as the hero, and only one", () => {
    const view: SynthesisView = { ...REC_VIEW, entities: REC_VIEW.entities.map((e, i) => i === 0 ? { ...e, image: 'https://cdn/m1.jpg' } : e) }
    const { container } = render(<ShoppingDecision view={view} heroImage="https://cdn/fallback.jpg" />)
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBe(1)
    expect(imgs[0].getAttribute('src')).toBe('https://cdn/m1.jpg')   // entity image wins over the prop
  })

  it('falls back to the scraped hero prop when the entity has no image', () => {
    const { container } = render(<ShoppingDecision view={REC_VIEW} heroImage="https://cdn/hero.jpg" />)
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBe(1)
    expect(imgs[0].getAttribute('src')).toBe('https://cdn/hero.jpg')
  })

  it('no recommendation → shows the options without a "Nên chọn" hero', () => {
    const view: SynthesisView = { v: 1, entities: [ent({ key: 'a' }), ent({ key: 'b', config: 'M1 Pro · 16GB' })], recommendation: null }
    const { container, queryByTestId } = render(<ShoppingDecision view={view} />)
    expect(queryByTestId('recommended-entity')).toBeNull()
    expect(container.textContent).toContain('Các lựa chọn phù hợp')
    expect(container.textContent).not.toContain('Nên chọn')
  })

  it('unknown values render honestly — never a fabricated number or sentinel', () => {
    const view: SynthesisView = {
      v: 1,
      entities: [ent({ key: 'u', recommended: true, matchesRequest: 'chua_ro', priceLow: null, priceHigh: null,
        offers: [{ seller: null, url: null, price: null, currency: null, condition: null }] })],
      recommendation: { entityKey: 'u', seller: null, reasons: [], tradeOff: null, conditional: false },
    }
    const { container } = render(<ShoppingDecision view={view} />)
    expect(container.textContent).toContain('chưa rõ giá')
    expect(container.textContent).toContain('Người bán chưa rõ')
    expect(container.textContent).not.toContain('KHONG CO DU LIEU')
    expect(container.querySelectorAll('a[href]').length).toBe(0)   // no link when url is null
  })

  it('conditional recommendation is phrased tentatively', () => {
    const view: SynthesisView = { ...REC_VIEW, recommendation: { ...REC_VIEW.recommendation!, conditional: true } }
    const { getByTestId } = render(<ShoppingDecision view={view} />)
    expect(getByTestId('recommended-entity').textContent).toContain('Tùy nhu cầu')
  })

  it('renders an ENGLISH decision for an English session', () => {
    setLocale('en')
    const { getByTestId, container } = render(<ShoppingDecision view={REC_VIEW} />)
    expect(getByTestId('recommended-entity').textContent).toContain('Best pick')
    expect(container.textContent).toContain('Matches what you asked for')
    expect(container.textContent).toContain('Other options')
    expect(container.textContent).not.toContain('Nên chọn')
  })

  it('empty synthesis renders nothing (safe)', () => {
    const { container } = render(<ShoppingDecision view={{ v: 1, entities: [], recommendation: null }} />)
    expect(container.querySelector('[data-testid="shopping-decision"]')).toBeNull()
    expect(container.textContent).toBe('')
  })
})
