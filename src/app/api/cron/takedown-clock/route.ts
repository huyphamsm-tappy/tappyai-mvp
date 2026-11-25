import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'
import { clockState } from '@/lib/safety/takedown/clock'
import { listOpenTakedowns } from '@/lib/safety/takedown/service'
import { alertTakedownRecipients } from '@/lib/safety/takedown/notify'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

// GET /api/cron/takedown-clock — the watch on the legal clock of open takedown requests (owner 25/11/2026). Behind MODERATION_ADMIN_ENABLED (404 off) and the CRON secret.
// Scheduled four times a day (vercel.json, one entry per run, like the moderation digest: the plan allows one run per day per entry). A new request alerts the recipients AT ONCE when it is recorded;
// this watch is the net under it. Says nothing while every request is comfortably inside its window. When one is AT RISK (half the window gone) or OVERDUE the recipients (MODERATION_DIGEST_USER_IDS)
// are told, and the backup recipients too once something is overdue. Counts only: never the request, the agency, or the content.
export async function GET(req: Request) {
  if (!moderationAdminEnabled()) return new NextResponse(null, { status: 404 })
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rows = await listOpenTakedowns(createAdminClient(), 500)
  if (!rows) return NextResponse.json({ error: 'read_failed' }, { status: 500 })
  const now = new Date()
  const states = rows.map((r) => clockState(r, now).state)
  const counts = { open: rows.length, at_risk: states.filter((s) => s === 'at_risk').length, overdue: states.filter((s) => s === 'overdue').length }
  if (counts.at_risk + counts.overdue === 0) return NextResponse.json({ ok: true, sent: 0, counts })

  const r = await alertTakedownRecipients({
    title: counts.overdue > 0 ? `QUÁ HẠN GỠ BÀI · ${counts.overdue} yêu cầu` : `SẮP QUÁ HẠN GỠ BÀI · ${counts.at_risk} yêu cầu`,
    body: `Yêu cầu gỡ bài đang mở: ${counts.open} (quá hạn ${counts.overdue}, sắp quá hạn ${counts.at_risk}). Vào bàn kiểm duyệt xử lý ngay.`,
    escalate: counts.overdue > 0,
    data: counts,
  })
  return NextResponse.json({ ok: true, ...r, counts })
}
