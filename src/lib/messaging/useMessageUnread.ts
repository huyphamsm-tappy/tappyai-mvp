'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * The unread-message number for the navigation badges, on EVERY page (the conversation store itself is mounted only on the inbox).
 *
 * It is a count reader only: it does not use the conversation store and does not touch the notification store. Two numbers from /api/messaging/unread — the unread messages, and how
 * many of the unread notifications are message notifications — so `badgeTotal` counts a message once whether or not message notifications are on.
 *
 * ONE reader for the whole page, however many badges use it (the shell and the bottom bar): the first user starts it, the last one stops it. It refreshes on start, when the tab
 * regains focus, when a message arrives (the same unfiltered, row-level-security-scoped realtime subscription the inbox uses, debounced), and when the inbox says it read a thread
 * (MESSAGES_READ_EVENT). Every failure is silent: the badge keeps its last number.
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

async function load(): Promise<void> {
  try {
    const r = await fetch('/api/messaging/unread')
    if (!r.ok) return
    const d = (await r.json()) as Partial<MessageUnread>
    const messages = Number.isFinite(d.messages) ? Math.max(0, Math.floor(d.messages as number)) : 0
    const messageNotifications = Number.isFinite(d.messageNotifications) ? Math.max(0, Math.floor(d.messageNotifications as number)) : 0
    if (messages === current.messages && messageNotifications === current.messageNotifications) return
    current = { messages, messageNotifications }
    for (const fn of listeners) fn(current)
  } catch { /* keep the last number */ }
}

function start(): () => void {
  void load()
  let debounce: ReturnType<typeof setTimeout> | null = null
  const later = () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(() => { void load() }, 400) }
  const onWake = () => { if (document.visibilityState === 'visible') void load() }
  window.addEventListener('focus', onWake)
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener(MESSAGES_READ_EVENT, later)

  let cleanup = () => {}
  try {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    void supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id
      if (cancelled || !id) return
      channel = supabase
        .channel(`messaging-badge:${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, later)
        .subscribe()
    }).catch(() => {})
    cleanup = () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  } catch { /* no realtime: focus and the inbox's read event still refresh the badge */ }

  return () => {
    if (debounce) clearTimeout(debounce)
    window.removeEventListener('focus', onWake)
    document.removeEventListener('visibilitychange', onWake)
    window.removeEventListener(MESSAGES_READ_EVENT, later)
    cleanup()
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
