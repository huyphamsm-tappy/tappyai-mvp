import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export const runtime = 'edge'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/notifications/read  (ADR-014 contract v1)
// Server-side read state — replaces the old client-only `notifSeenAt`.
// Body (optional): { ids: string[] } to mark specific rows; omitted (or empty) → mark ALL unread rows read.
// D7 (DR-4): done by the database function `mark_notifications_read(p_ids)`, scoped to the caller by `auth.uid()` inside it. A collapsed "message"
// notification is the unread pointer of its thread, so reading it also moves that thread's chat cursor (same transaction, same lock as the emitter).
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

  // The function takes uuids. Anything else is dropped; if ids WERE asked for and none is valid, nothing is read (never "mark all" by accident).
  const valid = ids?.filter(id => UUID.test(id))
  if (ids && ids.length > 0 && valid && valid.length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: valid && valid.length > 0 ? valid : null })
  if (error) {
    console.error('[api/notifications/read] update failed:', error)
    return NextResponse.json({ error: 'update_failed', message: serverMessage('notif.markReadFailed', requestLocale(req)) }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
