// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

const tracked: Array<{ type: string; props: Record<string, unknown> | undefined }> = []
vi.mock('@/lib/tracking/tracker', () => ({
  track: (type: string, props?: Record<string, unknown>) => { tracked.push({ type, props }) },
  tracker: null,
}))

import {
  FIRST_QUERY_KEY, RETURN_DAY_KEY, classifyOutboundAction, daysBetweenVnDays, detectShareChannel,
  emitFirstVisit, emitQuery, emitResultAction, emitReturnIfDue, emitShareViewed, emitSignup, emitG1,
} from './g1Events'
import { FIRST_ATTR_KEY, SESSION_ATTR_KEY } from './attribution'

describe('G1 event emitters — over the ONE tracker', () => {
  beforeEach(() => { tracked.length = 0; localStorage.clear(); sessionStorage.clear(); history.replaceState(null, '', '/') })

  it('stamps attribution onto every event', () => {
    sessionStorage.setItem(SESSION_ATTR_KEY, JSON.stringify({ source: 'zalo_link', share_id: 'sh1', at: 'x' }))
    emitQuery({ domain: 'food' })
    expect(tracked[0]).toEqual({ type: 'query', props: expect.objectContaining({ source: 'zalo_link', share_id: 'sh1', domain: 'food', is_first_query: true }) })
  })

  it('refuses to send an event that fails the contract', () => {
    expect(emitG1('result_action', { action_type: 'nope' as never })).toBe(false)
    expect(tracked).toHaveLength(0)
  })

  it('first_visit fires once per browser', () => {
    expect(emitFirstVisit()).toBe(true)
    expect(emitFirstVisit()).toBe(false)
    expect(tracked.filter(t => t.type === 'first_visit')).toHaveLength(1)
  })

  it('query records the first-query day once and marks only the first as is_first_query', () => {
    emitQuery({})
    emitQuery({})
    expect(localStorage.getItem(FIRST_QUERY_KEY)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(tracked.map(t => t.props?.is_first_query)).toEqual([true, false])
  })

  it('share_viewed is deduplicated per share per session — 20 refreshes are 1 view', () => {
    for (let i = 0; i < 20; i++) emitShareViewed({ share_id: 'sh1', slug: 'AbCdEfGh12' })
    emitShareViewed({ share_id: 'sh2', slug: 'ZzZzZzZzZ1' })
    expect(tracked.filter(t => t.type === 'share_viewed').map(t => t.props?.share_id)).toEqual(['sh1', 'sh2'])
  })

  it('signup carries first-touch attribution', () => {
    localStorage.setItem(FIRST_ATTR_KEY, JSON.stringify({ source: 'share_out', share_id: 'sh9', at: 'x' }))
    emitSignup('google')
    expect(tracked[0].props).toMatchObject({ method: 'google', first_source: 'share_out', first_share_id: 'sh9' })
  })

  describe('return', () => {
    it('does not fire without a prior query, or on the first-query day itself', () => {
      expect(emitReturnIfDue('2026-09-13')).toBe(false)
      localStorage.setItem(FIRST_QUERY_KEY, '2026-09-13')
      expect(emitReturnIfDue('2026-09-13')).toBe(false)
    })
    it('fires once per VN day with the day distance', () => {
      localStorage.setItem(FIRST_QUERY_KEY, '2026-09-13')
      expect(emitReturnIfDue('2026-09-19')).toBe(true)
      expect(emitReturnIfDue('2026-09-19')).toBe(false)
      expect(tracked[0].props).toMatchObject({ days_since_first_query: 6 })
      expect(localStorage.getItem(RETURN_DAY_KEY)).toBe('2026-09-19')
    })
    it('daysBetweenVnDays is exact across month boundaries', () => {
      expect(daysBetweenVnDays('2026-08-30', '2026-09-04')).toBe(5)
    })
  })

  it('result_action carries the action type and never a full outbound URL', () => {
    emitResultAction({ action_type: 'outbound_booking', result_id: 'r1', target_host: 'shopee.vn', click_id: 'c1' })
    expect(tracked[0].props).toMatchObject({ action_type: 'outbound_booking', result_id: 'r1', target_host: 'shopee.vn', click_id: 'c1' })
    expect(JSON.stringify(tracked[0].props)).not.toContain('https://')
  })
})

describe('classifyOutboundAction — pure', () => {
  it('maps CTA types and hosts to the five action types', () => {
    expect(classifyOutboundAction('booking', 'https://www.agoda.com/x')).toBe('outbound_booking')
    expect(classifyOutboundAction('maps', 'https://www.google.com/maps/search/?api=1&query=x')).toBe('outbound_map')
    expect(classifyOutboundAction(undefined, 'https://maps.app.goo.gl/abc')).toBe('outbound_map')
    expect(classifyOutboundAction('website', 'https://www.tiktok.com/@x/video/1')).toBe('outbound_tiktok')
    expect(classifyOutboundAction(undefined, 'https://shopee.vn/product/1')).toBe('outbound_booking')
    expect(classifyOutboundAction(undefined, 'https://www.trip.com/hotels/x')).toBe('outbound_booking') // CCP partner
    expect(classifyOutboundAction('internal_booking', '/bookings/new?placeId=1')).toBe('outbound_booking')
  })
  it('returns null for clicks G1 does not count', () => {
    expect(classifyOutboundAction('website', 'https://example.com')).toBeNull()
    expect(classifyOutboundAction('call', 'tel:0123')).toBeNull()
    expect(classifyOutboundAction(undefined, 'not a url')).toBeNull()
  })
})

describe('detectShareChannel — referrer/UA class only', () => {
  it('recognises Zalo, Messenger and Facebook, else other', () => {
    expect(detectShareChannel('', 'Mozilla/5.0 Zalo/23.1')).toBe('zalo')
    expect(detectShareChannel('https://l.messenger.com/', 'Mozilla')).toBe('messenger')
    expect(detectShareChannel('https://m.facebook.com/', 'Mozilla')).toBe('facebook')
    expect(detectShareChannel('https://google.com', 'Mozilla')).toBe('other')
  })
})
