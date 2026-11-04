'use client'

// WEB-ONLY Phase 8 / WP-06 — the browser client of the user-safety routes that already exist in this line. Thin: every rule (flags, rate limit,
// anonymous refusal, visibility, who may report what) lives on the server. Reports go to the PER-TARGET routes the Android and iOS apps already
// call; there is no `/api/reports` endpoint and this file must not invent one.
//
//   review   POST /api/reviews/{id}/report           always on; body { reason }                   (content_reports)
//   comment  POST /api/comments/{id}/report          REPORTS_ENABLED; body { reason, note? }      (user_reports)
//   user     POST /api/users/{id}/report             REPORTS_ENABLED; body { reason, note? }      (user_reports)
//   message  POST /api/messaging/messages/{id}/report  REPORTS_ENABLED; body { reason, note? }    (user_reports, target_type 'message')
//   block    POST|DELETE /api/users/{id}/block       USER_BLOCKS_ENABLED
//   list     GET /api/users/blocks                   USER_BLOCKS_ENABLED

export type ReportTarget = 'review' | 'comment' | 'user' | 'message'

/**
 * What the menu offers. Every entry is accepted by all three routes: the comment/user routes accept the canonical seven plus the native extras,
 * and the review route maps a native extra (scam, hate, sexual, self_harm, impersonation) onto the nearest canonical reason instead of a 400.
 * A test pins this against `src/lib/reviews/reportReasons.ts`, so the client can never offer a reason a route refuses.
 */
export const REPORT_REASONS = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'scam', 'misinformation', 'impersonation', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

/** The comment/user routes cap the note at 300 characters; the client says so instead of silently truncating on the server. */
export const REPORT_NOTE_MAX = 300

const REPORT_URL: Record<ReportTarget, (id: string) => string> = {
  review: (id) => `/api/reviews/${encodeURIComponent(id)}/report`,
  comment: (id) => `/api/comments/${encodeURIComponent(id)}/report`,
  user: (id) => `/api/users/${encodeURIComponent(id)}/report`,
  message: (id) => `/api/messaging/messages/${encodeURIComponent(id)}/report`,
}

export type SafetyOutcome = 'ok' | 'already' | 'rate_limited' | 'login' | 'failed'

export async function sendReport(target: ReportTarget, targetId: string, reason: ReportReason, details?: string): Promise<SafetyOutcome> {
  try {
    const note = details?.trim().slice(0, REPORT_NOTE_MAX)
    const res = await fetch(REPORT_URL[target](targetId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, ...(note ? { note } : {}) }),
    })
    if (res.status === 401 || res.status === 403) return 'login'
    if (res.status === 429) return 'rate_limited'
    if (!res.ok) return 'failed'
    const body = await res.json().catch(() => null)
    return body && body.alreadyReported === true ? 'already' : 'ok'
  } catch {
    return 'failed'
  }
}

export async function setBlocked(userId: string, blocked: boolean): Promise<SafetyOutcome> {
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}/block`, { method: blocked ? 'POST' : 'DELETE' })
    if (res.status === 401 || res.status === 403) return 'login'
    return res.ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

let blockList: Promise<Set<string>> | null = null

/** The caller's own block list, fetched once per page and kept current locally on (un)block. A failure is an empty list, never an error. */
export function myBlocks(): Promise<Set<string>> {
  blockList ??= fetch('/api/users/blocks')
    .then((r) => (r.ok ? r.json() : { blocks: [] }))
    .then((b: { blocks?: { blocked_id: string }[] }) => new Set((b.blocks ?? []).map((x) => x.blocked_id)))
    .catch(() => new Set<string>())
  return blockList
}

export async function rememberBlock(userId: string, blocked: boolean): Promise<void> {
  const set = await myBlocks()
  if (blocked) set.add(userId)
  else set.delete(userId)
}

/** Test seam. */
export function __resetSafetyClient(): void {
  blockList = null
}
