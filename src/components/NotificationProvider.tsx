'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePushIdentityReconcile } from '@/hooks/usePushIdentityReconcile'
import type { NotificationDTO } from '@/lib/notifications/contract'

interface NotificationContextValue {
  notifications: NotificationDTO[]
  unreadCount: number
  loading: boolean
  refetch: () => Promise<void>
  markAllRead: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  loading: false,
  refetch: async () => {},
  markAllRead: async () => {},
})

export function useNotifications() {
  return useContext(NotificationContext)
}

/**
 * ADR-014 — app-level notification store. Mounted ONCE in the root layout, so the
 * unread badge is correct on every route (fixes the Home-badge bug: the previous
 * badge + its Realtime subscription lived inside the /reviews component and
 * unmounted off-route). Holds ONE Realtime subscription on the `notifications`
 * table filtered to the current user; any INSERT/UPDATE re-syncs the store.
 * Context (not Zustand) per the ADR.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [notifications, setNotifications] = useState<NotificationDTO[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [uid, setUid] = useState<string | null>(null)

  // Push identity belongs here, and nowhere else. This provider already owns
  // "notification state follows the current account", it is mounted once in the
  // root layout, and keeping the listener in a single provider is what stops two
  // copies from both writing on every sign-in.
  usePushIdentityReconcile()

  const refetch = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications')
      if (!r.ok) return
      const d = await r.json()
      setNotifications(d.notifications ?? [])
      setUnreadCount(d.unread_count ?? 0)
    } catch {
      // keep the previous state on a transient failure
    }
  }, [])

  // Resolve the current user + follow auth changes (login/logout flip the store).
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setUid(data.user?.id ?? null) }).catch(() => {})
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id ?? null)
    })
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [supabase])

  // Initial fetch + single Realtime subscription, scoped to the user.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!uid) { setNotifications([]); setUnreadCount(0); return }
    let cancelled = false
    setLoading(true)
    refetch().finally(() => { if (!cancelled) setLoading(false) })

    const trigger = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => { void refetch() }, 300)
    }

    const channel = supabase
      .channel(`notifications:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, trigger)
      .subscribe()

    // Catch-up when the tab regains focus (the socket may have dropped while backgrounded).
    const onWake = () => { if (document.visibilityState === 'visible') void refetch() }
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [uid, supabase, refetch])

  const markAllRead = useCallback(async () => {
    // Optimistic: clear the badge + flag rows read immediately; the Realtime
    // UPDATE echo will reconcile. Server owns the authoritative read_at.
    const nowIso = new Date().toISOString()
    setUnreadCount(0)
    setNotifications(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: nowIso })))
    try { await fetch('/api/notifications/read', { method: 'POST' }) } catch { /* echo/refetch will reconcile */ }
  }, [])

  const value = useMemo<NotificationContextValue>(
    () => ({ notifications, unreadCount, loading, refetch, markAllRead }),
    [notifications, unreadCount, loading, refetch, markAllRead],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
