import { describe, it, expect } from 'vitest'
import { comparisonFromSynthesis } from './comparisonFromSynthesis'
import type { SynthesisView, SynthesisEntityView } from '@/lib/ai/consultative/synthesisView'

// P4-05 — the comparison the chat actually renders is DERIVED from the decision the backend
// already sent. These tests pin the two properties that make that safe:
//   1. it restates, it never infers;
//   2. a recommendation without a reason is never marked (DD-005).

const t = (k: string, p?: Record<string, string>) =>
  p ? `${k}:${Object.values(p).join(',')}` : k

function entity(over: Partial<SynthesisEntityView> = {}): SynthesisEntityView {
  return {
    key: 'e1',
    config: 'Air M1 8GB',
    matchesRequest: 'khop',
    recommended: false,
    priceLow: 18_990_000,
    priceHigh: 20_490_000,
    image: null,
    offers: [],
    ...over,
  }
}

function view(entities: SynthesisEntityView[], recommendation: SynthesisView['recommendation'] = null): SynthesisView {
  return { v: 1, entities, recommendation }
}

describe('comparisonFromSynthesis', () => {
  it('is not offered below two entities', () => {
    expect(comparisonFromSynthesis(view([entity()]), t, 'vi')).toBeNull()
    expect(comparisonFromSynthesis(view([]), t, 'vi')).toBeNull()
    expect(comparisonFromSynthesis(null, t, 'vi')).toBeNull()
  })

  it('restates only fields the backend supplied', () => {
    const c = comparisonFromSynthesis(
      view([
        entity({ key: 'a', config: 'Air M1', offers: [{ seller: 'CPS', url: null, price: 1, currency: 'VND', condition: null }] }),
        entity({ key: 'b', config: 'Air M2', matchesRequest: 'khac' }),
      ]),
      t, 'vi',
    )!

    expect(c.entities.map(e => e.key)).toEqual(['a', 'b'])
    expect(c.entities[0].label).toBe('Air M1')
    // Exactly three attributes, each a restatement of a field ShoppingDecision already shows.
    expect(c.attributes.map(a => a.key)).toEqual(['price', 'match', 'sellers'])
  })

  it('never invents a "cheapest" or ranked attribute', () => {
    const c = comparisonFromSynthesis(view([entity({ key: 'a' }), entity({ key: 'b', priceLow: 1 })]), t, 'vi')!
    const keys = c.attributes.map(a => a.key)
    for (const forbidden of ['cheapest', 'best', 'score', 'rank', 'value']) {
      expect(keys, 'the client must form no opinion the server did not state').not.toContain(forbidden)
    }
  })

  it('leaves an entity with no offers as unknown rather than "0 sellers"', () => {
    const c = comparisonFromSynthesis(view([entity({ key: 'a' }), entity({ key: 'b' })]), t, 'vi')!
    expect(c.entities[0].values.sellers).toBeNull()
  })

  it('marks the recommendation only when a reason accompanies it', () => {
    const entities = [entity({ key: 'a', recommended: true }), entity({ key: 'b' })]

    const withReason = comparisonFromSynthesis(
      view(entities, { entityKey: 'a', seller: null, reasons: [{ attribute: 'gia', evidence: 'Rẻ hơn 6 triệu' }], tradeOff: null, conditional: false }),
      t, 'vi',
    )!
    expect(withReason.recommendedKey).toBe('a')
    expect(withReason.reason).toBe('Rẻ hơn 6 triệu')

    const withoutReason = comparisonFromSynthesis(
      view(entities, { entityKey: 'a', seller: null, reasons: [], tradeOff: null, conditional: false }),
      t, 'vi',
    )!
    expect(withoutReason.recommendedKey, 'DD-005: a recommendation without a reason is not shipped').toBeNull()
    expect(withoutReason.reason).toBeNull()
  })

  it('ignores a recommendation pointing at a different entity', () => {
    // The same guard ShoppingDecision uses: a reason attached elsewhere is not this entity's reason.
    const c = comparisonFromSynthesis(
      view(
        [entity({ key: 'a', recommended: true }), entity({ key: 'b' })],
        { entityKey: 'b', seller: null, reasons: [{ attribute: 'x', evidence: 'unrelated' }], tradeOff: null, conditional: false },
      ),
      t, 'vi',
    )!
    expect(c.recommendedKey).toBeNull()
  })

  it('joins multiple reasons rather than dropping any', () => {
    const c = comparisonFromSynthesis(
      view(
        [entity({ key: 'a', recommended: true }), entity({ key: 'b' })],
        {
          entityKey: 'a', seller: null, tradeOff: null, conditional: false,
          reasons: [{ attribute: 'gia', evidence: 'Rẻ hơn' }, { attribute: 'pin', evidence: 'Pin lâu hơn' }],
        },
      ),
      t, 'vi',
    )!
    expect(c.reason).toContain('Rẻ hơn')
    expect(c.reason).toContain('Pin lâu hơn')
  })
})
