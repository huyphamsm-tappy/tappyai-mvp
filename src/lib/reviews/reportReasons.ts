// F-031 — the single source of truth for content-report reasons.
//
// The report API (`/api/reviews/[id]/report`) validates the incoming `reason`
// against this list, and the feed UI (`feedShared.tsx`) renders one button per
// entry, keyed to `reviews.reportReason.<reason>` in the i18n table. Keeping the
// list here means the client can never offer a reason the server would 400 on,
// and a missing i18n key is caught by the i18n parity test.
export const REPORT_REASONS = [
  'spam',
  'harassment',
  'inappropriate',
  'copyright',
  'misinformation',
  'violence',
  'other',
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

const REASON_SET: ReadonlySet<string> = new Set(REPORT_REASONS)

export function isReportReason(v: unknown): v is ReportReason {
  return typeof v === 'string' && REASON_SET.has(v)
}

// Reasons the native apps send that the feed list above does not offer (Android: scam, sensitive; iOS: hate, sexual,
// self_harm, scam, impersonation). The comment/user report routes (`user_reports`) accept and STORE them as sent; the
// post report route (`content_reports`, whose reasons stay the canonical seven) maps them onto the nearest canonical one
// so a native client never gets a 400 for a reason its own menu offers.
export const NATIVE_REPORT_REASONS = ['scam', 'sensitive', 'hate', 'sexual', 'self_harm', 'impersonation'] as const
export const USER_REPORT_REASONS: readonly string[] = [...REPORT_REASONS, ...NATIVE_REPORT_REASONS]

const NATIVE_TO_CANONICAL: Record<string, ReportReason> = {
  scam: 'misinformation', sensitive: 'inappropriate', hate: 'harassment', sexual: 'inappropriate', self_harm: 'violence', impersonation: 'other',
}

export function isUserReportReason(v: unknown): v is string {
  return typeof v === 'string' && USER_REPORT_REASONS.includes(v)
}

/** A reason as the post-report route stores it: canonical stays itself, a native one is mapped; anything else → null. */
export function canonicalReportReason(v: unknown): ReportReason | null {
  if (isReportReason(v)) return v
  return typeof v === 'string' && NATIVE_TO_CANONICAL[v] ? NATIVE_TO_CANONICAL[v] : null
}
