import { describe, it, expect } from 'vitest'
import { unframedForecast, verifyReport, verifierClean, type VerifierSource } from './claimVerifier'

const src = (id: number, text: string): VerifierSource => ({ id, title: `N${id}`, snippet: '', text })

describe('unframedForecast: a figure for a future year written as a fact', () => {
  it('flags a future-year figure with no word of estimate, forecast, scenario or assumption', () => {
    expect(unframedForecast('Doanh thu năm 2029 đạt 37.800 tỷ đồng.', 2026)).toBe(true)
    expect(unframedForecast('The market will reach 17.8 trillion in 2029.', 2026)).toBe(true)
  })
  it('does not flag a framed forecast, a past or current year, a year with no figure, or a far-off year', () => {
    expect(unframedForecast('Theo kịch bản cơ sở, doanh thu năm 2029 ước đạt 37.800 tỷ đồng.', 2026)).toBe(false)
    expect(unframedForecast('Dự báo doanh thu 2029 là 37.800 tỷ đồng.', 2026)).toBe(false)
    expect(unframedForecast('Under the base scenario revenue reaches 17.8 trillion in 2029.', 2026)).toBe(false)
    expect(unframedForecast('Doanh thu năm 2025 đạt 12.500 tỷ đồng.', 2026)).toBe(false)
    expect(unframedForecast('Luật có hiệu lực từ năm 2027.', 2026)).toBe(false)
    expect(unframedForecast('Doanh thu năm 2099 đạt 37.800 tỷ đồng.', 2026)).toBe(false)
  })
  it('a citation marker does not count as a year or a figure', () => {
    expect(unframedForecast('Mức này nằm trong nguồn [2027][2028].', 2026)).toBe(false)
  })
})

describe('verifyReport reports it, without hiding a worse status', () => {
  const S = [src(1, 'IMARC dự báo thị trường đạt 17,8 nghìn tỷ đồng vào năm 2029.')]
  it('a cited future-year figure that is in the source but written as a fact is unframed_forecast', () => {
    const r = verifyReport('Thị trường đạt 17,8 nghìn tỷ đồng năm 2029 [1].', S, 2026)
    expect(r.counts.unframed_forecast).toBe(1); expect(r.flagged[0]).toMatchObject({ status: 'unframed_forecast' }); expect(verifierClean(r)).toBe(false)
  })
  it('the same sentence framed as a forecast is supported', () => {
    const r = verifyReport('IMARC dự báo thị trường đạt 17,8 nghìn tỷ đồng năm 2029 [1].', S, 2026)
    expect(r.counts.supported).toBe(1); expect(r.counts.unframed_forecast).toBe(0); expect(verifierClean(r)).toBe(true)
  })
  it('a figure not in its source stays number_not_in_source (the worse status wins)', () => {
    const r = verifyReport('Thị trường đạt 99,9 nghìn tỷ đồng năm 2029 [1].', S, 2026)
    expect(r.counts.number_not_in_source).toBe(1); expect(r.counts.unframed_forecast).toBe(0)
  })
})
