import { describe, it, expect, vi } from 'vitest'
import { handoffBodyFor, reportCommerceHandoff, COMMERCE_HANDOFF_PATH } from './handoff'

// ── The client-side handoff beacon carries opaque ids only ───────────────────

const commerce = { linkId: 'a'.repeat(24), requestId: '550e8400-e29b-41d4-a716-446655440000', providerId: 'tripcom', depth: 4, guestDepth: 5, authRequiredAt: 'none' as const, loginRequired: false, freshnessType: 'static' as const, expiresAt: null, tracked: false, primary: true }

describe('handoffBodyFor', () => {
  it('is null for a non-commerce action and {linkId, requestId, platform} for a commerce one — never a URL', () => {
    expect(handoffBodyFor({})).toBeNull()
    expect(handoffBodyFor({ commerce })).toEqual({ linkId: commerce.linkId, requestId: commerce.requestId, platform: 'web' })
  })
})

describe('reportCommerceHandoff', () => {
  it('posts to the handoff path and swallows a failing sender', () => {
    const send = vi.fn()
    reportCommerceHandoff({ commerce }, send)
    expect(send).toHaveBeenCalledWith(COMMERCE_HANDOFF_PATH, JSON.stringify({ linkId: commerce.linkId, requestId: commerce.requestId, platform: 'web' }))
    expect(() => reportCommerceHandoff({ commerce }, () => { throw new Error('offline') })).not.toThrow()
    const untouched = vi.fn()
    reportCommerceHandoff({}, untouched)
    expect(untouched).not.toHaveBeenCalled()
  })
})
