import { describe, it, expect } from 'vitest'
import { placeRecommendations } from './fromToolResult'
import { UNKNOWN } from '@/lib/ai/consultative/normalizedEvidence'

// ─────────────────────────────────────────────────────────────────────────────
// SERPER EVIDENCE THAT WAS RETRIEVED, SCOPED, ATTRIBUTED — AND THEN DROPPED.
//
// `food.ts` writes `price_search_results` / `order_search_results` onto the
// result ENVELOPE, each item already tagged by `placeNamedBy` with an
// `evidence_scope` and, for entity-level items, an `evidence_about` naming the
// exact place. `buildPlaceEntity` then read `row.price_search_results` — a key
// no row has ever carried. Measured 2026-09-10: 18 items retrieved across three
// domains, ZERO reaching an entity, `priceSignal` unknown on every place.
//
// The other half of the contract matters just as much: an `area` item is a
// listicle about a district, and attaching one to a venue is what produced
// "Bún Bò Huế Đông Ba — giá tham khảo 25.000–50.000đ" from an article about
// Quận 1. Area evidence must stay where the prose layer can qualify it.
// ─────────────────────────────────────────────────────────────────────────────

const RESULT = (over: Record<string, unknown> = {}) => ({
  source: 'OpenStreetMap',
  _tappy_place_domain: 'food',
  amenity_type: 'restaurant',
  results: [
    { name: 'Bún Bò Huế Đông Ba', address: '19 Trần Cao Vân', maps_link: 'https://maps.google.com/?q=1', amenity: 'restaurant' },
    { name: 'Bún Bò Gia Hội', address: '20 Lý Tự Trọng', maps_link: 'https://maps.google.com/?q=2', amenity: 'restaurant' },
  ],
  ...over,
})

const priceSignalOf = (name: string, result: unknown) => {
  const rec = placeRecommendations(result).find(r => r.entity.identity.name === name)
  return rec?.entity.pricing.priceSignal
}

describe('ENTITY-scoped price evidence reaches the entity', () => {
  it('attaches an entity-scoped snippet to the place it names', () => {
    const signal = priceSignalOf('Bún Bò Huế Đông Ba', RESULT({
      price_search_results: [
        { title: 'Bún Bò Huế Đông Ba giá bao nhiêu', snippet: '35.000đ', link: 'https://x/1', evidence_scope: 'entity', evidence_about: 'Bún Bò Huế Đông Ba' },
      ],
    }))
    expect(signal?.value).toBe('price_search_results')
    // Weak evidence, and it must stay labelled as such all the way down.
    expect(signal?.evidence_type).toBe('REVIEW_SUPPORTED')
    expect(signal?.source_type).toBe('search_snippet')
  })

  it('does NOT attach it to the OTHER place in the same result set', () => {
    const signal = priceSignalOf('Bún Bò Gia Hội', RESULT({
      price_search_results: [
        { title: 'Bún Bò Huế Đông Ba giá bao nhiêu', snippet: '35.000đ', link: 'https://x/1', evidence_scope: 'entity', evidence_about: 'Bún Bò Huế Đông Ba' },
      ],
    }))
    expect(signal?.value).toBe(UNKNOWN)
  })
})

