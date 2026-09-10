// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
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
    key: p.key ?? 'k',
    name: p.name ?? '',
    config: p.config ?? 'M1 · 32GB · 512GB · 14 inch',
    specs: p.specs ?? [],
    condition: p.condition ?? null,
    matchesRequest: p.matchesRequest ?? 'khop', recommended: p.recommended ?? false,
    priceLow: p.priceLow ?? 25_800_000, priceHigh: p.priceHigh ?? 27_500_000,
    image: p.image ?? null,
    offers: p.offers ?? [{ seller: 'Zin100.vn', url: 'https://shop/zin', price: 25_800_000, currency: 'VND', condition: null, rating: null, ratingCount: null }],
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
    // §10: say that several are viable, and crown nobody.
    expect(container.textContent).toContain('Những lựa chọn sát nhất')
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

// ─────────────────────────────────────────────────────────────────────────────
// What the audit measured, pinned as behaviour.
// ─────────────────────────────────────────────────────────────────────────────

describe('ShoppingDecision — product identity', () => {
  it('🚨 shows the PRODUCT NAME, not the configuration string', () => {
    const view: SynthesisView = {
      v: 1,
      entities: [ent({ key: 'dell', recommended: true, name: 'Laptop Dell 15 DC15250', config: '16GB · 512GB',
        specs: [{ key: 'ram', value: 16 }, { key: 'storage', value: 512 }] })],
      recommendation: { entityKey: 'dell', seller: 'Zin100.vn', reasons: [], tradeOff: null, conditional: false },
    }
    const { getByTestId } = render(<ShoppingDecision view={view} />)
    const rec = getByTestId('recommended-entity')
    expect(rec.textContent).toContain('Laptop Dell 15 DC15250')
    // The measured defect: an unstated chip rendered as if it were a fact.
    expect(rec.textContent).not.toContain('chip ?')
    expect(rec.textContent).not.toContain('RAM ?')
    expect(rec.textContent).not.toContain('storage ?')
  })

  it('renders the stated specs as labelled chips, and omits what was not stated', () => {
    const view: SynthesisView = {
      v: 1,
      entities: [ent({ key: 'd', recommended: true, name: 'Dell 15', specs: [{ key: 'ram', value: 16 }, { key: 'storage', value: 512 }] })],
      recommendation: { entityKey: 'd', seller: null, reasons: [], tradeOff: null, conditional: false },
    }
    const { getByTestId } = render(<ShoppingDecision view={view} />)
    const specs = getByTestId('product-specs')
    expect(specs.textContent).toContain('16GB RAM')
    expect(specs.textContent).toContain('512GB')
    expect(specs.textContent).not.toContain('?')
  })

  it('falls back to the config when a listing carried no title', () => {
    const view: SynthesisView = { v: 1, entities: [ent({ key: 'x', name: '', config: 'M1 · 16GB' }), ent({ key: 'y', name: '', config: 'M2' })], recommendation: null }
    const { container } = render(<ShoppingDecision view={view} />)
    expect(container.textContent).toContain('M1 · 16GB')
  })
})

