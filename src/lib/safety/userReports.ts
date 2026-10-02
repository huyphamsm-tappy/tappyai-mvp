import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { isUserReportReason } from '@/lib/reviews/reportReasons'
import { UUID_RE, reportsEnabled } from '@/lib/safety/userBlocks'

// Reports of comments and users (owner 01/10; migration 20261001b_user_reports.sql). Same contract as the post report
// (POST /api/reviews/{id}/report): body {reason}, 200 {ok, reported, alreadyReported?}, 400 invalid_reason, 401, 403 anonymous.
// Added: optional `note` (<=300 chars), 429 at 10 per 10 minutes per account, 404 empty body while REPORTS_ENABLED is off.
//
// No existence oracle: a target that does not exist (or that the caller cannot see) answers exactly like success and
// writes nothing. The only distinguishable refusal is reporting yourself (400) — your own id/comment is yours to know.

export type ReportTarget = 'comment' | 'user'

export async function handleReport(req: NextRequest, targetType: ReportTarget, targetId: string): Promise<NextResponse> {
  if (!reportsEnabled()) return new NextResponse(null, { status: 404 })
  const locale = requestLocale(req)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let reason = ''
  let note: string | null = null
  try {
    const b = await req.json()
    reason = typeof b?.reason === 'string' ? b.reason.trim() : ''
    const raw = typeof b?.note === 'string' ? b.note : typeof b?.details === 'string' ? b.details : '' // iOS sends "details"
    if (raw.trim()) note = raw.trim().slice(0, 300)
  } catch { /* invalid below */ }
  if (!isUserReportReason(reason) || !UUID_RE.test(targetId)) {
    return NextResponse.json({ error: 'invalid_reason', message: serverMessage('validation.invalid', locale) }, { status: 400 })
  }
  if (targetType === 'user' && targetId === user.id) {
    return NextResponse.json({ error: 'invalid_target', message: serverMessage('validation.invalid', locale) }, { status: 400 })
  }
  if (!rateLimit(`user-report:${user.id}`, 10, 600_000).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', locale) }, { status: 429 })
  }
  const done = () => NextResponse.json({ ok: true, reported: true })

  // Does the target exist (and, for a comment, can the caller see it)? Not telling: a miss is a silent success.
  if (targetType === 'comment') {
    const { data, error } = await supabase.from('review_comments').select('id, user_id').eq('id', targetId).maybeSingle()
    if (error) return NextResponse.json({ error: 'report_failed', message: serverMessage('server.error', locale) }, { status: 500 })
    if (!data) return done()
    if ((data as { user_id: string }).user_id === user.id) {
      return NextResponse.json({ error: 'invalid_target', message: serverMessage('validation.invalid', locale) }, { status: 400 })
    }
  } else {
    const { data, error } = await createAdminClient().from('profiles').select('id').eq('id', targetId).maybeSingle()
    if (error) return NextResponse.json({ error: 'report_failed', message: serverMessage('server.error', locale) }, { status: 500 })
    if (!data) return done()
  }

  // The service role writes (no client role has INSERT on user_reports): the checks above are the authority. A PERSISTENT limit too —
  // the in-memory one is per serverless instance — 10 reports per 10 minutes per account, counted in the table.
  const writer = createAdminClient()
  const since = new Date(Date.now() - 600_000).toISOString()
  const recent = await writer.from('user_reports').select('id', { count: 'exact', head: true }).eq('reporter_id', user.id).gte('created_at', since)
  if (recent.error) return NextResponse.json({ error: 'report_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  if ((recent.count ?? 0) >= 10) return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', locale) }, { status: 429 })
  const { error } = await writer.from('user_reports').insert({ reporter_id: user.id, target_type: targetType, target_id: targetId, reason, note })
  if (error) {
    const code = (error as { code?: string }).code
    if (code === '23505') return NextResponse.json({ ok: true, reported: true, alreadyReported: true })
    console.error('[user-report]', targetType, code ?? 'error')
    return NextResponse.json({ error: 'report_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  }
  return done()
}
