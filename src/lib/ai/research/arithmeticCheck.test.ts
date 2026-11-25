import { describe, it, expect } from 'vitest'
import { arithmeticIssues, parseNumber } from './arithmeticCheck'

describe('parseNumber', () => {
  it('reads Vietnamese and English style numbers', () => {
    expect(parseNumber('16.300')).toBe(16300)
    expect(parseNumber('11,2')).toBe(11.2)
    expect(parseNumber('1.655,5')).toBe(1655.5)
    expect(parseNumber('1,655,000')).toBe(1655000)
    expect(parseNumber('1,655')).toBe(1.655)
    expect(parseNumber('90,70')).toBe(90.7)
    expect(parseNumber('abc')).toBeNull()
  })
})

describe('arithmeticIssues: a/b and its percentage', () => {
  it('429/434 stated as 90,70% is wrong (98.85%)', () => {
    const r = arithmeticIssues('Luật được thông qua với 429/434 đại biểu tán thành (90,70%).')
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('ratio')
    expect(r[0].computed).toBeCloseTo(98.85, 1)
  })
  it('16.300 of 120.000 stated as 11,2% is wrong; stated as 13,6% holds', () => {
    expect(arithmeticIssues('Giải ngân 16.300/120.000 tỷ đồng, đạt 11,2%.')).toHaveLength(1)
    expect(arithmeticIssues('Giải ngân 16.300/120.000 tỷ đồng, đạt 13,6%.')).toEqual([])
  })
  it('a date, a fraction with a small denominator and a number with no percentage are not judged', () => {
    expect(arithmeticIssues('Ngày 19/11 tăng 5%.')).toEqual([])
    expect(arithmeticIssues('Tỷ lệ 3/4 người dùng.')).toEqual([])
    expect(arithmeticIssues('Có 429/434 đại biểu tán thành.')).toEqual([])
    expect(arithmeticIssues('Sáng 10/2024 giá tăng 12%.')).toEqual([])
  })
  it('English works too', () => {
    expect(arithmeticIssues('The law passed with 429/434 votes (90.70%).')).toHaveLength(1)
    expect(arithmeticIssues('The law passed with 429/434 votes (98.8%).')).toEqual([])
  })
})

describe('arithmeticIssues: growth between two levels', () => {
  it('from 100 to 150 is +50%, not +30%', () => {
    expect(arithmeticIssues('Doanh số tăng từ 100 lên 150 xe, tăng 30%.')).toHaveLength(1)
    expect(arithmeticIssues('Doanh số tăng từ 100 lên 150 xe, tăng 50%.')).toEqual([])
    expect(arithmeticIssues('Doanh số từ 100 lên 150 xe (+50%).')).toEqual([])
  })
  it('the direction the word says must be the direction of the numbers', () => {
    expect(arithmeticIssues('Giá giảm từ 100 lên 150 triệu, giảm 50%.')).toHaveLength(1)
    expect(arithmeticIssues('Giá giảm từ 150 xuống 100 triệu, giảm 33,3%.')).toEqual([])
  })
  it('two years (from 2022 to 2025) are not levels', () => {
    expect(arithmeticIssues('Từ 2022 lên 2025 tăng 20%.')).toEqual([])
  })
  it('percentage points: from 21,2% to 26,5% is 5,3 points', () => {
    expect(arithmeticIssues('Tỷ lệ tăng từ 21,2% lên 26,5%, tức 3,0 điểm phần trăm.')).toHaveLength(1)
    expect(arithmeticIssues('Tỷ lệ tăng từ 21,2% lên 26,5%, tức 5,3 điểm phần trăm.')).toEqual([])
  })
  it('a sentence with no such shape is left alone', () => {
    expect(arithmeticIssues('Thị trường tăng nhanh nhờ chính sách miễn lệ phí trước bạ đến năm 2030.')).toEqual([])
    expect(arithmeticIssues('')).toEqual([])
  })
})