describe('ShoppingDecision — the facts the user came for', () => {
  const RATED: SynthesisView = {
    v: 1,
    entities: [ent({ key: 'r', recommended: true, name: 'Dell DC15250', priceLow: 15_900_000, priceHigh: 15_900_000,
      offers: [{ seller: 'Fptshop.com.vn', url: 'https://fptshop.com.vn/p/1', price: 15_900_000, currency: 'VND', condition: null, rating: 4.9, ratingCount: 1500 }] })],
    recommendation: {
      entityKey: 'r', seller: 'Fptshop.com.vn',
      reasons: [
        { attribute: 'rating', evidence: 'rated 4.9', params: { value: 4.9 } },
        { attribute: 'reviewCount', evidence: '1500 reviews', params: { count: 1500 } },
        { attribute: 'price', evidence: '15900000 VND', params: { priceVnd: 15_900_000 } },
      ],
      tradeOff: { attribute: 'price', evidence: '16290000 VND', params: { priceVnd: 16_290_000 } },
      conditional: false,
    },
  }

  it('🚨 renders rating and review count as product metadata', () => {
    const { getByTestId } = render(<ShoppingDecision view={RATED} />)
    const rating = getByTestId('product-rating')
    expect(rating.textContent).toContain('4.9')
    expect(rating.textContent).toMatch(/1[.,]500/)
    expect(rating.textContent).toContain('đánh giá')
  })

  it('🚨 renders a FORMATTED price — never the raw integer', () => {
    const { container } = render(<ShoppingDecision view={RATED} />)
    expect(container.textContent).toContain('15,9 triệu')
    expect(container.textContent).not.toContain('15900000')
  })

  it('🚨 says the reasons in Vietnamese, from the params the engine attached', () => {
    const { getByTestId } = render(<ShoppingDecision view={RATED} />)
    const reasons = getByTestId('pick-reasons').textContent ?? ''
    expect(reasons).toContain('đánh giá 4.9')
    expect(reasons).toContain('lượt đánh giá')
    expect(reasons).toContain('giá 15,9 triệu')
    // The measured defect, verbatim.
    expect(reasons).not.toContain('rated 4.9')
    expect(reasons).not.toContain('1500 reviews')
    expect(reasons).not.toContain('15900000 VND')
  })

  it('🚨 says them in English for an English session', () => {
    setLocale('en')
    const { getByTestId } = render(<ShoppingDecision view={RATED} />)
    const reasons = getByTestId('pick-reasons').textContent ?? ''
    expect(reasons).toContain('rated 4.9')
    expect(reasons).toContain('1,500 reviews')
    expect(reasons).toContain('15.9M')
    expect(reasons).not.toContain('đánh giá')
  })

  it('localises the trade-off the same way, and never invents one', () => {
    const { getByTestId } = render(<ShoppingDecision view={RATED} />)
    expect(getByTestId('pick-tradeoff').textContent).toContain('16,3 triệu')
    cleanup()
    const bare = render(<ShoppingDecision view={{ ...RATED, recommendation: { ...RATED.recommendation!, tradeOff: null } }} />)
    expect(bare.queryByTestId('pick-tradeoff')).toBeNull()
  })

  it('a reason with no params still renders — the engine string is the fallback', () => {
    const view: SynthesisView = {
      ...RATED,
      recommendation: { ...RATED.recommendation!, reasons: [{ attribute: 'seller', evidence: 'chuyên Apple' }] },
    }
    const { getByTestId } = render(<ShoppingDecision view={view} />)
    expect(getByTestId('pick-reasons').textContent).toContain('chuyên Apple')
  })

  it('localises the condition label instead of leaking Vietnamese into English', () => {
    const view: SynthesisView = {
      v: 1,
      entities: [ent({ key: 'c', recommended: true, name: 'iPhone 13', condition: { key: 'genuine', label: 'Chính hãng' } })],
      recommendation: { entityKey: 'c', seller: null, reasons: [], tradeOff: null, conditional: false },
    }
    setLocale('en')
    const { getByTestId } = render(<ShoppingDecision view={view} />)
    expect(getByTestId('product-specs').textContent).toContain('Genuine')
    expect(getByTestId('product-specs').textContent).not.toContain('Chính hãng')
  })
})

describe('ShoppingDecision — alternatives are choices, not decoration', () => {
  const ALT: SynthesisView = {
    v: 1,
    entities: [
      ent({ key: 'lead', recommended: true, name: 'Dell DC15250' }),
      ent({ key: 'alt', name: 'Asus Vivobook 15', matchesRequest: 'khac', image: 'https://cdn/asus.jpg',
        priceLow: 16_290_000, priceHigh: 16_290_000,
        offers: [{ seller: 'Tiki', url: 'https://tiki.vn/p/9', price: 16_290_000, currency: 'VND', condition: null, rating: 4.6, ratingCount: 88 }] }),
    ],
    recommendation: { entityKey: 'lead', seller: 'Zin100.vn', reasons: [], tradeOff: null, conditional: false },
  }

  it('🚨 an alternative carries its name, price, seller and a REAL destination', () => {
    const { getAllByTestId } = render(<ShoppingDecision view={ALT} />)
    const row = getAllByTestId('product-row')[0]
    expect(row.textContent).toContain('Asus Vivobook 15')
    expect(row.textContent).toContain('16,3 triệu')
    expect(row.textContent).toContain('Tiki')
    expect(row.querySelector('a[href]')?.getAttribute('href')).toBe('https://tiki.vn/p/9')
    expect(row.querySelector('img')?.getAttribute('src')).toBe('https://cdn/asus.jpg')
  })

  it('offers no action when the listing carried no URL', () => {
    const noUrl: SynthesisView = {
      ...ALT,
      entities: [ALT.entities[0], { ...ALT.entities[1], offers: [{ ...ALT.entities[1].offers[0], url: null }] }],
    }
    const { getAllByTestId } = render(<ShoppingDecision view={noUrl} />)
    expect(getAllByTestId('product-row')[0].querySelector('a[href]')).toBeNull()
  })

  it('🚨 names the host when the link does not go to the seller', () => {
    // Serper's rows link to google.com/search?…prds=productid:…, not to the shop.
    const viaGoogle: SynthesisView = {
      ...ALT,
      entities: [ALT.entities[0], { ...ALT.entities[1], offers: [{ ...ALT.entities[1].offers[0], url: 'https://www.google.com/search?ibp=oshop&prds=productid:1' }] }],
    }
    const { getAllByTestId } = render(<ShoppingDecision view={viaGoogle} />)
    expect(getAllByTestId('product-row')[0].textContent).toContain('Tìm trên Google')
  })
})

