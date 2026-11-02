import type { SupabaseClient } from '@supabase/supabase-js'
import { LADDER, RULE_GROUPS, type Feature, type LedgerOutcome, type RuleGroupId } from '@/lib/safety/communityRules'

// ── Moderation decisions — the server-side pieces (owner 01/10; migration 20261001d) ───────────────────────────────────
// Everything here reads with the SERVICE ROLE: the ledger, the appeals and the queue have no client access at all.
// Nothing here decides anything. The reviewer decides; these functions look things up, count, and word the notice.

export interface ActiveStrike { id: string; rule_group: RuleGroupId; feature: Feature; severity: number; strike_expires_at: string | null }

/** A person's strikes that still count: unexpired, and not reversed by an upheld appeal (an appeal won = the strike is gone). */
export async function activeStrikes(admin: SupabaseClient, userId: string, now: Date = new Date()): Promise<ActiveStrike[]> {
  const { data, error } = await admin.from('moderation_decisions')
    .select('id, rule_group, feature, severity, strike_expires_at')
    .eq('subject_user_id', userId).eq('strike', true)
  if (error) throw new Error('strikes_read_failed')
  const live = ((data ?? []) as ActiveStrike[]).filter((r) => !r.strike_expires_at || new Date(r.strike_expires_at).getTime() > now.getTime())
  if (live.length === 0) return []
  const { data: won, error: e2 } = await admin.from('moderation_appeals').select('decision_id').in('decision_id', live.map((r) => r.id)).eq('status', 'reversed')
  if (e2) throw new Error('strikes_read_failed')
  const reversed = new Set(((won ?? []) as Array<{ decision_id: string }>).map((r) => r.decision_id))
  return live.filter((r) => !reversed.has(r.id))
}

export const strikeCounts = (strikes: readonly ActiveStrike[], group: RuleGroupId, feature: Feature) => ({
  strikesTotal: strikes.length,
  strikesSameGroupFeature: strikes.filter((s) => s.rule_group === group && s.feature === feature).length,
})

export type TargetKind = 'review' | 'comment' | 'user'
export interface ResolvedTarget {
  kind: TargetKind
  /** The person the decision is about (the author of the content, or the reported user). */
  subjectId: string | null
  feature: Feature
  exists: boolean
  /** Context for the reviewer (short; the body of a comment is shown to staff only, never put in a notification). */
  context: { summary: string; reviewId?: string; body?: string; createdAt?: string; parentCommentId?: string | null } | null
}

export async function resolveTarget(admin: SupabaseClient, targetType: string, targetId: string): Promise<ResolvedTarget> {
  if (targetType === 'comment') {
    const { data } = await admin.from('review_comments').select('id, review_id, user_id, body, created_at, parent_comment_id').eq('id', targetId).maybeSingle()
    const c = data as { review_id: string; user_id: string; body: string; created_at: string; parent_comment_id: string | null } | null
    return { kind: 'comment', subjectId: c?.user_id ?? null, feature: 'comment', exists: !!c, context: c ? { summary: c.body.slice(0, 500), reviewId: c.review_id, body: c.body, createdAt: c.created_at, parentCommentId: c.parent_comment_id } : null }
  }
  if (targetType === 'review') {
    const { data } = await admin.from('reviews').select('id, user_id, place_name').eq('id', targetId).maybeSingle()
    const r = data as { user_id: string; place_name: string | null } | null
    return { kind: 'review', subjectId: r?.user_id ?? null, feature: 'post', exists: !!r, context: r ? { summary: r.place_name ?? '' } : null }
  }
  const { data } = await admin.from('profiles').select('id, username').eq('id', targetId).maybeSingle()
  const p = data as { id: string; username: string | null } | null
  return { kind: 'user', subjectId: p?.id ?? null, feature: 'profile', exists: !!p, context: p ? { summary: p.username ?? '' } : null }
}

