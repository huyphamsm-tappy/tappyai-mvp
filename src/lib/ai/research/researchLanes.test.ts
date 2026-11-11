import { describe, it, expect } from 'vitest'
import { questionKind, withNewsLane, NEWS_STEP_TITLE } from './researchLanes'
import type { ResearchPlan } from './deepResearch'

describe('questionKind', () => {
  it('the owner trend question is a TREND question', () => {
    expect(questionKind('Xu hướng thị trường trà sữa tại Hà Nội')).toBe('TREND')
    expect(questionKind('What are the latest trends in Hanoi bubble tea')).toBe('TREND')
  })
  it('a forecast or size question is SIZE_FORECAST even when it says "xu hướng"', () => {
    expect(questionKind('Dự báo doanh thu trà sữa Việt Nam giai đoạn 2027–2029 và phân tích độ nhạy')).toBe('SIZE_FORECAST')
    expect(questionKind('Quy mô và xu hướng tăng trưởng thị trường cà phê')).toBe('SIZE_FORECAST')
    expect(questionKind('Market size of Vietnam e-commerce')).toBe('SIZE_FORECAST')
  })
  it('comparison, other, empty and junk', () => {
    expect(questionKind('So sánh phở và bún chả')).toBe('COMPARE')
    expect(questionKind('Viết báo cáo về trà sữa')).toBe('OTHER')
    expect(questionKind('')).toBe('OTHER')
    expect(questionKind(null as unknown as string)).toBe('OTHER')
  })
  it('diacritics and case do not matter', () => {
    expect(questionKind('XU HƯỚNG mới nhất')).toBe('TREND')
  })
})

describe('withNewsLane', () => {
  const plan: ResearchPlan = { title: 'Xu hướng trà sữa Hà Nội', steps: [{ title: 'Quy mô', queries: ['a'] }, { title: 'Giá', queries: ['b'] }] }
  it('a TREND plan gets one press step with queries about the latest news, in both languages, naming no publisher', () => {
    const p = withNewsLane(plan, 'TREND', 'vi', 2026, 13)
    expect(p.steps).toHaveLength(3)
    const s = p.steps[2]
    expect(s.title).toBe(NEWS_STEP_TITLE.vi)
    expect(s.queries.some(q => /tin tức mới nhất 2026/.test(q))).toBe(true); expect(s.queries.some(q => /latest news 2026/.test(q))).toBe(true)
    expect(s.queries.join(' ')).not.toMatch(/ipos|q&me|euromonitor|cafef|znews/i)
  })
  it('English plans get English queries and an English title', () => {
    const s = withNewsLane({ ...plan, title: 'Hanoi bubble tea trends' }, 'TREND', 'en', 2026, 13).steps[2]
    expect(s.title).toBe(NEWS_STEP_TITLE.en); expect(s.queries[0]).toContain('latest news 2026')
  })
  it('other kinds are untouched; no room means no step; never added twice', () => {
    expect(withNewsLane(plan, 'SIZE_FORECAST', 'vi', 2026, 13)).toBe(plan)
    expect(withNewsLane(plan, 'OTHER', 'vi', 2026, 13)).toBe(plan)
    expect(withNewsLane(plan, 'TREND', 'vi', 2026, 2)).toBe(plan)
    const once = withNewsLane(plan, 'TREND', 'vi', 2026, 13)
    expect(withNewsLane(once, 'TREND', 'vi', 2026, 13)).toBe(once)
  })
})
