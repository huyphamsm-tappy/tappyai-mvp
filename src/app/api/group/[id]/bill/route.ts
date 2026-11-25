import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { clipField } from '@/lib/group/fields'
import { groupPeople } from '@/lib/group/people'
import { splitBill } from '@/lib/group/splitBill'
import { readBillRow, toBillView } from '@/lib/group/billView'

// The bill of a group meal (owner 20/11: equal split by default, editable by hand, with optional personal items). Written by the SERVICE ROLE after these checks (the table has no write policy):
//   PUT     a participant enters or replaces the bill and is its PAYER; only the payer edits it afterwards; editing clears "paid" (the amounts changed)
//   PATCH   the payer marks a person as having paid back, or unmarks
//   DELETE  the payer or the leader removes the bill
// People are named by opaque keys ('leader', member row ids); account ids never leave the server.
const MAX_ITEMS = 20

type Ctx = { params: { id: string } }
type MsgKey = Parameters<typeof serverMessage>[0]
type Begun =
  | { response: Response }
  | { user: { id: string }; admin: ReturnType<typeof createAdminClient>; group: { id: string; creator_id: string }; people: Awaited<ReturnType<typeof groupPeople>>; me: Awaited<ReturnType<typeof groupPeople>>[number]; locale: ReturnType<typeof requestLocale> }

async function begin(req: NextRequest, groupId: string): Promise<Begun> {
  const locale = requestLocale(req)
  const fail = (error: string, status: number, key: MsgKey = 'validation.invalid'): { response: Response } => ({ response: NextResponse.json({ error, message: serverMessage(key, locale) }, { status }) })
  const { user } = await getRequestUser(req)
  if (!user) return fail('unauthorized', 401, 'auth.required')
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return { response: anonRefusal }
  const rl = await publicRateLimit(`group-bill:${user.id}`, 60, 60_000)
  if (!rl.ok) return { response: rateLimitedResponse(req, rl, 'group_bill') }
  const admin = createAdminClient()
  const { data: group } = await admin.from('groups').select('id, creator_id').eq('id', groupId).single()
  if (!group) return fail('group_not_found', 404, 'group.notFound')
  const people = await groupPeople(admin, group)
  const me = people.find(p => p.userId === user.id)
  // a participant is the leader or an accepted member; a pending person and a stranger are neither
  if (!me) return fail('not_a_member', 403, 'group.ownerOnly')
  return { user, admin, group, people, me, locale }
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<Response> {
  const ctx = await begin(req, params.id)
  if ('response' in ctx) return ctx.response
  const { user, admin, group, people, me, locale } = ctx
  const body = (await req.json().catch(() => null)) as { totalVnd?: unknown; tipVnd?: unknown; items?: unknown; excluded?: unknown } | null
  const rawItems = Array.isArray(body?.items) ? body!.items : []
  const rawExcluded = Array.isArray(body?.excluded) ? body!.excluded : []
  if (!body || rawItems.length > MAX_ITEMS || rawExcluded.length > MAX_ITEMS) return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  const existing = await readBillRow(admin, group.id)
  if (existing && existing.payer_id !== user.id) return NextResponse.json({ error: 'payer_only', message: serverMessage('group.ownerOnly', locale) }, { status: 403 })

  const items = rawItems.map((it: { name?: unknown; amountVnd?: unknown; forId?: unknown }) => ({ name: clipField(it?.name, 40), amountVnd: it?.amountVnd as number, forId: String(it?.forId ?? '') }))
  const excluded = [...new Set(rawExcluded.map(String))]
  const tipVnd = body.tipVnd === undefined ? 0 : (body.tipVnd as number)
  const check = splitBill({ participants: people.map(p => ({ id: p.key, name: p.name })), payerId: me.key, totalVnd: body.totalVnd as number, tipVnd, items, excluded })
  if (!check.ok) return NextResponse.json({ error: 'invalid_bill', reason: check.error, message: serverMessage('validation.invalid', locale) }, { status: 400 })

  const row = { group_id: group.id, payer_id: user.id, total_vnd: body.totalVnd, tip_vnd: tipVnd, items, excluded, paid: {}, updated_at: new Date().toISOString() }
  const { error } = await admin.from('group_bills').upsert(row, { onConflict: 'group_id' })
  if (error) return NextResponse.json({ error: 'save_failed', message: serverMessage('group.joinFailed', locale) }, { status: 500 })
  const stored = await readBillRow(admin, group.id)
  return NextResponse.json({ ok: true, bill: stored ? toBillView(stored, people, user.id) : null })
}

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const ctx = await begin(req, params.id)
  if ('response' in ctx) return ctx.response
  const { user, admin, group, people, locale } = ctx
  const body = (await req.json().catch(() => null)) as { memberKey?: unknown; paid?: unknown } | null
  const key = typeof body?.memberKey === 'string' ? body.memberKey : ''
  if (!key || typeof body?.paid !== 'boolean') return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', locale) }, { status: 400 })
  const existing = await readBillRow(admin, group.id)
  if (!existing) return NextResponse.json({ error: 'no_bill', message: serverMessage('group.notFound', locale) }, { status: 404 })
  if (existing.payer_id !== user.id) return NextResponse.json({ error: 'payer_only', message: serverMessage('group.ownerOnly', locale) }, { status: 403 })
  const target = people.find(p => p.key === key)
  if (!target || target.userId === existing.payer_id) return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  const paid = { ...((existing.paid && typeof existing.paid === 'object' ? existing.paid : {}) as Record<string, boolean>) }
  if (body.paid) paid[key] = true
  else delete paid[key]
  const { error } = await admin.from('group_bills').update({ paid, updated_at: new Date().toISOString() }).eq('group_id', group.id)
  if (error) return NextResponse.json({ error: 'save_failed', message: serverMessage('group.joinFailed', locale) }, { status: 500 })
  const stored = await readBillRow(admin, group.id)
  return NextResponse.json({ ok: true, bill: stored ? toBillView(stored, people, user.id) : null })
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const ctx = await begin(req, params.id)
  if ('response' in ctx) return ctx.response
  const { user, admin, group, locale } = ctx
  const existing = await readBillRow(admin, group.id)
  if (!existing) return NextResponse.json({ ok: true })
  if (existing.payer_id !== user.id && group.creator_id !== user.id) return NextResponse.json({ error: 'payer_only', message: serverMessage('group.ownerOnly', locale) }, { status: 403 })
  const { error } = await admin.from('group_bills').delete().eq('group_id', group.id)
  if (error) return NextResponse.json({ error: 'delete_failed', message: serverMessage('group.joinFailed', locale) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