/** How trustworthy a reporter's history is, for the reviewer: how many reports, how many were rejected. */
export async function reporterTrust(admin: SupabaseClient, reporterId: string | null): Promise<{ total: number; dismissed: number; lowTrust: boolean } | null> {
  if (!reporterId) return null
  const { data, error } = await admin.from('moderation_queue').select('status').eq('reported_by', reporterId).filter('metadata->>source_table', 'eq', 'user_reports').limit(500)
  if (error) return null
  const rows = (data ?? []) as Array<{ status: string }>
  const dismissed = rows.filter((r) => r.status === 'dismissed').length
  return { total: rows.length, dismissed, lowTrust: rows.length >= LADDER.lowTrustMinReports && dismissed / rows.length >= LADDER.lowTrustDismissedShare }
}

/** What the REPORTER sees. Never the decision's details, never who the reviewer was. */
export type ReporterStatus = 'received' | 'in_review' | 'actioned' | 'no_violation'
export function reporterStatus(queueStatus: string | null | undefined): ReporterStatus {
  switch (queueStatus) {
    case 'in_review': return 'in_review'
    case 'resolved': return 'actioned'
    case 'dismissed': return 'no_violation'
    default: return 'received'
  }
}

export const withinAppealWindow = (createdAt: string, now: Date = new Date()): boolean =>
  now.getTime() - new Date(createdAt).getTime() <= LADDER.appealWindowDays * 86_400_000

/**
 * Apple Guideline 1.2: objectionable-content reports are acted on within 24 hours. EVERY report is therefore tracked at 24 h, whatever its
 * priority — the priority only decides the ORDER of the queue. (The reporter picks the reason that sets the priority; a serious report
 * filed under a routine reason must not get a longer clock.)
 */
export const REPORT_TARGET_HOURS = 24

/** A report older than the 24 h target. `priority` is kept in the signature for the callers; it no longer changes the clock. */
export function isOverdue(_priority: number, createdAt: string, now: Date = new Date()): boolean {
  const hours = (now.getTime() - new Date(createdAt).getTime()) / 3_600_000
  return hours > REPORT_TARGET_HOURS
}

/**
 * Escalation lead: the digest runs twice a day (every 12 h), so a report that will be overdue BEFORE the next run must be raised
 * NOW. At risk = past (target − 12 h) and not yet overdue.
 */
export const ESCALATION_LEAD_HOURS = 12
export function isAtRisk(_priority: number, createdAt: string, now: Date = new Date()): boolean {
  const hours = (now.getTime() - new Date(createdAt).getTime()) / 3_600_000
  return hours > REPORT_TARGET_HOURS - ESCALATION_LEAD_HOURS && hours <= REPORT_TARGET_HOURS
}

export const penaltyText = (outcome: LedgerOutcome, restrictDays: number | null, lang: 'vi' | 'en'): string => {
  if (lang === 'vi') {
    return { no_violation: 'Không vi phạm', warning: 'Cảnh cáo (không ảnh hưởng tài khoản)', content_removed: 'Nội dung bị gỡ và 1 strike',
      restricted: `Hạn chế đăng bài và bình luận ${restrictDays ?? ''} ngày (vẫn xem được)`.replace('  ', ' '), banned: 'Khoá tài khoản' }[outcome]
  }
  return { no_violation: 'No violation', warning: 'Warning (no effect on your account)', content_removed: 'Content removed and 1 strike',
    restricted: `Posting and commenting restricted for ${restrictDays ?? ''} days (you can still read)`.replace('  ', ' '), banned: 'Account locked' }[outcome]
}

