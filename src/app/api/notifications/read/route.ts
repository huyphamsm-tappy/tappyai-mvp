import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export const runtime = 'edge'

// POST /api/notifications/read  (ADR-014 contract v1)
// Server-side read state — replaces the old client-only `notifSeenAt`.
// Body (optional): { ids: string[] } to mark specific rows; omitted → mark ALL
// unread rows read. Scoped to the caller by RLS + explicit user_id filter.
export async function POST(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  let ids: string[] | undefined
  try {
    const body = await req.json()
    if (Array.isArray(body?.ids)) ids = body.ids.filter((x: unknown): x is string => typeof x === 'string')
  } catch {
    // no body → mark-all
  }

  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
  if (ids && ids.length > 0) query = query.in('id', ids)

  const { error } = await query
  if (error) {
    console.error('[api/notifications/read] update failed:', error)
    return NextResponse.json({ error: 'update_failed', message: serverMessage('notif.markReadFailed', requestLocale(req)) }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
