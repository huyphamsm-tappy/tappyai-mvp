import { describe, it, expect, vi } from 'vitest'
import { deepResearchResponse } from './deepResearchResponse'
import { readResearchStatus, type DeepResearchDeps, type Evidence, type ResearchPlan, type RunBounds } from './deepResearch'
import { STANDARD_RUN_BOUNDS } from './researchAdmission'

vi.spyOn(console, 'log').mockImplementation(() => {})

const mk = (steps: number): DeepResearchDeps => ({
  async plan(): Promise<ResearchPlan> { return { title: 'T', steps: Array.from({ length: steps }, (_, i) => ({ title: `Bước ${i + 1}`, queries: ['q'] })) } },
  async gather() { return [{ title: 'N', url: 'https://example.com/a', snippet: 's', text: 'nội dung' }] },
  async notes(_s: string, _q: string, ev: readonly Evidence[]) { return [{ text: 'phát hiện', source: ev[0]!.id }] },
  async *write() { yield '# B\n\nNội dung [1]\n' },
})
const tiers = async (res: Response): Promise<Array<string | undefined>> => {
  const text = await res.text()
  return text.split('\n').filter(l => l.startsWith('8:')).map(l => (JSON.parse(l.slice(2)) as Array<{ tier?: string; type?: string }>)[0]).filter(f => f?.type === 'tappy.research.v1').map(f => f.tier)
}
const turn = (o: { standard?: { steps: number; label: 'standard' | 'advanced' }; promote?: boolean }) => deepResearchResponse({
  question: 'q', context: '', lang: 'vi', cost: { usd: 0, calls: 0 }, serperUsd: () => ({ usd: 0, calls: 0 }), onFailed: async () => {},
  deps: mk(3),
  ...(o.standard ? { standard: { deps: mk(o.standard.steps), bounds: { ...STANDARD_RUN_BOUNDS, maxSteps: 3 }, label: o.standard.label } } : {}),
  ...(o.promote ? { promote: async () => ({ deps: mk(3), bounds: { ...STANDARD_RUN_BOUNDS, maxSteps: 13 } as RunBounds }) } : {}),
})

describe('the report says which kind it is (owner 11/11: the system must tell standard from advanced)', () => {
  it('a Standard run: every status frame carries tier "standard"', async () => {
    const t = await tiers(turn({ standard: { steps: 3, label: 'standard' } }))
    expect(t.length).toBeGreaterThan(2); expect(new Set(t)).toEqual(new Set(['standard']))
  })
  it('an Advanced run: tier "advanced" on every frame', async () => {
    expect(new Set(await tiers(turn({ standard: { steps: 3, label: 'advanced' } })))).toEqual(new Set(['advanced']))
  })
  it('a Standard plan too big and promoted: the frames of the first attempt say standard, the report itself says advanced', async () => {
    const t = await tiers(turn({ standard: { steps: 5, label: 'standard' }, promote: true }))
    expect(t.at(-1)).toBe('advanced'); expect(t.every(x => x === 'standard' || x === 'advanced')).toBe(true)
  })
  it('the existing engine (a request that never entered a tier) carries no tier at all', async () => {
    expect(new Set(await tiers(turn({})))).toEqual(new Set([undefined]))
  })
  it('a Standard plan too big with no Advanced allowance no longer reruns on the existing engine (owner 11/11/2026, R13: no Luna): the run ends failed and no frame is a finished report', async () => {
    const fb = await tiers(turn({ standard: { steps: 5, label: 'standard' } }))
    expect(fb.every(x => x === 'standard')).toBe(true)
  })
})

describe('readResearchStatus validates the tier', () => {
  const base = { type: 'tappy.research.v1', title: 'T', phase: 'done', steps: [], sources: 3 }
  it('keeps "standard" and "advanced"; drops anything else', () => {
    expect(readResearchStatus([{ ...base, tier: 'advanced' }])?.tier).toBe('advanced')
    expect(readResearchStatus([{ ...base, tier: 'standard' }])?.tier).toBe('standard')
    expect(readResearchStatus([{ ...base, tier: 'premium' }])?.tier).toBeUndefined()
    expect(readResearchStatus([{ ...base, tier: 5 }])?.tier).toBeUndefined()
    expect(readResearchStatus([base])?.tier).toBeUndefined()
  })
})
