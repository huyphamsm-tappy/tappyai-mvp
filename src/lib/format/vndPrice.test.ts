import { describe, it, expect } from 'vitest'
import { formatVndShort, formatVndRange } from './vndPrice'

describe('formatVndShort', () => {
  it('millions read compactly and per-locale', () => {
    expect(formatVndShort(25_800_000, 'vi')).toBe('25,8 triệu')
    expect(formatVndShort(25_800_000, 'en')).toBe('25.8M')
  })
  it('sub-million falls back to a grouped figure', () => {
    expect(formatVndShort(850_000, 'en')).toBe('850,000₫')
  })
  it('no number → null, so the caller shows an honest label (never a 0)', () => {
    expect(formatVndShort(null, 'vi')).toBeNull()
    expect(formatVndShort(undefined, 'en')).toBeNull()
    expect(formatVndShort(Number.NaN, 'vi')).toBeNull()
  })
})

describe('formatVndRange', () => {
  it('shows a low–high span', () => {
    expect(formatVndRange(25_800_000, 27_500_000, 'vi', 'x')).toBe('25,8 triệu – 27,5 triệu')
  })
  it('collapses to one value when low === high', () => {
    expect(formatVndRange(24_999_000, 24_999_000, 'en', 'x')).toBe('25M')
  })
  it('one side known → that side alone', () => {
    expect(formatVndRange(25_800_000, null, 'en', 'x')).toBe('25.8M')
  })
  it('neither known → the honest no-price label, never a fabricated 0', () => {
    expect(formatVndRange(null, null, 'vi', 'chưa rõ giá')).toBe('chưa rõ giá')
  })
})
