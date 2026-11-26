import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { assembleSummaries, type SummaryQueryClient, type ThreadSummaryRow } from '@/lib/messaging/summaries'

// GET /api/messaging/requests - "Tin nhan cho" (message requests, migration 20261210).
//   direction 'incoming'  somebody who is not mutually reachable asked to write to the caller (still waiting, newer than 30 days)
//   direction 'outgoing'  the caller asked; `remaining` is how many of the 3 messages the caller may still send until the other person replies
// Read with the CALLER's own client; the database function does the scoping. The same list shape as /api/messaging/threads plus `direction`, `remaining`, `startedAt`.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

interface RequestRow {
  thread_id: string
  direction: 'incoming' | 'outgoing'
  other_user_id: string | null
  started_at: string
  last_body: string | null
  last_created_at: string | null
  unread_count: number
  remaining: number
}

export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) },
      { status: 401 },
    )
  }
  if (user.is_anonymous) return NextResponse.json({ requests: [] })

  const { data, error } = await supabase.rpc('chat_request_summaries')
  if (error) {
    console.error('[messaging] request list:', error.message)
    return NextResponse.json(
      { error: 'server_error', message: serverMessage('server.error', requestLocale(req)) },
      { status: 500 },
    )
  }

  const rows = (data ?? []) as RequestRow[]
  const asSummaries: ThreadSummaryRow[] = rows.map(r => ({
    thread_id: r.thread_id,
    kind: 'direct',
    title: null,
    last_message_at: r.last_created_at ?? r.started_at,
    last_body: r.last_body,
    last_sender_id: null,
    last_created_at: r.last_created_at,
    unread_count: r.unread_count,
  }))
  const threads = await assembleSummaries(supabase as unknown as SummaryQueryClient, asSummaries)
  const extra = new Map(rows.map(r => [r.thread_id, r]))
  const requests = threads.map(t => {
    const r = extra.get(t.id)
    return { ...t, direction: r?.direction ?? 'incoming', remaining: r?.remaining ?? 0, startedAt: r?.started_at ?? t.lastMessageAt }
  })
  return NextResponse.json({ requests })
}
