// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import {
  useNotificationPreference, readNotificationPreference, writeNotificationPreference,
  NOTIFICATION_PREFERENCE_KEY, DEFAULT_NOTIFICATIONS_ON,
} from './preference'

// ── Tappy notifications: ON by default, OFF until switched back ─────────────
//
// The preference is per browser (localStorage), like the theme, and it is a FALLBACK: it is
// consulted only when nothing is stored and it never writes itself. The three consumers — the
// provider's badge, the chime, the deal prompt — are pinned below; so is what the preference
// must NOT do: ask the browser for permission or touch the device's push subscription.

beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

describe('the reader', () => {
  it('no saved preference → ON', () => {
    expect(DEFAULT_NOTIFICATIONS_ON).toBe(true)
    expect(readNotificationPreference()).toBe(true)
  })
  it('saved OFF → OFF; saved ON → ON; anything else → the default', () => {
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'off')
    expect(readNotificationPreference()).toBe(false)
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'on')
    expect(readNotificationPreference()).toBe(true)
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'maybe')
    expect(readNotificationPreference()).toBe(true)
  })
  it('blocked storage → ON, and no throw', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    try { expect(readNotificationPreference()).toBe(true) } finally { spy.mockRestore() }
  })
  it('the writer stores exactly "on" / "off"', () => {
    writeNotificationPreference(false)
    expect(localStorage.getItem(NOTIFICATION_PREFERENCE_KEY)).toBe('off')
    writeNotificationPreference(true)
    expect(localStorage.getItem(NOTIFICATION_PREFERENCE_KEY)).toBe('on')
  })
})

describe('the hook', () => {
  it('starts ON with nothing stored, and does not write the default into storage', () => {
    const { result } = renderHook(() => useNotificationPreference())
    expect(result.current.mounted).toBe(true)
    expect(result.current.enabled).toBe(true)
    expect(localStorage.getItem(NOTIFICATION_PREFERENCE_KEY)).toBeNull()
  })

  it('OFF persists: switched off, then a fresh mount (reload / re-login) is still OFF', () => {
    const first = renderHook(() => useNotificationPreference())
    act(() => first.result.current.setEnabled(false))
    expect(first.result.current.enabled).toBe(false)
    expect(localStorage.getItem(NOTIFICATION_PREFERENCE_KEY)).toBe('off')
    first.unmount()
    const second = renderHook(() => useNotificationPreference())
    expect(second.result.current.enabled).toBe(false)
  })

  it('ON again persists the same way', () => {
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'off')
    const { result } = renderHook(() => useNotificationPreference())
    expect(result.current.enabled).toBe(false)
    act(() => result.current.setEnabled(true))
    expect(localStorage.getItem(NOTIFICATION_PREFERENCE_KEY)).toBe('on')
    cleanup()
    expect(renderHook(() => useNotificationPreference()).result.current.enabled).toBe(true)
  })

  it('the default never overwrites a saved OFF — mounting a hundred times changes nothing', () => {
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'off')
    for (let i = 0; i < 100; i++) { renderHook(() => useNotificationPreference()); cleanup() }
    expect(localStorage.getItem(NOTIFICATION_PREFERENCE_KEY)).toBe('off')
  })

  it('every instance moves together: the settings switch and the provider read one preference', () => {
    const a = renderHook(() => useNotificationPreference())
    const b = renderHook(() => useNotificationPreference())
    act(() => a.result.current.setEnabled(false))
    expect(b.result.current.enabled).toBe(false)
    act(() => b.result.current.setEnabled(true))
    expect(a.result.current.enabled).toBe(true)
  })

  it('the first render is the default (ON) before mount, so server and client markup agree', () => {
    let first: { enabled: boolean; mounted: boolean } | null = null
    renderHook(() => { const p = useNotificationPreference(); if (!first) first = { enabled: p.enabled, mounted: p.mounted }; return p })
    expect(first).toEqual({ enabled: true, mounted: false })
  })
})

describe('what the preference must NOT do', () => {
  it('never asks the browser for permission and never touches the push subscription', () => {
    // Code only — the module's own comments name these things precisely to say it does not do them.
    const src = readFileSync('src/lib/notifications/preference.ts', 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(src).not.toMatch(/requestPermission/)
    expect(src).not.toMatch(/pushManager|serviceWorker|\/api\/notifications\/subscribe/)
    expect(src).not.toMatch(/marketing/i)
    expect(src).not.toMatch(/fetch\(/)
  })
})

// ── The consumers ───────────────────────────────────────────────────────────

vi.mock('@/lib/notifications/chime', () => ({ playTappyChime: vi.fn() }))
vi.mock('@/lib/notifications/pushIdentity', () => ({ reconcilePushIdentity: vi.fn(async () => true) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: () => ({ on: function () { return this }, subscribe: () => ({}) }),
    removeChannel: vi.fn(),
  }),
}))
vi.mock('@/hooks/usePushIdentityReconcile', () => ({ usePushIdentityReconcile: () => {} }))

