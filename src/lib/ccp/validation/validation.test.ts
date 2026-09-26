import { describe, it, expect } from 'vitest'
import { checkCommerceUrl, checkWrapperUrl, isoToCompact, isoToDmySlash, q } from './url'
import { compareDestinations, decodeWrapperDestination } from './paramEcho'
import { getProvider } from '../registry'

const tripcom = getProvider('tripcom')!

describe('URL safety (SSRF · open redirect · injection · allow-list)', () => {
  it('accepts an allow-listed https merchant URL', () => {
    expect(checkCommerceUrl('https://vn.trip.com/hotels/detail/?hotelId=1&checkIn=2026-10-10', tripcom).ok).toBe(true)
  })

  it('refuses http, credentials, private hosts, unknown hosts and look-alike subdomains', () => {
    const cases = [
      'http://vn.trip.com/hotels/detail/?hotelId=1',
      'https://user:pw@vn.trip.com/',
      'https://127.0.0.1/',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/',
      'https://attacker.example/vn.trip.com',
      'https://vn.trip.com.attacker.example/',
      'https://evil.vn.trip.com/',
    ]
    for (const c of cases) expect(checkCommerceUrl(c, tripcom).ok, c).toBe(false)
  })

  it('refuses raw control characters, whitespace and markdown-breaking characters', () => {
    for (const c of ['https://vn.trip.com/a b', 'https://vn.trip.com/a\n', 'https://vn.trip.com/?x=<script>', 'https://vn.trip.com/?x="y"', "https://vn.trip.com/?x='", 'https://vn.trip.com/?x=]']) {
      expect(checkCommerceUrl(c, tripcom).ok, JSON.stringify(c)).toBe(false)
    }
  })

  it('refuses an unencoded nested URL in the query (open-redirect shape)', () => {
    expect(checkCommerceUrl('https://vn.trip.com/?next=https://evil.example', tripcom).ok).toBe(false)
    expect(checkCommerceUrl(`https://vn.trip.com/?ref=${q('https://vn.trip.com/x')}`, tripcom).ok).toBe(true)
  })

  it('caps URL length', () => {
    expect(checkCommerceUrl('https://vn.trip.com/?x=' + 'a'.repeat(2100), tripcom).ok).toBe(false)
  })

  it('wrapper URLs are checked against the network host list', () => {
    expect(checkWrapperUrl('https://go.isclix.com/deep_link/1/2?url=x', ['go.isclix.com']).ok).toBe(true)
    expect(checkWrapperUrl('https://go.isclix.com.attacker.example/deep_link/1/2', ['go.isclix.com']).ok).toBe(false)
    expect(checkWrapperUrl('http://go.isclix.com/deep_link/1/2', ['go.isclix.com']).ok).toBe(false)
  })

  it('date helpers produce merchant formats from validated ISO input', () => {
    expect(isoToDmySlash('2026-09-13')).toBe('13/09/2026')
    expect(isoToCompact('2026-09-13')).toBe('20260913')
    expect(q('a b&c')).toBe('a%20b%26c')
  })
})

describe('parameter echo (D4)', () => {
  const direct = 'https://vn.trip.com/hotels/detail/?cityId=42599&hotelId=10569789&checkIn=2026-10-10&checkOut=2026-10-12&adult=2&children=0&crn=1&curr=VND&locale=vi-VN'

  it('decodes the ACCESSTRADE Deep Link `url=` form and the base64 `url_enc=` form', () => {
    const w1 = `https://go.isclix.com/deep_link/6277265300509373567/6455552313033835511?url=${encodeURIComponent(direct)}&utm_source=tappyai`
    expect(decodeWrapperDestination(w1)).toBe(direct)
    const b64 = Buffer.from(direct, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const w2 = `https://go.isclix.com/deep_link/v5/x/6455552313033835511?utm_source=tappyai&url_enc=${b64}`
    expect(decodeWrapperDestination(w2)).toBe(direct)
    expect(decodeWrapperDestination('https://go.isclix.com/deep_link/1/2')).toBeNull()
  })

  it('passes when every parameter survives, regardless of order', () => {
    const reordered = 'https://vn.trip.com/hotels/detail/?locale=vi-VN&hotelId=10569789&checkOut=2026-10-12&checkIn=2026-10-10&adult=2&children=0&crn=1&curr=VND&cityId=42599'
    expect(compareDestinations(direct, reordered).ok).toBe(true)
  })

  it('REJECTS the Product Link preset override observed for Trip.com', () => {
    const r = compareDestinations(direct, 'https://vn.trip.com/?locale=vi-vn')
    expect(r.ok).toBe(false)
    expect(r.pathMismatch).toBe(true)
    expect(r.missing).toEqual(expect.arrayContaining(['hotelId', 'checkIn', 'checkOut', 'adult']))
  })

  it('rejects a changed date or a dropped guest count', () => {
    expect(compareDestinations(direct, direct.replace('2026-10-12', '2026-10-13')).changed).toEqual(['checkOut'])
    expect(compareDestinations(direct, direct.replace('&adult=2', '')).missing).toEqual(['adult'])
    expect(compareDestinations(direct, direct.replace('vn.trip.com', 'www.trip.com')).hostMismatch).toBe(true)
  })
})
