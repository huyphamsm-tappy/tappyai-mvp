import { describe, it, expect } from 'vitest'
import { extractMoneyClaims } from './moneyGuard'
import { labelUnbackedPrices } from './consultative/unbackedPrices'

// Share run 31/10, T07: "Tour Bangkok – Pattaya 8N7Đ" reached the person as "tour 8Nchưa xác minh" - the one-brain label step read the nights of the
// travel-trade duration ("8 ngày 7 đêm") as 7 đồng.

describe('a tour length "<days>N<nights>Đ" is not a price', () => {
  it('the nights of a duration are not a money claim, in any case or spacing', () => {
    for (const s of ['Tour 8N7Đ No Shopping', 'tour 5N4đ Bangkok', 'Hành trình 3N2Đ', 'gói 4 N 3 Đ']) expect(extractMoneyClaims(s), s).toEqual([])
  })
  it('a price written after the duration is still a price; a bare "đ" price elsewhere is still read', () => {
    const c = extractMoneyClaims('Tour 5N4Đ giá 7.990.000đ một người')
    expect(c.map(x => x.lo)).toEqual([7990000])
    expect(extractMoneyClaims('vé gửi xe 5đ').map(x => x.lo)).toEqual([5])
    // a word ending in "n" before the number is not a duration; another unit after a duration is still money
    expect(extractMoneyClaims('phí gửi xe hơn 5đ').map(x => x.lo)).toEqual([5])
    expect(extractMoneyClaims('gói 2N 3 triệu').map(x => x.lo)).toEqual([3e6])
  })
  it('the one-brain label step leaves the duration whole and still labels an unbacked price', () => {
    const r = labelUnbackedPrices('Mình chọn tour 8N7Đ No Shopping, giá 10.990.000đ.', [], 'chưa xác minh')
    expect(r.text).toContain('tour 8N7Đ No Shopping')
    expect(r.text).not.toContain('8Nchưa')
    expect(r.text).not.toContain('10.990.000đ')
  })
})
