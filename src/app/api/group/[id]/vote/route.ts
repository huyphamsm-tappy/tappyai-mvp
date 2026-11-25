import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { optionIdsOf, voteSummary } from '@/lib/group/voteSummary'

// POST /api/group/[id]/vote   { optionId }   (owner 20/11)
// One vote per person, changeable until the decision. The participants are the creator and the accepted members; a pending person or a stranger can not vote. As soon as MORE THAN HALF of the
// participants vote for one place it is chosen, in the same step (the votes are written by the service role: a caller has no write access to the table).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const locale = requestLocale(req)
  const groupId = params.id
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal
  const rl = await publicRateLimit(`group-vote:${user.id}`, 60, 60_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'group_vote')

  const body = (await req.json().catch(() => null)) as { optionId?: unknown } | null
  const optionId = typeof body?.optionId === 'string' ? body.optionId.slice(0, 8) : ''
  if (!optionId) return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  const admin = createAdminClient()
  const { data: group } = await admin.from('groups').select('id, creator_id, suggestion_options, chosen_option').eq('id', groupId).single()
  if (!group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', locale) }, { status: 404 })
  if (group.creator_id !== user.id) {
    const { data: mine } = await admin.from('group_members').select('id, status').eq('group_id', groupId).eq('user_id', user.id).maybeSingle()
    if (!mine || mine.status !== 'member') return NextResponse.json({ error: 'not_a_member', message: serverMessage('group.ownerOnly', locale) }, { status: 403 })
  }
  if (group.chosen_option) return NextResponse.json({ error: 'already_decided', message: serverMessage('validation.invalid', locale) }, { status: 409 })
  const options = optionIdsOf(group.suggestion_options)
  if (!options.includes(optionId)) return NextResponse.json({ error: 'invalid_option', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  const { error } = await admin.from('group_votes').upsert({ group_id: groupId, user_id: user.id, option_id: optionId, updated_at: new Date().toISOString() }, { onConflict: 'group_id,user_id' })
  if (error) return NextResponse.json({ error: 'vote_failed', message: serverMessage('group.joinFailed', locale) }, { status: 500 })

  const votes = await voteSummary(admin, groupId, options, user.id)
  let chosen: string | null = null
  if (votes.majority) {
    // only while nobody has decided yet: two last votes arriving together must not overwrite each other
    await admin.from('groups').update({ chosen_option: votes.majority, decided_at: new Date().toISOString() }).eq('id', groupId).is('chosen_option', null)
    chosen = votes.majority
  }
  return NextResponse.json({ ok: true, chosen, votes })
}
