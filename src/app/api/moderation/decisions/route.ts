import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'
import { withinAppealWindow } from '@/lib/safety/moderationDecisions'

// GET /api/moderation/decisions — the violation notices of the CALLER (what was decided about their own content), so they can read
// them and appeal. Behind MODERATION_ADMIN_ENABLED (404 off). Works for a restricted (suspended) account — that is the point.
// Never returned: the reviewer, the reporter, other people's decisions, the reviewer's internal reason, a "no violation" outcome.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!moderationAdminEnabled()) return new NextResponse(null, { status: 404 })
  const locale = requestLocale(req)
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  if (!rateLimit(`mod-decisions:${user.id}`, 60, 60_000).ok) return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', locale) }, { status: 429 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('moderation_decisions')
    .select('id, created_at, rule_group, feature, severity, outcome, restrict_days, content_type, strike_expires_at')
    .eq('subject_user_id', user.id).neq('outcome', 'no_violation').order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: 'load_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  const rows = (data ?? []) as Array<{ id: string; created_at: string }>
  const appeals = rows.length
    ? await admin.from('moderation_appeals').select('decision_id, status, created_at').in('decision_id', rows.map((r) => r.id))
    : { data: [], error: null }
  if (appeals.error) return NextResponse.json({ error: 'load_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  const byDecision = new Map(((appeals.data ?? []) as Array<{ decision_id: string; status: string; created_at: string }>).map((a) => [a.decision_id, a]))
  const decisions = rows.map((r) => {
    const a = byDecision.get(r.id)
    return { ...r, appeal: a ? { status: a.status, created_at: a.created_at } : null, can_appeal: !a && withinAppealWindow(r.created_at) }
  })
  return NextResponse.json({ decisions })
}
