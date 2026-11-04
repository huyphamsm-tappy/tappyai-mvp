import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'

// GET /api/messaging/unread — the two numbers the navigation badge needs, nothing else:
//   messages              the unread messages over all of the caller's conversations (the same per-thread rule as the conversation list).
//   messageNotifications  how many of the caller's UNREAD notifications are of type `message` (0 while MESSAGE_NOTIFICATIONS_ENABLED is off). The badge subtracts them from the
//                         notification count and adds `messages`, so a message is counted once whether or not that flag is on.
// Read with the CALLER's own client, so row-level security scopes both reads. Anonymous or signed-out: zeros (a badge has nothing to say). A failed read answers zeros as well:
// a badge that cannot be computed shows nothing rather than a wrong number.
export const dynamic = 'force-dynamic'

const ZERO = { messages: 0, messageNotifications: 0 }

export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user || user.is_anonymous) return NextResponse.json(ZERO)

  let messages = 0
  try {
    const { data, error } = await supabase.rpc('chat_thread_summaries')
    if (error) throw new Error(error.message)
    messages = ((data ?? []) as Array<{ unread_count?: number | null }>).reduce((sum, r) => sum + (Number(r.unread_count) > 0 ? Number(r.unread_count) : 0), 0)
  } catch (e) {
    console.error('[messaging] unread total:', e instanceof Error ? e.message : e)
    return NextResponse.json(ZERO)
  }

  let messageNotifications = 0
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id) // redundant with RLS, kept explicit
      .eq('type', 'message')
      .is('read_at', null)
    if (!error && typeof count === 'number') messageNotifications = count
  } catch { /* the badge then counts the messages and leaves the notification count alone */ }

  return NextResponse.json({ messages, messageNotifications })
}
