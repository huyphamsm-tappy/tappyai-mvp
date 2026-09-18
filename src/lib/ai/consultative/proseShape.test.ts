import { describe, it, expect } from 'vitest'
import { guardProseShape } from './proseShape'

// Consultative V1 §6 — listing removed, reason kept, one alternative, cap of
// six, the pick sentence never cut, machine blocks untouched.

const venues = [
  { name: 'Bún Bò Huế Bến Ngự', rating: 4.4, reviewCount: 589, address: '585 Huỳnh Tấn Phát, Quận 7', hours: '06:00–20:00', phone: '+84 917 607 088' },
  { name: 'Cơm Niêu Sài Gòn', rating: 4.6, reviewCount: 1200 },
]

describe('guardProseShape — listings vs reasons', () => {
  it('drops a sentence that is only a card value; keeps a reason that uses the value', () => {
    const text = [
      'Mình chọn **Bún Bò Huế Bến Ngự** cho tối nay vì 4.4⭐ từ 589 đánh giá là bằng chứng đủ mạnh cho một quán nhỏ.',
      'Bún Bò Huế Bến Ngự: 4.4⭐ (589 đánh giá).',
      'Địa chỉ: 585 Huỳnh Tấn Phát, Quận 7.',
      'Mở cửa 06:00–20:00.',
      'Bạn nên đi trước 19h vì quán đóng sớm.',
    ].join(' ')
    const r = guardProseShape(text, { rendersCard: true, venues })
    expect(r.stats.listing_removed).toBe(3)
    expect(r.text).toContain('bằng chứng đủ mạnh')
    expect(r.text).toContain('đi trước 19h')
    expect(r.text).not.toContain('Địa chỉ:')
    expect(r.text).not.toContain('(589 đánh giá)')
  })
  it('without a card nothing is a duplicate — listings stay', () => {
    const text = 'Mình chọn **Bún Bò Huế Bến Ngự**. Địa chỉ: 585 Huỳnh Tấn Phát, Quận 7.'
    expect(guardProseShape(text, { rendersCard: false, venues }).text).toBe(text)
  })
  it('the pick sentence is never removed, even when it is only a value', () => {
    const text = 'Bún Bò Huế Bến Ngự: 4.4⭐ (589 đánh giá). Đi sớm nhé.'
    const r = guardProseShape(text, { rendersCard: true, venues })
    expect(r.text).toContain('Bún Bò Huế Bến Ngự')
    expect(r.stats.listing_removed).toBe(0)
  })
})

describe('guardProseShape — one alternative, cap of six, pick kept', () => {
  it('keeps the first alternative sentence and drops the second', () => {
    const text = 'Mình chọn **Cơm Niêu Sài Gòn** vì yên tĩnh. Ngoài ra **Bún Bò Huế Bến Ngự** rẻ hơn nhưng ồn. Nếu muốn view thì có chỗ khác. Đi sớm nhé.'
    const r = guardProseShape(text, { rendersCard: true, venues })
    expect(r.stats.alternatives_removed).toBe(1)
    expect(r.text).toContain('Ngoài ra')
    expect(r.text).not.toContain('Nếu muốn view')
  })
  it('caps at six sentences, dropping the least informative first, never the pick', () => {
    const text = [
      'Chào bạn.',
      'Hôm nay trời đẹp.',
      'Mình chọn **Cơm Niêu Sài Gòn** cho 2 người tối nay vì yên tĩnh.',
      'Quán có 4.6⭐ từ 1200 đánh giá nên khá đáng tin.',
      'Nên đặt bàn trước 18h.',
      'Ngoài ra Bún Bò Huế Bến Ngự rẻ hơn.',
      'Chúc bạn ngon miệng.',
      'Có gì cứ hỏi mình.',
      'Bạn đi bằng xe máy hay ô tô?',
    ].join(' ')
    const r = guardProseShape(text, { rendersCard: true, venues })
    expect(r.stats.sentences_out).toBe(6)
    expect(r.stats.capped).toBe(3)
    expect(r.text).toContain('Mình chọn **Cơm Niêu Sài Gòn**')
    expect(r.text).toContain('4.6⭐ từ 1200')
    expect(r.text).not.toContain('Hôm nay trời đẹp')
    expect(r.text).not.toContain('Có gì cứ hỏi mình')
  })
  it('machine blocks are neither counted nor touched', () => {
    const text = 'Mình chọn **Cơm Niêu Sài Gòn**.\n\n[FOLLOWUPS] a | b | c'
    const r = guardProseShape(text, { rendersCard: true, venues })
    expect(r.text).toBe(text)
    expect(r.stats.sentences_in).toBe(1)
  })
  it('empty text is returned as is', () => {
    expect(guardProseShape('', { rendersCard: true, venues }).text).toBe('')
  })
})

describe('guardProseShape — a labelled card field is a listing however the value is formatted', () => {
  it('"Địa chỉ: 290/28 Nam Kỳ Khởi Nghĩa, Quận 3." goes with a card even when the row address is longer', () => {
    const text = 'Mình chọn **Padme Chay** vì 1.643 đánh giá cho 2 người tối nay. Địa chỉ: 290/28 Nam Kỳ Khởi Nghĩa, Quận 3. Quán mở 10:00–22:00 nên tối nay vẫn kịp.'
    const r = guardProseShape(text, { rendersCard: true, venues: [{ name: 'Padme Chay', address: '290/28 Nam Kỳ Khởi Nghĩa, Phường 8, Quận 3, TP.HCM' }] })
    expect(r.text).not.toContain('Địa chỉ:')
    expect(r.text).toContain('tối nay vẫn kịp')
    expect(r.stats.listing_removed).toBe(1)
  })
})
