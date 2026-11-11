import { describe, it, expect } from 'vitest'
import { runDeepResearch, type DeepResearchDeps, type Evidence, type ResearchPlan, type RunBounds } from './deepResearch'
import { STANDARD_RUN_BOUNDS } from './researchAdmission'

function harness(plan: ResearchPlan, gapSteps = 5) {
  const calls = { gather: [] as string[], gaps: 0, notes: 0, write: 0 }
  let urls = 0
  const deps: DeepResearchDeps = {
    async plan() { return plan },
    async gather(q) { calls.gather.push(q); urls++; return [{ title: `Nguồn ${urls}`, url: `https://example.com/p-${urls}`, snippet: 's', text: 'nội dung' }] },
    async notes(step: string, _q: string, evidence: readonly Evidence[]) { calls.notes++; return [{ text: `phát hiện ${step} ${urls}`, source: evidence[0]!.id }] },
    async gaps() { calls.gaps++; return Array.from({ length: gapSteps }, (_, i) => ({ title: `Bù ${i}`, queries: ['g1', 'g2', 'g3'], completes: null })) },
    async *write() { calls.write++; yield '# Báo cáo\n\nNội dung [1]\n' },
  }
  const run = (bounds?: RunBounds) => runDeepResearch('câu hỏi', '', 'vi', deps, { status() {}, text() {} }, undefined, bounds)
  return { calls, run }
}

const plan = (n: number, queries = 3): ResearchPlan => ({ title: 'T', steps: Array.from({ length: n }, (_, i) => ({ title: `Bước ${i + 1}`, queries: Array.from({ length: queries }, (_, j) => `q${i}-${j}`) })) })

describe('runDeepResearch with Standard bounds', () => {
  it('a plan with more steps than the tier allows is refused BEFORE any search or model work: it is an Advanced request, nothing is cut to fit', async () => {
    // the real ceiling (13) is the plan's own cap, which a plan never exceeds; the refusal rule is shown with a lower ceiling passed in
    const h = harness(plan(9))
    const out = await h.run({ ...STANDARD_RUN_BOUNDS, maxSteps: 8 })
    expect(out.failed).toBe('exceeds_standard')
    expect(h.calls.gather).toEqual([]); expect(h.calls.notes).toBe(0); expect(h.calls.write).toBe(0)
    expect(out.plan?.steps).toHaveLength(9)
  })
  it('an ORDINARY report plan (six or seven sections, the shape every normal report has) is Standard, not Advanced (owner 11/11: "tất cả báo cáo đều là Advanced")', async () => {
    for (const n of [5, 7, 9, 12]) {
      const h = harness(plan(n))
      const out = await h.run(STANDARD_RUN_BOUNDS)
      expect(out.failed, `${n} steps`).toBeNull(); expect(h.calls.write).toBe(1)
    }
  })
  it('three steps run, each with at most two queries; one gap round of at most two follow-up steps', async () => {
    const h = harness(plan(3, 3))
    const out = await h.run(STANDARD_RUN_BOUNDS)
    expect(out.failed).toBeNull()
    expect(h.calls.gaps).toBe(1)
    expect(out.followUps).toBe(STANDARD_RUN_BOUNDS.followUpSteps)
    // 3 steps x 2 queries, then 2 follow-up steps x 2 queries
    expect(h.calls.gather).toHaveLength(3 * 2 + 2 * 2)
    expect(h.calls.gather).not.toContain('q0-2')
  })
  it('without bounds the run is unchanged: all queries, all follow-up steps the gap check proposes (capped by the existing GAP_STEPS)', async () => {
    const h = harness(plan(4, 3))
    const out = await h.run()
    expect(out.failed).toBeNull()
    expect(h.calls.gather.filter(q => q.startsWith('q')).length).toBe(12)
    expect(out.followUps).toBeGreaterThan(STANDARD_RUN_BOUNDS.followUpSteps)
  })
})
