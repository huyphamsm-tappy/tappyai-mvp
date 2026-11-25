import { describe, it, expect } from 'vitest'
import { signalsFromRequest, fold, marketsOrPeriodsOf, dimensionsOf, analysisOf, SIGNALS_MAX_CHARS } from './researchSignals'
import { admitResearch } from './researchAdmission'

const tier = (msg: string) => admitResearch(signalsFromRequest(msg).signals).tier

describe('fold', () => {
  it('lower-cases, strips diacritics, maps đ', () => {
    expect(fold('  Đà   Nẵng  NHẤT ')).toBe('da nang nhat')
  })
})

describe('simple requests stay Standard', () => {
  it('a focused question is one dimension, no cues', () => {
    const r = signalsFromRequest('Viết báo cáo về xu hướng quán cà phê specialty ở Hà Nội')
    expect(r.signals).toMatchObject({ dimensions: 1, dependentStages: false, marketsOrPeriods: 1, analysis: 'SUMMARY' })
    expect(tier('Viết báo cáo về xu hướng quán cà phê specialty ở Hà Nội')).toBe('STANDARD_REPORT')
  })
  it('the common word "nhất" or "hạn" is not read as Japan or Korea', () => {
    expect(marketsOrPeriodsOf(fold('Quán ngon nhất trong thời hạn một tuần'))).toBe(1)
  })
  it('"my" in English is not the United States', () => {
    expect(marketsOrPeriodsOf(fold('Summarise my notes on pho'))).toBe(1)
  })
})

describe('dimensions', () => {
  it('counts numbered or bulleted items', () => {
    const q = 'Báo cáo thị trường trà sữa:\n1. quy mô\n2. đối thủ\n3. giá\n4. xu hướng'
    expect(dimensionsOf(q, fold(q))).toBe(4)
    expect(tier(q)).toBe('ADVANCED_RESEARCH_REPORT')
  })
  it('counts the items after "bao gồm"', () => {
    const q = 'Báo cáo bao gồm quy mô, đối thủ và giá'
    expect(dimensionsOf(q, fold(q))).toBe(3)
  })
  it('one item is one dimension', () => {
    const q = 'Báo cáo về giá vé máy bay'
    expect(dimensionsOf(q, fold(q))).toBe(1)
  })
})

describe('markets and periods', () => {
  it('two markets, or two distinct years, are a comparison across non-equivalent datasets', () => {
    expect(signalsFromRequest('So sánh thị trường giao đồ ăn Việt Nam và Thái Lan').signals.marketsOrPeriods).toBe(2)
    expect(signalsFromRequest('Doanh thu du lịch 2019 so với 2024').signals.marketsOrPeriods).toBe(2)
    expect(tier('So sánh thị trường giao đồ ăn Việt Nam và Thái Lan')).toBe('ADVANCED_RESEARCH_REPORT')
  })
  it('one year or one market is not', () => {
    expect(signalsFromRequest('Du lịch Việt Nam năm 2024').signals.marketsOrPeriods).toBe(1)
  })
})

describe('analysis kind', () => {
  it('scenario and forecast cues', () => {
    expect(analysisOf(fold('Dự báo doanh thu 3 năm tới và phân tích độ nhạy'))).toBe('SCENARIO')
    expect(tier('Dự báo nhu cầu du lịch Đà Lạt')).toBe('ADVANCED_RESEARCH_REPORT')
  })
  it('comparison cues', () => {
    expect(analysisOf(fold('So sánh phở và bún chả'))).toBe('COMPARISON')
    expect(analysisOf(fold('Compare pho vs bun cha'))).toBe('COMPARISON')
  })
  it('a plain explanation is a summary', () => {
    expect(analysisOf(fold('Giải thích cách làm nước dùng phở'))).toBe('SUMMARY')
  })
})

describe('dependent stages', () => {
  it('"depending on / dựa trên kết quả" marks later questions that depend on earlier findings', () => {
    expect(signalsFromRequest('Tìm 3 đối thủ, sau đó dựa trên kết quả hãy phân tích giá của họ').signals.dependentStages).toBe(true)
    expect(signalsFromRequest('Find the top rivals, then based on what you find compare pricing').signals.dependentStages).toBe(true)
    expect(signalsFromRequest('Tìm 3 đối thủ và giá của họ').signals.dependentStages).toBe(false)
  })
})

describe('output complexity', () => {
  it('a report is multi-section; linked sub-reports and appendices are linked deliverables; a short ask is concise', () => {
    expect(signalsFromRequest('Viết báo cáo về trà sữa').signals.output).toBe('MULTI_SECTION')
    expect(signalsFromRequest('Viết báo cáo kèm phụ lục bảng số liệu').signals.output).toBe('LINKED_DELIVERABLES')
    expect(signalsFromRequest('Quán nào ngon ở Huế?').signals.output).toBe('CONCISE')
  })
})

describe('ambiguity and bounds', () => {
  it('a brief ask across several markets is reported as ambiguous instead of silently routed', () => {
    const r = signalsFromRequest('Tóm tắt ngắn so sánh Việt Nam, Thái Lan và Nhật Bản')
    expect(r.ambiguous).toBe(true); expect(r.cues).toContain('ambiguous_scope')
  })
  it('the cue list carries names only, never the user words', () => {
    const r = signalsFromRequest('Báo cáo bí mật về công ty ABC Holdings so sánh 2019 và 2024')
    for (const c of r.cues) expect(c).not.toMatch(/ABC|Holdings|bí mật/i)
  })
  it('reads only the current message, cut to the cap, and survives junk input', () => {
    const long = 'a '.repeat(SIGNALS_MAX_CHARS) + 'Việt Nam Thái Lan'
    expect(signalsFromRequest(long).signals.marketsOrPeriods).toBe(1)
    expect(signalsFromRequest('').signals).toMatchObject({ dimensions: 1, marketsOrPeriods: 1, analysis: 'SUMMARY', output: 'CONCISE' })
    expect(signalsFromRequest(null as unknown as string).signals.dimensions).toBe(1)
  })
})
