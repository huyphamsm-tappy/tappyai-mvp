import { describe, it, expect } from 'vitest'
import { normalizeShopping } from './candidate'
import { rankCandidates } from './rank'
import { derivePick, buildPickPayload } from './pick'
import { parseSerperPriceVnd } from '../tools/common'
import { deriveNeedProfile } from './needProfile'
import type { NeedProfile } from './needProfile'

// ── SHOP-NORM / SHOP-FILTER / SHOP-RANK / SHOP-PICK ────────────────────────
//
// Shopping was the last genuine product gap: organic retrieval returned phone
// cases and news articles, so `rankCandidates` correctly DECLINED to rank it and
// Shopping had no ranking, comparison, trade-off or Pick.
//
// The structured path now reads Serper's `/shopping` endpoint, where `price`,
// `source` and `productId` are the provider's OWN fields. Nothing is parsed out
// of a title — that is the defect C3-B.8 measured at a 20% false-accept rate.
//
// These are deterministic fixture tests. SERPER_API_KEY is absent, so no live
// call is made and no live verification is claimed. The fixture shape mirrors the
// records C3-B.9 captured from the real endpoint.

function profile(over: Partial<NeedProfile> = {}): NeedProfile {
  return {
    domain: 'shopping', subject: 'laptop', budget: null, budgetStated: null,
    location: { text: null, gps: null },
    useCases: [], priorities: [], mustHave: [], avoid: [],
    turnsObserved: 1, changedAtTurn: {},
    ...over,
  }
}
const prio = (key: string, weight = 2) => ({ key, weight, source: 'stated' as const })

/** A search_products result carrying structured /shopping records. */
const STRUCTURED = {
  query: 'tai nghe Sony WH-1000XM5',
  source: 'Google Search (Serper)',
  shopping_results: [
    { title: 'Sony WH-1000XM5 Chính hãng', link: 'https://shopee.vn/xm5-i.111.222', source: 'Shopee', price: 6_490_000, productId: 'p-xm5', imageUrl: 'https://img/xm5.jpg', rating: 4.9, ratingCount: 1240 },
    { title: 'Sony WH-1000XM5 Bản Quốc Tế', link: 'https://tiki.vn/xm5-p333.html', source: 'Tiki', price: 6_890_000, productId: 'p-xm5-intl', rating: 4.6, ratingCount: 300 },
    { title: 'Sony WH-1000XM5 Like New', link: 'https://lazada.vn/products/xm5-likenew', source: 'Lazada', price: 5_200_000, productId: 'p-xm5-ln' },
  ],
  // The organic array is still present and must stay ignored by the normalizer.
  search_results: [
    { title: 'Đệm tai thay thế cho WH-1000XM5', link: 'https://shopee.vn/dem-tai-i.9.9', snippet: 'Chỉ 335.000đ' },
    { title: 'Shopee, Lazada, Tiki tranh giành thị phần', link: 'https://vnexpress.net/x', snippet: 'Bài viết' },
  ],
  links: [{ name: 'Shopee', url: 'https://shopee.vn/search?keyword=x' }],
}

describe('parseSerperPriceVnd — only the provider price field, never a guess', () => {
  it('accepts a number and the formatted VND forms', () => {
    expect(parseSerperPriceVnd(6_490_000)).toBe(6_490_000)
    expect(parseSerperPriceVnd('₫6.490.000')).toBe(6_490_000)
    expect(parseSerperPriceVnd('6.490.000 ₫')).toBe(6_490_000)
  })

  it('REJECTS a foreign currency rather than reading it as VND', () => {
    // "$699" read as 699 VND would pass every downstream range check while being
    // wrong by ~25,000x.
    for (const v of ['$699', 'US$699', '699 USD', '€599', '¥1200']) {
      expect(parseSerperPriceVnd(v), `${v} must not parse as VND`).toBeNull()
    }
  })

  it('returns null for anything absent or unparseable', () => {
    for (const v of [null, undefined, '', '  ', 'Liên hệ', {}, [], 0, -5, NaN]) {
      expect(parseSerperPriceVnd(v)).toBeNull()
    }
  })
})

