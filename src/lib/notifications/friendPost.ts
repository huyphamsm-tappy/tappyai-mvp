import type { SupabaseClient } from '@supabase/supabase-js'
import { emitNotification } from '@/lib/notifications/emit'
import { blockedPeers } from '@/lib/safety/userBlocks'

/**
 * "A person you follow posted" — one in-app notification (and push, per the person's own push settings) for each follower of a NEW, PUBLIC post or clip.
 *
 * Rules (owner request 21/11/2026, found missing by a real UAT run):
 *  - only a post that is public right now (the caller passes it only when publication_state is PUBLISHED or the gate is off);
 *    a post held for review notifies nobody, and a post released later does not notify (v1: stated, not hidden);
 *  - never to a person who blocked the author or whom the author blocked, in either direction;
 *  - at most MAX_RECIPIENTS people per post (newest followers first), so one post can never fan out into a flood;
 *  - never throws and never delays the post for long: the whole fan-out is capped by `budgetMs`;
 *  - switch off with FRIEND_POST_NOTIFICATIONS_ENABLED=false.
 */
export const MAX_RECIPIENTS = 200
const BUDGET_MS = 4000

export function friendPostNotificationsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FRIEND_POST_NOTIFICATIONS_ENABLED?.trim().toLowerCase() !== 'false'
}

export interface FriendPostInput {
  admin: SupabaseClient
  authorId: string
  reviewId: string
  contentType: string | null | undefined
  body?: string | null
  placeName?: string | null
  /** Test seam. */
  budgetMs?: number
  emit?: typeof emitNotification
}

/** Returns how many people were notified (0 when off, nobody follows, or anything failed). */
export async function notifyFollowersOfPost(input: FriendPostInput): Promise<number> {
  if (!friendPostNotificationsEnabled()) return 0
  const emit = input.emit ?? emitNotification
  try {
    const work = (async () => {
      const { data: rows, error } = await input.admin
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', input.authorId)
        .order('created_at', { ascending: false })
        .limit(MAX_RECIPIENTS)
      if (error || !rows?.length) return 0
      const ids = (rows as Array<{ follower_id: string }>).map((r) => r.follower_id).filter((id) => id && id !== input.authorId)
      if (!ids.length) return 0
      const blocked = await blockedPeers(input.admin, input.authorId, ids)
      const recipients = ids.filter((id) => !blocked.has(id))
      if (!recipients.length) return 0

      const { data: prof } = await input.admin.from('profiles').select('full_name').eq('id', input.authorId).maybeSingle()
      const name = (prof as { full_name?: string | null } | null)?.full_name?.trim().split(/\s+/).pop() || 'Một người bạn theo dõi'
      const isVideo = input.contentType === 'video'
      const caption = (input.body || input.placeName || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      const results = await Promise.allSettled(recipients.map((userId) => emit({
        userId,
        type: 'friend_post',
        category: 'social',
        title: isVideo ? `🎬 ${name} vừa đăng clip mới` : `📸 ${name} vừa đăng bài mới`,
        body: caption || 'Xem ngay!',
        actorId: input.authorId,
        entityUrl: `/reviews/${input.reviewId}`,
      })))
      return results.filter((r) => r.status === 'fulfilled').length
    })()
    const timeout = new Promise<number>((resolve) => setTimeout(() => resolve(0), input.budgetMs ?? BUDGET_MS))
    return await Promise.race([work, timeout])
  } catch {
    return 0
  }
}
