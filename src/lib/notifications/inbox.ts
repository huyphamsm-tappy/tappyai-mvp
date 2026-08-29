import type { NotificationDTO } from './contract'

// Client-side Inbox model + grouping. Extracted from reviews/page.tsx so the pure
// logic (mapping the v1 contract, grouping, time-sectioning) is unit-tested.

export interface InboxNotif {
  id: string
  type: string
  category: string
  actor_id: string
  actor_name: string
  actor_avatar: string | null
  title: string
  text: string
  url: string
  created_at: string
  read_at: string | null
}

export interface GroupedNotif {
  id: string
  type: string
  category: string
  url: string
  actors: { name: string; avatar: string | null; id: string }[]
  title: string
  text: string
  comment_body?: string
  created_at: string
  count: number
}

export const NOTIF_COLOR: Record<string, string> = {
  like: '#ff6b35', follow: '#1D9E75', profile_view: '#534AB7', comment: '#378ADD',
}

/**
 * The official TappyAI mark on a platform-originated notification row.
 *
 * The SAME asset Web Push already uses — `dispatchWebPush` in `send.ts` sets it
 * as both `icon` and `badge`, and `public/push-sw.js` repeats it as its own
 * fallback. A notification and its inbox entry are the same message, so they
 * must not carry different marks.
 *
 * ⚠️ THIS LITERAL EXISTS IN THREE PLACES AND CANNOT BE SHARED FROM ONE.
 * `send.ts` is server-only; `push-sw.js` is a static file the bundler never
 * touches, so it can import nothing. `inbox.test.ts` asserts this constant
 * still matches the one in `send.ts`, so the three cannot drift silently.
 *
 * NOT `/logo.png` or `/logo.svg` — those are the retired infinity mark, named
 * as retired in `send.ts` and `push-sw.js`.
 */
export const TAPPY_NOTIFICATION_MARK = '/tappy/wave.png'

/**
 * The brand mark for a NON-SOCIAL row, or null to keep the category emoji.
 *
 * 🔑 KEYED ON `category`, NEVER ON THE SENDER. `category: 'system'` is what the
 * existing contract calls a platform-originated message, and every caller that
 * goes through `dispatchNotification` — the Controller today, Marketing
 * campaigns later — arrives with it. Branching on who sent it would be how
 * Controller and Marketing end up with two different-looking notifications for
 * the same product; there is deliberately no way to express that here.
 *
 * `deal` and `explore` keep their emoji: they are product categories, not the
 * platform speaking, and this change is not a redesign of the inbox.
 */
export function notificationBrandMark(category: string): string | null {
  return category === 'system' ? TAPPY_NOTIFICATION_MARK : null
}

// v1 contract row → Inbox model.
export function mapDtoToInbox(dto: NotificationDTO): InboxNotif {
  return {
    id: dto.id,
    type: dto.type,
    category: dto.category,
    actor_id: dto.actor?.id ?? '',
    actor_name: dto.actor?.name ?? '',
    actor_avatar: dto.actor?.avatar ?? null,
    title: dto.title,
    text: dto.body,
    url: dto.entity_url ?? '',
    created_at: dto.created_at,
    read_at: dto.read_at,
  }
}

// Collapse many likes on the SAME review into one row (actor stack); everything
// else stays its own row. Non-social rows (no actor) keep an empty actors[].
export function groupNotifs(notifs: InboxNotif[]): GroupedNotif[] {
  const map = new Map<string, GroupedNotif>()
  for (const n of notifs) {
    const key = n.type === 'like' ? `like:${n.url}` : n.type === 'profile_view' ? 'profile_view' : n.id
    const existing = map.get(key)
    if (existing) {
      if (n.actor_id && !existing.actors.find(a => a.id === n.actor_id))
        existing.actors.push({ name: n.actor_name, avatar: n.actor_avatar, id: n.actor_id })
      existing.count++
      if (new Date(n.created_at) > new Date(existing.created_at)) existing.created_at = n.created_at
    } else {
      map.set(key, {
        id: n.id, type: n.type, category: n.category, url: n.url,
        actors: n.actor_id ? [{ name: n.actor_name, avatar: n.actor_avatar, id: n.actor_id }] : [],
        title: n.title,
        text: n.text,
        comment_body: n.type === 'comment' ? n.text : undefined,
        created_at: n.created_at, count: 1,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export function notifSection(created_at: string, now: number = Date.now()): string {
  const ms = now - new Date(created_at).getTime()
  if (ms < 60 * 60 * 1000) return 'VỪA XONG'
  if (ms < 24 * 60 * 60 * 1000) return 'HÔM NAY'
  return 'TUẦN NÀY'
}

// A group is rendered in the "social" (avatar-stack + verb) style only when it is
// a like/follow/comment WITH at least one actor. Everything else (milestone,
// deal, explore reminders, broadcast, system) renders the generic title/body row.
export function isSocialGroup(g: GroupedNotif): boolean {
  return (g.type === 'like' || g.type === 'follow' || g.type === 'comment') && g.actors.length > 0
}
