import { describe, it, expect } from 'vitest'
import { roundDongDecimals } from './dongDecimals'

describe('roundDongDecimals (UAT 60, question 14)', () => {
  it('a dong amount with a comma decimal part becomes a whole number, rounded, the dot thousands kept', () => {
    expect(roundDongDecimals('Giá trung bình 1.341.015,02đ/đêm (Agoda)')).toBe('Giá trung bình 1.341.015đ/đêm (Agoda)')
    expect(roundDongDecimals('khoảng 2.500.000,50 đồng một đêm')).toBe('khoảng 2.500.001 đồng một đêm')
    expect(roundDongDecimals('giá 999.999,5 VND')).toBe('giá 1.000.000 VND')
    expect(roundDongDecimals('650.000,00₫')).toBe('650.000₫')
    expect(roundDongDecimals('15,25đ')).toBe('15đ')
  })
  it('anything else is left as written: a rate, a rating, a weight, a figure with no dong unit, a longer word after the unit', () => {
    for (const s of ['Lãi suất 5,65%/năm', 'Điểm 4,6 sao', 'nặng 1,38 kg', 'có 3,5 triệu đồng', 'giá 1.341.015,02 USD', 'ở số 12,5 đường', 'tổng 1,5 đồngbằng']) expect(roundDongDecimals(s)).toBe(s)
  })
  it('empty and plain text pass through', () => {
    expect(roundDongDecimals('')).toBe('')
    expect(roundDongDecimals('Không có số tiền')).toBe('Không có số tiền')
  })
})
