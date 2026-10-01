import { describe, it, expect } from 'vitest'
import { createEnrichmentCollector } from './toolResultSplit'
import type { Recommendation } from '@/lib/recommendation/types'

// PL-PLAN-CARD-RACE (owner UAT 2026-10-01): the same trip request showed hotel cards once and restaurant cards once, because
// the hotel / food / sights searches run in parallel and the first to finish took the single card block.
const rec = (name: string) => ({ entity: { id: name, identity: { name } } }) as unknown as Recommendation
const TEXT = 'Lên kế hoạch đi Đà Nẵng 3 ngày 2 đêm khách sạn quán ăn'

describe('a trip plan carries the hotel block whichever search returns first', () => {
  for (const order of [['stay', 'place'], ['place', 'stay'], ['place', 'food', 'stay']] as const) {
    it(`arrival order ${order.join(' → ')}`, () => {
      const c = createEnrichmentCollector(TEXT)
      c.preferStay = true
      for (const k of order) c.setPlacesRecommendations([rec(k)], k as never)
      expect(c.placesProducer).toBe('stay')
      expect(c.placesRecommendations![0].entity.identity.name).toBe('stay')
    })
  }
  it('without the flag the old first-wins rule is unchanged (single-domain turns)', () => {
    const c = createEnrichmentCollector(TEXT)
    c.setPlacesRecommendations([rec('place')], 'place' as never)
    c.setPlacesRecommendations([rec('stay')], 'stay' as never)
    expect(c.placesProducer).toBe('place')
  })
})
