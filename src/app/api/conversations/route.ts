import { getRequestUser } from '@/lib/auth/getRequestUser'
import { requireEligibleUser, productAccessResponse } from '@/lib/account/requireEligibleUser'
import { NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { HISTORY_PAGE_SIZE } from '@/lib/chat/workspace/historyModel'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// ── V3 User Data Foundation: which verbs are gated, and why not all four ─────
//
// POST and PUT are product usage — they are how a conversation comes into
// existence and grows — so they require an account and 18+.
//
// GET and DELETE are deliberately NOT gated. A blocked user must still be able
// to see the history they already have and to erase it (MFS 6.5: private,
// controllable, erasable). Gating those would strand a person's own data behind
// a refusal, which is a worse privacy outcome than the one the gate protects,
// and would take away the one action a blocked account should always be able to
// take. Both remain scoped to the owner by `user_id` and by RLS.
const MAX_MESSAGES = 200
const MAX_PAYLOAD_BYTES = 512 * 1024 // 512 KB

export async function GET(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // History paging: `?before=<updated_at of the last row you have>` returns the next, older page of the same size.
  const before = searchParam(req, 'before')
  if (before && Number.isNaN(Date.parse(before))) return NextResponse.json({ error: 'invalid_fields', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  let query = supabase.from('conversations').select('id, title, category, updated_at, messages, is_pinned, is_archived, project_id').eq('user_id', user.id)
  if (before) query = query.lt('updated_at', before)
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(HISTORY_PAGE_SIZE)
  if (error) { console.error('[conversations]', error); return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 }) }
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const access = await requireEligibleUser(req)
  if (!access.ok) return productAccessResponse(access)
  const { user, supabase } = access
  const { title, category, messages } = await req.json()
  if (Array.isArray(messages)) {
    if (messages.length > MAX_MESSAGES) return NextResponse.json({ error: 'too_many_messages', message: serverMessage('conversation.tooMany', requestLocale(req)) }, { status: 413 })
    if (JSON.stringify(messages).length > MAX_PAYLOAD_BYTES) return NextResponse.json({ error: 'payload_too_large', message: serverMessage('conversation.tooLarge', requestLocale(req)) }, { status: 413 })
  }
  const { data, error } = await supabase.from('conversations').insert({ user_id: user.id, title: title || 'Cuộc trò chuyện mới', category: category || 'general', messages: messages || [] }).select().single()
  if (error) { console.error('[conversations]', error); return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 }) }
  return NextResponse.json(data)
}

export async function PUT(req: Request) {
  const access = await requireEligibleUser(req)
  if (!access.ok) return productAccessResponse(access)
  const { user, supabase } = access
  const { id, title, messages, pinned, archived, projectId } = await req.json()
  if (Array.isArray(messages)) {
    if (messages.length > MAX_MESSAGES) return NextResponse.json({ error: 'too_many_messages', message: serverMessage('conversation.tooMany', requestLocale(req)) }, { status: 413 })
    if (JSON.stringify(messages).length > MAX_PAYLOAD_BYTES) return NextResponse.json({ error: 'payload_too_large', message: serverMessage('conversation.tooLarge', requestLocale(req)) }, { status: 413 })
  }
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })
  // Pin / archive (chat workspace): only real booleans. This route does not stamp updated_at for them, but the database's own
  // BEFORE UPDATE trigger (update_conversations_updated_at) does for every UPDATE, so a pin or a restore also moves the conversation to "today".
  if ((pinned !== undefined && typeof pinned !== 'boolean') || (archived !== undefined && typeof archived !== 'boolean')) {
    return NextResponse.json({ error: 'invalid_fields', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  }
  // Project (chat workspace): a string id of one of the caller's OWN projects, or null to take the conversation out of its project.
  if (projectId !== undefined && projectId !== null) {
    if (typeof projectId !== 'string' || !projectId) return NextResponse.json({ error: 'invalid_fields', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
    const { data: owned } = await supabase.from('chat_projects').select('id').eq('id', projectId).eq('user_id', user.id).maybeSingle()
    if (!owned) return NextResponse.json({ error: 'invalid_fields', message: serverMessage('chatProject.notYours', requestLocale(req)) }, { status: 400 })
  }
  // Only the fields the caller sent are written: a rename must not blank the messages, a save must not touch the title or the flags.
  const patch: Record<string, unknown> = {}
  if (projectId !== undefined) patch.project_id = projectId
  if (title !== undefined) patch.title = title
  if (messages !== undefined) patch.messages = messages
  if (pinned !== undefined) patch.is_pinned = pinned
  if (archived !== undefined) patch.is_archived = archived
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })
  if (title !== undefined || messages !== undefined) patch.updated_at = new Date().toISOString()
  const { data, error } = await supabase.from('conversations').update(patch).eq('id', id).eq('user_id', user.id).select().single()
  if (error) { console.error('[conversations]', error); return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 }) }
  return NextResponse.json(data)
}

// Lets the user erase their own chat history (MFS 6.5 History: private, controllable,
// and erasable). Scoped to the owner by user_id (defence-in-depth beyond RLS).
export async function DELETE(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  let id = new URL(req.url).searchParams.get('id')
  if (!id) { try { id = (await req.json())?.id } catch { /* no body */ } }
  if (!id) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })
  const { error } = await supabase.from('conversations').delete().eq('id', id).eq('user_id', user.id)
  if (error) { console.error('[conversations]', error); return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
