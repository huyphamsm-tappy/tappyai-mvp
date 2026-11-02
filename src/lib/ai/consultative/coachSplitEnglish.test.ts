// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { shapeCoachReply, splitCoachRanges } from './coachFares'

// COACH-SPLIT-EN-01 (allowlist cons-allowlist-coach-split-en.md): in English the coach range split drops the "from" right before the range, as the Vietnamese
// split drops "từ", and writes the two figures with English digit grouping. Values, labels and the Vietnamese output are unchanged.
const ROWS = [
  { title: 'FUTA Bus Lines', link: 'https://futabus.vn/', snippet: 'Đặt vé xe Phương Trang đi liên tỉnh trực tuyến. Số điện thoại tổng đài đặt vé xe phương trang: 1900 6067.' },
  { title: 'Xe Phương Trang | Đặt Vé Online, Giá Vé 2026', link: 'https://www.redbus.vn/ve-xe-khach/nha-xe/phuong-trang', snippet: 'Đặt vé xe Phương Trang (FUTA Bus Lines) online tại redBus. Giá vé từ 165.000đ, 92 tuyến, 350+ điểm bán.' },
  { title: 'công ty phương trang khai trương tuyến bến xe an sương', link: 'https://futabus.vn/tin-tuc/cong-ty-phuong-trang-khai-truong-tuyen-ben-xe-an-suong-ben-xe-quy-nhon', snippet: 'Với mức giá ưu đãi chỉ 350.000 VNĐ, Quý Khách sẽ được trải nghiệm hành trình 625km trên dòng xe cao cấp KimLong 99 VIP.' },
  { title: 'Vé xe Phương Trang từ Sài Gòn đi Quy Nhơn - Bình Định', link: 'https://vexere.com/vi-VN/ve-xe-khach-phuong-trang-tu-sai-gon-di-quy-nhon-binh-dinh-129t2681-11071.html', snippet: 'Với giá vé chỉ từ 410000 đ và các tiện ích trên xe như: Đang cập nhật. Mỗi ngày nhà xe Phương Trang có 29 chuyến xe đi Sài Gòn đi Quy Nhơn - Bình Định.' },
]
const TYPED_ROWS = [
  { title: 'Xe giường nằm Phương Trang', link: 'https://a.example/giuong-nam', snippet: 'Xe giường nằm Phương Trang TP.HCM đi Quy Nhơn giá 450.000đ một chiều.' },
  { title: 'Xe limousine Phương Trang', link: 'https://b.example/limousine', snippet: 'Xe limousine Phương Trang TP.HCM đi Quy Nhơn giá 650.000đ một chiều.' },
]
const toRows = (rs: typeof ROWS) => rs.map(r => ({ host: new URL(r.link).hostname.replace(/^www\./, ''), url: r.link, text: `${r.title} ${r.snippet}` }))
const P = 'promotional price in an article on futabus.vn, no date'
const F = '"from" price on vexere.com, not date-specific'

describe('COACH-SPLIT-EN-01 — English range split', () => {
  it('E1: "From X to Y" — "From" goes with the range, figures in English grouping', () => {
    expect(splitCoachRanges('From 350,000đ to 410,000đ.', toRows(ROWS), 'en').text).toBe(`350,000đ (${P}) and 410,000đ (${F}).`)
  })
  it('E2: a dash range after the operator rule', () => {
    expect(shapeCoachReply('Fares are 350,000–410,000đ, depending on the operator.', toRows(ROWS), 'en').text).toBe(`Fares are 350,000đ (${P}) and 410,000đ (${F}).`)
  })
  it('E5: a lower-case "from" right before the range goes too', () => {
    expect(splitCoachRanges('Tickets from 350,000đ to 410,000đ.', toRows(ROWS), 'en').text).toBe(`Tickets 350,000đ (${P}) and 410,000đ (${F}).`)
  })
  it('E6: a "From" that is not right before the range stays', () => {
    expect(splitCoachRanges('From Saigon, fares are 350,000–410,000đ.', toRows(ROWS), 'en').text).toBe(`From Saigon, fares are 350,000đ (${P}) and 410,000đ (${F}).`)
  })
  it('E7: two plain fares', () => {
    expect(splitCoachRanges('From 450,000đ to 650,000đ.', toRows(TYPED_ROWS), 'en').text).toBe('450,000đ (price listed on a.example) and 650,000đ (price listed on b.example).')
  })
  it('E8: a range one row states end to end is left alone', () => {
    const one = [{ host: 'a.example', url: 'https://a.example/', text: 'Xe A Vé xe từ 300,000 - 450,000đ tùy chặng' }]
    expect(splitCoachRanges('Fares are 300,000–450,000đ.', one, 'en').text).toBe('Fares are 300,000–450,000đ.')
  })
  it('V1/V3: Vietnamese is unchanged ("từ" dropped, dot grouping)', () => {
    expect(splitCoachRanges('Giá từ 350.000đ đến 410.000đ.', toRows(ROWS), 'vi').text).toBe('Giá 350.000đ (giá ưu đãi nêu trong bài của futabus.vn, không ghi ngày) và 410.000đ (giá "từ" ở vexere.com, chưa theo ngày).')
    expect(splitCoachRanges('Giá 450.000–650.000đ.', toRows(TYPED_ROWS), 'vi').text).toBe('Giá 450.000đ (giá nêu ở a.example) và 650.000đ (giá nêu ở b.example).')
  })
})
