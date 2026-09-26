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