describe('ShoppingDecision — no Pick is still an answer', () => {
  const SHORTLIST: SynthesisView = {
    v: 1,
    entities: [
      ent({ key: 'a', name: 'Dell DC15250', priceLow: 16_990_000, priceHigh: 16_990_000, offers: [{ seller: 'Fptshop.com.vn', url: 'https://fptshop.com.vn/1', price: 16_990_000, currency: 'VND', condition: null, rating: 4.9, ratingCount: 88 }] }),
      ent({ key: 'b', name: 'Asus Vivobook 15', priceLow: 19_490_000, priceHigh: 19_490_000, offers: [{ seller: 'Tiki', url: 'https://tiki.vn/2', price: 19_490_000, currency: 'VND', condition: null, rating: null, ratingCount: null }] }),
    ],
    recommendation: null,
  }

  it('🚨 renders every ranked product, in the engine order, crowning nobody', () => {
    const { getAllByTestId, queryByTestId, container } = render(<ShoppingDecision view={SHORTLIST} />)
    expect(queryByTestId('recommended-entity')).toBeNull()
    const rows = getAllByTestId('product-row')
    expect(rows.map(r => !!r.textContent?.includes('Dell DC15250'))).toEqual([true, false])
    expect(container.textContent).not.toContain('Nên chọn')
    expect(container.textContent).not.toContain('Đánh đổi')
  })

  it('still gives every one of them price, seller and an action', () => {
    const { getAllByTestId } = render(<ShoppingDecision view={SHORTLIST} />)
    for (const row of getAllByTestId('product-row')) {
      expect(row.textContent).toMatch(/triệu/)
      expect(row.querySelector('a[href]')).toBeTruthy()
    }
  })

  it('offers no price watch without a recommendation to watch', () => {
    const { queryByTestId } = render(<ShoppingDecision view={SHORTLIST} onPriceWatch={() => {}} />)
    expect(queryByTestId('price-watch-action')).toBeNull()
  })
})

