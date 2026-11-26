import { describe, it, expect } from 'vitest'
import { DEAL_SOURCES, MAX_DEALS_PER_PARTNER, endOfOfferDay, isAllowedLink, offerToRow, offersOf, rowsForSource } from './accesstradeOffers'

const LAZADA = DEAL_SOURCES.find(s => s.partnerId === 'lazada')!
const VEXERE = DEAL_SOURCES.find(s => s.partnerId === 'vexere')!
const NOW = new Date('2026-11-26T05:00:00Z')

const offer = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  name: 'Giảm 50K đơn đầu',
  content: 'Áp dụng   cho đơn\nđầu tiên',
  aff_link: 'https://go.isclix.com/deep_link/5087153089503673507?url=https%3A%2F%2Fwww.lazada.vn%2F',
  end_time: '2026-12-31',
  coupons: [{ coupon_code: 'LZD50', coupon_desc: 'Giảm 50.000đ' }],
  image: 'https://static.accesstrade.vn/x.png',
  ...over,
})

describe('Accesstrade offers -> partner_deals rows', () => {
  it('maps a coupon offer: title, voucher code, the coupon\'s own description as the label, the tracked link, the end of the day in Vietnam', () => {
    const row = offerToRow(offer(), LAZADA, NOW)!
    expect(row).toMatchObject({
      partner_slug: 'lazada', partner_name: 'Lazada', title: 'Giảm 50K đơn đầu', official_url: expect.stringContaining('go.isclix.com'),
      description: 'Áp dụng cho đơn đầu tiên', end_at: '2026-12-31T16:59:59.000Z', is_active: true, country_code: 'VN',
      metadata: { source: 'accesstrade', external_id: 'o1', promotion: { discountLabel: 'Giảm 50.000đ', voucherCode: 'LZD50' } },
    })
  })

  it('reads the older coupon-endpoint spelling too (prod_link, end_date, data.data)', () => {
    const json = { data: { data: [offer({ aff_link: undefined, prod_link: 'https://go.isclix.com/deep_link/1?url=x', end_time: undefined, end_date: 'Thu, 31 Dec 2026 16:00:00 GMT' })] } }
    expect(offersOf(json)).toHaveLength(1)
    expect(rowsForSource(json, LAZADA, NOW)).toHaveLength(1)
  })

  it('drops what must not be shown: no link, a link on another host or over http, an ended offer, no id', () => {
    for (const bad of [
      offer({ aff_link: undefined }),
      offer({ aff_link: 'https://evil.example/deep?x=1' }),
      offer({ aff_link: 'http://go.isclix.com/deep_link/1' }),
      offer({ aff_link: 'https://go.isclix.com.evil.example/x' }),
      offer({ end_time: '2026-11-25' }),
      offer({ id: undefined }),
    ]) expect(offerToRow(bad, LAZADA, NOW)).toBeNull()
  })

  it('an offer with no end date is kept for a bounded 3 days, never open-ended', () => {
    const row = offerToRow(offer({ end_time: undefined }), VEXERE, NOW)!
    expect(Date.parse(row.end_at) - NOW.getTime()).toBe(3 * 24 * 3600 * 1000)
  })

  it('an offer without a coupon is shown without a code (no invented discount)', () => {
    const row = offerToRow(offer({ coupons: [] }), VEXERE, NOW)!
    expect(row.metadata.promotion).toEqual({ discountLabel: null, voucherCode: null })
  })

  it('keeps at most 4 per partner, coupons first, then the soonest to end; de-duplicates ids', () => {
    const many = Array.from({ length: 10 }, (_, i) => offer({ id: `o${i}`, coupons: i % 2 ? [] : [{ coupon_code: `C${i}`, coupon_desc: 'x' }], end_time: `2026-12-${String(10 + i).padStart(2, '0')}` }))
    const rows = rowsForSource({ data: [...many, offer({ id: 'o0' })] }, LAZADA, NOW)
    expect(rows).toHaveLength(MAX_DEALS_PER_PARTNER)
    expect(rows.every(r => r.metadata.promotion.voucherCode)).toBe(true)
    expect(rows.map(r => r.metadata.external_id)).toEqual(['o0', 'o2', 'o4', 'o6'])
  })

  it('link and date helpers', () => {
    expect(isAllowedLink('https://go.isclix.com/a', LAZADA.linkHosts)).toBe(true)
    expect(isAllowedLink('https://www.lazada.vn/x', LAZADA.linkHosts)).toBe(true)
    expect(isAllowedLink('https://notlazada.vn/x', LAZADA.linkHosts)).toBe(false)
    expect(endOfOfferDay('nonsense')).toBeNull()
    expect(offersOf(null)).toEqual([])
  })
})
