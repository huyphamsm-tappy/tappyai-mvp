'use client'

import { useCallback, useEffect, useState } from 'react'

// ── The "Tappy notifications" preference ────────────────────────────────────
//
// ON by default, OFF only when the person switches it off, and then OFF until they switch it
// back — the same contract, and the same mechanism, as the theme (`lib/theme/useThemeMode.ts`):
// one localStorage key, read on the client after mount, written only by the user's own action.
//
// WHAT IT GOVERNS (all of it real, all of it already in the product):
//   • the unread badge `NotificationProvider` hands to the bottom bar, the V3 shell and the inbox
//   • the foreground chime `usePushNotifications` plays when an identity push arrives
//   • the "get deal alerts" nudge on Deals (`DealNotifyButton`)
//
// WHAT IT DOES NOT GOVERN — and does not pretend to:
//   • the browser/OS notification PERMISSION. That is a browser fact, asked for only by the
//     person's own tap on the push switch (`usePushNotifications.subscribe`). This preference
//     never calls `Notification.requestPermission()`, in either direction.
//   • the device's Web Push SUBSCRIPTION. That is a server-owned row per device
//     (`/api/notifications/subscribe`), switched by its own control on the settings screen.
//   • marketing consent, which is opt-IN by governance (`lib/marketing/governance.ts`).
//
// 🚨 THE DEFAULT IS A FALLBACK, NOT A RESET. `readNotificationPreference` returns ON only when
// nothing is stored; a stored OFF survives every reload and every login in this browser. Storage
// is per browser, like the theme — there is no account-level column for it, and none is added.

export const NOTIFICATION_PREFERENCE_KEY = 'tappy_notifications'
export const DEFAULT_NOTIFICATIONS_ON = true
/** Same-tab change signal, so every hook instance (provider, settings) moves together. */
const CHANGE_EVENT = 'tappy:notifications'

type Stored = 'on' | 'off'

/** The stored choice, or the default. Client only; never throws. */
export function readNotificationPreference(): boolean {
  try {
    const saved = localStorage.getItem(NOTIFICATION_PREFERENCE_KEY) as Stored | null
    if (saved === 'off') return false
    if (saved === 'on') return true
  } catch {
    // Private mode / blocked storage: the preference is a convenience, never a crash.
  }
  return DEFAULT_NOTIFICATIONS_ON
}

/** Records the person's choice. The only writer. */
export function writeNotificationPreference(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, enabled ? 'on' : 'off')
  } catch {
    // The in-memory state still changes for this session; it simply will not persist.
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: enabled }))
  } catch {
    // No window (SSR) — nothing to notify.
  }
}

export interface NotificationPreference {
  /** True when Tappy notifications are on. Meaningless until `mounted`. */
  enabled: boolean
  /** False during SSR and the first client render — the stored value cannot be read before. */
  mounted: boolean
  setEnabled: (enabled: boolean) => void
}

export function useNotificationPreference(): NotificationPreference {
  // Render ON first so server markup and the first client paint agree; the effect corrects it.
  const [enabled, setEnabledState] = useState(DEFAULT_NOTIFICATIONS_ON)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setEnabledState(readNotificationPreference())
    setMounted(true)
    const onChange = (e: Event) => setEnabledState(Boolean((e as CustomEvent<boolean>).detail))
    const onStorage = (e: StorageEvent) => { if (e.key === NOTIFICATION_PREFERENCE_KEY) setEnabledState(readNotificationPreference()) }
    window.addEventListener(CHANGE_EVENT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    writeNotificationPreference(next)
  }, [])

  return { enabled, mounted, setEnabled }
}
