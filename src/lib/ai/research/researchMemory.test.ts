import { describe, it, expect, beforeEach } from 'vitest'
import { rememberResearch, recallResearch, __resetResearchMemory } from './researchMemory'
import type { ResearchStatus } from './deepResearch'

const status = (phase: ResearchStatus['phase']): ResearchStatus => ({ type: 'tappy.research.v1', title: 'Thị trường xe điện', phase, steps: [], links: [{ id: 1, title: 'VnExpress', url: 'https://vnexpress.net/a' }] } as unknown as ResearchStatus)

beforeEach(() => __resetResearchMemory())

describe('researchMemory: a finished report keeps its sources across the save navigation (UAT 60)', () => {
  it('a finished report is recalled by its text, with its sources and charts', () => {
    rememberResearch('# Thị trường xe điện\n\nVinFast dẫn đầu.', { status: status('done'), charts: [] })
    const back = recallResearch('# Thị trường xe điện\n\nVinFast dẫn đầu.')
    expect(back?.status.links?.[0].url).toBe('https://vnexpress.net/a')
  })
  it('a report that already holds its sources is kept even when its last frame still says "writing"; one with neither is not; an unknown text recalls nothing', () => {
    rememberResearch('# Đang viết có nguồn', { status: status('writing'), charts: [] })
    expect(recallResearch('# Đang viết có nguồn')).not.toBeNull()
    rememberResearch('# Đang viết', { status: { ...status('writing'), links: [] } as ResearchStatus, charts: [] })
    expect(recallResearch('# Đang viết')).toBeNull()
    expect(recallResearch('# Một báo cáo khác')).toBeNull()
  })
  it('only the last dozen reports are kept', () => {
    for (let i = 0; i < 14; i++) rememberResearch(`# Báo cáo ${String(i).padStart(2, '0')}`, { status: status('done'), charts: [] })
    expect(recallResearch('# Báo cáo 00')).toBeNull()
    expect(recallResearch('# Báo cáo 13')).not.toBeNull()
  })
})
