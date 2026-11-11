import { describe, it, expect } from 'vitest'
import { BENCHMARK, benchmarkById } from './benchmarkSet'
import { scoreReport, efficiencyScore, weightedTotal, forecastChecks, fillerCandidates, CRITERIA_WEIGHTS } from './benchmarkScore'

// M1 of Report Engine V2.1: the fixed question set, the six-criterion rubric and the automatic part of the scoring. Everything here is pure; the live runs only feed it.

describe('the question set', () => {
  it('has ten questions with unique ids, at least two forecasts, and a few that are not food and drink', () => {
    expect(BENCHMARK).toHaveLength(10)
    expect(new Set(BENCHMARK.map(q => q.id)).size).toBe(10)
    expect(BENCHMARK.filter(q => q.kind === 'forecast').length).toBeGreaterThanOrEqual(2)
    expect(BENCHMARK.filter(q => !q.fnb).length).toBeGreaterThanOrEqual(3)
    for (const q of BENCHMARK) { expect(q.text.length).toBeGreaterThan(10); expect(q.facts.length).toBeGreaterThanOrEqual(2) }
  })
  it('every mandatory fact has a unique id inside its question, patterns that compile, and says whether the owner has reviewed it', () => {
    for (const q of BENCHMARK) {
      expect(new Set(q.facts.map(f => f.id)).size).toBe(q.facts.length)
      for (const f of q.facts) {
        expect(f.all.length + (f.atLeast ? 1 : 0)).toBeGreaterThan(0)
        for (const p of [...f.all, ...(f.atLeast?.of ?? [])]) expect(() => 'x'.match(p)).not.toThrow()
        expect(['draft', 'reviewed']).toContain(f.status)
      }
    }
  })
  it('the lookup finds a question by id', () => {
    expect(benchmarkById('q01')!.kind).toBe('trend')
    expect(benchmarkById('zz')).toBeUndefined()
  })
})

describe('mandatory facts', () => {
  const q01 = benchmarkById('q01')!
  const GOOD = '# Xu hướng\n## 1. Tóm tắt\nTiền dịch lên vùng 36.000–70.000 đồng, nhóm này tăng từ 48,29% lên 61,78% trong nửa đầu 2026.\nTrà sữa 7.000 đồng với Viên Viên, Tam Hảo, Mãn Mãn.\nThuế tiêu thụ đặc biệt 8% từ 2027 và 10% từ 2028 với nước giải khát có đường.\n'
  it('are matched on the folded text: diacritics and case do not matter', () => {
    const s = scoreReport(GOOD, q01, { tier: 'advanced', usd: 0.4 })
    expect(s.factRecallPct).toBe(100)
    expect(scoreReport(GOOD.toUpperCase(), q01, { tier: 'advanced', usd: 0.4 }).factRecallPct).toBe(100)
  })
  it('a report with none of them scores zero and names what is missing', () => {
    const s = scoreReport('# Báo cáo\n## 1. Tóm tắt\nThị trường có nhiều thay đổi.\n', q01, { tier: 'standard', usd: 0.1 })
    expect(s.factRecallPct).toBe(0)
    expect(s.facts.every(f => !f.hit)).toBe(true)
  })
  it('a fact that needs several patterns is a miss when one of them is absent', () => {
    const onlyTax = 'Thuế tiêu thụ đặc biệt áp dụng với nước giải khát.'
    const s = scoreReport(onlyTax, q01, { tier: 'standard', usd: 0.1 })
    expect(s.facts.find(f => f.id === 'tax')!.hit).toBe(false)
  })
  it('"at least n of these names" counts distinct names', () => {
    const q03 = benchmarkById('q03')!
    const two = 'Highlands và Phúc Long dẫn đầu năm 2026.'
    const three = 'Highlands, Phúc Long và Starbucks dẫn đầu năm 2026.'
    expect(scoreReport(two, q03, { tier: 'standard', usd: 0.1 }).facts.find(f => f.id === 'chains')!.hit).toBe(false)
    expect(scoreReport(three, q03, { tier: 'standard', usd: 0.1 }).facts.find(f => f.id === 'chains')!.hit).toBe(true)
  })
})

describe('size, repetition and sources', () => {
  it('pages are estimated from the length (about 2,250 characters a page, as the real PDFs came out)', () => {
    const s = scoreReport('x'.repeat(22_500), benchmarkById('q01')!, { tier: 'standard', usd: 0.1 })
    expect(s.pagesApprox).toBe(10)
  })
  it('repetition is the share of figures written on three or more lines', () => {
    const text = 'a 12.500 tỷ\nb 12.500 tỷ\nc 12.500 tỷ\nd 35.000 đồng\n'
    expect(scoreReport(text, benchmarkById('q01')!, { tier: 'standard', usd: 0.1 }).repeatedPct).toBe(50)
  })
  it('sources are the numbered "n. title — site" lines of the last section', () => {
    const text = '# T\n## 1. Tóm tắt\nÝ\n## Nguồn\n1. A — a.vn\n2. B — b.vn\n'
    expect(scoreReport(text, benchmarkById('q01')!, { tier: 'standard', usd: 0.1 }).sources).toBe(2)
  })
})

