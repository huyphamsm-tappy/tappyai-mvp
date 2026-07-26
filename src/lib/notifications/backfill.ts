import type { EmitNotificationInput } from './emit'

// ─── ADR-014 backfill ────────────────────────────────────────────────────────
// One-time seed of the `notifications` table from the pre-existing social
// activity tables, so the Inbox isn't empty at cutover. Owner-approved cap:
// 30 days OR the 100 most recent events per user (whichever is smaller).
// Backfilled rows are pushed-nowhere and land already-read (read_at = created_at)
// so they never inflate the unread badge.

export const BACKFILL_DEFAULT_SINCE_DAYS = 30
export const BACKFILL_DEFAULT_PER_USER_CAP = 100

export interface RawFollow { follower_id: string; following_id: string; created_at: string }
export interface RawLike { user_id: string; review_id: string; created_at: string }
export interface RawComment { user_id: string; review_id: string; body: string; created_at: string }
export interface RawMilestone { review_id: string; milestone: number; created_at: string }
export interface ReviewMeta { user_id: string; place_name: string | null }

export interface BackfillSources {
  follows: RawFollow[]
  likes: RawLike[]
  comments: RawComment[]
  milestones: RawMilestone[]
  /** review_id → { owner user_id, place_name } */
  reviewsById: Map<string, ReviewMeta>
  /** actor user_id → display full_name */
  namesById: Map<string, string | null>
  perUserCap?: number
}

/** Last name-word, matching the live generators' `${name}` derivation. */
function shortName(full: string | null | undefined, fallback: string): string {
  const n = full?.split(' ').pop()?.trim()
  return n && n.length ? n : fallback
}

// A ready-to-insert backfill row. skipPush + read_at = created_at are set here so
// the route just hands each straight to emitNotification.
export type BackfillItem = EmitNotificationInput & { createdAt: string }

/**
 * Pure mapping: raw social rows → per-user-capped, insert-ready notifications,
 * newest first, each capped to `perUserCap` per recipient. Self-events (liking /
 * commenting on your own review) are dropped, mirroring the live generators.
 */
export function buildBackfillItems(sources: BackfillSources): BackfillItem[] {
  const cap = sources.perUserCap ?? BACKFILL_DEFAULT_PER_USER_CAP
  const items: BackfillItem[] = []

  const push = (recipient: string, createdAt: string, rest: Omit<EmitNotificationInput, 'userId' | 'createdAt' | 'readAt' | 'skipPush' | 'data'>) => {
    items.push({ userId: recipient, createdAt, readAt: createdAt, skipPush: true, data: { backfill: true }, ...rest })
  }

  for (const f of sources.follows) {
    const name = shortName(sources.namesById.get(f.follower_id), 'Ai đó')
    push(f.following_id, f.created_at, {
      type: 'follow', category: 'social',
      title: `👤 ${name} đang theo dõi bạn`,
      body: 'Xem trang cá nhân của họ',
      actorId: f.follower_id,
      entityUrl: `/users/${f.follower_id}`,
    })
  }

  for (const l of sources.likes) {
    const review = sources.reviewsById.get(l.review_id)
    if (!review || review.user_id === l.user_id) continue
    const name = shortName(sources.namesById.get(l.user_id), 'Ai đó')
    push(review.user_id, l.created_at, {
      type: 'like', category: 'social',
      title: `❤️ ${name} thích review của bạn`,
      body: review.place_name || 'Xem ngay!',
      actorId: l.user_id,
      entityUrl: `/reviews/${l.review_id}`,
    })
  }

  for (const c of sources.comments) {
    const review = sources.reviewsById.get(c.review_id)
    if (!review || review.user_id === c.user_id) continue
    const name = shortName(sources.namesById.get(c.user_id), 'Ai do')
    push(review.user_id, c.created_at, {
      type: 'comment', category: 'social',
      title: name + ' binh luan review cua ban',
      body: '"' + c.body.slice(0, 60) + (c.body.length > 60 ? '...' : '') + '"',
      actorId: c.user_id,
      entityUrl: '/reviews/' + c.review_id,
    })
  }

  for (const m of sources.milestones) {
    const review = sources.reviewsById.get(m.review_id)
    if (!review) continue
    push(review.user_id, m.created_at, {
      type: 'milestone', category: 'social',
      title: `🎉 ${m.milestone} người đã thích bài của bạn!`,
      body: review.place_name || 'Xem ngay',
      entityUrl: `/reviews/${m.review_id}`,
    })
  }

  // Newest first, then cap per recipient.
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const perUser = new Map<string, number>()
  const capped: BackfillItem[] = []
  for (const it of items) {
    const n = perUser.get(it.userId) ?? 0
    if (n >= cap) continue
    perUser.set(it.userId, n + 1)
    capped.push(it)
  }
  return capped
}
