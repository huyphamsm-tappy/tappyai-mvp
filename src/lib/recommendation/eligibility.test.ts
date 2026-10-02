import { describe, it, expect } from 'vitest'
import { classifyEligibility, applyEligibility } from './eligibility'
import { placeRecommendations } from './fromToolResult'
import type { EntityDomain } from './entity'

// ── BUG 4 — the hard domain boundary, across all five domains ────────────────
//
// The rule under test is EXCLUSION, not ranking. A domain mismatch must be
// removed before the ranker sees it; a low score is not a boundary.

const ALL: EntityDomain[] = ['food', 'shopping', 'travel', 'entertainment', 'spa']

describe('🚨 Cây Si — the case that must NOT be excluded', () => {
  // OSM node 446043425, tags {amenity: restaurant, name: "Cây Si"}. Reported as
  // a tree recommended for dining; it is a restaurant named after a banyan tree.
  it('is admitted for Food & Dining on its amenity tag', () => {
    expect(classifyEligibility({ amenity: 'restaurant' }, 'food')).toBe('admit')
  })

  it('survives the whole pipeline into a recommendation', () => {
    const recs = placeRecommendations({
      source: 'OpenStreetMap',
      amenity_type: 'restaurant',
      _tappy_place_domain: 'food',
      results: [{ name: 'Cây Si', maps_link: 'https://maps.google.com/?q=21.03,105.85' }],
    })
    expect(recs.map(r => r.entity.identity.name)).toContain('Cây Si')
  })

  it('the filter never reads the venue NAME — only its category', () => {
    // A name-based filter would have deleted this real restaurant, which is the
    // exact failure such a filter would claim to prevent.
    for (const name of ['Cây Si', 'Cây Đa', 'Hoa Sữa', 'Bún Chả Hương Liên']) {
      expect(classifyEligibility({ amenity: 'restaurant' }, 'food'), name).toBe('admit')
    }
  })
})

describe('admission per domain', () => {
  const CASES: Array<[EntityDomain, { amenity?: string; placeTypes?: string[] }]> = [
    ['food', { amenity: 'restaurant' }],
    ['food', { placeTypes: ['restaurant', 'point_of_interest'] }],
    ['food', { placeTypes: ['buffet_restaurant'] }],
    ['shopping', { placeTypes: ['clothing_store'] }],
    ['shopping', { amenity: 'marketplace' }],
    ['travel', { placeTypes: ['lodging'] }],
    ['travel', { amenity: 'hotel' }],
    ['entertainment', { placeTypes: ['movie_theater'] }],
    ['entertainment', { amenity: 'cinema' }],
    ['spa', { placeTypes: ['spa'] }],
    ['spa', { amenity: 'beauty' }],
  ]
  it.each(CASES)('%s admits %o', (domain, input) => {
    expect(classifyEligibility(input, domain)).toBe('admit')
  })
})

describe('obvious cross-domain contamination is REJECTED', () => {
  const CASES: Array<[string, EntityDomain, { amenity?: string; placeTypes?: string[] }]> = [
    ['a hotel offered for dining', 'food', { placeTypes: ['lodging', 'hotel'] }],
    ['a clothing shop offered for dining', 'food', { placeTypes: ['clothing_store'] }],
    ['a furniture shop offered for dining', 'food', { placeTypes: ['furniture_store'] }],
    ['a natural feature offered for dining', 'food', { placeTypes: ['natural_feature'] }],
    ['a hospital offered for dining', 'food', { placeTypes: ['hospital'] }],
    ['an OSM hotel offered for dining', 'food', { amenity: 'hotel' }],
    ['a restaurant offered for shopping', 'shopping', { placeTypes: ['restaurant'] }],
    ['a restaurant offered for spa', 'spa', { placeTypes: ['restaurant'] }],
    ['a hotel offered for entertainment', 'entertainment', { placeTypes: ['lodging'] }],
    ['a petrol station offered for travel', 'travel', { placeTypes: ['gas_station'] }],
  ]
  it.each(CASES)('%s', (_label, domain, input) => {
    expect(classifyEligibility(input, domain)).toBe('reject')
  })
})

describe('UNKNOWN is not REJECT — recall is protected', () => {
  it('no category evidence at all is unknown, and therefore admitted', () => {
    expect(classifyEligibility({}, 'food')).toBe('unknown')
    const { eligible, excluded } = applyEligibility([{}], 'food', () => ({}))
    expect(eligible).toHaveLength(1)
    expect(excluded).toHaveLength(0)
  })

  it('an unrecognised Google type is unknown, not a mismatch', () => {
    expect(classifyEligibility({ placeTypes: ['point_of_interest', 'establishment'] }, 'food')).toBe('unknown')
  })

  it('an incomplete types array does not reject a legitimate place', () => {
    const { excluded } = applyEligibility(
      [{ place_types: ['establishment'] }],
      'food',
      row => ({ placeTypes: row.place_types }),
    )
    expect(excluded).toHaveLength(0)
  })
})