describe('SHOP-NORM-01 — structured results normalize correctly', () => {
  const c = normalizeShopping(STRUCTURED)

  it('produces one candidate per structured record', () => {
    expect(c).toHaveLength(3)
    expect(c.map(x => x.name)).toContain('Sony WH-1000XM5 Chính hãng')
  })

  it('carries the provider price, rating and review count', () => {
    const shopee = c.find(x => x.name.includes('Chính hãng'))!
    expect(shopee.attrs.priceVnd).toBe(6_490_000)
    expect(shopee.attrs.rating).toBe(4.9)
    expect(shopee.attrs.reviewCount).toBe(1240)
  })

  it('leaves absent fields UNDEFINED — Lazada supplied no rating', () => {
    const lazada = c.find(x => x.name.includes('Like New'))!
    expect(lazada.attrs.priceVnd).toBe(5_200_000)
    expect(lazada.attrs.rating).toBeUndefined()
    expect('rating' in lazada.attrs).toBe(false)
  })

  it('IGNORES the organic search_results entirely', () => {
    // The ear pads (335k) and the VnExpress article are in the fixture. If either
    // became a candidate, Shopping would be ranking accessories and news again.
    for (const x of c) {
      expect(x.name).not.toContain('Đệm tai')
      expect(x.name).not.toContain('tranh giành')
    }
  })

  it('an organic-only result yields NO candidates, so the ranker declines', () => {
    const organicOnly = { search_results: STRUCTURED.search_results, links: STRUCTURED.links }
    expect(normalizeShopping(organicOnly)).toEqual([])
    expect(rankCandidates(normalizeShopping(organicOnly), profile()).rankable).toBe(false)
  })

  it('never throws on malformed input', () => {
    for (const bad of [null, undefined, {}, { shopping_results: null }, { shopping_results: [{}] }, 'x', 7]) {
      expect(() => normalizeShopping(bad)).not.toThrow()
    }
  })
})

describe('SHOP-NORM-02 — the product URL stays with its product', () => {
  const c = normalizeShopping(STRUCTURED)

  it('each candidate keeps its own link and store', () => {
    expect(c.find(x => x.name.includes('Chính hãng'))!.link).toBe('https://shopee.vn/xm5-i.111.222')
    expect(c.find(x => x.name.includes('Quốc Tế'))!.link).toBe('https://tiki.vn/xm5-p333.html')
    expect((c.find(x => x.name.includes('Like New'))!.raw as { source: string }).source).toBe('Lazada')
  })

  it('identity prefers the provider productId', () => {
    expect(c.find(x => x.name.includes('Chính hãng'))!.id).toBe('p-xm5')
  })

  it('reordering never moves a URL onto a different product', () => {
    const byName = new Map(c.map(x => [x.name, x.link]))
    for (const need of [profile(), profile({ priorities: [prio('price', 5)] }), profile({ priorities: [prio('rating', 5)] })]) {
      for (const e of rankCandidates(c, need).ranked) {
        expect(e.candidate.link).toBe(byName.get(e.candidate.name))
      }
    }
  })
})

describe('SHOP-FILTER-01/02 — budget', () => {
  const c = normalizeShopping(STRUCTURED)

  it('SHOP-FILTER-01: over-budget products are removed', () => {
    const need = profile({ budget: { min: 0, max: 6_000_000, type: 'under' }, budgetStated: 6_000_000 })
    const r = rankCandidates(c, need)
    expect(r.ranked.map(x => x.candidate.name)).toEqual(['Sony WH-1000XM5 Like New'])
    expect(r.filtered.map(f => f.filteredBy)).toEqual(['budget', 'budget'])
  })

  it('SHOP-FILTER-02: an unknown price is NOT treated as over-budget', () => {
    const withUnpriced = normalizeShopping({
      shopping_results: [
        ...STRUCTURED.shopping_results,
        { title: 'Sony WH-1000XM5 Liên hệ', link: 'https://shopee.vn/lh-i.7.7', source: 'Shopee', productId: 'p-lh' },
      ],
    })
    const need = profile({ budget: { min: 0, max: 6_000_000, type: 'under' }, budgetStated: 6_000_000 })
    const names = rankCandidates(withUnpriced, need).ranked.map(x => x.candidate.name)
    expect(names).toContain('Sony WH-1000XM5 Liên hệ')
  })

  it('when everything is over budget, nothing survives and the reason is explicit', () => {
    const need = profile({ budget: { min: 0, max: 1_000_000, type: 'under' }, budgetStated: 1_000_000 })
    const r = rankCandidates(c, need)
    expect(r.ranked).toHaveLength(0)
    expect(r.budgetFilterEmpty).toBe(true)
  })
})

