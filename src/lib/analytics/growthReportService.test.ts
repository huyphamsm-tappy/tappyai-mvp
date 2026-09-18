import { describe, it, expect } from 'vitest'
import { GROWTH_REPORT_MAX_DAYS, resolveRange } from './growthReportService'

describe('resolveRange — bounded report window', () => {
  it('defaults to the last 30 VN days ending today', () => {
    expect(resolveRange({}, '2026-09-14')).toEqual({ from: '2026-08-16', to: '2026-09-14' })
  })
  it('honours an explicit range inside the cap', () => {
    expect(resolveRange({ from: '2026-09-01', to: '2026-09-10' }, '2026-09-14')).toEqual({ from: '2026-09-01', to: '2026-09-10' })
  })
  it('clamps a window wider than the cap so a report can never become an unbounded scan', () => {
    const r = resolveRange({ from: '2025-01-01', to: '2026-09-14' }, '2026-09-14')
    expect(r.to).toBe('2026-09-14')
    expect(Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1).toBe(GROWTH_REPORT_MAX_DAYS)
  })
})
