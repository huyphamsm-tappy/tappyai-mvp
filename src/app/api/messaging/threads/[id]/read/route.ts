import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

/**
 * POST /api/messaging/threads/[id]/read — move the caller's read cursor to now.
 *
 * 🔑 A CURSOR, NOT A COUNTER. Nothing here decrements a number. The unread badge
 * is derived by `chat_thread_summaries()` from this timestamp, so marking a
 * thread read and counting what is unread can never disagree — the second is a
 * function of the first.
 *
 * The client could write `chat_reads` directly (the RLS policies allow exactly
 * this row and no other), and this route exists anyway so that the anonymous
 * refusal, the locale-aware errors and the auth handling look like every other
 * social write in the app rather than being the one place that does not.
 */
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

  // 🚨 `user_id` comes from the session. The INSERT policy also demands
  // `user_id = auth.uid()` AND participation, so a read receipt cannot be moved
  // on someone else's behalf even if this route were called with a forged body.
  const { error } = await supabase
    .from('chat_reads')
    .upsert(
      { thread_id: params.id, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: 'thread_id,user_id' },
    )

  if (error) {
    // Not a participant: RLS refuses. Answered as "not found" so the endpoint
    // cannot be used to discover which threads exist.
    if (error.code === '42501') {
      return NextResponse.json(
        { error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) },
        { status: 404 },
      )
    }
    console.error('[messaging] mark read:', error.message)
    return NextResponse.json(
      { error: 'server_error', message: serverMessage('server.error', requestLocale(req)) },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
