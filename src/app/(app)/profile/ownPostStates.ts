/**
 * The owner's own posts, split by visibility state (P2b, 2026-09-28).
 *
 * `GET /api/reviews/mine` already returns EVERY post the signed-in user owns — hidden ones and
 * ones the content-safety gate has held — with `is_hidden` and, when the gate has a decision, the
 * author-facing `moderation` payload (`state` is UNDER_REVIEW / PUBLISHED / RESTRICTED; the raw
 * `publication_state` / `safety_state` columns never reach the client). So the three tabs that
 * come from that one route are a pure partition of its rows, done here, with no new endpoint:
 *
 *   · hidden      — `is_hidden === true` (the owner's own choice; wins over a moderation state)
 *   · restricted  — not hidden, and the gate has NOT published it (UNDER_REVIEW or RESTRICTED)
 *   · published   — everything else: what a visitor can actually see on this profile
 *
 * A row with no `moderation` payload predates the gate (or the gate is off) and is readable by
 * the public, exactly as `isPubliclyReadable(null)` says.
 */

export type OwnPostState = 'published' | 'restricted' | 'hidden'

export interface OwnPostRow {
  is_hidden?: boolean | null
  moderation?: { state?: string | null } | null
}

export function ownPostState(row: OwnPostRow): OwnPostState {
  if (row.is_hidden === true) return 'hidden'
  const state = row.moderation?.state
  if (state === 'UNDER_REVIEW' || state === 'RESTRICTED') return 'restricted'
  return 'published'
}

export function postsInState<T extends OwnPostRow>(rows: readonly T[], state: OwnPostState): T[] {
  return rows.filter((r) => ownPostState(r) === state)
}
