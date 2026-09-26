'use client'

import { useState } from 'react'
import Image from '@/components/media/SafeImage'
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
 *
 * Two SIZES of the same card (owner redesign, 2026-09-12): `row` is the compact
 * avatar-left line the right-rail search results use; `tile` is the main list's
 * card — avatar on top, name, count, a full-width action — the reference's card
 * shape. Same data, same button, same mutation; only the arrangement differs.
 *
 * 🚨 A TILE RE-FLOWS BELOW `sm`. Two tiles at 375px measured 125px wide and
 * wrapped both the count and the button; a row with the button beside the text
 * squeezed the name to "Ma…". So on a phone the tile is one per line with the
 * avatar and copy side by side and the action FULL WIDTH underneath, and it
 * stands up into the card shape from `sm`, where a column is ~190px or wider.
 */
export default function PersonCard({
  person,
  followsYou = false,
  onFollowChange,
  variant = 'row',
}: {
  person: Person
  /** True in the Followers list: this person follows the viewer. Real, not inferred. */
  followsYou?: boolean
  onFollowChange?: (id: string, isFollowing: boolean, followerCount: number) => void
  variant?: 'row' | 'tile'
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const name = person.full_name?.trim() || t('v3.msg.unknownUser')
  const tile = variant === 'tile'

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

  const avatarSize = tile ? 64 : 44
  const avatar = person.avatar_url ? (
    <Image
      src={person.avatar_url}
      alt=""
      width={avatarSize}
      height={avatarSize}
      className={`v3-social-avatar flex-shrink-0 rounded-full object-cover ${tile ? 'h-12 w-12 sm:h-16 sm:w-16' : 'h-11 w-11'}`}
    />
  ) : (
    <span
      className={`v3-social-avatar flex flex-shrink-0 items-center justify-center rounded-full font-bold ${tile ? 'h-12 w-12 text-[17px] sm:h-16 sm:w-16 sm:text-[22px]' : 'h-11 w-11 text-[15px]'}`}
      style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
      aria-hidden="true"
    >
      {name[0]?.toUpperCase() ?? '?'}
    </span>
  )

  const meta = (
    <span className={`flex items-center gap-2 ${tile ? 'mt-0.5 sm:mt-1 sm:justify-center' : 'mt-0.5'}`}>
      {/* A real, trigger-maintained column on `profiles` — not a derived guess. */}
      <span className={tile ? 'text-[12px]' : 'text-[11.5px]'} style={{ color: 'var(--v3-fg-muted)' }}>
        {t('v3.social.followerCount', { n: String(person.follower_count ?? 0) })}
      </span>
      {followsYou && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
          style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
        >
          {t('v3.social.followsYou')}
        </span>
      )}
    </span>
  )

  const button = (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={person.is_following}
      className={`${person.is_following ? 'v3-social-btn-secondary' : 'v3-social-btn-primary'} flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl font-semibold disabled:opacity-60 ${
        tile ? 'min-h-[36px] w-full px-3 text-[13px] sm:mt-4 sm:min-h-[38px]' : 'min-h-[34px] px-3 text-[12.5px]'
      }`}
    >
      {busy
        ? <Loader2 size={14} className="animate-spin" />
        : person.is_following ? <Check size={14} /> : <UserPlus size={14} />}
      {person.is_following ? t('v3.social.following') : t('v3.social.follow')}
    </button>
  )

  if (tile) {
    return (
      <div className={`v3-social-card flex flex-col gap-3 p-3 sm:gap-0 sm:p-4 ${error ? 'v3-social-card-error' : ''}`} data-person={person.id}>
        {/* The card is the discovery layer; the profile is the destination. There is
            no second profile implementation here. */}
        <Link
          href={`/users/${person.id}`}
          className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 sm:flex-col sm:gap-0 sm:text-center"
          title={t('v3.social.viewProfile')}
        >
          {avatar}
          <span className="min-w-0 flex-1 sm:mt-3 sm:w-full sm:flex-none">
            <span className="block truncate text-[14px] font-bold leading-tight sm:text-[15px]" style={{ color: 'var(--v3-fg)' }}>
              {name}
            </span>
            {meta}
          </span>
        </Link>
        {button}
      </div>
    )
  }

  return (
    <div className={`v3-social-card flex items-center gap-3 p-3 ${error ? 'v3-social-card-error' : ''}`} data-person={person.id}>
      {/* The card is the discovery layer; the profile is the destination. There is
          no second profile implementation here. */}
      <Link
        href={`/users/${person.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2"
        title={t('v3.social.viewProfile')}
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
            {name}
          </span>
          {meta}
        </span>
      </Link>
      {button}
    </div>
  )
}
