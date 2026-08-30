// @vitest-environment jsdom
//
// The app-wide half of the fix. usePushNotifications only exists where a push
// toggle is on screen, and the person who sits down at a shared browser has no
// reason to open notification settings — so the release has to happen from
// somewhere that is always mounted.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  reconcile: vi.fn(async (): Promise<boolean | null> => false),
  callbacks: [] as ((event: string, session: unknown) => void)[],
  unsubscribe: vi.fn(),
}))

vi.mock('@/lib/notifications/pushIdentity', () => ({
  reconcilePushIdentity: h.reconcile,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        h.callbacks.push(cb)
        return { data: { subscription: { unsubscribe: h.unsubscribe } } }
      },
    },
  }),
}))

import { usePushIdentityReconcile } from './usePushIdentityReconcile'

const A = { user: { id: 'account-A' } }
const B = { user: { id: 'account-B' } }

const emit = (event: string, session: unknown) => {
  act(() => { h.callbacks.forEach(cb => cb(event, session)) })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.callbacks.length = 0
  h.reconcile.mockResolvedValue(false)
})

describe('usePushIdentityReconcile', () => {
  it('reconciles on the session present at first load', async () => {
    renderHook(() => usePushIdentityReconcile())
    emit('INITIAL_SESSION', A)
    expect(h.reconcile).toHaveBeenCalledTimes(1)
  })

  it('reconciles when somebody signs in', async () => {
    renderHook(() => usePushIdentityReconcile())
    emit('SIGNED_IN', A)
    expect(h.reconcile).toHaveBeenCalledTimes(1)
  })

  it('🚨 A -> B on the same browser reconciles again', async () => {
    // This is the incident: the browser carries A's claim and B arrives.
    renderHook(() => usePushIdentityReconcile())
    emit('INITIAL_SESSION', A)
    emit('SIGNED_IN', B)
    expect(h.reconcile).toHaveBeenCalledTimes(2)
  })

  it('ignores re-emissions of the SAME identity', async () => {
    // Supabase re-emits these on tab focus and token refresh. Reconciling on
    // every emission would turn an event-driven write into a polling one.
    renderHook(() => usePushIdentityReconcile())
    emit('INITIAL_SESSION', A)
    emit('SIGNED_IN', A)
    emit('INITIAL_SESSION', A)
    expect(h.reconcile).toHaveBeenCalledTimes(1)
  })

  it('ignores events that are not a session appearing', async () => {
    renderHook(() => usePushIdentityReconcile())
    emit('TOKEN_REFRESHED', A)
    emit('USER_UPDATED', A)
    emit('PASSWORD_RECOVERY', A)
    expect(h.reconcile).not.toHaveBeenCalled()
  })

  it('does not reconcile for a signed-out visitor', async () => {
    // There is no session to authorise the call, and sign-out is the other
    // surface's job — performSignOut releases the claim while the session still
    // exists.
    renderHook(() => usePushIdentityReconcile())
    emit('INITIAL_SESSION', null)
    expect(h.reconcile).not.toHaveBeenCalled()
  })

  it('🚨 never subscribes anybody — it can only ask, and asking only releases', async () => {
    // Consent is per account. B is told the truth and opts in themselves.
    // reconcilePushIdentity is the ONLY thing this hook calls; there is no
    // subscribe path reachable from here.
    renderHook(() => usePushIdentityReconcile())
    emit('SIGNED_IN', B)
    expect(h.reconcile).toHaveBeenCalledWith()
    expect(h.reconcile).toHaveBeenCalledTimes(1)
  })

  it('a failing reconcile does not throw out of the listener', async () => {
    // The listener runs inside Supabase's own emit loop; throwing there would
    // take down every other auth listener in the app.
    h.reconcile.mockRejectedValue(new Error('offline'))
    renderHook(() => usePushIdentityReconcile())
    expect(() => emit('SIGNED_IN', A)).not.toThrow()
  })

  it('does not block: it never awaits the reconcile before returning', async () => {
    let settled = false
    h.reconcile.mockReturnValue(new Promise<boolean | null>(r => {
      setTimeout(() => { settled = true; r(false) }, 50)
    }))
    renderHook(() => usePushIdentityReconcile())
    emit('SIGNED_IN', A)
    // The emit returned while the request is still outstanding — navigation and
    // every other auth listener carried on.
    expect(settled).toBe(false)
  })

  it('stops listening on unmount', () => {
    const { unmount } = renderHook(() => usePushIdentityReconcile())
    unmount()
    expect(h.unsubscribe).toHaveBeenCalled()
  })
})
