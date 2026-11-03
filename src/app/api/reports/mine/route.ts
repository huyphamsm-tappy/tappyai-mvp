import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { reportsEnabled } from '@/lib/safety/userBlocks'
import { reporterStatus, type ReporterStatus } from '@/lib/safety/moderationDecisions'

// GET /api/reports/mine — the status of the reports the CALLER filed (posts/clips, comments, users). Behind REPORTS_ENABLED (404 off).
//
// A reporter learns exactly one of: received · in_review · actioned · no_violation. Never what the decision was, never who the
// reviewer was, never who the target is beyond the id they already reported. The target ids also let a client hide those items
// for the reporter themselves (a report hides nothing for anybody else). Nobody can read another person's reports: the caller
// is always the filter, whatever the query string says.

export const dynamic = 'force-dynamic'

interface Row { id: string; target_type: 'review' | 'comment' | 'user'; target_id: string; reason: string; created_at: string; status: ReporterStatus }

export async function GET(req: NextRequest) {
  if (!reportsEnabled()) return new NextResponse(null, { status: 404 })
  const locale = requestLocale(req)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal
  if (!rateLimit(`reports-mine:${user.id}`, 60, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', locale) }, { status: 429 })
  }
  const fail = () => NextResponse.json({ error: 'load_failed', message: serverMessage('server.error', locale) }, { status: 500 })

  // Comment / user reports: the caller's own rows (RLS own-row), then the queue (service role) by source id.
  const own = await supabase.from('user_reports').select('id, target_type, target_id, reason, created_at').order('created_at', { ascending: false }).limit(200)
  if (own.error) return fail()
  const admin = createAdminClient()
  const sourceHash = createHash('sha256').update(`content_report:${user.id}`).digest('hex')
  const post = await admin.from('content_reports').select('id, content_id, reason, created_at').eq('reporter_source_id', sourceHash).order('created_at', { ascending: false }).limit(200)
  if (post.error) return fail()

  const ownRows = (own.data ?? []) as Array<{ id: string; target_type: 'comment' | 'user'; target_id: string; reason: string; created_at: string }>
  const postRows = (post.data ?? []) as Array<{ id: string; content_id: string; reason: string; created_at: string }>
  const status = new Map<string, string>()
  for (const [table, ids] of [['user_reports', ownRows.map((r) => r.id)], ['content_reports', postRows.map((r) => r.id)]] as const) {
    if (ids.length === 0) continue
    const q = await admin.from('moderation_queue').select('status, metadata').filter('metadata->>source_table', 'eq', table).in('metadata->>source_id', ids)
    if (q.error) return fail()
    for (const r of (q.data ?? []) as Array<{ status: string; metadata: { source_id?: string } | null }>) if (r.metadata?.source_id) status.set(`${table}:${r.metadata.source_id}`, r.status)
  }

  const reports: Row[] = [
    ...ownRows.map((r) => ({ id: r.id, target_type: r.target_type, target_id: r.target_id, reason: r.reason, created_at: r.created_at, status: reporterStatus(status.get(`user_reports:${r.id}`)) })),
    ...postRows.map((r) => ({ id: r.id, target_type: 'review' as const, target_id: r.content_id, reason: r.reason, created_at: r.created_at, status: reporterStatus(status.get(`content_reports:${r.id}`)) })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 200)
  return NextResponse.json({ reports })
}
