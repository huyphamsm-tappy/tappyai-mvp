import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import type { CommerceRequest } from '../domain/types'
import { deriveKind, resolveDeepLink } from './resolve'
import { tripcomAdapter } from '../adapters/tripcom'
import { pasgoAdapter } from '../adapters/pasgo'
import { dmxAdapter } from '../adapters/dmx'
import type { DiscoveryHint } from '../adapters/types'
import { cgvAdapter } from '../adapters/cgv'
import { klookAdapter } from '../adapters/klook'
import type { ProviderAdapter } from '../adapters/types'
import { resolveCommerce } from '../index'
import { rankLinks } from '../ranking/score'
import { setCommerceEventWriter } from '../events/sink'

const now = new Date('2026-09-13T10:00:00+07:00')
const hotelReq: CommerceRequest = {
  domain: 'travel',
  intentType: 'book_hotel',
  subject: 'Nordic Resort',
  configuration: { kind: 'hotel', propertyRef: '10569789', cityRef: '42599', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 },
  context: { actorHash: 'a1b2c3d4e5f60718' },
}

describe('Deep Link Resolver — the six steps', () => {
  const saved = process.env.ACCESSTRADE_PUBLISHER_ID
  beforeEach(() => { process.env.ACCESSTRADE_PUBLISHER_ID = '6277265300509373567'; setCommerceEventWriter(() => {}) })
  afterEach(() => { if (saved === undefined) delete process.env.ACCESSTRADE_PUBLISHER_ID; else process.env.ACCESSTRADE_PUBLISHER_ID = saved; setCommerceEventWriter(null) })

  it('Trip.com: direct URL → validated → wrapped → param echo proven → AFFILIATE_DEEP_LINK with metadata', () => {
    const offer = tripcomAdapter.toOffer(hotelReq, { subjectRef: '10569789' }, now)!
    const r = resolveDeepLink(tripcomAdapter, hotelReq, offer, hotelReq.configuration, { now })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.wrapper).toBe('applied')
    expect(r.link.kind).toBe('AFFILIATE_DEEP_LINK')
    expect(r.link.validation.status).toBe('param_echo_ok')
    expect(r.link.validation.method).toBe('decode')
    expect(new URL(r.link.url).hostname).toBe('go.isclix.com')
    expect(r.link.depth).toBe(4)
    expect(r.link.depthProfile.guestDepth).toBe(5)
    expect(r.link.authRequiredAt).toBe('none')
    expect(r.link.paramsPreserved).toContain('checkIn')
    expect(r.link.freshness.freshnessType).toBe('static')
  })

  it('falls back to the DIRECT link when wrapping is disabled, unavailable or the campaign is not approved', () => {
    const offer = tripcomAdapter.toOffer(hotelReq, { subjectRef: '10569789' }, now)!
    const off = resolveDeepLink(tripcomAdapter, hotelReq, offer, hotelReq.configuration, { now, wrappingEnabled: false })
    expect(off.ok && off.wrapper).toBe('disabled')
    expect(off.ok && off.link.kind).toBe('DIRECT_DEEP_LINK')
    expect(off.ok && new URL(off.link.url).hostname).toBe('vn.trip.com')

    delete process.env.ACCESSTRADE_PUBLISHER_ID
    const unavailable = resolveDeepLink(tripcomAdapter, hotelReq, offer, hotelReq.configuration, { now })
    expect(unavailable.ok && unavailable.wrapper).toBe('unavailable')
    expect(unavailable.ok && unavailable.link.tracking.mode).toBe('none')

    process.env.ACCESSTRADE_PUBLISHER_ID = '6277265300509373567'
    const dmxReq: CommerceRequest = { domain: 'shopping', intentType: 'buy_product', subject: 'iPhone 15' }
    const dmxOffer = dmxAdapter.toOffer(dmxReq, { url: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb' }, now)!
    const pending = resolveDeepLink(dmxAdapter, dmxReq, dmxOffer, undefined, { now })
    expect(pending.ok && pending.wrapper).toBe('unavailable') // campaign pending → direct
    expect(pending.ok && pending.link.kind).toBe('DETAIL_HANDOFF')
  })

  it('REJECTS a wrapper that destroys the destination and ships the direct link instead', () => {
    // A tracking config whose network would preset-override: simulate by an
    // adapter whose direct link contains a param the wrapper cannot echo —
    // here we monkey-patch the wrapper output via an adapter that emits a URL
    // with an unencodable fragment. Simplest faithful test: verify the resolver
    // path through the public verifyExternalWrapper contract is covered in
    // tracking tests; here assert the resolver marks rejection distinctly.
    const brokenAdapter: ProviderAdapter = {
      ...tripcomAdapter,
      entry: { ...tripcomAdapter.entry, tracking: { ...tripcomAdapter.entry.tracking!, safeWrapper: 'product_link' as unknown as 'deep_link' } },
    }
    const offer = tripcomAdapter.toOffer(hotelReq, { subjectRef: '10569789' }, now)!
    const r = resolveDeepLink(brokenAdapter, hotelReq, offer, hotelReq.configuration, { now })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.wrapper).toBe('rejected')
    expect(r.link.tracking.mode).toBe('none')
    expect(new URL(r.link.url).hostname).toBe('vn.trip.com')
    expect(r.link.validation.detail).toMatch(/unsafe_wrapper/)
  })

  it('refuses an unsafe direct URL outright (adapter bug or registry drift cannot reach the user)', () => {
    const evil: ProviderAdapter = { ...pasgoAdapter, buildDirectLink: () => ({ url: 'https://evil.example/x', depth: 5, paramsPreserved: [], paramsPageOnly: [], paramsDropped: [], expiresAt: null, grammar: 'verified', limitations: [] }) }
    const req: CommerceRequest = { domain: 'food_drink', intentType: 'reserve_table', subject: 'x' }
    const offer = pasgoAdapter.toOffer(req, { url: 'https://pasgo.vn/nha-hang/cha-ca-hang-son-huynh-thuc-khang-4815', verified: { bookable: true, checkedAt: now.toISOString(), source: 'merchant_page' } }, now)!
    const r = resolveDeepLink(evil, req, offer, undefined, { now })
    expect(r).toMatchObject({ ok: false, reason: 'unsafe_direct_url' })
  })

  it('PasGo: CHECKOUT_HANDOFF at L5 with the 5-minute expiry; no tracking (affiliate optional)', () => {
    const req: CommerceRequest = { domain: 'food_drink', intentType: 'reserve_table', subject: 'x', configuration: { kind: 'reservation', restaurantRef: '4815', date: '2026-09-13', time: '19:00', adults: 2 } }
    const offer = pasgoAdapter.toOffer(req, { url: 'https://pasgo.vn/nha-hang/cha-ca-hang-son-huynh-thuc-khang-4815', verified: { bookable: true, checkedAt: now.toISOString(), source: 'merchant_page' } }, now)!
    const r = resolveDeepLink(pasgoAdapter, req, offer, req.configuration, { now })
    expect(r.ok && r.link.kind).toBe('CHECKOUT_HANDOFF')
    expect(r.ok && r.link.depth).toBe(5)
    expect(r.ok && r.link.expiresAt).toBe(new Date(now.getTime() + 300_000).toISOString())
    expect(r.ok && r.wrapper).toBe('unavailable')
  })

  it('CGV and Klook: guest L4 boundary is carried, never claimed as L5', () => {
    const cgvReq: CommerceRequest = { domain: 'entertainment', intentType: 'buy_ticket', subject: 'HOPE', configuration: { kind: 'cinema', filmRef: 'hope-vung-tu-dia' } }
    const cgvOffer = cgvAdapter.toOffer(cgvReq, { subjectRef: 'hope-vung-tu-dia' }, now)!
    const c = resolveDeepLink(cgvAdapter, cgvReq, cgvOffer, cgvReq.configuration, { now })
    expect(c.ok && c.link.authRequiredAt).toBe('before_selection')
    expect(c.ok && c.link.depthProfile.guestDepth).toBe(4)
    expect(c.ok && c.link.limitations.join(' ')).toMatch(/đăng nhập/)

    const spaReq: CommerceRequest = { domain: 'spa', intentType: 'buy_spa_voucher', subject: 'Ha Spa', configuration: { kind: 'spa', activityRef: '43345' } }
    const spaOffer = klookAdapter.toOffer(spaReq, { subjectRef: '43345' }, now)!
    const k = resolveDeepLink(klookAdapter, spaReq, spaOffer, spaReq.configuration, { now })
    expect(k.ok && k.link.kind).toBe('AFFILIATE_DEEP_LINK') // Klook approved → wrapped
    expect(k.ok && k.link.authRequiredAt).toBe('before_checkout')
  })

  it('deriveKind maps tracking first, then landing depth', () => {
    expect(deriveKind(5, { mode: 'none' }, true)).toBe('CHECKOUT_HANDOFF')
    expect(deriveKind(4, { mode: 'none' }, true)).toBe('DIRECT_DEEP_LINK')
    expect(deriveKind(4, { mode: 'none' }, false)).toBe('CONFIGURED_HANDOFF')
    expect(deriveKind(3, { mode: 'none' }, false)).toBe('DETAIL_HANDOFF')
    expect(deriveKind(2, { mode: 'none' }, false)).toBe('SEARCH_HANDOFF')
    expect(deriveKind(3, { mode: 'first_party', utm: {} }, false)).toBe('TRACKED_DEEP_LINK')
    expect(deriveKind(3, { mode: 'affiliate', network: 'accesstrade', campaignId: '1', subIds: {}, utm: {} }, false)).toBe('AFFILIATE_DEEP_LINK')
  })
})