export interface NoticeInput {
  decisionId: string
  ruleGroup: RuleGroupId
  outcome: LedgerOutcome
  restrictDays: number | null
  contentType: string | null
  strikeExpiresAt: string | null
}
const GROUP_NAME: Record<RuleGroupId, { vi: string; en: string }> = {
  spam: { vi: 'Spam', en: 'Spam' },
  harassment: { vi: 'Quấy rối và bắt nạt', en: 'Harassment and bullying' },
  hate: { vi: 'Thù ghét', en: 'Hate' },
  sexual: { vi: 'Nội dung nhạy cảm / tình dục', en: 'Sensitive / sexual content' },
  violence_selfharm: { vi: 'Bạo lực và tự hại', en: 'Violence and self-harm' },
  scam_misinfo: { vi: 'Lừa đảo và thông tin sai gây hại', en: 'Scams and harmful misinformation' },
  impersonation: { vi: 'Mạo danh', en: 'Impersonation' },
  ip_privacy: { vi: 'Bản quyền và quyền riêng tư', en: 'Copyright and privacy' },
  illegal_goods: { vi: 'Hàng / dịch vụ trái pháp luật', en: 'Illegal goods or services' },
  child_safety: { vi: 'An toàn trẻ em', en: 'Child safety' },
}
const CONTENT_NAME: Record<string, { vi: string; en: string }> = { review: { vi: 'bài viết', en: 'post' }, comment: { vi: 'bình luận', en: 'comment' }, user: { vi: 'hồ sơ', en: 'profile' } }

/** The notice the sanctioned person receives: what, which rule, the penalty, until when, how to appeal. Never the other party, never the reporter. */
export function noticeFor(n: NoticeInput): { title: string; body: string; entityUrl: string } {
  const g = GROUP_NAME[n.ruleGroup]
  const c = CONTENT_NAME[n.contentType ?? ''] ?? { vi: 'nội dung', en: 'content' }
  const until = n.strikeExpiresAt ? new Date(n.strikeExpiresAt).toISOString().slice(0, 10) : null
  const viEnd = n.outcome === 'banned' ? '' : n.outcome === 'restricted' ? ` Hạn chế kéo dài ${n.restrictDays} ngày.` : until ? ` Strike hết hạn ngày ${until}.` : ''
  const enEnd = n.outcome === 'banned' ? '' : n.outcome === 'restricted' ? ` The restriction lasts ${n.restrictDays} days.` : until ? ` The strike expires on ${until}.` : ''
  const body =
    `Mình đã xem xét ${c.vi} của bạn: vi phạm Quy tắc cộng đồng, nhóm «${g.vi}». Hình phạt: ${penaltyText(n.outcome, n.restrictDays, 'vi')}.${viEnd} ` +
    `Nếu bạn cho rằng đây là nhầm lẫn, bạn có thể kháng nghị một lần trong ${LADDER.appealWindowDays} ngày ở mục Thông báo vi phạm, hoặc gửi email support@tappyai.com.\n` +
    `We reviewed your ${c.en}: it breaks the Community Guidelines, group “${g.en}”. Penalty: ${penaltyText(n.outcome, n.restrictDays, 'en')}.${enEnd} ` +
    `If you think this is a mistake you can appeal once within ${LADDER.appealWindowDays} days from Violation notices, or email support@tappyai.com.`
  return { title: 'Thông báo về nội dung của bạn · Notice about your content', body, entityUrl: `/profile/notices?d=${n.decisionId}` }
}

export const GROUP_PRIORITY = (g: RuleGroupId) => RULE_GROUPS[g].priority

export interface DigestCounts { open: number; new_24h: number; urgent: number; overdue: number; at_risk: number }
/** The daily summary for the reviewers: counts only, never a report, a reporter or content. */
export function digestNotice(c: DigestCounts): { title: string; body: string } {
  return {
    title: c.overdue > 0 ? 'Có báo cáo quá hạn · Overdue reports'
      : c.at_risk > 0 ? 'Báo cáo sắp quá hạn · Reports nearly due' : 'Hàng chờ kiểm duyệt · Moderation queue',
    body: `Hàng chờ kiểm duyệt: ${c.open} đang chờ, ${c.new_24h} mới trong 24 giờ, ${c.urgent} khẩn, ${c.at_risk} sắp quá hạn, ${c.overdue} quá hạn. Mở /admin/moderation.
Moderation queue: ${c.open} waiting, ${c.new_24h} new in 24 h, ${c.urgent} urgent, ${c.at_risk} nearly due, ${c.overdue} overdue. Open /admin/moderation.`,
  }
}