describe('sections that may be filler', () => {
  const q = benchmarkById('q01')!
  const text = '# T\n## 1. Tóm tắt\nÝ chính.\n## 2. Kênh bán trà sữa\nTrà sữa bán qua app tại Hà Nội.\n## 3. Thanh toán và hạ tầng hỗ trợ\nVietQR và ví điện tử tăng nhanh.\n## 4. Khuyến nghị\nLàm tốt.\n## Nguồn\n1. A — a.vn\n'
  it('a section whose heading and opening share no content word with the question is a candidate; the usual sections are not', () => {
    expect(fillerCandidates(text, q)).toEqual(['3. Thanh toán và hạ tầng hỗ trợ'])
  })
  it('a section that hits a mandatory fact is not a candidate', () => {
    const t = text.replace('Vietqr', 'x').replace('VietQR và ví điện tử tăng nhanh.', 'Thuế tiêu thụ đặc biệt 8% từ 2027, 10% từ 2028.')
    expect(fillerCandidates(t, q)).toEqual([])
  })
})

describe('forecast checks', () => {
  const FULL = 'Kịch bản thấp, cơ sở, cao cho 2027, 2028, 2029. Độ nhạy: sản lượng và giá. Điểm hòa vốn. Giả định của báo cáo, không có nguồn.'
  it('finds scenarios, the three years, a sensitivity, a break-even and labelled assumptions', () => {
    expect(forecastChecks(FULL)).toEqual({ scenarios: true, years: true, sensitivity: true, breakeven: true, assumptionsLabelled: true })
  })
  it('each one is reported on its own', () => {
    const c = forecastChecks('Kịch bản cơ sở 2027 và 2028.')
    expect(c.scenarios).toBe(true)
    expect(c.years).toBe(false)
    expect(c.sensitivity).toBe(false)
    expect(c.breakeven).toBe(false)
  })
  it('a forecast question gets the checks in its score; others do not', () => {
    expect(scoreReport(FULL, benchmarkById('q02')!, { tier: 'advanced', usd: 0.4 }).forecast).not.toBeNull()
    expect(scoreReport(FULL, benchmarkById('q01')!, { tier: 'advanced', usd: 0.4 }).forecast).toBeNull()
  })
})

describe('the automatic sub-scores (0 to 5)', () => {
  it('efficiency falls with pages over 8, repetition over 5% and cost over the tier budget', () => {
    const base = { pages: 8, repeatedPct: 5, usd: 0.1, tier: 'standard' as const }
    expect(efficiencyScore(base)).toBe(5)
    expect(efficiencyScore({ ...base, pages: 14 })).toBeLessThan(5)
    expect(efficiencyScore({ ...base, repeatedPct: 15 })).toBeLessThan(5)
    expect(efficiencyScore({ ...base, usd: 0.2 })).toBe(4)
    expect(efficiencyScore({ ...base, tier: 'advanced', usd: 0.4 })).toBe(5)
    expect(efficiencyScore({ ...base, pages: 40, repeatedPct: 40, usd: 9 })).toBe(0)
  })
  it('completeness is the fact recall on a 0 to 5 scale; citation integrity is the verifier\'s supported share, none without it', () => {
    const q = benchmarkById('q01')!
    const none = scoreReport('nothing', q, { tier: 'standard', usd: 0.1, verifier: { supported: 90, checked: 100 } })
    expect(none.auto.completeness).toBe(0)
    expect(none.auto.citation).toBe(4.5)
    expect(scoreReport('nothing', q, { tier: 'standard', usd: 0.1 }).auto.citation).toBeNull()
  })
})

describe('the weighted total', () => {
  it('weights are 20, 20, 15, 15, 20, 10 and sum to 100', () => {
    expect(Object.values(CRITERIA_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
    expect(CRITERIA_WEIGHTS.accuracy).toBe(20)
    expect(CRITERIA_WEIGHTS.efficiency).toBe(10)
  })
  it('all six scores give a total out of 100; a missing one gives no total but a partial over what is known, with the weight it covers', () => {
    const all = { accuracy: 5, citation: 5, completeness: 5, source: 5, analytic: 5, efficiency: 5 }
    expect(weightedTotal(all).total).toBe(100)
    expect(weightedTotal({ ...all, accuracy: 0 }).total).toBe(80)
    const p = weightedTotal({ ...all, accuracy: null, analytic: null })
    expect(p.total).toBeNull()
    expect(p.weightCovered).toBe(60)
    expect(p.partial).toBe(100)
  })
})
