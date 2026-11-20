import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// POST /api/group/[id]/leave — a member leaves the group, or a person withdraws their pending request (owner 20/11). The creator does not leave: they delete the group.
// The row is deleted with the caller's own client (the policy "delete your own membership"); the service role only checks that there is a row to leave.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const locale = requestLocale(req)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })

  const admin = createAdminClient()
  const { data: group } = await admin.from('groups').select('id, creator_id').eq('id', params.id).single()
  if (!group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', locale) }, { status: 404 })
  if (group.creator_id === user.id) return NextResponse.json({ error: 'creator_cannot_leave', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  const { data: mine } = await admin.from('group_members').select('id').eq('group_id', params.id).eq('user_id', user.id).maybeSingle()
  if (!mine) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', locale) }, { status: 404 })

  const { error } = await supabase.from('group_members').delete().eq('group_id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'leave_failed', message: serverMessage('group.joinFailed', locale) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
