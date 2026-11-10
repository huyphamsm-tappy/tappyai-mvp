import { describe, it, expect, vi } from 'vitest'
import { standardTurnFor } from './researchTurn'
import { deepResearchResponse } from './deepResearchResponse'
import { STANDARD_RUN_BOUNDS } from './researchAdmission'
import type { DeepResearchDeps, Evidence, ResearchPlan } from './deepResearch'

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
  const res = deepResearchResponse({
    question: 'q', context: '', lang: 'vi', cost: { usd: 0, calls: 0 }, serperUsd: () => ({ usd: 0, calls: 0 }), onFailed: failed,
    deps: mk('legacy', 6),
    standard: { deps: mk('standard', standardPlanSteps), bounds: { ...STANDARD_RUN_BOUNDS } },
  })
  return { res, ran, failed }
}

describe('deepResearchResponse with a Standard pair', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  it('a plan within the tier runs on the Standard deps only', async () => {
    const { res, ran, failed } = turn(2)
    const text = await res.text()
    expect(ran).toEqual({ standard: 1, legacy: 0 })
    expect(text).toContain('Báo cáo'); expect(failed).not.toHaveBeenCalled()
  })
  it('a plan over the tier falls back to the legacy engine in the same stream, with no refund and a report', async () => {
    const { res, ran, failed } = turn(5)
    const text = await res.text()
    expect(ran).toEqual({ standard: 1, legacy: 1 })
    expect(text).toContain('Báo cáo'); expect(text).not.toContain('không hoàn thành'); expect(failed).not.toHaveBeenCalled()
  })
})
