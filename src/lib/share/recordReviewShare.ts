import type { ShareTargetId } from '@/lib/share/shareTargets'

/**
 * Persist one completed share of a review — the self profile's "Đã share" history
 * (`POST /api/reviews/[id]/share`, 2026-09-15).
 *
 * Called by the review share sheets from `ShareMenu`'s `onShared`, i.e. only after the share
 * COMPLETED. Fire-and-forget on purpose: the share already happened in the user's hands, and a
 * history write that fails (offline, anonymous session → 403) must never turn a successful share
 * into an error toast. It resolves to whether the record landed, for callers that care.
 */
export async function recordReviewShare(reviewId: string, channel: ShareTargetId | string): Promise<boolean> {
  try {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    })
    return res.ok
  } catch {
    return false
  }
}
