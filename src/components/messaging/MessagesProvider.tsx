'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage, ChatThreadSummary } from '@/lib/messaging/types'

// ── Social messaging store ──────────────────────────────────────────────────
//
// 🚨 SEPARATE FROM `NotificationProvider`, PERMANENTLY.
//
// They look alike — both hold a list, an unread count and one Realtime channel —
// and that resemblance is the trap. A notification is something the SYSTEM told
// you about your content; a message is something a PERSON said to you. They have
// different tables, different lifecycles, different read semantics, and
// The Messages count and the Notifications count are two independent numbers a
// user reads as two independent facts.
//
// So this provider never imports `useNotifications`, never writes to it, and
// never contributes to its count. `NotificationProvider` is not modified by this
// feature at all.

interface MessagesContextValue {
  threads: ChatThreadSummary[]
  /** Sum of per-thread unread. Message unread ONLY — never notification unread. */
  unreadTotal: number
  loading: boolean
  /** Null until auth resolves; used to tell my own messages from theirs. */
  meId: string | null
  refetch: () => Promise<void>
  markThreadRead: (threadId: string) => Promise<void>
  /** Fires when a message arrives for a thread, so an open thread can append it. */
  subscribeToIncoming: (fn: (message: ChatMessage) => void) => () => void
}

const MessagesContext = createContext<MessagesContextValue>({
  threads: [],
  unreadTotal: 0,
  loading: false,
  meId: null,
  refetch: async () => {},
  markThreadRead: async () => {},
  subscribeToIncoming: () => () => {},
})

export function useMessages() {
  return useContext(MessagesContext)
}

interface MessageRow {
  id: string
  thread_id: string
  sender_id: string | null
  body: string
  created_at: string
}

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [threads, setThreads] = useState<ChatThreadSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [meId, setMeId] = useState<string | null>(null)

  // Listeners rather than state: an open thread wants each message as it lands,
  // not a re-render of the whole list per keystroke on the other side.
  const listeners = useRef(new Set<(m: ChatMessage) => void>())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetch = useCallback(async () => {
    try {
      const r = await fetch('/api/messaging/threads')
      if (!r.ok) return
      const d = await r.json()
      setThreads(d.threads ?? [])
    } catch {
      // keep the previous state on a transient failure
    }
  }, [])

  // Resolve the current user + follow auth changes, exactly as the notification
  // store does — signing out must empty this, not leave someone else's threads
  // on screen.
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setMeId(data.user?.id ?? null) }).catch(() => {})
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setMeId(session?.user?.id ?? null)
    })
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [supabase])

  useEffect(() => {
    if (!meId) { setThreads([]); return }
    let cancelled = false
    setLoading(true)
    refetch().finally(() => { if (!cancelled) setLoading(false) })

    /**
     * 🚨 NO `filter:` ON THIS SUBSCRIPTION, AND THAT IS DELIBERATE.
     *
     * `postgres_changes` filters are single-column equality. A user belongs to
     * many threads, so `thread_id=eq.<one>` would make the conversation list
     * deaf to every other thread — new messages would only ever appear in the
     * one already open.
     *
     * Scoping instead comes from RLS: Realtime evaluates the subscriber's own
     * SELECT policy per row, and `chat_messages_select_participant` returns
     * only threads they are in. That policy is asserted by
     * `supabase/tests/chat_messaging_boundary.test.ts`, because if it were ever
     * dropped this channel would broadcast every message on the platform.
     */
    const channel = supabase
      .channel(`messaging:${meId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        payload => {
          const row = payload.new as MessageRow
          if (!row?.id) return
          const message: ChatMessage = {
            id: row.id,
            threadId: row.thread_id,
            senderId: row.sender_id,
            body: row.body,
            createdAt: row.created_at,
          }
          for (const fn of listeners.current) fn(message)

          // The list itself is re-read rather than patched: unread is derived
          // server-side, and recomputing it here would be a second implementation
          // of the same rule, free to disagree with the first.
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => { void refetch() }, 250)
        },
      )
      .subscribe()

    // Catch-up when the tab regains focus — the socket may have dropped while
    // backgrounded, and a missed INSERT is a message the user never sees.
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
  }, [meId, supabase, refetch])

  const markThreadRead = useCallback(async (threadId: string) => {
    // Optimistic on the badge only. The server owns `last_read_at`, and the
    // refetch reconciles — including the case where a message arrived between
    // the click and the write.
    setThreads(prev => prev.map(t => (t.id === threadId ? { ...t, unreadCount: 0 } : t)))
    try {
      await fetch(`/api/messaging/threads/${threadId}/read`, { method: 'POST' })
    } catch {
      // the next refetch restores the true count
    }
    void refetch()
  }, [refetch])

  const subscribeToIncoming = useCallback((fn: (m: ChatMessage) => void) => {
    listeners.current.add(fn)
    return () => { listeners.current.delete(fn) }
  }, [])

  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0),
    [threads],
  )

  const value = useMemo<MessagesContextValue>(
    () => ({ threads, unreadTotal, loading, meId, refetch, markThreadRead, subscribeToIncoming }),
    [threads, unreadTotal, loading, meId, refetch, markThreadRead, subscribeToIncoming],
  )

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>
}
