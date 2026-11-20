import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// DELETE /api/group/[id] — the creator deletes the group (its members, requests, votes and bills go with it: ON DELETE CASCADE). Owner 20/11: a group can be closed from the app.
// Read and written with the caller's own client: the creator policy ("Creators manage own groups") is the boundary, so a non-creator never even sees the row (404).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const locale = requestLocale(req)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })

  const { data: group } = await supabase.from('groups').select('id, creator_id').eq('id', params.id).single()
  if (!group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', locale) }, { status: 404 })
  if (group.creator_id !== user.id) return NextResponse.json({ error: 'owner_only', message: serverMessage('group.ownerOnly', locale) }, { status: 403 })

  const { error } = await supabase.from('groups').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: 'delete_failed', message: serverMessage('group.createFailed', locale) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
