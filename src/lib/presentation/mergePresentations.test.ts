// Final UAT 19/11: two of three comparisons of two subjects showed one card and no table. The model called present_blocks twice (cards in one call, the table in the other) and the second call REPLACED the first.
import { describe, it, expect } from 'vitest'
import { mergePresentations } from './declare'

const profiles = { id: 'p1', type: 'profiles', subjects: [{ name: 'A' }, { name: 'B' }] }
const compare = { id: 'c1', type: 'compare', columns: ['A', 'B'], rows: [] }
const compare2 = { id: 'c2', type: 'compare', columns: ['A', 'B'], rows: [{ label: 'x' }] }
const booking = { id: 'b1', type: 'booking' }
const wrap = (blocks: unknown[], links: Record<string, unknown> = {}) => ({ presentation: { v: 1, blocks }, links }) as never

describe('mergePresentations', () => {
  it('a second call that declares only the table keeps the cards of the first', () => {
    const m = mergePresentations(wrap([profiles]), wrap([compare]))
    expect(m.presentation.blocks.map(b => b.type)).toEqual(['profiles', 'compare'])
  })
  it('a block type declared again replaces that type only (the newest table wins, the cards stay)', () => {
    const m = mergePresentations(wrap([profiles, compare]), wrap([compare2]))
    expect(m.presentation.blocks.map(b => b.id)).toEqual(['p1', 'c2'])
  })
  it('the first call alone, or no previous call, passes through unchanged', () => {
    const next = wrap([compare])
    expect(mergePresentations(null, next)).toBe(next)
    expect(mergePresentations(undefined, next)).toBe(next)
    expect(mergePresentations(wrap([]), next)).toBe(next)
  })
  it('the partner links of both calls are kept, and a link of a block that is gone is dropped', () => {
    const l1 = { url: 'https://a.test/1', label: 'one', providerId: 'agoda' }
    const l2 = { url: 'https://v.test/2', label: 'two', providerId: 'vexere' }
    const m = mergePresentations(wrap([booking, profiles], { b1: l1, gone: l1 }), wrap([{ id: 'b2', type: 'booking' }], { b2: l2 }))
    expect(Object.keys(m.links).sort()).toEqual(['b2'])
    const kept = mergePresentations(wrap([booking], { b1: l1 }), wrap([compare], {}))
    expect(Object.keys(kept.links)).toEqual(['b1'])
  })
})
