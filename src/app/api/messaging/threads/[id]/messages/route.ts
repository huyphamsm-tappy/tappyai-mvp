import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { rateLimit } from '@/lib/security/rateLimit'
import type { ChatMessage } from '@/lib/messaging/types'
import { emitMessageNotification, messageNotificationsEnabled } from '@/lib/messaging/messageNotifications'

/** Matches the CHECK constraint on `chat_messages.body`; the database is the authority. */
const MAX_BODY = 4000
const PAGE_SIZE = 50

interface MessageRow {
  id: string
  thread_id: string
  sender_id: string | null
  body: string
  created_at: string
}

const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  threadId: r.thread_id,
  senderId: r.sender_id,
  body: r.body,
  createdAt: r.created_at,
})

/**
 * 🚨 THE 404 IS A PRIVACY DECISION, NOT A CONVENIENCE.
 *
 * A non-participant asking for a thread gets "not found", never "forbidden".
 * `403` would confirm the thread exists, which turns this endpoint into an
 * oracle for whether two people are talking — the exact fact private messaging
 * is supposed to hide. The read itself is refused by RLS either way; this only
 * decides what the refusal tells the asker.
 */
async function loadThread(
  supabase: Awaited<ReturnType<typeof getRequestUser>>['supabase'],
  threadId: string,
) {
  const { data } = await supabase.from('chat_threads').select('id, kind').eq('id', threadId).maybeSingle()
  return data as { id: string; kind: string } | null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) },
      { status: 401 },
    )
  }

  if (!(await loadThread(supabase, params.id))) {
    return NextResponse.json(
      { error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) },
      { status: 404 },
    )
  }

  // Newest-first with a cursor, then reversed for display: an infinite history
  // must page from the bottom, and offset paging would shift under every new
  // message that arrives while the reader is scrolling.
  const before = searchParam(req, 'before')
  let query = supabase
    .from('chat_messages')
    .select('id, thread_id, sender_id, body, created_at')
    .eq('thread_id', params.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) {
    console.error('[messaging] message list:', error.message)
    return NextResponse.json(
      { error: 'server_error', message: serverMessage('server.error', requestLocale(req)) },
      { status: 500 },
    )
  }

  const rows = (data ?? []) as MessageRow[]
  return NextResponse.json({
    messages: rows.map(toMessage).reverse(),
    hasMore: rows.length === PAGE_SIZE,
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) },
      { status: 401 },
    )
  }
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  // Per-user, not per-IP: this throttles a runaway client without letting one
  // office network's shared address throttle everyone behind it.
  if (!rateLimit(`messaging:send:${user.id}`, 60, 60_000).ok) {
    return NextResponse.json(
      { error: 'rate_limit', message: serverMessage('rate.tooFast', requestLocale(req)) },
      { status: 429 },
    )
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) },
      { status: 400 },
    )
  }

  const raw = (payload as { body?: unknown }).body
  const bodyText = typeof raw === 'string' ? raw.trim() : ''
  if (!bodyText || bodyText.length > MAX_BODY) {
    return NextResponse.json(
      { error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) },
      { status: 400 },
    )
  }

  if (!(await loadThread(supabase, params.id))) {
    return NextResponse.json(
      { error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) },
      { status: 404 },
    )
  }

  // 🔑 `sender_id` is taken from the SESSION, never from the request body, and
  // the INSERT policy asserts it equals `auth.uid()` a second time. A client
  // cannot post as somebody else even if this line were wrong.
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ thread_id: params.id, sender_id: user.id, body: bodyText })
    .select('id, thread_id, sender_id, body, created_at')
    .single()

  if (error) {
    // RLS refusal on a thread that exists but is not the caller's — answered as
    // "not found" for the same reason as above.
    if (error.code === '42501') {
      return NextResponse.json(
        { error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) },
        { status: 404 },
      )
    }
    console.error('[messaging] send:', error.message)
    return NextResponse.json(
      { error: 'server_error', message: serverMessage('server.error', requestLocale(req)) },
      { status: 500 },
    )
  }

  // ── MESSENGER → INBOX (Phase 6) ───────────────────────────────────────────
  //
  // The message is stored and the response is owed to the caller; the Inbox
  // notification is an extra. It is awaited only so a failure is logged in the
  // same request, and it cannot throw — `notifyThreadRecipients` swallows its
  // own errors, exactly like every other notification producer.
  //
  // 🚨 OFF BY DEFAULT. `MESSAGE_NOTIFICATIONS_ENABLED` gates the whole path, and
  // while it is off this call reads no rows and emits nothing.
  await notifyThreadRecipients(supabase, params.id, user.id)

  return NextResponse.json({ message: toMessage(data as MessageRow) })
}

/**
 * Emit one Inbox notification per OTHER participant of the thread.
 *
 * 🚨 The message body is not passed in, and there is no parameter for it. What
 * the notification carries is the sender's name, the thread id and a deep link.
 *
 * The roster is read with the caller's own client, so RLS confirms the caller is
 * in the thread before anyone is notified — a forged thread id yields an empty
 * roster rather than a notification storm aimed at strangers.
 */
async function notifyThreadRecipients(
  supabase: Awaited<ReturnType<typeof getRequestUser>>['supabase'],
  threadId: string,
  senderId: string,
): Promise<void> {
  // Checked before any query: "off" must mean nothing happens at all.
  if (!messageNotificationsEnabled()) return

  try {
    const { data: roster } = await supabase
      .from('chat_participants')
      .select('user_id')
      .eq('thread_id', threadId)
    const recipients = ((roster ?? []) as { user_id: string }[])
      .map(r => r.user_id)
      .filter(id => id !== senderId)
    if (!recipients.length) return

    const { data: me } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', senderId)
      .maybeSingle()
    const sender = me as { full_name: string | null; avatar_url: string | null } | null

    await Promise.all(recipients.map(recipientId => emitMessageNotification({
      recipientId,
      senderId,
      senderName: sender?.full_name?.trim() || 'TappyAI',
      senderAvatarUrl: sender?.avatar_url ?? null,
      threadId,
    })))
  } catch (e) {
    // A notification must never fail the send that triggered it.
    console.error('[messaging] message notification:', e)
  }
}
