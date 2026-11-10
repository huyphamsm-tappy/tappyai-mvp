import { describe, it, expect, vi } from 'vitest'
import { runDeepResearch, type DeepResearchDeps, type Evidence } from './deepResearch'
import { deepResearchResponse } from './deepResearchResponse'
import { STANDARD_RUN_BOUNDS } from './researchAdmission'

const deps = (report: string): DeepResearchDeps => ({
  async plan() { return { title: 'T', steps: [{ title: 'Bước 1', queries: ['q'] }] } },
  async gather() { return [{ title: 'N', url: 'https://example.com/a', snippet: 's', text: 'Thị trường đạt 2,26 tỷ USD.' }] },
  async notes(_s: string, _q: string, ev: readonly Evidence[]) { return [{ text: 'thị trường 2,26 tỷ USD', source: ev[0]!.id }] },
  async *write() { yield report },
})
const run = (d: DeepResearchDeps, bounds?: typeof STANDARD_RUN_BOUNDS) => runDeepResearch('q', '', 'vi', d, { status() {}, text() {} }, undefined, bounds)

describe('the verifier is wired to tier runs only', () => {
  it('a tier run returns the report and its cited sources for the verifier; the unbounded run does not', async () => {
    const tier = await run(deps('# B\n\nThị trường đạt 2,26 tỷ USD [1].\n'), STANDARD_RUN_BOUNDS)
    expect(tier.checked?.sources.map(s => s.id)).toEqual([1]); expect(tier.checked?.report).toContain('2,26')
    expect((await run(deps('# B\n\nThị trường đạt 2,26 tỷ USD [1].\n'))).checked).toBeUndefined()
  })
  it('the response logs the verification as counts and sentence numbers, never the text', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = deepResearchResponse({ question: 'q', context: '', lang: 'vi', cost: { usd: 0, calls: 0 }, serperUsd: () => ({ usd: 0, calls: 0 }), onFailed: async () => {}, deps: deps(''), standard: { deps: deps('# B\n\nThị trường đạt 9.999 tỷ USD [1].\n'), bounds: { ...STANDARD_RUN_BOUNDS } } })
    await res.text()
    const line = log.mock.calls.map(c => String(c[0])).find(l => l.includes('tappyai_report_verification'))!
    expect(line).toBeTruthy(); expect(JSON.parse(line)).toMatchObject({ number_not_in_source: 1, flagged: [{ s: 3, status: 'number_not_in_source' }].slice(0, 1).map(f => ({ status: f.status })) })
    expect(line).not.toContain('Thị trường đạt')
    log.mockRestore()
  })
})
