// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
// P0-1 (G2 package 1): a model-decided ask card is built from the router's catalogue only.
import { describe, it, expect } from 'vitest'
import { catalogueAsk, slotView } from './consultRouter'

const STATE = 'cuối tuần làm gì'
const cat = (domain: Parameters<typeof slotView>[0], text = STATE, gps = false) => slotView(domain, text, gps).missing

describe('catalogueAsk', () => {
  it('valid ids -> those catalogue questions first, in the model\'s order, with the catalogue\'s words', () => {
    const r = catalogueAsk({ domains: ['food'], questionIds: ['budget', 'area'] }, STATE, false, 'vi')
    const m = cat('food')
    const want = (id: string) => { const q = m.find(x => x.id === id)!; return { id, q: q.vi, options: q.o.slice(0, 4) } }
    expect(r.source).toBe('catalogue_ids')
    expect(r.unknownIds).toBe(0)
    expect(r.ask?.questions.slice(0, 2)).toEqual([want('budget'), want('area')])
    expect(r.ask?.lead).toBe(slotView('food', STATE, false).lead.vi)
  })
  it('unknown ids -> the router\'s own order; the unknown count is reported', () => {
    const r = catalogueAsk({ domains: ['food'], questionIds: ['q1', 'evil<script>'] }, STATE, false, 'vi')
    expect({ source: r.source, unknown: r.unknownIds, first: r.ask?.questions[0].id }).toEqual({ source: 'catalogue_order', unknown: 2, first: cat('food')[0].id })
  })
  it('English uses the catalogue\'s English text and options', () => {
    const r = catalogueAsk({ domains: ['spa'], questionIds: ['service'] }, 'muốn đi spa', false, 'en')
    const q = slotView('spa', 'muốn đi spa', false).missing.find(x => x.id === 'service')!
    expect(r.ask?.questions[0]).toEqual({ id: 'service', q: q.en, options: q.oEn.slice(0, 4) })
  })
  it('no usable domain -> the server domain question; an unknown domain counts as none', () => {
    for (const domains of [[], ['weapons'], ['']]) {
      const r = catalogueAsk({ domains, questionIds: ['x'] }, STATE, false, 'vi')
      expect({ source: r.source, ids: r.ask?.questions.map(q => q.id) }).toEqual({ source: 'domain_question', ids: ['domain'] })
    }
  })
  it('fewer than two open questions -> no card (source none), as the router itself decides', () => {
    // Measured 16/10: this state leaves ONE open catalogue question (dish) -- below the two a card needs (toAsk).
    const full = 'quán phở bò quận 1 tầm 100k ăn tại quán 2 người tối nay'
    expect(slotView('food', full, true).missing.map(m => m.id)).toEqual(['dish'])
    expect(catalogueAsk({ domains: ['food'], questionIds: ['budget'] }, full, true, 'vi')).toEqual({ ask: undefined, source: 'none', unknownIds: 1 })
  })
  it('every word comes from the catalogue: no model text can reach the card', () => {
    const r = catalogueAsk({ domains: ['entertainment'], questionIds: ['party', 'time'] }, 'đi chơi tối nay', false, 'vi')
    const view = slotView('entertainment', 'đi chơi tối nay', false)
    const words = new Set([view.lead.vi, ...view.missing.flatMap(m => [m.vi, ...m.o])])
    for (const q of r.ask?.questions ?? []) { expect(words.has(q.q)).toBe(true); for (const o of q.options) expect(words.has(o)).toBe(true) }
    expect(words.has(r.ask?.lead ?? '')).toBe(true)
  })
})
