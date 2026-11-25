import { describe, it, expect } from 'vitest'
import { extractMoneyClaims, redactUnsupportedClaims } from './moneyGuard'
import { guardTravelClaimsInText } from './travelGuard'

const row = (pipe: boolean, a: string, b: string, c: string) => (pipe ? `| ${a} | ${b} | ${c} |` : `${a} | ${b} | ${c}`)
const table = (pipe: boolean, link: string) => [
  'Mình tìm theo giả định nhận phòng tối 19/11, 2 người.',
  '',
  row(pipe, 'Khách sạn', 'Giá/đêm', 'Đặt hoặc kiểm tra'),
  pipe ? '|---|---|---|' : '--- | --- | ---',
  row(pipe, 'Khách sạn Menora Quy Nhơn', '215.063đ', link),
  row(pipe, 'Khách sạn Quy Nhơn Center - 08 Trần Độc', '231.481đ', link),
  row(pipe, 'Khách sạn La Cactus 2', '247.000đ', link),
  '',
  'Giá có thể đổi khi mở trang.',
].join('\n')

const cells = (l: string) => l.split('|').length

describe('a table row keeps its cells when its price is unverified', () => {
  for (const pipe of [true, false]) for (const link of ['Agoda', '[Agoda](https://www.agoda.com/a)']) {
    const t = table(pipe, link)
    const rowsOf = (s: string) => s.split('\n').filter(l => /Menora|Center|Cactus|Khách sạn \|/.test(l))

    it(`redactUnsupportedClaims (pipe=${pipe}, ${link.slice(0, 7)})`, () => {
      const claims = extractMoneyClaims(t)
      expect(claims.length).toBe(3)
      for (const pick of [[1], [0, 1], [1, 2], [0, 1, 2], [2]]) {
        const marked = claims.map((c, i) => ({ ...c, verdict: pick.includes(i) ? 'UNVERIFIED' : 'VERIFIED' })) as never[]
        const out = redactUnsupportedClaims(t, marked)
        expect(rowsOf(out)).toHaveLength(4)
        for (const r of rowsOf(out)) expect(cells(r), r).toBe(cells(rowsOf(t)[0]))
        expect(out).toContain('Quy Nhơn Center - 08 Trần Độc')
        expect(out).toContain('Giá có thể đổi khi mở trang.')
        // a figure is removed whole or kept whole, never split at its dot
        expect(out).not.toMatch(/\b\d{1,3}\.(?!\d{3})\s*\|/)
        if (!pick.includes(1)) expect(out).toContain('231.481đ')
        else expect(out).not.toMatch(/231\.|481đ/)
      }
    })

    it(`guardTravelClaimsInText judge mode (pipe=${pipe}, ${link.slice(0, 7)})`, () => {
      const out = guardTravelClaimsInText(t, [215063, 247000], 'ngân sách 800 nghìn', { lang: 'vi', availability: 'counted' }).text
      const rows = rowsOf(out)
      expect(rows).toHaveLength(4)
      for (const r of rows) expect(cells(r), r).toBe(cells(rowsOf(t)[0]))
      expect(out).toContain('215.063đ')
      expect(out).toContain('247.000đ')
      expect(out).not.toMatch(/231\.|481đ/)
    })
  }
})
