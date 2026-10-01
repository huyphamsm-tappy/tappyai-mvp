import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { moderationAdminEnabled, UUID_RE } from '@/lib/safety/userBlocks'
import { withinAppealWindow } from '@/lib/safety/moderationDecisions'

// POST /api/moderation/decisions/{id}/appeal — appeal ONE decision about the caller's own content, once, within the window.
// Body {message} (10–1000 chars). Behind MODERATION_ADMIN_ENABLED (404 off). A restricted account may appeal (it can sign in);
// a locked account cannot sign in and appeals by email — the reviewer records that one (admin route, source "email").
//
// No oracle: a decision that is not the caller's answers exactly like one that does not exist (404).

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!moderationAdminEnabled()) return new NextResponse(null, { status: 404 })
  const locale = requestLocale(req)
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })
  if (!rateLimit(`mod-appeal:${user.id}`, 5, 600_000).ok) return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', locale) }, { status: 429 })

  let message = ''
  try { const b = await req.json(); message = typeof b?.message === 'string' ? b.message.trim() : '' } catch { /* invalid below */ }
  if (message.length < 10 || message.length > 1000) return NextResponse.json({ error: 'invalid_message', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('moderation_decisions').select('id, created_at, outcome, subject_user_id').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'appeal_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  const d = data as { id: string; created_at: string; outcome: string; subject_user_id: string | null } | null
  if (!d || d.subject_user_id !== user.id || d.outcome === 'no_violation') return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })
  if (!withinAppealWindow(d.created_at)) return NextResponse.json({ error: 'appeal_window_closed', message: serverMessage('validation.invalid', locale) }, { status: 409 })

  const ins = await admin.from('moderation_appeals').insert({ decision_id: d.id, appellant_id: user.id, message, source: 'app' })
  if (ins.error) {
    if ((ins.error as { code?: string }).code === '23505') return NextResponse.json({ error: 'already_appealed', message: serverMessage('validation.invalid', locale) }, { status: 409 })
    console.error('[moderation][appeal]', (ins.error as { code?: string }).code ?? 'error')
    return NextResponse.json({ error: 'appeal_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  }
  return NextResponse.json({ ok: true, status: 'pending' })
}
