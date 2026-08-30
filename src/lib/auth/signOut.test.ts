import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  order: [] as string[],
  release: vi.fn(async (_opts?: unknown) => { h.order.push('release') }),
  signOut: vi.fn(async () => { h.order.push('signOut') }),
  emitAuthLogout: vi.fn(() => { h.order.push('emitAuthLogout') }),
}))

vi.mock('@/lib/notifications/pushIdentity', () => ({ releaseOwnPushClaim: h.release }))
vi.mock('@/lib/analytics/authEvents', () => ({ emitAuthLogout: h.emitAuthLogout }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: h.signOut } }),
}))

import { performSignOut } from './signOut'

beforeEach(() => {
  vi.clearAllMocks()
  h.order.length = 0
  h.release.mockImplementation(async () => { h.order.push('release') })
  h.signOut.mockImplementation(async () => { h.order.push('signOut') })
})

describe('performSignOut — push claim release', () => {
  it('releases this browser\'s push claim BEFORE the session is torn down', async () => {
    // The release is authorised by the session it is about to destroy. After
    // signOut there is no identity left to make the call with.
    await performSignOut()
    expect(h.order).toEqual(['emitAuthLogout', 'release', 'signOut'])
  })

  it('bounds the release so sign-out is never held open by the network', async () => {
    await performSignOut()
    expect(h.release).toHaveBeenCalledWith({ timeoutMs: 1500 })
  })

  it('🚨 a failing release never throws and never skips sign-out', async () => {
    // Leaving somebody looking at a screen that appears signed in is the worse
    // of the two outcomes — the whole reason this function swallows errors.
    h.release.mockRejectedValueOnce(new Error('offline'))
    await expect(performSignOut()).resolves.toBeUndefined()
    expect(h.signOut).toHaveBeenCalledTimes(1)
  })

  it('a failing sign-out still does not throw', async () => {
    h.signOut.mockRejectedValueOnce(new Error('network'))
    await expect(performSignOut()).resolves.toBeUndefined()
  })

  it('still emits the logout event before anything is torn down', async () => {
    h.release.mockRejectedValueOnce(new Error('offline'))
    await performSignOut()
    expect(h.order[0]).toBe('emitAuthLogout')
  })

  it('releases exactly once per sign-out', async () => {
    await performSignOut()
    expect(h.release).toHaveBeenCalledTimes(1)
  })
})
