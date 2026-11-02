import { describe, it, expect } from 'vitest'
import { createLeanResearch } from './researchLoop'

const noFetch = async () => { throw new Error('no fetch in this test') }
const allowAll = { check: async () => ({ allowed: true, reason: 'allowed' as const }), __reset: () => undefined }

describe('LeanResearch.collectFrom (Wave 4 · C3)', () => {
  it('a result the code obtained adds its links (link / url / website keys, nested) and nothing else', () => {
    const r = createLeanResearch({ lang: 'vi', userTexts: [], fetchPage: noFetch as never, robots: allowAll as never })
    expect(r.allowedCount()).toBe(0)
    r.collectFrom({ results: [{ name: 'A', link: 'https://a.example/x' }, { name: 'B', nested: { website: 'https://b.example/' } }, { name: 'C', note: 'https://c.example/ in free text is not a link field' }] })
    expect(r.allowedCount()).toBe(2)
  })
  it('an odd shape, null, a string or a cyclic-looking deep object adds nothing and never throws', () => {
    const r = createLeanResearch({ lang: 'vi', userTexts: [], fetchPage: noFetch as never, robots: allowAll as never })
    for (const x of [null, undefined, 'https://x.example/', 42, { a: { b: { c: { d: { e: { f: { link: 'https://deep.example/' } } } } } } }]) expect(() => r.collectFrom(x)).not.toThrow()
    expect(r.allowedCount()).toBe(0)
  })
  it('a slimmed place card (no link field, as the pre-search hands it on) adds nothing', () => {
    const r = createLeanResearch({ lang: 'vi', userTexts: [], fetchPage: noFetch as never, robots: allowAll as never })
    r.collectFrom({ source: 'Serper Maps', results: [{ name: 'Cà phê Mây', address: 'x', rating_value: 4.5 }] })
    expect(r.allowedCount()).toBe(0)
  })
})