describe('SHOP-FILTER-03 — a must-have is respected', () => {
  const c = normalizeShopping({
    shopping_results: [
      { title: 'Có wifi', link: 'https://s/a', price: 1_000_000, productId: 'a' },
      { title: 'Không wifi', link: 'https://s/b', price: 900_000, productId: 'b' },
    ],
  })

  it('a must-have the evidence cannot confirm does not silently eliminate anyone', () => {
    // /shopping supplies no amenity booleans, so `wifi` is UNKNOWN for both.
    // Unknown must never be read as a contradiction.
    const r = rankCandidates(c, profile({ mustHave: ['wifi'] }))
    expect(r.ranked).toHaveLength(2)
    expect(r.filtered).toHaveLength(0)
  })

  it('and both are flagged unverified, so the reply hedges instead of asserting', () => {
    const r = rankCandidates(c, profile({ mustHave: ['wifi'] }))
    for (const e of r.ranked) expect(e.unverifiedMustHave).toContain('wifi')
  })
})

describe('SHOP-RANK-01 — a user priority changes the ranking', () => {
  // Both carry FULL evidence, so the priority is the only thing that moves.
  const TRADEOFF = normalizeShopping({
    shopping_results: [
      { title: 'Rẻ Đánh Giá Thấp', link: 'https://s/cheap', source: 'Lazada', price: 3_000_000, productId: 'cheap', rating: 4.0, ratingCount: 200 },
      { title: 'Đắt Đánh Giá Cao', link: 'https://s/premium', source: 'Shopee', price: 7_500_000, productId: 'premium', rating: 4.9, ratingCount: 5000 },
    ],
  })
  const budget = { min: 0, max: 8_000_000, type: 'under' as const }

  it('a price-first buyer gets the cheaper one', () => {
    const need = profile({ priorities: [prio('price', 4)], budget, budgetStated: 8_000_000 })
    expect(rankCandidates(TRADEOFF, need).ranked[0].candidate.name).toBe('Rẻ Đánh Giá Thấp')
  })

  it('a rating-first buyer gets the better-reviewed one', () => {
    const need = profile({ priorities: [prio('rating', 4)], budget, budgetStated: 8_000_000 })
    expect(rankCandidates(TRADEOFF, need).ranked[0].candidate.name).toBe('Đắt Đánh Giá Cao')
  })

  it('the two orders genuinely differ — §14 proven for Shopping', () => {
    const a = rankCandidates(TRADEOFF, profile({ priorities: [prio('price', 4)], budget, budgetStated: 8_000_000 })).ranked.map(x => x.candidate.name)
    const b = rankCandidates(TRADEOFF, profile({ priorities: [prio('rating', 4)], budget, budgetStated: 8_000_000 })).ranked.map(x => x.candidate.name)
    expect(a).not.toEqual(b)
  })

  it('the winner names the attribute that decided it', () => {
    const need = profile({ priorities: [prio('price', 4)], budget, budgetStated: 8_000_000 })
    expect(rankCandidates(TRADEOFF, need).ranked[0].reasons.map(x => x.key)).toContain('price')
  })

  // ── A behaviour worth recording rather than tuning away ────────────────────
  //
  // Measured while writing these tests: on the STRUCTURED fixture a price-first
  // turn still ranks the 6.49M Shopee listing above the 5.2M "Like New" one,
  // because the cheaper listing carries NO rating and no review count. Two
  // shipped rules combine to produce that:
  //
  //   * missing evidence contributes ZERO — it earns no points, and is not
  //     penalised either (the RANK-05 policy);
  //   * the price term normalises against the BUDGET CEILING, so when the
  //     ceiling sits far above every candidate, price gaps compress.
  //
  // The result is defensible — an unrated used unit does not beat a 4.9/1240 new
  // one on a 1.3M saving — and it is exactly what the contract prescribes. It is
  // pinned here so a future reader sees it as designed, not accidental.
  it('an unrated cheaper listing does not automatically win a price-first turn', () => {
    const need = profile({ priorities: [prio('price', 4)], budget, budgetStated: 8_000_000 })
    const r = rankCandidates(normalizeShopping(STRUCTURED), need)
    expect(r.ranked[0].candidate.name).toBe('Sony WH-1000XM5 Chính hãng')
    const unrated = r.ranked.find(e => e.candidate.name.includes('Like New'))!
    // It earns NO rating points — not because it was penalised, but because
    // there is no evidence to score. `missing` deliberately tracks only what the
    // USER prioritised, so `rating` is absent from it here: the user asked about
    // price, not rating.
    expect(unrated.candidate.attrs.rating).toBeUndefined()
    expect(unrated.reasons.map(x => x.key)).not.toContain('rating')
    expect(unrated.missing).not.toContain('rating')
  })

  it('…and it IS listed as missing once the user actually prioritises rating', () => {
    const need = profile({ priorities: [prio('price', 4), prio('rating', 2)], budget, budgetStated: 8_000_000 })
    const r = rankCandidates(normalizeShopping(STRUCTURED), need)
    expect(r.ranked.find(e => e.candidate.name.includes('Like New'))!.missing).toContain('rating')
  })
})