describe('orchestrator + ranking + fallback', () => {
  beforeEach(() => { process.env.ACCESSTRADE_PUBLISHER_ID = '6277265300509373567'; setCommerceEventWriter(() => {}) })
  afterEach(() => { delete process.env.ACCESSTRADE_PUBLISHER_ID; setCommerceEventWriter(null) })

  it('returns a disabled failure and no links while CCP_ENABLED is false (default)', () => {
    const r = resolveCommerce(hotelReq, { now, hints: [{ subjectRef: '10569789' }] })
    expect('links' in r && r.links).toEqual([])
    expect('providersFailed' in r && r.providersFailed[0]).toMatchObject({ code: 'disabled' })
  })

  it('resolves the five MVP examples end to end when enabled', () => {
    const cases: Array<[CommerceRequest, DiscoveryHint, string, number]> = [
      [{ domain: 'shopping', intentType: 'buy_product', subject: 'iPhone 15' }, { url: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb' }, 'dmx', 3],
      [hotelReq, { subjectRef: '10569789' }, 'tripcom', 4],
      [{ domain: 'food_drink', intentType: 'reserve_table', subject: 'x', configuration: { kind: 'reservation', restaurantRef: '4815', date: '2026-09-13', time: '19:00', adults: 2 } }, { url: 'https://pasgo.vn/nha-hang/cha-ca-hang-son-huynh-thuc-khang-4815', verified: { bookable: true, checkedAt: '2026-09-13T00:00:00.000Z', source: 'merchant_page' } }, 'pasgo', 5],
      [{ domain: 'entertainment', intentType: 'buy_ticket', subject: 'HOPE', configuration: { kind: 'cinema', filmRef: 'hope-vung-tu-dia' } }, { subjectRef: 'hope-vung-tu-dia' }, 'cgv', 3],
      [{ domain: 'spa', intentType: 'buy_spa_voucher', subject: 'Ha Spa', configuration: { kind: 'spa', activityRef: '43345' } }, { subjectRef: '43345' }, 'klook', 3],
    ]
    for (const [req, hint, provider, depth] of cases) {
      const r = resolveCommerce(req, { now, hints: [hint], enabled: true })
      expect('links' in r, provider).toBe(true)
      if (!('links' in r)) continue
      expect(r.links, provider).toHaveLength(1)
      expect(r.links[0].providerId).toBe(provider)
      expect(r.links[0].depth).toBe(depth)
      expect(r.links[0].validation.status).not.toBe('failed')
    }
  })

  it('rejects malformed input at the boundary and never guesses ids', () => {
    const r = resolveCommerce({ domain: 'travel', intentType: 'book_hotel', subject: 'x', configuration: { kind: 'hotel', propertyRef: '1', checkIn: '2026-10-12', checkOut: '2026-10-10', adults: 2 } }, { now, enabled: true })
    expect('issues' in r).toBe(true)
    const noHint = resolveCommerce(hotelReq, { now, enabled: true, hints: [] })
    expect('links' in noHint && noHint.links).toEqual([])
    expect('providersFailed' in noHint && noHint.providersFailed.map(f => f.code)).toContain('no_offer')
  })

  it('requireGuestPath filters login-gated providers instead of pretending they reach L5', () => {
    const req: CommerceRequest = { domain: 'spa', intentType: 'buy_spa_voucher', subject: 'Ha Spa', configuration: { kind: 'spa', activityRef: '43345' }, context: { requireGuestPath: true } }
    const r = resolveCommerce(req, { now, enabled: true, hints: [{ subjectRef: '43345' }] })
    expect('links' in r && r.links).toEqual([])
  })

  it('ranking: monetisation cannot outrank depth/exactness — a tracked detail link loses to a direct configured link', () => {
    const req: CommerceRequest = { domain: 'travel', intentType: 'book_hotel', subject: 'x', configuration: { kind: 'hotel', propertyRef: '10569789', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 } }
    const offer = tripcomAdapter.toOffer(req, { subjectRef: '10569789' }, now)!
    const configured = resolveDeepLink(tripcomAdapter, req, offer, req.configuration, { now, wrappingEnabled: false })
    const trackedDetail = resolveDeepLink(tripcomAdapter, req, offer, undefined, { now })
    expect(configured.ok && trackedDetail.ok).toBe(true)
    if (!configured.ok || !trackedDetail.ok) return
    expect(trackedDetail.link.tracking.mode).toBe('affiliate')
    const ranked = rankLinks(req, [trackedDetail.link, configured.link], now)
    expect(ranked[0].link.kind).toBe('DIRECT_DEEP_LINK')
    expect(ranked[0].features.monetisation).toBe(0)
    expect(ranked[1].features.monetisation).toBe(1)
  })

  it('ranking: when links are otherwise equal, the affiliate one wins (tie-break only)', () => {
    const req: CommerceRequest = { domain: 'travel', intentType: 'book_hotel', subject: 'x', configuration: { kind: 'hotel', propertyRef: '10569789', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 } }
    const offer = tripcomAdapter.toOffer(req, { subjectRef: '10569789' }, now)!
    const direct = resolveDeepLink(tripcomAdapter, req, offer, req.configuration, { now, wrappingEnabled: false })
    const wrapped = resolveDeepLink(tripcomAdapter, req, offer, req.configuration, { now })
    if (!direct.ok || !wrapped.ok) throw new Error('resolve failed')
    const ranked = rankLinks(req, [direct.link, wrapped.link], now)
    expect(ranked[0].link.tracking.mode).toBe('affiliate')
    expect(ranked[0].score - ranked[1].score).toBeLessThanOrEqual(0.05 + 0.1 * 0.1 + 1e-9) // monetisation cap (+ echo-validated precision bonus)
  })
})
