import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { MAX_MEMBERS } from '@/lib/group/limits'

// POST /api/group/[id]/members   { memberId, action: 'approve' | 'decline' | 'remove' }   (owner 20/11: a group is private; the LEADER accepts who comes in)
//   approve  a pending request becomes a member (the group holds at most MAX_MEMBERS accepted members)
//   decline  a pending request is deleted
//   remove   an accepted member is taken out
// Creator only, on a group that exists; the write is made with the service role after the creator check, never by the caller (the table has no update policy for a caller).

const ACTIONS = ['approve', 'decline', 'remove'] as const
type Action = (typeof ACTIONS)[number]

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const groupId = params.id
  const locale = requestLocale(req)
  if (!groupId) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', locale) }, { status: 400 })
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal
  const rl = await publicRateLimit(`group-members:${user.id}`, 60, 60_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'group_members')

  const body = (await req.json().catch(() => null)) as { memberId?: unknown; action?: unknown } | null
  const memberId = typeof body?.memberId === 'string' ? body.memberId.slice(0, 64) : ''
  const action = ACTIONS.find(a => a === body?.action) as Action | undefined
  if (!memberId || !action) return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  const admin = createAdminClient()
  const { data: group } = await admin.from('groups').select('id, creator_id').eq('id', groupId).single()
  if (!group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', locale) }, { status: 404 })
  if (group.creator_id !== user.id) return NextResponse.json({ error: 'owner_only', message: serverMessage('group.ownerOnly', locale) }, { status: 403 })

  const { data: row } = await admin.from('group_members').select('id, status').eq('id', memberId).eq('group_id', groupId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'member_not_found', message: serverMessage('group.notFound', locale) }, { status: 404 })

  // each action fits one state: decline is for a request, remove is for an accepted member (approving someone already accepted is a no-op)
  const fits = action === 'decline' ? row.status === 'pending' : action === 'remove' ? row.status === 'member' : true
  if (!fits) return NextResponse.json({ error: 'invalid_state', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  if (action === 'approve') {
    if (row.status === 'member') return NextResponse.json({ ok: true })
    const { count } = await admin.from('group_members').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'member')
    if ((count ?? 0) >= MAX_MEMBERS) return NextResponse.json({ error: 'group_full', message: serverMessage('group.full', locale) }, { status: 400 })
    const { error } = await admin.from('group_members').update({ status: 'member' }).eq('id', memberId).eq('group_id', groupId)
    if (error) return NextResponse.json({ error: 'update_failed', message: serverMessage('group.joinFailed', locale) }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  const { error } = await admin.from('group_members').delete().eq('id', memberId).eq('group_id', groupId)
  if (error) return NextResponse.json({ error: 'update_failed', message: serverMessage('group.joinFailed', locale) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
