import { createAdminClient } from '@/lib/supabase/admin'
import { emitNotification, type EmitNotificationInput } from '@/lib/notifications/emit'

// ── Operator alerts (App Review 1.2, 11/10 remediation) ─────────────────────────────────────────────────────────────
//
// Apple asks that a report — and a block — reach the developer, and that reports are acted on within 24 hours. The daily
// digest (`/api/cron/moderation-digest`) alone can leave a report unseen for a day, so each NEW report and each NEW block
// also pings the reviewers through the notification system that already exists (inbox + device push): no new provider.
//
// 🚨 CONTENT-FREE. The alert says that something is waiting and where to look (/admin/moderation). It never carries a report,
//    a reporter, a reported account, a block pair or any content — the queue is the only place those are read.
// 🚨 BEST EFFORT. It runs after the report / block is already stored and never throws: a failed alert must not turn a stored
//    report into an error for the person who filed it. A failure is logged (visible in the function logs) and the digest and
//    the queue still hold the report.
// 🚨 INERT UNTIL CONFIGURED. With no recipients it does nothing, so shipping this changes no behaviour until the owner names
//    the reviewers (`MODERATION_ALERT_USER_IDS`, falling back to the digest's `MODERATION_DIGEST_USER_IDS`).
// THROTTLED. At most one alert of each kind per recipient per 15 minutes, so a flood of reports does not become a flood of
//    pushes; the queue and the digest carry the rest.

export type OperatorAlertKind = 'report' | 'block'

export const ALERT_WINDOW_MS = 15 * 60_000

export function alertRecipients(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.MODERATION_ALERT_USER_IDS || env.MODERATION_DIGEST_USER_IDS || ''
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))]
}

export function alertNotice(kind: OperatorAlertKind): { title: string; body: string } {
  if (kind === 'block') {
    return {
      title: 'Có người dùng vừa chặn một tài khoản · A user blocked an account',
      body: 'Một người dùng vừa chặn một tài khoản (có thể là dấu hiệu hành vi lạm dụng). Kiểm tra hàng chờ báo cáo: /admin/moderation.\n' +
        'A user just blocked an account (possibly a sign of abuse). Check the report queue: /admin/moderation.',
    }
  }
  return {
    title: 'Có báo cáo mới · New report',
    body: 'Có một báo cáo mới đang chờ xem xét. Mở /admin/moderation. Mục tiêu xử lý nhóm nghiêm trọng: 24 giờ.\n' +
      'A new report is waiting for review. Open /admin/moderation. Target for severe groups: 24 h.',
  }
}

export interface OperatorAlertDeps {
  recipients?: string[]
  emit?: (input: EmitNotificationInput) => Promise<{ id: string | null }>
  /** Whether this recipient already got an alert of this kind inside the window. A failed read counts as "no". */
  recentlyAlerted?: (userId: string, kind: OperatorAlertKind, sinceIso: string) => Promise<boolean>
  now?: () => number
}

async function defaultRecentlyAlerted(userId: string, kind: OperatorAlertKind, sinceIso: string): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .contains('data', { kind: 'moderation_alert', alert: kind })
    .gte('created_at', sinceIso)
  if (error) return false
  return (count ?? 0) > 0
}

export interface OperatorAlertResult { recipients: number; sent: number; skipped: number; failed: number }

export async function alertModerators(kind: OperatorAlertKind, deps: OperatorAlertDeps = {}): Promise<OperatorAlertResult> {
  const result: OperatorAlertResult = { recipients: 0, sent: 0, skipped: 0, failed: 0 }
  try {
    const recipients = deps.recipients ?? alertRecipients()
    result.recipients = recipients.length
    if (recipients.length === 0) return result
    const emit = deps.emit ?? emitNotification
    const recently = deps.recentlyAlerted ?? defaultRecentlyAlerted
    const since = new Date((deps.now?.() ?? Date.now()) - ALERT_WINDOW_MS).toISOString()
    const note = alertNotice(kind)
    for (const userId of recipients) {
      try {
        if (await recently(userId, kind, since)) { result.skipped++; continue }
        const r = await emit({
          userId, type: 'system', category: 'system', title: note.title, body: note.body,
          entityUrl: '/admin/moderation', data: { kind: 'moderation_alert', alert: kind },
        })
        if (r.id) result.sent++; else result.failed++
      } catch {
        result.failed++
      }
    }
    if (result.sent === 0 && result.skipped === 0) {
      console.error(`[operator-alert] ${kind}: no alert delivered to ${result.recipients} recipient(s)`)
    }
  } catch (e) {
    console.error('[operator-alert] failed:', e instanceof Error ? e.message : e)
  }
  return result
}
