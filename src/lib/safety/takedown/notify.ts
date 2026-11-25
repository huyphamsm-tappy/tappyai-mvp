// Telling the people who must act on a takedown request. The channel is the notification system (inbox + device push) to the recipients named in MODERATION_DIGEST_USER_IDS; the backup
// recipients are told too when `escalate` is set. Counts and a due time only: never the agency, the reference, or the content. Best effort: a failure never undoes a request.
import { emitNotification } from '@/lib/notifications/emit'
import { alertRecipients, backupRecipients } from '@/lib/safety/operatorAlert'
import { ESCALATION_PREFIX, newRequestText } from '@/lib/i18n/takedownAlerts'

export interface TakedownAlert { title: string; body: string; escalate?: boolean; data?: Record<string, unknown> }

export async function alertTakedownRecipients(a: TakedownAlert, deps: { recipients?: string[]; backups?: string[]; emit?: typeof emitNotification } = {}): Promise<{ sent: number; escalated: number; recipients: number }> {
  const emit = deps.emit ?? emitNotification
  const recipients = deps.recipients ?? alertRecipients()
  let sent = 0
  let escalated = 0
  for (const userId of recipients) {
    try { if ((await emit({ userId, type: 'system', category: 'system', title: a.title, body: a.body, entityUrl: '/admin/moderation', data: { kind: 'takedown_clock', ...a.data } })).id) sent++ } catch { /* best effort */ }
  }
  if (a.escalate) {
    for (const userId of deps.backups ?? backupRecipients(recipients)) {
      try { if ((await emit({ userId, type: 'system', category: 'system', title: `${ESCALATION_PREFIX}${a.title}`, body: a.body, entityUrl: '/admin/moderation', data: { kind: 'takedown_clock', escalation: true, ...a.data } })).id) escalated++ } catch { /* best effort */ }
    }
  }
  if (recipients.length > 0 && sent === 0) console.error('[takedown] no alert delivered to', recipients.length, 'recipient(s)')
  return { sent, escalated, recipients: recipients.length }
}

/** The alert for a request that was just recorded. */
export function newRequestAlert(urgency: string, dueAtIso: string): TakedownAlert {
  const hours = urgency === 'emergency_6h' ? 6 : urgency === 'complaint_48h' ? 48 : 24
  const dueVn = new Date(new Date(dueAtIso).getTime() + 7 * 3_600_000).toISOString().replace('T', ' ').slice(0, 16)
  return { ...newRequestText(urgency, hours, dueVn), escalate: urgency === 'emergency_6h', data: { urgency } }
}
