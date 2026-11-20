import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { optionIdsOf, voteSummary } from '@/lib/group/voteSummary'

// POST /api/group/[id]/choose   { optionId }   (owner 20/11: the group decides by majority)
// The LEADER's choice exists only for the one case the majority rule leaves open: everyone has voted and no place has more than half. The leader never overrides a majority and never decides early.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const locale = requestLocale(req)
  const groupId = params.id
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal
  const rl = await publicRateLimit(`group-choose:${user.id}`, 30, 60_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'group_choose')

  const body = (await req.json().catch(() => null)) as { optionId?: unknown } | null
  const optionId = typeof body?.optionId === 'string' ? body.optionId.slice(0, 8) : ''
  if (!optionId) return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  const admin = createAdminClient()
  const { data: group } = await admin.from('groups').select('id, creator_id, suggestion_options, chosen_option').eq('id', groupId).single()
  if (!group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', locale) }, { status: 404 })
  if (group.creator_id !== user.id) return NextResponse.json({ error: 'owner_only', message: serverMessage('group.ownerOnly', locale) }, { status: 403 })
  const options = optionIdsOf(group.suggestion_options)
  if (!options.includes(optionId)) return NextResponse.json({ error: 'invalid_option', message: serverMessage('validation.invalid', locale) }, { status: 400 })
  if (group.chosen_option) return NextResponse.json({ error: 'already_decided', message: serverMessage('validation.invalid', locale) }, { status: 409 })

  const votes = await voteSummary(admin, groupId, options, user.id)
  if (votes.majority || !votes.allVoted) return NextResponse.json({ error: 'not_allowed_yet', message: serverMessage('validation.invalid', locale) }, { status: 409 })

  await admin.from('groups').update({ chosen_option: optionId, decided_at: new Date().toISOString() }).eq('id', groupId).is('chosen_option', null)
  return NextResponse.json({ ok: true, chosen: optionId, votes })
}
