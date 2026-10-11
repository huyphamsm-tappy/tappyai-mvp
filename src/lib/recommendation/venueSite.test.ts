// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { buildActions, venueSite } from './actions'

// Live 2026-10-11: the Nhà hát Lớn card's "Website" button pointed at ticket-stations.com, a ticket reseller, not the venue's own site.
afterEach(() => { delete process.env.CONSULTATIVE_IN_AGENT; delete process.env.TAPPY_AGENT })
const flagOn = () => { process.env.CONSULTATIVE_IN_AGENT = '1'; process.env.TAPPY_AGENT = '2' }
const websites = (a: ReturnType<typeof buildActions>) => a.filter(x => x.kind === 'website').map(x => x.url)

const ROW = { name: 'Nhà hát Lớn Hà Nội', website_uri: 'https://www.ticket-stations.com/vn/hanoi-opera-house', maps_link: 'https://maps.google.com/?cid=1', address: '1 Tràng Tiền, Hoàn Kiếm, Hà Nội' }

describe('a ticket reseller is not the venue\'s website (flag on)', () => {
  it('flag on: the reseller "Website" button is dropped; Maps stays', () => {
    flagOn()
    const a = buildActions(ROW, 'entertainment')
    expect(websites(a).join(' ')).not.toContain('ticket-stations')
    expect(a.some(x => x.kind === 'maps')).toBe(true)
  })
  it('flag on: the venue\'s OWN site is kept (both directions)', () => {
    flagOn()
    const a = buildActions({ ...ROW, website_uri: 'https://hanoioperahouse.org.vn/' }, 'entertainment')
    expect(websites(a).join(' ')).toContain('hanoioperahouse.org.vn')
  })
  it('CONTROL — flag off: unchanged, the button is still built', () => {
    const a = buildActions(ROW, 'entertainment')
    expect(websites(a).join(' ')).toContain('ticket-stations')
  })
  it('venueSite: look-alike hosts are not matched', () => {
    flagOn()
    expect(venueSite('https://notticket-stations.com/x')).toBe('https://notticket-stations.com/x')
    expect(venueSite('https://www.ticket-stations.com/x')).toBeUndefined()
    expect(venueSite(undefined)).toBeUndefined()
  })
})
