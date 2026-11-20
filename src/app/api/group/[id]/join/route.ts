import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { clipField } from '@/lib/group/fields'
import { MAX_MEMBERS, MAX_PENDING } from '@/lib/group/limits'

// POST /api/group/[id]/join — opening the invite link FILES A REQUEST (owner 20/11: a group is private; a Tappy account and the leader's acceptance are both needed).
// The person is written as 'pending'; they read nothing of the group until the leader accepts them (POST /api/group/[id]/members). Opening the link never makes a membership.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const groupId = params.id
  if (!groupId) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })

  // Auth required — joining writes member data (budget/dietary/area) into a
  // group and must be attributed to the caller. Anonymous joins are rejected.
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let name: string, budget: string, food_preferences: string, dietary_restrictions: string, area: string
  try {
    const body = await req.json()
    name = clipField(body.name, 60)
    budget = clipField(body.budget, 40)
    food_preferences = clipField(body.food_preferences, 200)
    dietary_restrictions = clipField(body.dietary_restrictions, 200)
    area = clipField(body.area, 80)
    if (!name || !area) throw new Error('missing fields')
  } catch {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  }

  // The checks below read through the service role: under the read boundary a caller sees only the groups they already belong to, and someone asking to join, by definition, does not.
  const admin = createAdminClient()
  const { data: group } = await admin.from('groups').select('id, creator_id').eq('id', groupId).single()
  if (!group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', requestLocale(req)) }, { status: 404 })
  if (group.creator_id === user.id) return NextResponse.json({ ok: true, alreadyJoined: true })

  const { data: mine } = await admin.from('group_members').select('id, status').eq('group_id', groupId).eq('user_id', user.id).maybeSingle()
  if (mine) return NextResponse.json(mine.status === 'member' ? { ok: true, alreadyJoined: true } : { ok: true, pending: true, alreadyRequested: true })

  // a full group (accepted members only: a request is not a seat) takes no new request, and a link that went public cannot pile up requests without end
  const { count: accepted } = await admin.from('group_members').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'member')
  if ((accepted ?? 0) >= MAX_MEMBERS) return NextResponse.json({ error: 'group_full', message: serverMessage('group.full', requestLocale(req)) }, { status: 400 })
  const { count: waiting } = await admin.from('group_members').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'pending')
  if ((waiting ?? 0) >= MAX_PENDING) return NextResponse.json({ error: 'too_many_requests', message: serverMessage('group.full', requestLocale(req)) }, { status: 429 })

  // The INSERT stays on the caller's client: the write is still gated by `group_members_insert_self`, so a row can only be attributed to the authenticated user, and only as 'pending'.
  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: user.id, name, budget, food_preferences, dietary_restrictions, area, status: 'pending' })

  if (error) {
    // Unique (group_id, user_id) violation → the request already exists (two taps at once); treat as success.
    if (error.code === '23505') return NextResponse.json({ ok: true, pending: true, alreadyRequested: true })
    return NextResponse.json({ error: 'join_failed', message: serverMessage('group.joinFailed', requestLocale(req)) }, { status: 500 })
  }
  return NextResponse.json({ ok: true, pending: true })
}
