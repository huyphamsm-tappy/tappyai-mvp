import { describe, it, expect, vi } from 'vitest'
import { standardTurnFor } from './researchTurn'
import { deepResearchResponse } from './deepResearchResponse'
import { STANDARD_RUN_BOUNDS } from './researchAdmission'
import type { DeepResearchDeps, Evidence, ResearchPlan, RunBounds } from './deepResearch'

const ON = { RESEARCH_ADMISSION: '1' }

describe('standardTurnFor', () => {
  it('flag off (default), or no Claude available: null, the route keeps the existing engine', () => {
    expect(standardTurnFor('Viết báo cáo về trà sữa', { env: {}, claudeAvailable: true })).toBeNull()
    expect(standardTurnFor('Viết báo cáo về trà sữa', { env: ON, claudeAvailable: false })).toBeNull()
    expect(standardTurnFor('Viết báo cáo về trà sữa', { env: { ...ON, VERCEL_ENV: 'production' }, claudeAvailable: true })).toBeNull()
  })
  it('a simple report is Standard with the Standard bounds; the audit holds no user words', () => {
    const p = standardTurnFor('Viết báo cáo về trà sữa ở Hà Nội', { env: ON, claudeAvailable: true })!
    expect(p.decision.tier).toBe('STANDARD_REPORT'); expect(p.bounds).toEqual(STANDARD_RUN_BOUNDS)
    expect(JSON.stringify(p.cues)).not.toMatch(/trà sữa|Hà Nội/i)
  })
  it('an Advanced request (forecast, several markets, dependent stages) and an ambiguous one are not Standard', () => {
    expect(standardTurnFor('Dự báo doanh thu trà sữa 3 năm tới', { env: ON, claudeAvailable: true })).toBeNull()
    expect(standardTurnFor('So sánh thị trường Việt Nam và Thái Lan', { env: ON, claudeAvailable: true })).toBeNull()
    expect(standardTurnFor('Tìm đối thủ, sau đó dựa trên kết quả phân tích giá', { env: ON, claudeAvailable: true })).toBeNull()
    expect(standardTurnFor('Tóm tắt ngắn so sánh Việt Nam, Thái Lan và Nhật Bản', { env: ON, claudeAvailable: true })).toBeNull()
  })
})

// A turn with a Standard pair of deps and a legacy pair: who ran, and what happened to the refund.
function turn(standardPlanSteps: number) {
  const ran = { standard: 0, legacy: 0 }
  const mk = (who: 'standard' | 'legacy', steps: number): DeepResearchDeps => ({
    async plan(): Promise<ResearchPlan> { ran[who]++; return { title: 'T', steps: Array.from({ length: steps }, (_, i) => ({ title: `Bước ${i + 1}`, queries: ['q'] })) } },
    async gather() { return [{ title: 'N', url: `https://example.com/${who}`, snippet: 's', text: 'nội dung' }] },
    async notes(_s: string, _q: string, ev: readonly Evidence[]) { return [{ text: 'phát hiện', source: ev[0]!.id }] },
    async *write() { yield '# Báo cáo\n\nNội dung [1]\n' },
  })
  const failed = vi.fn(async () => {})
  const models: string[] = []
  const res = deepResearchResponse({
    question: 'q', context: '', lang: 'vi', cost: { usd: 0, calls: 0 }, serperUsd: () => ({ usd: 0, calls: 0 }), onFailed: failed,
    deps: mk('legacy', 6),
    standard: { deps: mk('standard', standardPlanSteps), bounds: { ...STANDARD_RUN_BOUNDS, maxSteps: 3 }, label: 'standard' },
    onUsage: u => { models.push(u.model) },
  })
  return { res, ran, failed, models }
}

describe('a Standard plan over the tier is promoted to Advanced (R13 4.2.3) when the route can run it', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const mkDeps = (who: string, steps: number, ran: string[]): DeepResearchDeps => ({
    async plan(): Promise<ResearchPlan> { ran.push(who); return { title: 'T', steps: Array.from({ length: steps }, (_, i) => ({ title: `Bước ${i + 1}`, queries: ['q'] })) } },
    async gather() { return [{ title: 'N', url: `https://example.com/${who}`, snippet: 's', text: 'nội dung' }] },
    async notes(_s: string, _q: string, ev: readonly Evidence[]) { return [{ text: 'phát hiện', source: ev[0]!.id }] },
    async *write() { yield '# Báo cáo\n\nNội dung [1]\n' },
  })
  const run = (promote: (() => Promise<{ deps: DeepResearchDeps; bounds: RunBounds } | null>) | undefined, ran: string[], models: string[]) => deepResearchResponse({
    question: 'q', context: '', lang: 'vi', cost: { usd: 0, calls: 0 }, serperUsd: () => ({ usd: 0, calls: 0 }), onFailed: async () => {},
    deps: mkDeps('legacy', 6, ran), standard: { deps: mkDeps('standard', 5, ran), bounds: { ...STANDARD_RUN_BOUNDS, maxSteps: 3 }, label: 'standard' },
    ...(promote ? { promote } : {}), onUsage: u => { models.push(u.model) },
  })
  it('over 3 steps, with allowance: the Advanced deps run instead, once, and the cost line says so; the legacy engine is not touched', async () => {
    const ran: string[] = []; const models: string[] = []
    const text = await run(async () => ({ deps: mkDeps('advanced', 5, ran), bounds: { ...STANDARD_RUN_BOUNDS, maxSteps: 13 } }), ran, models).text()
    expect(ran).toEqual(['standard', 'advanced']); expect(models).toEqual(['sonnet55+haiku55']); expect(text).toContain('Báo cáo')
  })
  it('over 3 steps, no allowance (promote returns null) or no promote at all: the existing engine, as before', async () => {
    const a: string[] = []; const m1: string[] = []
    await run(async () => null, a, m1).text()
    expect(a).toEqual(['standard', 'legacy']); expect(m1).toEqual(['luna'])
    const b: string[] = []; const m2: string[] = []
    await run(undefined, b, m2).text()
    expect(b).toEqual(['standard', 'legacy']); expect(m2).toEqual(['luna'])
  })
  it('a promote that throws is the same as none; a plan within the tier is never promoted', async () => {
    const a: string[] = []
    await run(async () => { throw new Error('quota store down') }, a, []).text()
    expect(a).toEqual(['standard', 'legacy'])
  })
})

describe('deepResearchResponse with a Standard pair', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  it('a plan within the tier runs on the Standard deps only', async () => {
    const { res, ran, failed, models } = turn(2)
    const text = await res.text()
    expect(ran).toEqual({ standard: 1, legacy: 0 })
    expect(models).toEqual(['haiku55']) // the cost line names the model that served the run
    expect(text).toContain('Báo cáo'); expect(failed).not.toHaveBeenCalled()
  })
  it('a plan over the tier falls back to the legacy engine in the same stream, with no refund and a report', async () => {
    const { res, ran, failed, models } = turn(5)
    const text = await res.text()
    expect(ran).toEqual({ standard: 1, legacy: 1 })
    expect(models).toEqual(['luna']) // served by the existing engine after the fallback
    expect(text).toContain('Báo cáo'); expect(text).not.toContain('không hoàn thành'); expect(failed).not.toHaveBeenCalled()
  })
})
