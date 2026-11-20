import { describe, it, expect } from 'vitest'
import { withPartnerLinks } from './planPartnerLinks'

const plan = (items: unknown[]) => JSON.stringify({ type: 'trip', title: 'T', days: [{ label: 'D1', items }] })
const ctx = {
  stays: [{ name: 'Pu Luong Eco Garden', url: 'https://www.agoda.com/partners/x?hid=1', perNight: 1_250_000 }, { name: 'Other Hotel', url: 'https://www.agoda.com/partners/x?hid=2' }],
  transport: [{ name: 'Vexere', url: 'https://vexere.com/vi-VN/ve-xe-khach-a-di-b' }, { name: 'Vexere vé tàu', url: 'https://vexere.com/vi-VN/ve-tau-hoa-a-di-b' }],
}
const items = (json: string) => (JSON.parse(json).days[0].items as Array<Record<string, unknown>>)

describe('withPartnerLinks', () => {
  it('a hotel stop gets the Agoda page of the hotel it names, and its price per night when it has none', () => {
    const out = items(withPartnerLinks(plan([{ name: 'Pu Luong Eco Garden', category: 'hotel' }]), ctx))
    expect(out[0].booking_link).toBe('https://www.agoda.com/partners/x?hid=1')
    expect(out[0].price).toBe('1.250.000đ/đêm')
  })
  it('a stop whose price is already there keeps it; a hotel the lookup did not return gets no link (never another hotel)', () => {
    const out = items(withPartnerLinks(plan([{ name: 'Pu Luong Eco Garden', category: 'hotel', price: '1.000.000đ' }, { name: 'Khách sạn Không Có', category: 'hotel' }]), ctx))
    expect(out[0].price).toBe('1.000.000đ')
    expect(out[1].booking_link).toBeUndefined()
  })
  it('a coach stop gets the Vexere route page, a train stop the Vexere train page, a flight or a taxi nothing', () => {
    const out = items(withPartnerLinks(plan([
      { name: 'Xe khách giường nằm TP.HCM - Đà Lạt', category: 'transport' },
      { name: 'Tàu hỏa Sài Gòn - Nha Trang', category: 'transport' },
      { name: 'Bay TP.HCM - Thọ Xuân', category: 'transport' },
      { name: 'Taxi sân bay', category: 'transport' },
    ]), ctx))
    expect(out[0].booking_link).toContain('ve-xe-khach')
    expect(out[1].booking_link).toContain('ve-tau-hoa')
    expect(out[2].booking_link).toBeUndefined()
    expect(out[3].booking_link).toBeUndefined()
  })
  it('a stop that already has a link keeps it, a non-https link is never used, and bad JSON comes back as it was', () => {
    const out = items(withPartnerLinks(plan([{ name: 'Pu Luong Eco Garden', category: 'hotel', booking_link: 'https://own.example/b' }]), ctx))
    expect(out[0].booking_link).toBe('https://own.example/b')
    const http = items(withPartnerLinks(plan([{ name: 'Pu Luong Eco Garden', category: 'hotel' }]), { ...ctx, stays: [{ name: 'Pu Luong Eco Garden', url: 'http://insecure.example/x' }] }))
    expect(http[0].booking_link).toBeUndefined()
    expect(withPartnerLinks('not json', ctx)).toBe('not json')
  })
})
