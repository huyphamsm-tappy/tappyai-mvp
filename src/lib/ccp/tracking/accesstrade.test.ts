import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { isAccesstradeConfigured, verifyExternalWrapper, wrapWithAccesstrade } from './accesstrade'
import { getProvider } from '../registry'

const direct = 'https://vn.trip.com/hotels/detail/?cityId=42599&hotelId=10569789&checkIn=2026-10-10&checkOut=2026-10-12&adult=2&children=0&crn=1&curr=VND&locale=vi-VN'
const tripcom = getProvider('tripcom')!.tracking!

describe('ACCESSTRADE Deep Link wrapper (D4)', () => {
  const saved = process.env.ACCESSTRADE_PUBLISHER_ID
  beforeEach(() => { process.env.ACCESSTRADE_PUBLISHER_ID = '6277265300509373567' })
  afterEach(() => { if (saved === undefined) delete process.env.ACCESSTRADE_PUBLISHER_ID; else process.env.ACCESSTRADE_PUBLISHER_ID = saved })

  it('is unavailable (not an error) when the publisher id is not configured', () => {
    delete process.env.ACCESSTRADE_PUBLISHER_ID
    expect(isAccesstradeConfigured()).toBe(false)
    const r = wrapWithAccesstrade({ directUrl: direct, tracking: tripcom })
    expect(r).toEqual({ ok: false, reason: 'not_configured' })
  })

  it('refuses a malformed publisher id rather than emitting a broken wrapper', () => {
    process.env.ACCESSTRADE_PUBLISHER_ID = 'abc'
    expect(isAccesstradeConfigured()).toBe(false)
  })

  it('builds the Deep Link endpoint URL and proves the destination survived (param echo)', () => {
    const r = wrapWithAccesstrade({ directUrl: direct, tracking: tripcom, actorHash: 'a1b2c3d4e5f60718', utmContent: 'hotel_danang' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const u = new URL(r.url)
    expect(u.hostname).toBe('go.isclix.com')
    expect(u.pathname).toBe('/deep_link/6277265300509373567/6455552313033835511')
    expect(u.searchParams.get('url')).toBe(direct)
    expect(u.searchParams.get('utm_source')).toBe('tappyai')
    expect(u.searchParams.get('sub1')).toBe('a1b2c3d4e5f60718')
    expect(r.tracking).toMatchObject({ mode: 'affiliate', network: 'accesstrade', campaignId: '6455552313033835511' })
  })

  it('does not wrap a campaign that is not approved (DMX pending) — direct link stays', () => {
    const dmx = getProvider('dmx')!.tracking!
    const r = wrapWithAccesstrade({ directUrl: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb', tracking: dmx })
    expect(r).toMatchObject({ ok: false, reason: 'campaign_not_approved' })
  })

  it('never emits a raw user identifier in sub-ids: only the hash the caller provides', () => {
    const r = wrapWithAccesstrade({ directUrl: direct, tracking: tripcom })
    expect(r.ok && Object.keys(r.tracking.mode === 'affiliate' ? r.tracking.subIds : {})).toEqual([])
  })

  it('verifyExternalWrapper rejects a Product-Link-style preset override and accepts a faithful Deep Link', () => {
    const preset = `https://go.isclix.com/deep_link/6277265300509373567/6455552313033835511?url=${encodeURIComponent('https://vn.trip.com/?locale=vi-vn')}`
    expect(verifyExternalWrapper(preset, direct).ok).toBe(false)
    const faithful = `https://go.isclix.com/deep_link/6277265300509373567/6455552313033835511?url=${encodeURIComponent(direct)}`
    expect(verifyExternalWrapper(faithful, direct).ok).toBe(true)
    expect(verifyExternalWrapper('https://evil.example/?url=' + encodeURIComponent(direct), direct).ok).toBe(false)
  })
})
