import { describe, it, expect, vi, beforeEach } from 'vitest'

const ga = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('@/lib/tracking/tracker', () => ({ trackGa: (...a: unknown[]) => { ga.calls.push(a) }, track: () => undefined }))

import { inlineLinkTap } from './handoff'
import { trackedLinkFacts } from '@/lib/ccp/tracking/trackedLink'

// ── A tracked link inside the reply TEXT reports GA4 affiliate_click (27 Sep 2026) ──
// Found on the deployed Preview: the flight answer renders the Trip.com Deep Link in the prose,
// where no Action exists — a tap fired no analytics at all. Same event as the card path.

const PUB = '6277265300509373567'
const wrap = (campaign: string, dest: string) => `https://go.isclix.com/deep_link/${PUB}/${campaign}?url=${encodeURIComponent(dest)}&utm_source=tappyai&utm_medium=ccp&sub1=${'a'.repeat(24)}`

beforeEach(() => { ga.calls = [] })

describe('trackedLinkFacts', () => {
  it('names the provider of a wrapped registry destination — never the URL', () => {
    expect(trackedLinkFacts(wrap('6455552313033835511', 'https://vn.trip.com/flights/showfarefirst?dcity=sgn&acity=han&ddate=2026-10-10'))).toEqual({ providerId: 'tripcom', domain: 'travel' })
    expect(trackedLinkFacts(wrap('6318680441596031865', 'https://www.vietnamairlines.com/vn/vi/buy-tickets-other-products/booking-and-manage-bookings/book-tickets'))).toEqual({ providerId: 'vietnamairlines', domain: 'travel' })
    expect(trackedLinkFacts(wrap('6259155740535091857', 'https://cellphones.com.vn/iphone-15.html'))).toEqual({ providerId: 'cellphones', domain: 'shopping' })
  })
  it('is null for a direct merchant link, a foreign wrapper, a non-registry destination or garbage', () => {
    expect(trackedLinkFacts('https://vn.trip.com/flights/showfarefirst?dcity=sgn')).toBeNull()
    expect(trackedLinkFacts('https://evil.example/deep_link/1/2?url=' + encodeURIComponent('https://vn.trip.com/'))).toBeNull()
    expect(trackedLinkFacts(wrap('1', 'https://example.com/x'))).toBeNull()
    expect(trackedLinkFacts('http://go.isclix.com/deep_link/1/2?url=' + encodeURIComponent('https://vn.trip.com/'))).toBeNull()
    expect(trackedLinkFacts('not a url')).toBeNull()
  })
})

describe('inlineLinkTap', () => {
  it('fires exactly one affiliate_click with domain / provider / tracked — no URL, no ids', () => {
    inlineLinkTap(wrap('6455552313033835511', 'https://vn.trip.com/flights/showfarefirst?dcity=sgn&acity=han&ddate=2026-10-10'))
    expect(ga.calls).toEqual([['affiliate_click', { domain: 'travel', provider: 'tripcom', tracked: true }]])
    expect(JSON.stringify(ga.calls)).not.toMatch(/isclix|trip\.com|sub1|aaaa/)
  })
  it('ignores ordinary links (maps, reviews, direct merchant pages)', () => {
    inlineLinkTap('https://maps.google.com/?q=x')
    inlineLinkTap('https://www.agoda.com/vi-vn/')
    expect(ga.calls).toEqual([])
  })
})
