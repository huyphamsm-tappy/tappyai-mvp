import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { projectToCta } from './projection'
import { resolveDeepLink } from '../resolver/resolve'
import { tripcomAdapter } from '../adapters/tripcom'
import { cgvAdapter } from '../adapters/cgv'
import type { CommerceRequest } from '../domain/types'

const now = new Date('2026-09-13T10:00:00+07:00')

describe('CTA projection (D8)', () => {
  beforeEach(() => { delete process.env.ACCESSTRADE_PUBLISHER_ID })
  afterEach(() => { delete process.env.ACCESSTRADE_PUBLISHER_ID })

  it('keeps the legacy four fields and adds the commerce block; never uses internal_booking', () => {
    const req: CommerceRequest = { domain: 'travel', intentType: 'book_hotel', subject: 'x', configuration: { kind: 'hotel', propertyRef: '10569789', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 } }
    const offer = tripcomAdapter.toOffer(req, { subjectRef: '10569789' }, now)!
    const r = resolveDeepLink(tripcomAdapter, req, offer, req.configuration, { now })
    if (!r.ok) throw new Error('resolve failed')
    const cta = projectToCta(r.link)
    expect(cta).toMatchObject({ label: 'Đặt tại Trip.com', type: 'booking', url: r.link.url, primary: true })
    expect(cta.type).not.toBe('internal_booking')
    expect(cta.commerce).toMatchObject({ provider: 'tripcom', merchant: 'tripcom', linkKind: 'DIRECT_DEEP_LINK', depth: 4, guestDepth: 5, authRequiredAt: 'none', handoff: 'guest' })
    expect(cta.commerce.expiresAt).toBe(r.link.expiresAt)
  })

  it('states the merchant-login handoff explicitly for login-gated providers', () => {
    const req: CommerceRequest = { domain: 'entertainment', intentType: 'buy_ticket', subject: 'HOPE', configuration: { kind: 'cinema', filmRef: 'hope-vung-tu-dia' } }
    const offer = cgvAdapter.toOffer(req, { subjectRef: 'hope-vung-tu-dia' }, now)!
    const r = resolveDeepLink(cgvAdapter, req, offer, req.configuration, { now })
    if (!r.ok) throw new Error('resolve failed')
    const cta = projectToCta(r.link)
    expect(cta.label).toBe('Mua vé tại CGV (cần đăng nhập)')
    expect(cta.commerce.handoff).toBe('merchant_login')
    expect(cta.commerce.note).toMatch(/đăng nhập/)
    expect(cta.type).toBe('booking')
  })
})
