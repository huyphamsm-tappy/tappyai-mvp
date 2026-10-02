import { describe, it, expect } from 'vitest'
import { createEnrichmentCollector } from './toolResultSplit'
import type { Recommendation } from '@/lib/recommendation/recommendation'

// ─────────────────────────────────────────────────────────────────────────────
// THE SLOT ITSELF — the guard site, not the predicate.
//
// `slotAdmission.test.ts` proves `admitsProducer` decides correctly.  This
// proves the COLLECTOR actually asks it, and in the right order.  The
// distinction is the whole bug: the predicate never existed, and the collector's
// only rule was "first non-empty set wins" — which is why an empty place search
// left the slot open for a hotel search to fill on a flight turn.
// ─────────────────────────────────────────────────────────────────────────────

const recs = (n: number): Recommendation[] =>
  Array.from({ length: n }, (_, i) => ({ entity: { identity: { name: `e${i}` } } }) as unknown as Recommendation)

describe('the recommendation slot is domain-aware', () => {
  it('🚨 THE UAT DEFECT: an empty place search does not open the slot for hotels', () => {
    const c = createEnrichmentCollector('máy bay đi, bay từ sài gòn')
    // search_places ran and found nothing — a RESULT, not a vacancy.
    c.setPlacesRecommendations([], 'place')
    // get_hotel_prices then returned eight stays, as the planning block requires.
    c.setPlacesRecommendations(recs(8), 'stay')
    expect(c.placesRecommendations).toBeUndefined()
    expect(c.placesProducer).toBeUndefined()
  })

  it('a hotel turn still gets its hotel card', () => {
    const c = createEnrichmentCollector('khách sạn Đà Nẵng giá rẻ')
    c.setPlacesRecommendations(recs(3), 'stay')
    expect(c.placesRecommendations).toHaveLength(3)
    expect(c.placesProducer).toBe('stay')
  })

  it('a food turn still gets its food card', () => {
    const c = createEnrichmentCollector('Quán bún bò ngon ở TP.HCM')
    c.setPlacesRecommendations(recs(6), 'food')
    expect(c.placesRecommendations).toHaveLength(6)
    expect(c.placesProducer).toBe('food')
  })

  it('records WHICH subject owns the card, so trip subdomains stay distinguishable', () => {
    const c = createEnrichmentCollector('lên kế hoạch chuyến đi Đà Nẵng 3 ngày')
    c.setPlacesRecommendations(recs(4), 'food')
    c.setPlacesRecommendations(recs(8), 'stay')
    // First admitted non-empty set still wins — a plan carries one block.
    expect(c.placesProducer).toBe('food')
    expect(c.placesRecommendations).toHaveLength(4)
  })

  it('a producer with no subject (flights, weather) can never claim the slot', () => {
    const c = createEnrichmentCollector('thời tiết Đà Nẵng')
    c.setPlacesRecommendations(recs(5), null)
    expect(c.placesRecommendations).toBeUndefined()
  })

  it('fails open: an unrecognised turn behaves exactly as it did before the guard', () => {
    const c = createEnrichmentCollector('xyzzy qwerty')
    c.setPlacesRecommendations(recs(2), 'stay')
    expect(c.placesRecommendations).toHaveLength(2)
  })

  it('a collector built with no turn text admits, as every existing caller expects', () => {
    const c = createEnrichmentCollector()
    c.setPlacesRecommendations(recs(2), 'stay')
    expect(c.placesRecommendations).toHaveLength(2)
  })
})
