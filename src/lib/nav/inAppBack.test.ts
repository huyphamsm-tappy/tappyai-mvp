// @vitest-environment jsdom
/**
 * Phase 7 — CHILD → Back → ACTUAL PARENT.
 *
 * Pins the one Back decision every in-app control now makes: pop when the
 * previous history entry is ours, otherwise `replace()` the declared parent.
 * The signal is the app's own per-tab list of history entries, kept from the
 * router's pathname changes plus the `popstate` flag.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { goBack, hasInAppHistory, inAppDepth, recordNavigation } from './inAppBack'

const push = { popped: false }
const pop = { popped: true }

describe('inAppBack', () => {
  beforeEach(() => sessionStorage.clear())

  it('the first pathname a tab sees is the entry page: depth 0, Back goes to the parent', () => {
    expect(recordNavigation('/scam-shield', push)).toBe(0)
    expect(hasInAppHistory()).toBe(false)
    const router = { back: vi.fn(), replace: vi.fn() }
    goBack(router, '/tools')
    expect(router.replace).toHaveBeenCalledWith('/tools')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('a push grows the depth; Back then pops history instead of jumping to the parent', () => {
    recordNavigation('/tools', push)
    recordNavigation('/scam-shield', push)
    expect(inAppDepth()).toBe(1)
    const router = { back: vi.fn(), replace: vi.fn() }
    goBack(router, '/tools')
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('a pop moves onto the neighbour that carries the pathname — back, and forward again', () => {
    recordNavigation('/tools', push)
    recordNavigation('/currency', push)
    expect(recordNavigation('/tools', pop)).toBe(0)
    expect(recordNavigation('/currency', pop)).toBe(1)
  })

  it('🚨 back-then-push drops the forward entries and counts the new one', () => {
    recordNavigation('/profile', push)         // 0
    recordNavigation('/reviews/r1', push)      // 1
    recordNavigation('/profile', pop)          // 0
    expect(recordNavigation('/profile/qr', push)).toBe(1)
    expect(hasInAppHistory()).toBe(true)
    // The clip entry is gone: a pop from /profile/qr lands on /profile, not on the clip.
    expect(recordNavigation('/profile', pop)).toBe(0)
  })

  it('a multi-step pop (long-press Back) lands on the matching entry', () => {
    recordNavigation('/a', push)
    recordNavigation('/b', push)
    recordNavigation('/c', push)
    expect(recordNavigation('/a', pop)).toBe(0)
  })

  it('a reload of the current entry changes nothing', () => {
    recordNavigation('/a', push)
    recordNavigation('/b', push)
    expect(recordNavigation('/b', push)).toBe(1)
    expect(recordNavigation('/b', pop)).toBe(1)
  })

  it('a pop onto a pathname the app never recorded starts over at 0 (an entry from outside)', () => {
    recordNavigation('/a', push)
    recordNavigation('/b', push)
    expect(recordNavigation('/somewhere-else', pop)).toBe(0)
    expect(hasInAppHistory()).toBe(false)
  })
})
