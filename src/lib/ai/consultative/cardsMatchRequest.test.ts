import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { onlyMatchingCards, cardsConsistentWithAnswer } from './cardsMatchRequest'
import { parseShoppingMarker, renderShoppingMarker, type SynthesisView } from './synthesisView'

// 30/10 localhost (MacBook Air M3): the answer talked about two product pages and the card under it showed a different product
// ("MacBook Neo", a different model line) next to the two that matched. When the tools found listings that match what the person
// asked for, a listing whose match is unclear or different is not put beside them.

const ent = (key: string, name: string, matchesRequest: 'khop' | 'khac' | 'chua_ro', recommended = false) =>
  ({ key, name, config: '', specs: [], condition: null, matchesRequest, recommended, priceLow: 1, priceHigh: 1, image: null, offers: [] }) as unknown as SynthesisView['entities'][number]
const marker = (entities: SynthesisView['entities'], recKey: string | null = null) =>
  renderShoppingMarker({ v: 1, entities, recommendation: recKey ? ({ entityKey: recKey, seller: null, reasons: [], tradeOff: null, conditional: false } as never) : null, asked: null } as unknown as SynthesisView)
const names = (m: string) => parseShoppingMarker(m).view?.entities.map(e => e.name)

describe('cardsConsistentWithAnswer: a card whose numbers the answer never mentions is a different model', () => {
  const m = () => marker([ent('a', 'Apple iPhone 15 Pro Max', 'chua_ro'), ent('b', 'Apple iPhone 16 Pro Max 256GB', 'chua_ro'), ent('c', 'iPhone 15 Pro Max 256GB', 'chua_ro'), ent('d', 'iPhone 15 Plus', 'chua_ro')])
  it('drops the listings with a number (generation, capacity, code) the answer does not contain', () => {
    const out = cardsConsistentWithAnswer(m(), 'Giá iPhone 15 Pro Max 256 GB khoảng 17 triệu, mới 25 triệu.')
    expect(names(out)).toEqual(['Apple iPhone 15 Pro Max', 'iPhone 15 Pro Max 256GB', 'iPhone 15 Plus'])
  })
  it('a spaced capacity ("256 GB") still matches "256GB"', () => {
    expect(names(cardsConsistentWithAnswer(marker([ent('a', 'X 256GB', 'chua_ro'), ent('b', 'X 512GB', 'chua_ro')]), 'bản 256 GB giá tốt'))).toEqual(['X 256GB'])
  })
  it('never blanks the card: when nothing is consistent, everything stays', () => {
    const only = marker([ent('a', 'Model 99', 'chua_ro'), ent('b', 'Model 98', 'chua_ro')])
    expect(cardsConsistentWithAnswer(only, 'a general answer with no figures')).toBe(only)
  })
  it('a listing with no number at all is kept (nothing to contradict)', () => {
    const k = marker([ent('a', 'Kettle Pro', 'chua_ro'), ent('b', 'Kettle 2000W', 'chua_ro')])
    expect(names(cardsConsistentWithAnswer(k, 'Kettle Pro is fine'))).toEqual(['Kettle Pro'])
  })
  it('the answer\'s own text only: the machine blocks are not read as the answer', () => {
    const out = cardsConsistentWithAnswer(m(), 'Giá iPhone 15 Pro Max 17 triệu.\n[TAPPY_SHOPPING]{"x":"iPhone 16 Pro Max 256GB"}[/TAPPY_SHOPPING]')
    expect(names(out)).not.toContain('Apple iPhone 16 Pro Max 256GB')
  })
  it('works for any product family', () => {
    const k = marker([ent('a', 'Máy giặt LG 9kg', 'chua_ro'), ent('b', 'Máy giặt LG 11kg', 'chua_ro')])
    expect(names(cardsConsistentWithAnswer(k, 'Mình chọn máy giặt LG 9 kg'))).toEqual(['Máy giặt LG 9kg'])
  })
})

describe('wiring', () => {
  it('one brain applies it when the answer named no listing', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/ai/streamEnrichment.ts'), 'utf8')
    expect(src).toContain('collector.oneBrain === true && collector.shoppingMarker) collector.shoppingMarker = cardsConsistentWithAnswer(onlyMatchingCards(collector.shoppingMarker), mainText)')
  })
})

describe('onlyMatchingCards', () => {
  it('keeps only the listings that match when at least one does', () => {
    const m = marker([ent('a', 'Model X (other line)', 'chua_ro'), ent('b', 'Model Y 13 inch', 'khop'), ent('c', 'Model Z', 'khac'), ent('d', 'Model Y 16GB', 'khop')])
    expect(names(onlyMatchingCards(m))).toEqual(['Model Y 13 inch', 'Model Y 16GB'])
  })
  it('leaves everything when nothing matches (the person stated no configuration, or the lookup could not tell)', () => {
    const m = marker([ent('a', 'A', 'chua_ro'), ent('b', 'B', 'chua_ro')])
    expect(onlyMatchingCards(m)).toBe(m)
  })
  it('leaves everything when all match', () => {
    const m = marker([ent('a', 'A', 'khop'), ent('b', 'B', 'khop')])
    expect(onlyMatchingCards(m)).toBe(m)
  })
  it('drops a crowned recommendation whose card was dropped', () => {
    const m = marker([ent('a', 'A', 'chua_ro', true), ent('b', 'B', 'khop')], 'a')
    const out = parseShoppingMarker(onlyMatchingCards(m)).view!
    expect(out.entities.map(e => e.name)).toEqual(['B'])
    expect(out.recommendation).toBeNull()
    expect(out.entities.some(e => e.recommended)).toBe(false)
  })
  it('a marker that does not parse is returned as it was', () => {
    expect(onlyMatchingCards('[TAPPY_SHOPPING]not json[/TAPPY_SHOPPING]')).toBe('[TAPPY_SHOPPING]not json[/TAPPY_SHOPPING]')
  })
  it('works the same for any product family (nothing names one)', () => {
    for (const [wrong, right] of [['Washer Pro 9kg', 'Fridge 300L'], ['Phone A', 'Phone B'], ['Kettle', 'Headphones']]) {
      const m = marker([ent('a', wrong, 'chua_ro'), ent('b', right, 'khop')])
      expect(names(onlyMatchingCards(m))).toEqual([right])
    }
  })
})
