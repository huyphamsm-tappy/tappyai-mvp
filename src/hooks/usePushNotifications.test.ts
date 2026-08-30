// @vitest-environment jsdom
//
// ── `subscribed` must mean "registered TO ME" ────────────────────────────────
//
// THE BUG THIS PINS. The hook used to answer `!!browserSubscription`. A Web Push
// subscription belongs to the BROWSER, not the account, so after an account
// switch the settings toggle read ON for somebody whose row did not exist. They
// were therefore never prompted to subscribe, never received their own
// notifications, and kept receiving the previous account's — the layer that made
// the 2026-08-29 defect self-sustaining rather than self-correcting.
//
// Every assertion below is about STATE the person sees, never about which
// function the hook happens to call.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void

const h = vi.hoisted(() => ({
  reconcile: vi.fn(async (): Promise<boolean | null> => false),
  callbacks: [] as ((event: string, session: unknown) => void)[],
  unsubscribe: vi.fn(),
}))

vi.mock('@/lib/notifications/pushIdentity', () => ({
  reconcilePushIdentity: h.reconcile,
  browserPushCredential: vi.fn(async () => 'https://push.example/device-1'),
  releaseOwnPushClaim: vi.fn(async () => {}),
}))
vi.mock('@/lib/notifications/chime', () => ({ playTappyChime: vi.fn() }))
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

import { usePushNotifications } from './usePushNotifications'

/** The browser DOES hold a push subscription in every test here — that is the
 *  whole point: a credential exists, and it still must not decide the answer. */
beforeEach(() => {
  vi.clearAllMocks()
  h.callbacks.length = 0
  h.reconcile.mockResolvedValue(false)

  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: { permission: 'granted', requestPermission: async () => 'granted' },
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    writable: true,
    value: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => ({ endpoint: 'https://push.example/device-1' }) },
      }),
    },
  })
})

/** Emit a Supabase auth event to every listener the render installed. */
const emit: AuthCallback = (event, session) => {
  act(() => { h.callbacks.forEach(cb => cb(event, session)) })
}

const A = { user: { id: 'account-A' } }
const B = { user: { id: 'account-B' } }

describe('subscribed reflects the server, not the browser', () => {
  it('🚨 a browser subscription plus "not mine" reads as NOT subscribed', async () => {
    // The exact 2026-08-29 shape: the device holds a credential owned by someone
    // else. Answering ON here is the bug.
    h.reconcile.mockResolvedValue(false)
    const { result } = renderHook(() => usePushNotifications())

    emit('SIGNED_IN', B)

    await waitFor(() => expect(result.current.reconciling).toBe(false))
    expect(result.current.subscribed).toBe(false)
  })

  it('reads as subscribed when the server says the claim is the caller\'s', async () => {
    h.reconcile.mockResolvedValue(true)
    const { result } = renderHook(() => usePushNotifications())

    emit('INITIAL_SESSION', A)

    await waitFor(() => expect(result.current.subscribed).toBe(true))
  })

  it('🚨 fails CLOSED when the answer cannot be obtained', async () => {
    // Offline, 500, timeout — all arrive as null. Wrongly OFF costs one tap;
    // wrongly ON is the defect.
    h.reconcile.mockResolvedValue(null)
    const { result } = renderHook(() => usePushNotifications())

    emit('SIGNED_IN', A)

    await waitFor(() => expect(result.current.reconciling).toBe(false))
    expect(result.current.subscribed).toBe(false)
  })

  it('reads OFF while the answer is still outstanding', async () => {
    let settle: (v: boolean | null) => void = () => {}
    h.reconcile.mockReturnValue(new Promise<boolean | null>(r => { settle = r }))
    const { result } = renderHook(() => usePushNotifications())

    emit('SIGNED_IN', A)

    expect(result.current.subscribed).toBe(false)
    expect(result.current.reconciling).toBe(true)

    await act(async () => { settle(true) })
    await waitFor(() => expect(result.current.subscribed).toBe(true))
  })

  it('starts OFF before any session has been observed', async () => {
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.subscribed).toBe(false)
    expect(result.current.reconciling).toBe(true)
  })

  it('answers OFF for a signed-out visitor without asking the server', async () => {
    const { result } = renderHook(() => usePushNotifications())

    emit('INITIAL_SESSION', null)

    await waitFor(() => expect(result.current.reconciling).toBe(false))
    expect(result.current.subscribed).toBe(false)
    expect(h.reconcile).not.toHaveBeenCalled()
  })
})

describe('an identity change re-asks', () => {
  it('🚨 A -> B on the same browser produces a fresh answer, not A\'s', async () => {
    h.reconcile.mockResolvedValue(true)
    const { result } = renderHook(() => usePushNotifications())
    emit('INITIAL_SESSION', A)
    await waitFor(() => expect(result.current.subscribed).toBe(true))

    h.reconcile.mockResolvedValue(false)
    emit('SIGNED_IN', B)

    await waitFor(() => expect(result.current.subscribed).toBe(false))
  })

  it('does not re-ask when the same account is re-emitted', async () => {
    // Supabase re-emits on tab focus and token refresh; those are not identity
    // changes, and treating them as such would write on a timer.
    const { result } = renderHook(() => usePushNotifications())
    emit('INITIAL_SESSION', A)
    await waitFor(() => expect(result.current.reconciling).toBe(false))
    expect(h.reconcile).toHaveBeenCalledTimes(1)

    emit('SIGNED_IN', A)
    emit('TOKEN_REFRESHED', A)

    expect(h.reconcile).toHaveBeenCalledTimes(1)
  })

  it('asks exactly once on first load — not once per mount effect', async () => {
    renderHook(() => usePushNotifications())
    emit('INITIAL_SESSION', A)
    await waitFor(() => expect(h.reconcile).toHaveBeenCalledTimes(1))
  })

  it('stops listening when the consumer unmounts', () => {
    const { unmount } = renderHook(() => usePushNotifications())
    unmount()
    expect(h.unsubscribe).toHaveBeenCalled()
  })
})
