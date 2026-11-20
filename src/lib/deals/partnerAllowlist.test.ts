import { describe, it, expect } from 'vitest'
import { isAllowedDealPartner, onlyAllowedPartners, ALLOWED_DEAL_PARTNERS } from './partnerAllowlist'

describe('the Deals page shows only the four partners (owner 20/11/2026)', () => {
  it('the four: Accesstrade, Lazada, Agoda, Vexere', () => {
    expect([...ALLOWED_DEAL_PARTNERS].sort()).toEqual(['accesstrade', 'agoda', 'lazada', 'vexere'])
  })
  it.each(['Accesstrade', 'ACCESSTRADE', 'AccessTrade VN', 'Lazada', 'lazada.vn', 'Agoda', 'agoda.com', 'Vexere', 'VeXeRe.com', ' Lazada '])('accepts %s', n => { expect(isAllowedDealPartner(n)).toBe(true) })
  it.each(['Shopee', 'Tiki', 'Booking.com', 'Traveloka', 'Trip.com', 'Grab', '', 'notagoda'])('refuses %s', n => { expect(isAllowedDealPartner(n)).toBe(false) })
  it('a missing or odd name is refused, never thrown on', () => {
    expect(isAllowedDealPartner(undefined as never)).toBe(false)
    expect(isAllowedDealPartner(null as never)).toBe(false)
    expect(isAllowedDealPartner(42 as never)).toBe(false)
  })
  it('onlyAllowedPartners keeps the order and drops the rest', () => {
    const rows = [{ partnerName: 'Shopee' }, { partnerName: 'Agoda' }, { partnerName: 'Tiki' }, { partnerName: 'Lazada' }]
    expect(onlyAllowedPartners(rows).map(r => r.partnerName)).toEqual(['Agoda', 'Lazada'])
  })
})