describe('the boundary is HARD — exclusion, not a lower score', () => {
  it('a mismatched row never reaches the recommendation list', () => {
    const recs = placeRecommendations({
      source: 'Google Maps',
      _tappy_place_domain: 'food',
      results: [
        { place_id: 'a', name: 'Nhà Hàng New Day', place_types: ['restaurant'] },
        { place_id: 'b', name: 'Khách Sạn Metropole', place_types: ['lodging', 'hotel'] },
        { place_id: 'c', name: 'Cửa Hàng Nội Thất', place_types: ['furniture_store'] },
      ],
    })
    const names = recs.map(r => r.entity.identity.name)
    expect(names).toContain('Nhà Hàng New Day')
    expect(names).not.toContain('Khách Sạn Metropole')
    expect(names).not.toContain('Cửa Hàng Nội Thất')
  })

  it('applyEligibility reports what it removed rather than losing it silently', () => {
    const { eligible, excluded } = applyEligibility(
      [{ t: ['restaurant'] }, { t: ['lodging'] }],
      'food',
      row => ({ placeTypes: row.t }),
    )
    expect(eligible).toHaveLength(1)
    expect(excluded).toHaveLength(1)
  })
})

describe('every domain has a working boundary', () => {
  it.each(ALL)('%s admits its own and rejects a clear mismatch', (domain) => {
    const own = { food: 'restaurant', shopping: 'marketplace', travel: 'hotel', entertainment: 'cinema', spa: 'spa' }[domain]
    expect(classifyEligibility({ amenity: own }, domain)).toBe('admit')
    // A cinema is not a spa, a spa is not a restaurant, and so on.
    const foreign = domain === 'food' ? 'hotel' : 'restaurant'
    expect(classifyEligibility({ amenity: foreign }, domain)).toBe('reject')
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// 🚨 AN UNKNOWN DOMAIN MUST NOT BE ANSWERED AS "food".
//
// `_tappy_place_domain` is `place` for any query matching none of the enrichment
// classes, and `place` is not an EntityDomain — so `domainOf` declared it FOOD
// and judged its rows against OSM_ADMIT.food, where a cinema, a mall or a gym is
// "a different domain's venue" and is REJECTED. An unknown domain silently
// became a wrong one, and the rows vanished before any card could be built.
// ─────────────────────────────────────────────────────────────────────────────

describe('🚨 unknown domain fails safe, not into food', () => {
  const row = (name: string, amenity: string) => ({ name, amenity, maps_link: 'https://maps.google.com/?cid=1' })

  const result = (domain: string | undefined, rows: Array<Record<string, unknown>>) => ({
    source: 'OpenStreetMap',
    ...(domain ? { _tappy_place_domain: domain } : {}),
    results: rows,
  })

  it('keeps rows a food boundary would have thrown away', () => {
    // A generic `place` set carrying venues from several categories.
    const recs = placeRecommendations(result('place', [
      row('CGV Vincom', 'cinema'),
      row('Lotte Mart', 'mall'),
      row('Fit24', 'fitness_centre'),
    ]))
    expect(recs.map(r => r.entity.identity.name)).toEqual(['CGV Vincom', 'Lotte Mart', 'Fit24'])
  })

  it('an absent domain field behaves the same way', () => {
    const recs = placeRecommendations(result(undefined, [row('Lotte Mart', 'mall')]))
    expect(recs).toHaveLength(1)
  })

  it('🚨 a STATED domain still enforces its boundary — nothing was loosened', () => {
    // food + a cinema row is a genuine mismatch and must still be rejected.
    const recs = placeRecommendations(result('food', [
      row('Quán Ăn Ngon', 'restaurant'),
      row('CGV Vincom', 'cinema'),
    ]))
    expect(recs.map(r => r.entity.identity.name)).toEqual(['Quán Ăn Ngon'])
  })

  it('every active domain still admits its own venues', () => {
    const cases: Array<[string, string, string]> = [
      ['food', 'restaurant', 'Quán Ăn'],
      ['spa', 'massage', 'Sen Spa'],
      ['entertainment', 'cinema', 'CGV'],
      ['shopping', 'mall', 'Takashimaya'],
    ]
    for (const [domain, amenity, name] of cases) {
      const recs = placeRecommendations(result(domain, [row(name, amenity)]))
      expect(recs.map(r => r.entity.identity.name), domain).toEqual([name])
    }
  })
})