describe('SHOP-RANK-02 — determinism', () => {
  const c = normalizeShopping(STRUCTURED)
  const need = profile({ priorities: [prio('rating')], budget: { min: 0, max: 8_000_000, type: 'under' }, budgetStated: 8_000_000 })

  it('identical inputs give byte-identical output, 50 runs', () => {
    const first = JSON.stringify(rankCandidates(c, need))
    for (let i = 0; i < 50; i++) expect(JSON.stringify(rankCandidates(c, need))).toBe(first)
  })

  it('input order does not decide the outcome', () => {
    expect(rankCandidates([...c].reverse(), need).ranked.map(x => x.candidate.name))
      .toEqual(rankCandidates(c, need).ranked.map(x => x.candidate.name))
  })
})

describe('SHOP-RANK-03 — missing attributes invent nothing', () => {
  const c = normalizeShopping(STRUCTURED)

  it('the unrated product is neither penalised nor given a rating', () => {
    const lazada = c.find(x => x.name.includes('Like New'))!
    expect(lazada.attrs.rating).toBeUndefined()
    const r = rankCandidates(c, profile({ priorities: [prio('rating')] }))
    const entry = r.ranked.find(e => e.candidate.name.includes('Like New'))!
    expect(entry.reasons.map(x => x.key)).not.toContain('rating')
    expect(entry.missing).toContain('rating')
  })

  it('no candidate gains an attribute the provider never sent', () => {
    for (const x of c) {
      expect(x.attrs.wifi).toBeUndefined()
      expect(x.attrs.stars).toBeUndefined()
      expect(x.attrs.distanceKm).toBeUndefined()
      expect(x.attrs.cuisine).toBeUndefined()
    }
  })

  it('a price priority with no price anywhere produces no price reasons', () => {
    const unpriced = normalizeShopping({
      shopping_results: [
        { title: 'A', link: 'https://s/a', productId: 'a', rating: 4.2 },
        { title: 'B', link: 'https://s/b', productId: 'b', rating: 4.0 },
      ],
    })
    const r = rankCandidates(unpriced, profile({ priorities: [prio('price')] }))
    for (const e of r.ranked) expect(e.reasons.map(x => x.key)).not.toContain('price')
  })
})

