import { describe, it, expect, afterEach, vi } from 'vitest'
import { runDeepResearch, type DeepResearchDeps, type Evidence, type Finding, type ResearchPlan } from './deepResearch'
import { DEEP_RESEARCH_V2_FLAG } from './deepResearchState'

// A run with stub deps: one plan step ("Quy mô thị trường") and two question parts, the second ("Bản đồ đối thủ lớn") has no heading in the written report.
function harness(o: { firstStepFindings: number; gapStepFindings: number }) {
  const calls = { gaps: 0, repair: 0, repairParts: [] as string[] }
  let urls = 0
  const deps: DeepResearchDeps = {
    async plan(): Promise<ResearchPlan> { return { title: 'Thị trường', parts: ['Quy mô thị trường và tăng trưởng', 'Bản đồ đối thủ lớn'], steps: [{ title: 'Quy mô thị trường', queries: ['q1'] }] } },
    async gather() { urls++; return [{ title: `Nguồn ${urls}`, url: `https://example.com/page-${urls}`, snippet: 's', text: 'nội dung trang' }] },
    async notes(step: string, _q: string, evidence: readonly Evidence[]) {
      const n = step === 'Quy mô thị trường' ? o.firstStepFindings : o.gapStepFindings
      return Array.from({ length: n }, (_, i) => ({ text: `phát hiện ${step} số ${i} ${urls}`, source: evidence[0]!.id }))
    },
    async gaps() { calls.gaps++; return [{ title: `Bù lần ${calls.gaps}`, queries: ['g'], completes: null }] },
    async *write() { yield '# Báo cáo\n\n## Quy mô thị trường\nNội dung [1]\n' },
    async *repair(input: { parts: ReadonlyArray<{ part: string; findings: readonly Finding[] }> }) { calls.repair++; calls.repairParts.push(...input.parts.map(p => p.part)); yield '## Bản đồ đối thủ lớn\nNội dung bổ sung [1]\n' },
  }
  const run = async () => { let text = ''; const out = await runDeepResearch('câu hỏi', '', 'vi', deps, { status() {}, text(t) { text += t } }); return { out, text } }
  return { calls, run }
}

describe('Deep Research V2: gap rounds and the repair of unnamed parts (03/11)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('OFF: one gap round, no repair - the one-pass run', async () => {
    const h = harness({ firstStepFindings: 2, gapStepFindings: 10 })
    const { out, text } = await h.run()
    expect(h.calls.gaps).toBe(1)
    expect(h.calls.repair).toBe(0)
    expect(out.followUps).toBe(1)
    expect(text).not.toContain('Nội dung bổ sung')
  })

  it('ON: gap rounds continue while a section is thin, up to the round cap', async () => {
    vi.stubEnv(DEEP_RESEARCH_V2_FLAG, '1')
    const h = harness({ firstStepFindings: 2, gapStepFindings: 10 }) // step 1 stays thin (2 findings), every round keeps 10
    const { out } = await h.run()
    expect(h.calls.gaps).toBe(3)
    expect(out.followUps).toBe(3)
  })

  it('ON: stops at diminishing returns (a round that kept too few findings)', async () => {
    vi.stubEnv(DEEP_RESEARCH_V2_FLAG, '1')
    const h = harness({ firstStepFindings: 2, gapStepFindings: 3 })
    await h.run()
    expect(h.calls.gaps).toBe(1)
  })

  it('ON: stops when every section is covered after the first round', async () => {
    vi.stubEnv(DEEP_RESEARCH_V2_FLAG, '1')
    const h = harness({ firstStepFindings: 10, gapStepFindings: 10 })
    await h.run()
    expect(h.calls.gaps).toBe(1)
  })

  it('ON: the part no heading names is answered in an appended section, once, before the sources', async () => {
    vi.stubEnv(DEEP_RESEARCH_V2_FLAG, '1')
    const h = harness({ firstStepFindings: 10, gapStepFindings: 10 })
    const { out, text } = await h.run()
    expect(h.calls.repair).toBe(1)
    expect(h.calls.repairParts).toEqual(['Bản đồ đối thủ lớn'])
    expect(out.repaired).toBe(1)
    expect(text.indexOf('Nội dung bổ sung')).toBeGreaterThan(text.indexOf('Nội dung [1]'))
  })

  it('ON in a production runtime: nothing changes', async () => {
    vi.stubEnv(DEEP_RESEARCH_V2_FLAG, '1')
    vi.stubEnv('NODE_ENV', 'production')
    const h = harness({ firstStepFindings: 2, gapStepFindings: 10 })
    await h.run()
    expect(h.calls.gaps).toBe(1)
    expect(h.calls.repair).toBe(0)
  })
})