import { NotificationProvider, useNotifications } from '@/components/NotificationProvider'
import { playTappyChime } from '@/lib/notifications/chime'

describe('NotificationProvider — the badge follows the preference, the inbox does not', () => {
  const Probe = () => {
    const n = useNotifications()
    return <div data-testid="probe" data-unread={n.unreadCount} data-enabled={String(n.notificationsEnabled)} data-items={n.notifications.length} />
  }
  const withFetch = (unread: number) => vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, json: async () => ({ notifications: [{ id: 'n1', title: 'x', read_at: null }], unread_count: unread }),
  })))
  afterEach(() => vi.unstubAllGlobals())

  it('ON (default): the unread count is what the server said', async () => {
    withFetch(3)
    render(<NotificationProvider><Probe /></NotificationProvider>)
    await vi.waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-unread')).toBe('3'))
    expect(screen.getByTestId('probe').getAttribute('data-enabled')).toBe('true')
  })

  it('OFF: the badge count is 0 while the list itself is still there', async () => {
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'off')
    withFetch(3)
    render(<NotificationProvider><Probe /></NotificationProvider>)
    await vi.waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-items')).toBe('1'))
    expect(screen.getByTestId('probe').getAttribute('data-unread')).toBe('0')
    expect(screen.getByTestId('probe').getAttribute('data-enabled')).toBe('false')
  })
})

describe('the chime', () => {
  it('is silent while OFF, plays while ON — the SW message path is unchanged', async () => {
    const listeners: Array<(e: MessageEvent) => void> = []
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: (_t: string, h: (e: MessageEvent) => void) => listeners.push(h),
        removeEventListener: vi.fn(), getRegistration: vi.fn(), register: vi.fn(),
      },
    })
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'default' } })
    const { usePushNotifications } = await import('@/hooks/usePushNotifications')
    renderHook(() => usePushNotifications())
    expect(listeners.length).toBe(1)
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'off')
    listeners[0]({ data: { type: 'TAPPY_IDENTITY' } } as MessageEvent)
    expect(playTappyChime).not.toHaveBeenCalled()
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'on')
    listeners[0]({ data: { type: 'TAPPY_IDENTITY' } } as MessageEvent)
    expect(playTappyChime).toHaveBeenCalledTimes(1)
  })
})

describe('the Deals prompt', () => {
  it('is hidden while OFF and shown while ON; it never asks for permission on its own', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getRegistration: vi.fn(), register: vi.fn() },
    })
    const requestPermission = vi.fn()
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'default', requestPermission } })
    const { default: DealNotifyButton } = await import('@/app/(app)/deals/DealNotifyButton')
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'off')
    const off = render(<DealNotifyButton />)
    await vi.waitFor(() => expect(off.container.querySelector('button')).toBeNull())
    off.unmount()
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, 'on')
    const on = render(<DealNotifyButton />)
    await vi.waitFor(() => expect(on.container.querySelector('button')).toBeTruthy())
    expect(requestPermission).not.toHaveBeenCalled()
  })
})

describe('the settings switch', () => {
  it('renders ON by default, writes OFF on a tap, and asks the browser for nothing', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getRegistration: vi.fn(), register: vi.fn() },
    })
    const requestPermission = vi.fn()
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'default', requestPermission } })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    const { default: NotificationSettings } = await import('@/components/notifications/NotificationSettings')
    render(<NotificationSettings />)
    const master = () => document.querySelector('[data-tappy-notifications-switch]') as HTMLButtonElement
    await vi.waitFor(() => expect(master().disabled).toBe(false))
    expect(master().getAttribute('aria-checked')).toBe('true')
    fireEvent.click(master())
    expect(master().getAttribute('aria-checked')).toBe('false')
    expect(localStorage.getItem(NOTIFICATION_PREFERENCE_KEY)).toBe('off')
    // The device push switch is a separate control and is still there, untouched.
    expect(document.querySelectorAll('[role="switch"]').length).toBeGreaterThanOrEqual(2)
    expect(requestPermission).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