describe('SHOP-PICK-01/02/03 — the Pick', () => {
  const c = normalizeShopping(STRUCTURED)
  const need = profile({ priorities: [prio('rating', 4)], budget: { min: 0, max: 8_000_000, type: 'under' }, budgetStated: 8_000_000 })
  const r = rankCandidates(c, need)
  const pick = derivePick(r, need)!

  it('SHOP-PICK-01: Pick = ranked[0], and is a real candidate', () => {
    expect(pick.candidate).toBe(r.ranked[0].candidate)
    expect(c).toContain(pick.candidate)
  })

  it('SHOP-PICK-02: the Pick keeps its EXACT product URL and store', () => {
    expect(pick.candidate.link).toBe('https://shopee.vn/xm5-i.111.222')
    expect((pick.candidate.raw as { source: string }).source).toBe('Shopee')
    expect((pick.candidate.raw as { productId: string }).productId).toBe('p-xm5')
  })

  it('SHOP-PICK-03: the explanation is grounded in real candidate evidence', () => {
    expect(pick.reasons.length).toBeGreaterThan(0)
    const payload = buildPickPayload(pick)
    expect(payload.pick).toBe('Sony WH-1000XM5 Chính hãng')
    const decided = payload.decided_by as Array<{ attribute: string; evidence: string }>
    expect(decided.length).toBeGreaterThan(0)
    expect(decided.map(d => d.attribute)).toContain('rating')
    // Every quoted figure must exist in the fixture evidence.
    expect(decided.find(d => d.attribute === 'rating')!.evidence).toContain('4.9')
  })

  it('the payload names a runner-up that is also real', () => {
    expect(c.map(x => x.name)).toContain(pick.runnerUp!.candidate.name)
  })

  it('no Pick when evidence is insufficient — one survivor after budget filtering', () => {
    const tight = profile({ budget: { min: 0, max: 6_000_000, type: 'under' }, budgetStated: 6_000_000, priorities: [prio('price')] })
    expect(derivePick(rankCandidates(c, tight), tight)).toBeNull()
  })

  it('no Pick when the organic-only shape is all that came back', () => {
    const organicOnly = normalizeShopping({ search_results: STRUCTURED.search_results })
    expect(derivePick(rankCandidates(organicOnly, need), need)).toBeNull()
  })
})

describe('end to end — a real Vietnamese request drives the shopping decision', () => {
  it('a stated budget and priority filter and order the structured candidates', () => {
    const need = deriveNeedProfile([
      { role: 'user', content: 'Mình muốn mua tai nghe Sony WH-1000XM5, tầm 6 triệu, ưu tiên giá rẻ' },
    ])
    expect(need.domain).toBe('shopping')
    expect(need.budgetStated).toBe(6_000_000)
    const r = rankCandidates(normalizeShopping(STRUCTURED), need)
    // "tầm 6 triệu" widens to 7.2M by the shipped `around` semantics, so the
    // 6.89M Tiki listing stays in and only the 6.49M/5.2M/6.89M set is ranked.
    expect(r.ranked.length).toBeGreaterThanOrEqual(2)
    expect(r.ranked.every(e => (e.candidate.attrs.priceVnd ?? 0) <= need.budget!.max)).toBe(true)
  })

  it('the English equivalent produces the same ordering', () => {
    const vi = deriveNeedProfile([{ role: 'user', content: 'Mua tai nghe Sony WH-1000XM5, ưu tiên giá rẻ' }])
    const en = deriveNeedProfile([{ role: 'user', content: 'Buy Sony WH-1000XM5 headphones, cheapest option please' }])
    const a = rankCandidates(normalizeShopping(STRUCTURED), vi).ranked.map(x => x.candidate.name)
    const b = rankCandidates(normalizeShopping(STRUCTURED), en).ranked.map(x => x.candidate.name)
    expect(b).toEqual(a)
  })
})
