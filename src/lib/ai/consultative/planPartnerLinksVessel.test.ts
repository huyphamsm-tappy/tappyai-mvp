import { describe, it, expect } from 'vitest'
import { withPartnerLinks } from './planPartnerLinks'

// Independent review 20/11: the bare word "tàu" (folded "tau") is also a ship or a ferry, and "ga tàu" appears in a taxi stop, so such stops got the Vexere TRAIN page. Only a train is a train.
const ctx = { stays: [], transport: [{ name: 'Vexere', url: 'https://vexere.com/vi-VN/ve-xe-khach-a-di-b' }, { name: 'Vexere vé tàu', url: 'https://vexere.com/vi-VN/ve-tau-hoa-a-di-b' }] }
const links = (names: string[]) => (JSON.parse(withPartnerLinks(JSON.stringify({ type: 'trip', title: 'T', days: [{ label: 'D1', items: names.map(name => ({ name, category: 'transport' })) }] }), ctx)).days[0].items as Array<{ booking_link?: string }>).map(i => i.booking_link)

describe('withPartnerLinks: what counts as a train', () => {
  it('a ferry, a fast boat or a taxi to the station gets no train page', () => {
    expect(links(['Tàu cao tốc Rạch Giá - Phú Quốc', 'Taxi ra ga tàu', 'Tàu thuyền ra đảo', 'Phà Sóc Sơn'])).toEqual([undefined, undefined, undefined, undefined])
  })
  it('a train still gets it: "tàu hỏa", "tàu Thống Nhất", "tàu SE1", "train", "đường sắt"', () => {
    const out = links(['Tàu hỏa Sài Gòn - Nha Trang', 'Tàu Thống Nhất Hà Nội - Huế', 'Tàu SE1 Sài Gòn - Quy Nhơn', 'Train Hanoi - Sapa', 'Đi đường sắt Đà Nẵng - Huế'])
    for (const l of out) expect(l).toContain('ve-tau-hoa')
  })
})
