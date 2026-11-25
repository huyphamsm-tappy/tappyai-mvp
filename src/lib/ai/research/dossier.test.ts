import { describe, it, expect } from 'vitest'
import { assembleDossier, type EvidenceIn, type FactIn } from './dossier'

const NOW = new Date('2026-11-10T08:00:00Z')
const ev = (id: string, url: string, title: string, text = '', over: Partial<EvidenceIn> = {}): EvidenceIn => ({ id, url, title, snippet: '', text, sourceType: 'OFFICIAL_BUSINESS', ...over })
const fact = (evidenceId: string, value: unknown, over: Partial<FactIn> = {}): FactIn => ({ entityKey: 'place:a', factType: 'opening_hours', value, evidenceId, retrievedAt: '2026-11-08T00:00:00Z', ...over })
const base = (o = {}) => ({ query: 'bún chả hà nội', evidence: [] as EvidenceIn[], facts: [] as FactIn[], now: NOW, budgetChars: 10_000, ...o })

describe('assembleDossier', () => {
  it('is deterministic: the same input gives the same output', () => {
    const input = base({ evidence: [ev('1', 'https://a.vn/x', 'Bún chả Hà Nội', 'bún chả ngon'), ev('2', 'https://b.vn/y', 'Phở', 'phở bò')], facts: [fact('1', { open: '8-21' })] })
    expect(assembleDossier(input)).toEqual(assembleDossier(input))
  })
  it('merges the same page written two ways (canonical address) and counts it', () => {
    const d = assembleDossier(base({ evidence: [ev('1', 'https://www.a.vn/x/', 'Bún chả', 'nội dung dài về bún chả ngon nhất'), ev('2', 'https://a.vn/x', 'Bún chả', 'nội dung dài về bún chả ngon nhất')] }))
    expect(d.sources).toHaveLength(1); expect(d.duplicatesMerged).toBe(1)
  })
  it('a copy of an article on another site shares its independence group: it does not count as a second source', () => {
    const body = 'Quán bún chả nổi tiếng ở phố Lê Văn Hưu phục vụ từ sáng đến tối với giá phải chăng và nhiều món nướng thơm lừng'
    const d = assembleDossier(base({
      evidence: [ev('1', 'https://news-a.vn/bai', 'Bún chả phố cổ', body, { sourceType: 'NEWS' }), ev('2', 'https://news-b.vn/chep', 'Bún chả phố cổ', body, { sourceType: 'NEWS' })],
      facts: [fact('1', { open: '8-21' }, { factType: 'permanently_closed' }), fact('2', { open: '8-21' }, { factType: 'permanently_closed' })],
    }))
    expect(d.sources[0].group).toBe(d.sources[1].group)
    expect(d.facts).toHaveLength(1); expect(d.facts[0].independentGroups).toBeLessThanOrEqual(1)
  })
  it('ranks by relevance to the query: the page about the topic first, the unrelated one last', () => {
    const d = assembleDossier(base({ evidence: [ev('1', 'https://a.vn/1', 'Giá vàng hôm nay', 'giá vàng tăng'), ev('2', 'https://b.vn/2', 'Bún chả Hà Nội ngon', 'bún chả hà nội quán ngon bún chả')] }))
    expect(d.sources.map(s => s.id)).toEqual(['2', '1']); expect(d.sources[0].score).toBeGreaterThan(d.sources[1].score)
  })
  it('groups equal values (any casing or spacing) into one fact with all its evidence, and judges it with the evidence gate', () => {
    const d = assembleDossier(base({
      evidence: [ev('1', 'https://quan.vn/', 'Quán', 'x'), ev('2', 'https://maps.example.com/p', 'Maps', 'y', { sourceType: 'PROVIDER_API' })],
      facts: [fact('1', { text: '8-21 hàng ngày' }), fact('2', { text: '8-21  Hàng ngày' })],
    }))
    expect(d.facts).toHaveLength(1)
    expect(d.facts[0]).toMatchObject({ independentGroups: 2, state: 'STRONG_SUPPORT' }); expect(d.facts[0].evidenceIds.sort()).toEqual(['1', '2'])
  })
  it('two different values for one entity and type stay as two facts and are both marked important', () => {
    const d = assembleDossier(base({ evidence: [ev('1', 'https://a.vn/', 'A', 'x'), ev('2', 'https://b.vn/', 'B', 'y')], facts: [fact('1', '8-21'), fact('2', '9-22')] }))
    expect(d.facts).toHaveLength(2); expect(d.facts.every(f => f.important)).toBe(true)
  })
  it('a fact whose evidence is not in the set is ignored, never invented', () => {
    expect(assembleDossier(base({ evidence: [ev('1', 'https://a.vn/', 'A')], facts: [fact('zzz', 'x')] })).facts).toEqual([])
  })
})

describe('budget-aware packing', () => {
  const many = Array.from({ length: 30 }, (_, i) => ev(String(i), `https://s${i}.vn/p`, `Nguồn ${i} bún chả`, 'bún chả '.repeat(80)))
  it('drops the least relevant plain sources first and says how many', () => {
    const d = assembleDossier(base({ evidence: many, budgetChars: 3000 }))
    expect(d.sources.length).toBeLessThan(30); expect(d.omitted.sources).toBe(30 - d.sources.length)
    expect(d.chars).toBeLessThanOrEqual(3000 + 1500)
  })
  it('never cuts an important fact or the source it stands on, even over the budget', () => {
    const evidence = [...many, ev('c1', 'https://conflict-a.vn/', 'A', 'x'), ev('c2', 'https://conflict-b.vn/', 'B', 'y')]
    const d = assembleDossier(base({ evidence, facts: [fact('c1', '8-21'), fact('c2', '9-22')], budgetChars: 100 }))
    expect(d.facts).toHaveLength(2)
    expect(d.sources.map(s => s.id)).toEqual(expect.arrayContaining(['c1', 'c2']))
  })
  it('empty input is an empty dossier', () => {
    expect(assembleDossier(base())).toMatchObject({ sources: [], facts: [], duplicatesMerged: 0, omitted: { sources: 0, facts: 0 } })
  })
})
