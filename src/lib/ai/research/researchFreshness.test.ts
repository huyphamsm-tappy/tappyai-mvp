import { describe, it, expect, afterEach, vi } from 'vitest'
import { researchFreshnessOn } from './deepResearchState'
import { runDeepResearch, type DeepResearchDeps, type Evidence, type ResearchPlan } from './deepResearch'

// The gap check is told which measures are running on old readings, so it looks up their latest period first (this year to date). Only with RESEARCH_FRESHNESS; without it the gap check is called
// exactly as before (four arguments).

describe('the flag', () => {
  it('is off by default, on only for "1", locked in production unless the owner lists it', () => {
    expect(researchFreshnessOn({})).toBe(false)
    expect(researchFreshnessOn({ RESEARCH_FRESHNESS: '1' })).toBe(true)
    expect(researchFreshnessOn({ RESEARCH_FRESHNESS: 'yes' })).toBe(false)
    expect(researchFreshnessOn({ RESEARCH_FRESHNESS: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(researchFreshnessOn({ RESEARCH_FRESHNESS: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'RESEARCH_FRESHNESS' })).toBe(true)
  })
})

describe('the engine hands the old-reading measures to the gap check', () => {
  afterEach(() => vi.unstubAllEnvs())
  const plan: ResearchPlan = { title: 'T', steps: [{ title: 'Chi tiêu', queries: ['q'] }] }
  function run(texts: string[], figures: Array<{ series: string; label: string; value: number } | null>) {
    const gapArgs: unknown[][] = []
    const deps: DeepResearchDeps = {
      async plan() { return structuredClone(plan) },
      async gather() { return texts.map((t, i) => ({ title: `N${i}`, url: `https://a${i}.vn/p`, snippet: 's', text: t })) },
      async notes(_s: string, _q: string, e: readonly Evidence[]) { return e.map((x, i) => ({ text: `phát hiện ${x.id}`, source: x.id, figure: figures[i] ? { ...figures[i]!, unit: '%' } : null })) },
      async gaps(...args: unknown[]) { gapArgs.push(args); return [] },
      async *write() { yield '# B\n\n## Chi tiêu\nNội dung [1]\n' },
    }
    return runDeepResearch('câu hỏi', '', 'vi', deps, { status() {}, text() {} }).then(() => gapArgs)
  }
  const old = [{ series: 'Chi 21-35k', label: '2023', value: 29.6 }, { series: 'Chi 21-35k', label: '2024', value: 40 }]
  const oldTexts = ['Chi 21-35k năm 2023 là 29,6', 'Chi 21-35k năm 2024 là 40']

  it('flag on, a measure read twice with its newest reading before this year: the gap check gets a fifth argument naming it', async () => {
    vi.stubEnv('RESEARCH_FRESHNESS', '1')
    const args = await run(oldTexts, old)
    expect(args).toHaveLength(1)
    expect(args[0]).toHaveLength(5)
    const hints = args[0][4] as string[]
    expect(hints).toHaveLength(1)
    expect(hints[0]).toContain('Chi 21-35k')
    expect(hints[0]).toContain('2024')
  })
  it('flag off: the gap check gets exactly four arguments, as before', async () => {
    const args = await run(oldTexts, old)
    expect(args[0]).toHaveLength(4)
  })
  it('flag on but nothing is running on old readings: four arguments', async () => {
    vi.stubEnv('RESEARCH_FRESHNESS', '1')
    const args = await run(['không có số'], [null])
    expect(args[0]).toHaveLength(4)
  })
})