describe('ShoppingDecision — price watch', () => {
  const PRICED: SynthesisView = {
    v: 1,
    entities: [ent({ key: 'p', recommended: true, name: 'iPhone 13 128GB', priceLow: 15_900_000, priceHigh: 15_900_000 })],
    recommendation: { entityKey: 'p', seller: 'Zin100.vn', reasons: [], tradeOff: null, conditional: false },
  }

  it('🚨 offers the watch on a recommendation with a real price, naming the product', () => {
    let asked: string | null = null
    const { getByTestId } = render(<ShoppingDecision view={PRICED} onPriceWatch={(n) => { asked = n }} />)
    const btn = getByTestId('price-watch-action')
    expect(btn.textContent).toContain('Theo dõi giá')
    fireEvent.click(btn)
    expect(asked).toBe('iPhone 13 128GB')
  })

  it('does not offer it without a price, or without a host that can handle it', () => {
    const noPrice: SynthesisView = {
      ...PRICED,
      entities: [{ ...PRICED.entities[0], priceLow: null, priceHigh: null, offers: [{ seller: null, url: null, price: null, currency: null, condition: null, rating: null, ratingCount: null }] }],
    }
    const { queryByTestId } = render(<ShoppingDecision view={noPrice} onPriceWatch={() => {}} />)
    expect(queryByTestId('price-watch-action')).toBeNull()
    cleanup()
    // No handler → no dead control.
    const bare = render(<ShoppingDecision view={PRICED} />)
    expect(bare.queryByTestId('price-watch-action')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE SELLER/DESTINATION CONTRACT.
//
// 🚨 MEASURED: a card read "NÊN CHỌN · Shopee · 82.000đ" and its button said
// "Tìm trên Google" — because Serper's /shopping rows name a merchant but carry
// a `google.com/search?…prds=` redirect as the link, 40 out of 40 on a live
// query. Both facts were true; together they read as a broken promise.
//
// The rule: the button names the site it opens AND whether that site shows the
// product. A URL is never rewritten to make a nicer label true.
// ─────────────────────────────────────────────────────────────────────────────

describe('ShoppingDecision — where the buy button actually goes', () => {
  const withOffer = (url: string | null, sellerName: string | null): SynthesisView => ({
    v: 1,
    entities: [ent({
      key: 'p', recommended: true, name: 'Ốp lưng iPhone 17 Pro Max',
      priceLow: 82_000, priceHigh: 82_000,
      offers: [{ seller: sellerName, url, price: 82_000, currency: 'VND', condition: null, rating: null, ratingCount: null }],
    })],
    recommendation: { entityKey: 'p', seller: sellerName, reasons: [], tradeOff: null, conditional: false },
  })

  it('🚨 a Shopee PRODUCT url opens Shopee, and says so plainly', () => {
    const { getByTestId } = render(<ShoppingDecision view={withOffer('https://shopee.vn/op-lung-i.123.456', 'Shopee')} />)
    const row = getByTestId('offer-row')
    expect(row.querySelector('a')?.getAttribute('href')).toBe('https://shopee.vn/op-lung-i.123.456')
    expect(row.textContent).toContain('Xem')
    expect(row.textContent).not.toContain('Google')
  })

  it('🚨 a Lazada PRODUCT url opens Lazada', () => {
    const { getByTestId } = render(<ShoppingDecision view={withOffer('https://www.lazada.vn/products/op-lung-i123.html', 'Lazada')} />)
    const row = getByTestId('offer-row')
    expect(row.querySelector('a')?.getAttribute('href')).toContain('lazada.vn/products/')
    expect(row.textContent).toContain('Xem')
  })

  it('🚨 a GOOGLE-only link says Google and says search — never "buy on Shopee"', () => {
    // The exact live shape: seller Shopee, link a Google Shopping redirect.
    const { getByTestId } = render(<ShoppingDecision view={withOffer(
      'https://www.google.com/search?ibp=oshop&q=op+lung&prds=productid:1', 'Shopee')} />)
    const row = getByTestId('offer-row')
    expect(row.textContent).toContain('Shopee')            // the seller is still named
    expect(row.textContent).toContain('Tìm trên Google')    // …and the button tells the truth
    expect(row.querySelector('a')?.getAttribute('href')).toContain('google.com')
  })

  it('🚨 a direct link on a site that is NOT the named seller is qualified, not silently "Xem"', () => {
    const { getByTestId } = render(<ShoppingDecision view={withOffer('https://tiki.vn/op-lung-p123.html', 'CellphoneS')} />)
    expect(getByTestId('offer-row').textContent).toContain('Xem trên Tiki')
  })

  it('🚨 no URL → no button at all, and nothing fabricated', () => {
    const { getByTestId } = render(<ShoppingDecision view={withOffer(null, 'Shopee')} />)
    const row = getByTestId('offer-row')
    expect(row.querySelector('a')).toBeNull()
    expect(row.textContent).toContain('Shopee')
    expect(row.textContent).not.toMatch(/Google|Tìm trên/)
  })

  it('alternatives obey the same contract', () => {
    const view: SynthesisView = {
      v: 1,
      entities: [
        ent({ key: 'lead', recommended: true, name: 'Ốp A' }),
        ent({ key: 'alt', name: 'Ốp B', priceLow: 99_000, priceHigh: 99_000,
          offers: [{ seller: 'Shopee', url: 'https://www.google.com/search?q=op+b&prds=x', price: 99_000, currency: 'VND', condition: null, rating: null, ratingCount: null }] }),
      ],
      recommendation: { entityKey: 'lead', seller: null, reasons: [], tradeOff: null, conditional: false },
    }
    const { getAllByTestId } = render(<ShoppingDecision view={view} />)
    const alt = getAllByTestId('product-row')[0]
    expect(alt.textContent).toContain('Tìm trên Google')
    expect(alt.querySelector('a[href]')?.getAttribute('href')).toContain('google.com')
  })
})