describe('AREA-scoped evidence never becomes an entity fact', () => {
  it('refuses a listicle about the district', () => {
    const result = RESULT({
      price_search_results: [
        { title: 'Danh sách quán bún bò Quận 1 ngon', snippet: '25.000–50.000đ', link: 'https://x/2', evidence_scope: 'area' },
      ],
    })
    for (const name of ['Bún Bò Huế Đông Ba', 'Bún Bò Gia Hội']) {
      expect(priceSignalOf(name, result)?.value).toBe(UNKNOWN)
    }
  })

  it('refuses an item with no scope at all', () => {
    const result = RESULT({ price_search_results: [{ title: 'x', snippet: 'y', link: 'https://x/3' }] })
    expect(priceSignalOf('Bún Bò Huế Đông Ba', result)?.value).toBe(UNKNOWN)
  })

  /**
   * 🚨 DEFENCE IN DEPTH, AND A MUTATION PROVED IT WAS NOT YET LOAD-BEARING.
   *
   * Deleting the `evidence_scope !== 'entity'` check SURVIVED the first mutation
   * run, because `food.ts` sets scope and `evidence_about` from the same
   * expression — an `area` item never carries an `evidence_about`, so the very
   * next line dropped it anyway. The two checks were perfectly correlated, which
   * made one of them free to delete without any test noticing.
   *
   * That correlation is a property of TODAY'S producer, not of the contract. If
   * a future producer ever labels an item `area` while still naming a venue it
   * mentions, the scope check is the only thing standing between a listicle and
   * a price on that venue's card. This case makes it stand on its own.
   */
  it('refuses an AREA item even when it names a venue in the set', () => {
    const result = RESULT({
      price_search_results: [
        {
          title: 'Danh sách quán bún bò Quận 1, có Bún Bò Huế Đông Ba',
          snippet: '25.000–50.000đ', link: 'https://x/5',
          evidence_scope: 'area', evidence_about: 'Bún Bò Huế Đông Ba',
        },
      ],
    })
    expect(priceSignalOf('Bún Bò Huế Đông Ba', result)?.value).toBe(UNKNOWN)
  })

  it('refuses an entity-scoped item whose `evidence_about` names nobody in the set', () => {
    const result = RESULT({
      price_search_results: [
        { title: 'z', snippet: 'y', link: 'https://x/4', evidence_scope: 'entity', evidence_about: 'Quán Không Tồn Tại' },
      ],
    })
    expect(priceSignalOf('Bún Bò Huế Đông Ba', result)?.value).toBe(UNKNOWN)
  })
})

describe('ENTITY-scoped ordering evidence becomes a DIRECT order action', () => {
  const orderAction = (name: string, result: unknown) => {
    const rec = placeRecommendations(result).find(r => r.entity.identity.name === name)
    return rec?.entity.actions.filter(a => a.kind === 'order' && a.urlKind === 'direct') ?? []
  }

  it('gives the named venue its own ShopeeFood page as a direct destination', () => {
    const acts = orderAction('Bún Bò Huế Đông Ba', RESULT({
      order_search_results: [
        { title: 'Bún Bò Huế Đông Ba - ShopeeFood', link: 'https://shopeefood.vn/da-nang/bun-bo-hue-dong-ba', evidence_scope: 'entity', evidence_about: 'Bún Bò Huế Đông Ba' },
      ],
    }))
    expect(acts).toHaveLength(1)
    expect(acts[0].url).toBe('https://shopeefood.vn/da-nang/bun-bo-hue-dong-ba')
    expect(acts[0].attributed).toBe(true)
  })

  /**
   * 🚨 "ShopeeFood has lots of bún bò places" is not evidence that THIS
   * restaurant delivers. Same rule `isOrderingClaim` enforces in prose, on a
   * different surface.
   */
  it('an area-scoped ordering snippet produces NO direct order action', () => {
    const acts = orderAction('Bún Bò Huế Đông Ba', RESULT({
      order_search_results: [
        { title: 'Top quán bún bò trên ShopeeFood', link: 'https://shopeefood.vn/da-nang/collection/bun-bo', evidence_scope: 'area' },
      ],
    }))
    expect(acts).toHaveLength(0)
  })
})

describe('the envelope is left alone when it carries nothing scoped', () => {
  it('a result with no evidence arrays builds the same entities', () => {
    const recs = placeRecommendations(RESULT())
    expect(recs.map(r => r.entity.identity.name)).toEqual(['Bún Bò Huế Đông Ba', 'Bún Bò Gia Hội'])
    expect(recs[0].entity.pricing.priceSignal.value).toBe(UNKNOWN)
  })
})
