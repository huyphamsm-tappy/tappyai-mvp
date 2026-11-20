import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { isServableMediaUrl } from '@/lib/media/servableMedia'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { clipField } from '@/lib/group/fields'
import { optionIdsOf, voteSummary } from '@/lib/group/voteSummary'
import { readBillRow, toBillView, type BillView } from '@/lib/group/billView'
import { groupPeople } from '@/lib/group/people'

export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  // owner 20/11 (UAT 18/11: 25 groups in a row and six from one double tap were all accepted): a limit per account, and a second tap on the same name is the same group
  const rl = await publicRateLimit(`group-create:${user.id}`, 10, 60 * 60_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'group_create')

  let name: string
  try {
    const body = await req.json()
    name = clipField(body.name, 60)
    if (!name) throw new Error('missing name')
  } catch {
    return NextResponse.json({ error: 'invalid_name', message: serverMessage('group.invalidName', requestLocale(req)) }, { status: 400 })
  }

  const since = new Date(Date.now() - 60_000).toISOString()
  const { data: recent } = await supabase.from('groups').select('id, name').eq('creator_id', user.id).eq('name', name).gt('created_at', since).limit(1)
  if (recent && recent.length > 0) return NextResponse.json(recent[0])

  const { data, error } = await supabase
    .from('groups')
    .insert({ name, creator_id: user.id })
    .select('id, name')
    .single()

  if (error) return NextResponse.json({ error: 'create_failed', message: serverMessage('group.createFailed', requestLocale(req)) }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const id = searchParam(req, 'id')
  if (!id) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })

  // Owner 20/11: a group is PRIVATE. It needs a Tappy account (no account: 401) and the leader's acceptance: the link only lets a person ASK to join. So, by who is asking:
  //   creator           the group, the accepted members and the pending requests (to accept or decline them)
  //   accepted member   the group and the accepted members
  //   pending person    only that their request waits, and the group name
  //   anyone else       only the group name, so they can ask to join
  // (S-1, 20260904: the read goes through the service role keyed by the one id the caller gave; nothing here can enumerate.)
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  const supabase = createAdminClient()

  const { data: group, error: groupError } = await supabase
    .from('groups')
    // `avatar_url`: the group's own picture (20260922_groups_avatar_url), set by the creator
    // through POST /api/group/[id]/avatar. Only a servable URL leaves — a retired-host URL
    // would render as a broken image on every member's screen.
    .select('id, name, creator_id, status, suggestion, created_at, avatar_url')
    .eq('id', id)
    .single()

  if (groupError || !group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', requestLocale(req)) }, { status: 404 })
  group.avatar_url = isServableMediaUrl(group.avatar_url) ? group.avatar_url : null

  const { data: rows } = await supabase
    .from('group_members')
    .select('id, user_id, name, budget, food_preferences, dietary_restrictions, area, created_at, status')
    .eq('group_id', id)
    .order('created_at', { ascending: true })
  const all = (rows ?? []) as Array<Record<string, unknown>>
  const mine = all.find(r => r.user_id === user.id)
  const isCreator = group.creator_id === user.id
  if (!isCreator && mine?.status !== 'member') return NextResponse.json({ state: mine ? 'pending' : 'none', id: group.id, name: group.name })

  // the person's own account id never leaves: the others see names and tastes, not who they are on Tappy
  const view = ({ user_id: _u, status: _s, ...rest }: Record<string, unknown>) => rest
  const members = all.filter(r => r.status === 'member').map(view)

  // the suggestion cards, the vote and the decision (20261205): read apart so that a database without that migration still answers with the group as before
  const { data: extra } = await supabase.from('groups').select('suggestion_options, chosen_option, decided_at').eq('id', id).single()
  const options = optionIdsOf(extra?.suggestion_options)
  let votes: Awaited<ReturnType<typeof voteSummary>> | null = null
  if (options.length) { try { votes = await voteSummary(supabase, id, options, user.id) } catch { votes = null } }
  // the bill of the meal (20261206), for the people of the group; absent before that migration is applied
  let bill: BillView | null = null
  let people: Awaited<ReturnType<typeof groupPeople>> = []
  try {
    people = await groupPeople(supabase, group)
    const row = await readBillRow(supabase, group.id)
    bill = row ? toBillView(row, people, user.id) : null
  } catch { bill = null }
  return NextResponse.json({
    ...group,
    state: isCreator ? 'creator' : 'member',
    members,
    ...(isCreator ? { pendingRequests: all.filter(r => r.status === 'pending').map(view) } : {}),
    suggestion_options: options.length ? extra?.suggestion_options : null,
    chosen_option: extra?.chosen_option ?? null,
    ...(votes ? { votes } : {}),
    ...(bill ? { bill } : {}),
    // the people of the meal by opaque key (never by account id) and which one is the caller: the bill form needs them before any bill exists
    people: people.map(p => ({ key: p.key, name: p.name })),
    myKey: people.find(p => p.userId === user.id)?.key ?? null,
  })
}
