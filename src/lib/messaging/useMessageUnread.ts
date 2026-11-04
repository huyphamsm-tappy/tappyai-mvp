'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAnonymousUser } from '@/lib/auth/socialWriteAccess'

/**
 * The unread-message number for the navigation badges, on EVERY page (the conversation store itself is mounted only on the inbox).
 *
 * It is a count reader only: it does not use the conversation store and does not touch the notification store. Two numbers from /api/messaging/unread — the unread messages, and how
 * many of the unread notifications are message notifications — so `badgeTotal` counts a message once whether or not message notifications are on.
 *
 * ONE reader for the whole page, however many badges use it (the shell and the bottom bar): the first user starts it, the last one stops it. Only a signed-in MEMBER has messages: it asks
 * the auth client ONCE (no extra auth subscription) and a visitor — including the anonymous session every browser gets — makes no request at all. It refreshes when it starts, when the tab
 * regains focus (which also notices a sign-in that happened meanwhile), when a message arrives (the same unfiltered, row-level-security-scoped realtime subscription the inbox uses,
 * debounced), and when the inbox says it read a thread (MESSAGES_READ_EVENT). Every failure is silent: the badge keeps its last number.
 */
export const MESSAGES_READ_EVENT = 'tappy:messages-read'

export interface MessageUnread { messages: number; messageNotifications: number }

/** The one number a badge shows: other notifications + unread messages. A message notification is not counted twice. */
export function badgeTotal(notificationUnread: number, u: MessageUnread): number {
  return Math.max(0, notificationUnread - u.messageNotifications) + u.messages
}

const ZERO: MessageUnread = { messages: 0, messageNotifications: 0 }
let current: MessageUnread = ZERO
const listeners = new Set<(v: MessageUnread) => void>()
let stop: (() => void) | null = null

function publish(next: MessageUnread) {
  if (next.messages === current.messages && next.messageNotifications === current.messageNotifications) return
  current = next
  for (const fn of listeners) fn(current)
}

async function load(): Promise<void> {
  try {
    const r = await fetch('/api/messaging/unread')
    if (!r.ok) return
    const d = (await r.json()) as Partial<MessageUnread>
    publish({
      messages: Number.isFinite(d.messages) ? Math.max(0, Math.floor(d.messages as number)) : 0,
      messageNotifications: Number.isFinite(d.messageNotifications) ? Math.max(0, Math.floor(d.messageNotifications as number)) : 0,
    })
  } catch { /* keep the last number */ }
}

function start(): () => void {
  let supabase: ReturnType<typeof createClient> | null = null
  try { supabase = createClient() } catch { /* no auth client (e.g. a build without the env): nothing to read */ }
  let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
  let cancelled = false
  let debounce: ReturnType<typeof setTimeout> | null = null

  /** Is this browser a signed-in member right now? If so refresh the number and make sure the realtime channel is open; if not, show nothing. */
  const check = async () => {
    if (!supabase) return
    try {
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      const user = data.user
      if (!user || isAnonymousUser(user)) { publish(ZERO); return }
      void load()
      if (!channel) {
        channel = supabase
          .channel(`messaging-badge:${user.id}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, later)
          .subscribe()
      }
    } catch { /* keep the last number */ }
  }
  const later = () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(() => { void load() }, 400) }
  const onWake = () => { if (document.visibilityState === 'visible') void check() }
  window.addEventListener('focus', onWake)
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener(MESSAGES_READ_EVENT, later)
  void check()

  return () => {
    cancelled = true
    if (debounce) clearTimeout(debounce)
    window.removeEventListener('focus', onWake)
    document.removeEventListener('visibilitychange', onWake)
    window.removeEventListener(MESSAGES_READ_EVENT, later)
    if (channel && supabase) supabase.removeChannel(channel)
    current = ZERO
  }
}

export function useMessageUnread(): MessageUnread {
  const [value, setValue] = useState<MessageUnread>(current)
  useEffect(() => {
    listeners.add(setValue)
    setValue(current)
    if (listeners.size === 1) stop = start()
    return () => {
      listeners.delete(setValue)
      if (listeners.size === 0 && stop) { stop(); stop = null }
    }
  }, [])
  return value
}
