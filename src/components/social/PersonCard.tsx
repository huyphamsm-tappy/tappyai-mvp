'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Check, Loader2, UserPlus } from 'lucide-react'

/**
 * The shape `/api/users/search` and `/api/social/connections` both return.
 *
 * 🚨 THERE IS NO `username`, AND THE CARD MUST NOT SHOW ONE. `profiles` holds
 * `id, email, full_name, avatar_url, bio, follower_count, following_count,
 * language` and no handle column. The reference design shows `@mai.anh` under
 * every name; rendering that would mean inventing a handle, and rendering the
 * email instead would put addresses on a discovery page. Neither happens.
 */
export interface Person {
  id: string
  full_name: string | null
  avatar_url: string | null
  follower_count: number | null
  following_count: number | null
  is_following: boolean
}

/**
 * One person, one consistent card, used by every list on the page.
 *
 * 🚨 NO MUTUAL-CONNECTION COUNT. The reference shows a mutual-friend count on each
 * card. `user_follows` is directional and there is no friendship model, so the
 * honest version of that number does not exist — and a number on a card is read
 * as a fact, not as an inference. It is left out rather than approximated.
 */
export default function PersonCard({
  person,
  followsYou = false,
  onFollowChange,
}: {
  person: Person
  /** True in the Followers list: this person follows the viewer. Real, not inferred. */
  followsYou?: boolean
  onFollowChange?: (id: string, isFollowing: boolean, followerCount: number) => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const name = person.full_name?.trim() || t('v3.msg.unknownUser')

  /**
   * 🚨 THE SERVER'S ANSWER IS THE ONE THAT RENDERS.
   *
   * `POST /api/users/[id]/follow` TOGGLES — it inserts, and turns an insert
   * conflict into a delete — so the client cannot know which way it went until
   * the response arrives. An optimistic flip would guess, and would be wrong
   * exactly when two tabs disagree about the current state. The button shows a
   * spinner instead and then reports what actually happened, including the
   * follower count the server recalculated.
   */
  async function toggle() {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      const r = await fetch(`/api/users/${person.id}/follow`, { method: 'POST' })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      onFollowChange?.(person.id, !!d.following, Number(d.follower_count ?? person.follower_count ?? 0))
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border p-3"
      style={{ background: 'var(--v3-panel)', borderColor: error ? 'var(--v3-rose)' : 'var(--v3-border)' }}
    >
      {/* The card is the discovery layer; the profile is the destination. There is
          no second profile implementation here. */}
      <Link href={`/users/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3" title={t('v3.social.viewProfile')}>
        {person.avatar_url ? (
          <Image src={person.avatar_url} alt="" width={44} height={44} className="h-11 w-11 flex-shrink-0 rounded-full object-cover" />
        ) : (
          <span
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
            style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
            aria-hidden="true"
          >
            {name[0]?.toUpperCase() ?? '?'}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
            {name}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            {/* A real, trigger-maintained column on `profiles` — not a derived guess. */}
            <span className="text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('v3.social.followerCount', { n: String(person.follower_count ?? 0) })}
            </span>
            {followsYou && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
              >
                {t('v3.social.followsYou')}
              </span>
            )}
          </span>
        </span>
      </Link>

      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={person.is_following}
        className="flex min-h-[34px] flex-shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold transition-opacity disabled:opacity-60"
        style={person.is_following
          ? { background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)', border: '1px solid var(--v3-border)' }
          : { background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
      >
        {busy
          ? <Loader2 size={14} className="animate-spin" />
          : person.is_following ? <Check size={14} /> : <UserPlus size={14} />}
        {person.is_following ? t('v3.social.following') : t('v3.social.follow')}
      </button>
    </div>
  )
}
