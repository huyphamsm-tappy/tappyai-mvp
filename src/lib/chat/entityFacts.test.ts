import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFacts, fetchEntityFacts, __clearEntityFactsCache } from './entityFacts'

beforeEach(() => __clearEntityFactsCache())

describe('readFacts: the server\'s answer, re-checked', () => {
  it('bounded plain text; a Wikidata link only when it is a wikidata.org item page and there are facts', () => {
    const r = readFacts({ facts: [{ label: 'Sinh', value: '1971\u0000' }, { label: '', value: 'x' }, { label: 'Quốc tịch', value: 'a'.repeat(400) }, null], wikidata: 'https://www.wikidata.org/wiki/Q317521' })
    expect(r.facts).toHaveLength(2)
    expect(r.facts[0]).toEqual({ label: 'Sinh', value: '1971' })
    expect(r.facts[1].value.length).toBe(160)
    expect(r.wikidata).toBe('https://www.wikidata.org/wiki/Q317521')
    expect(readFacts({ facts: [{ label: 'a', value: 'b' }], wikidata: 'https://evil.example/wiki/Q1' }).wikidata).toBeUndefined()
    expect(readFacts({ facts: [], wikidata: 'https://www.wikidata.org/wiki/Q1' })).toEqual({ facts: [] })
    expect(readFacts(null)).toEqual({ facts: [] })
    expect(readFacts({ facts: 'nope' })).toEqual({ facts: [] })
  })
})

describe('fetchEntityFacts', () => {
  it('one request per subject per session, with the wiki and the language; a failure is no table', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ facts: [{ label: 'Sinh', value: '1971' }] }) })
    await fetchEntityFacts('Elon Musk', 'en', 'vi', f as never)
    await fetchEntityFacts('elon musk', 'en', 'vi', f as never)
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith('/api/entity-facts?t=Elon%20Musk&w=en&ui=vi')
    const bad = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await fetchEntityFacts('Tesla', 'en', 'vi', bad as never)).toEqual({ facts: [] })
    const notOk = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    expect(await fetchEntityFacts('Sam Altman', 'en', 'vi', notOk as never)).toEqual({ facts: [] })
  })
})
