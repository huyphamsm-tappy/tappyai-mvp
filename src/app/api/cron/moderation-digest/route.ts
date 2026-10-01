import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { emitNotification } from '@/lib/notifications/emit'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'
import { isOverdue, digestNotice } from '@/lib/safety/moderationDecisions'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

// GET /api/cron/moderation-digest — the daily summary of the moderation queue for the reviewers (owner 02/10).
// Behind MODERATION_ADMIN_ENABLED (404 off) and the CRON secret. NOT scheduled in vercel.json yet: the schedule line is listed in
// docs/uat/ENV-RELEASE-CHECKLIST.md (Part B) for the owner to add.
//
// CHANNEL: there is no outbound e-mail channel in the product today, so the summary goes through the notification system (inbox +
// device push) to the reviewers named in MODERATION_DIGEST_USER_IDS (comma-separated user ids). An e-mail to support@tappyai.com needs a
// mail provider (Brevo) wired first — backlog. Counts only: never a report, a reporter or content.

export async function GET(req: Request) {
  if (!moderationAdminEnabled()) return new NextResponse(null, { status: 404 })
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const recipients = (process.env.MODERATION_DIGEST_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const admin = createAdminClient()
  const now = new Date()
  const { data, error } = await admin.from('moderation_queue').select('priority, created_at').in('status', ['pending', 'in_review']).limit(5000)
  if (error) return NextResponse.json({ error: 'read_failed' }, { status: 500 })
  const open = (data ?? []) as Array<{ priority: number; created_at: string }>
  const dayAgo = now.getTime() - 86_400_000
  const counts = {
    open: open.length,
    new_24h: open.filter((r) => new Date(r.created_at).getTime() > dayAgo).length,
    urgent: open.filter((r) => r.priority >= 3).length,
    overdue: open.filter((r) => isOverdue(r.priority, r.created_at, now)).length,
  }
  // Nothing waiting and nothing new: stay quiet (no daily noise).
  if (counts.open === 0) return NextResponse.json({ ok: true, sent: 0, counts })

  const note = digestNotice(counts)
  let sent = 0
  for (const userId of recipients) {
    const r = await emitNotification({ userId, type: 'system', category: 'system', title: note.title, body: note.body, entityUrl: '/admin/moderation', data: { kind: 'moderation_digest', ...counts } })
    if (r.id) sent++
  }
  return NextResponse.json({ ok: true, sent, recipients: recipients.length, counts })
}
