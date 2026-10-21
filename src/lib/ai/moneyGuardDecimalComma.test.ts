// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { extractMoneyClaims, redactUnsupportedClaims, type MoneyClaim } from './moneyGuard'

// Live 2026-10-11: "Giá đang thấy cho ấm Philips 1,7 lít, khoảng 650.000đ, tùy mã…" came out as "…ấm Philips 1, tùy mã…". The clause cut treated
// the decimal comma of "1,7" as a clause delimiter. With CONSULTATIVE_IN_AGENT (decimalSafe) a comma flanked by digits is part of the number.
const bad = (text: string): MoneyClaim[] => extractMoneyClaims(text).map(c => ({ ...c, verdict: 'UNVERIFIED' }) as MoneyClaim)

describe('clause cut and a decimal comma', () => {
  const text = 'Giá đang thấy cho ấm Philips 1,7 lít là khoảng 650.000đ, tùy mã và nơi bán.'

  it('flag on: the litre figure survives, only the price clause goes', () => {
    const out = redactUnsupportedClaims(text, bad(text), { decimalSafe: true })
    expect(out).toContain('1,7 lít')
    expect(out).not.toContain('650.000')
    expect(out).not.toMatch(/1,(?!7)/)
  })

  it('flag off: the old behaviour is unchanged (control)', () => {
    const out = redactUnsupportedClaims(text, bad(text))
    const on = redactUnsupportedClaims(text, bad(text), { decimalSafe: true })
    expect(out).not.toBe(on)
  })

  it('flag on: a normal comma between clauses still delimits', () => {
    const t = 'Bản này nhẹ, giá khoảng 650.000đ, bảo hành 12 tháng.'
    const out = redactUnsupportedClaims(t, bad(t), { decimalSafe: true })
    expect(out).toContain('Bản này nhẹ')
    expect(out).not.toContain('650.000')
  })
})
