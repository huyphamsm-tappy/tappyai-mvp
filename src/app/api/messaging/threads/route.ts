import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { assembleSummaries, type SummaryQueryClient } from '@/lib/messaging/summaries'

// ── /api/messaging/threads ──────────────────────────────────────────────────
//
// 🚨 THIS IS NOT `/api/chat` AND NOT `/api/conversations`.
//
//   /api/chat            User ↔ TappyAI. The assistant's streaming endpoint.
//   /api/conversations   User ↔ TappyAI. That assistant's saved history.
//   /api/messaging/...  User ↔ User. This.
//
// 🚨 Note the spelling above. A slash followed by a star, written inside a LINE comment,
// still opens a BLOCK COMMENT for
// any tool that strips block comments before line comments — which is what
// `anonymousWriteBoundary.test.ts` does. Written the obvious way, this paragraph swallowed the
// rest of the file and the guard reported this route as having no anonymous refusal at all.
//
// The namespaces are separate on purpose: the two features share every noun and
// no data, and putting social messaging under `/api/chat` would have been the
// first step towards someone "unifying" them.

export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) },
      { status: 401 },
    )
  }

  // 🔑 No `.eq('user_id', …)` anywhere in this file. Every read is scoped by the
  // RLS policies in 20260905_chat_messaging_phase1.sql, evaluated against this
  // request's own authenticated client. A filter here would be a second, weaker
  // copy of a rule the database already enforces — and the one that goes stale.
  const { data, error } = await supabase.rpc('chat_thread_summaries')
  if (error) {
    console.error('[messaging] thread list:', error.message)
    return NextResponse.json(
      { error: 'server_error', message: serverMessage('server.error', requestLocale(req)) },
      { status: 500 },
    )
  }

  // See `SummaryQueryClient`: the cast is what keeps `tsc` from unrolling
  // PostgREST's recursive builder types through a second structural interface.
  const threads = await assembleSummaries(supabase as unknown as SummaryQueryClient, data ?? [])
  return NextResponse.json({ threads })
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) },
      { status: 401 },
    )
  }
  // B17 — an anonymous session is authenticated but is not an account. The SQL
  // functions refuse it too; this is the layer that gives the user a sentence
  // rather than a Postgres error code.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) },
      { status: 400 },
    )
  }

  const input = body as { kind?: unknown; userId?: unknown; userIds?: unknown; title?: unknown }
  const invalid = () => NextResponse.json(
    { error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) },
    { status: 400 },
  )

  if (input.kind === 'direct') {
    if (typeof input.userId !== 'string' || !input.userId) return invalid()
    // The RPC is what enforces "one thread per pair" — see the unique partial
    // index on `direct_key`. The route never checks-then-inserts, because that
    // is exactly the shape that loses the race it is meant to win.
    const { data, error } = await supabase.rpc('chat_start_direct', { p_target: input.userId })
    if (error) return rpcFailure(req, error.message, '[messaging] start direct')
    return NextResponse.json({ threadId: data as string })
  }

  if (input.kind === 'group') {
    const ids = Array.isArray(input.userIds) ? input.userIds.filter((v): v is string => typeof v === 'string') : []
    if (ids.length === 0) return invalid()
    const title = typeof input.title === 'string' ? input.title.slice(0, 120) : null
    const { data, error } = await supabase.rpc('chat_create_group', { p_title: title, p_members: ids })
    if (error) return rpcFailure(req, error.message, '[messaging] create group')
    return NextResponse.json({ threadId: data as string })
  }

  return invalid()
}

/**
 * Turns a Postgres error from the membership functions into an HTTP answer.
 *
 * The functions raise named conditions (`anonymous_not_allowed`,
 * `invalid_target`, …) precisely so this mapping does not have to guess from a
 * message string. Anything unrecognised is a 500 and is logged — a caller's
 * mistake and our own failure must not arrive as the same status.
 */
function rpcFailure(req: NextRequest, message: string, tag: string) {
  const locale = requestLocale(req)
  if (message.includes('anonymous_not_allowed')) {
    return NextResponse.json(
      { error: 'forbidden', message: serverMessage('auth.forbidden', locale) },
      { status: 403 },
    )
  }
  if (message.includes('invalid_target') || message.includes('invalid_members') || message.includes('too_many_members')) {
    return NextResponse.json(
      { error: 'invalid_input', message: serverMessage('validation.invalid', locale) },
      { status: 400 },
    )
  }
  console.error(tag, message)
  return NextResponse.json(
    { error: 'server_error', message: serverMessage('server.error', locale) },
    { status: 500 },
  )
}
