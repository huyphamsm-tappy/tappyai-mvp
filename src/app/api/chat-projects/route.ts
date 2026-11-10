import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { requireEligibleUser, productAccessResponse } from '@/lib/account/requireEligibleUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// Chat workspace · projects: a person's own named groups of conversations (table chat_projects, 20261119). Owner-only by user_id AND by RLS.
//
// GET is not age-gated for the same reason GET/DELETE on /api/conversations are not: a person must always be able to see and remove what
// they already have. POST and PUT create and change data, so they need an eligible account; all three writes refuse a guest (anonymous) session.

const MAX_TITLE = 80
const MAX_DESCRIPTION = 300
const MAX_PROJECTS = 50

function cleanTitle(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t.length >= 1 && t.length <= MAX_TITLE ? t : null
}

/** undefined = not sent; null = cleared; string = value; false = invalid. */
function cleanDescription(v: unknown): string | null | undefined | false {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'string') return false
  const t = v.trim()
  if (t.length > MAX_DESCRIPTION) return false
  return t === '' ? null : t
}

export async function GET(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  const { data, error } = await supabase
    .from('chat_projects')
    .select('id, title, description, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(MAX_PROJECTS)
  if (error) { console.error('[chat-projects]', error); return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 }) }
  // The number of conversations in each project, counted from the person's own conversations (RLS applies).
  const { data: rows } = await supabase.from('conversations').select('project_id').eq('user_id', user.id).not('project_id', 'is', null)
  const counts = new Map<string, number>()
  for (const r of rows ?? []) { const id = (r as { project_id: string | null }).project_id; if (id) counts.set(id, (counts.get(id) ?? 0) + 1) }
  return NextResponse.json({ projects: (data ?? []).map(p => ({ ...p, conversationCount: counts.get(p.id) ?? 0 })) })
}

export async function POST(req: Request) {
  const access = await requireEligibleUser(req)
  if (!access.ok) return productAccessResponse(access)
  const { user, supabase } = access
  const anon = refuseAnonymousSocialWrite(req, user)
  if (anon) return anon
  let body: { title?: unknown; description?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_fields', message: serverMessage('validation.badBody', requestLocale(req)) }, { status: 400 }) }
  const title = cleanTitle(body.title)
  const description = cleanDescription(body.description)
  if (!title || description === false) return NextResponse.json({ error: 'invalid_fields', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  const { count } = await supabase.from('chat_projects').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  if ((count ?? 0) >= MAX_PROJECTS) return NextResponse.json({ error: 'too_many_projects', message: serverMessage('chatProject.tooMany', requestLocale(req)) }, { status: 409 })
  const { data, error } = await supabase.from('chat_projects').insert({ user_id: user.id, title, description: description ?? null }).select('id, title, description, created_at, updated_at').single()
  if (error) { console.error('[chat-projects]', error); return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 }) }
  return NextResponse.json({ ...data, conversationCount: 0 })
}

export async function PUT(req: Request) {
  const access = await requireEligibleUser(req)
  if (!access.ok) return productAccessResponse(access)
  const { user, supabase } = access
  const anon = refuseAnonymousSocialWrite(req, user)
  if (anon) return anon
  let body: { id?: unknown; title?: unknown; description?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_fields', message: serverMessage('validation.badBody', requestLocale(req)) }, { status: 400 }) }
  if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) {
    const title = cleanTitle(body.title)
    if (!title) return NextResponse.json({ error: 'invalid_fields', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
    patch.title = title
  }
  const description = cleanDescription(body.description)
  if (description === false) return NextResponse.json({ error: 'invalid_fields', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  if (description !== undefined) patch.description = description
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })
  patch.updated_at = new Date().toISOString()
  const { data, error } = await supabase.from('chat_projects').update(patch).eq('id', body.id).eq('user_id', user.id).select('id, title, description, created_at, updated_at').maybeSingle()
  if (error) { console.error('[chat-projects]', error); return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 }) }
  if (!data) return NextResponse.json({ error: 'not_found', message: serverMessage('chatProject.notFound', requestLocale(req)) }, { status: 404 })
  return NextResponse.json(data)
}

// Deleting a project never deletes its conversations: the column is ON DELETE SET NULL.
export async function DELETE(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  const anon = refuseAnonymousSocialWrite(req, user)
  if (anon) return anon
  const id = searchParam(req, 'id')
  if (!id) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })
  const { error } = await supabase.from('chat_projects').delete().eq('id', id).eq('user_id', user.id)
  if (error) { console.error('[chat-projects]', error); return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
