'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import UserAvatar from '@/components/UserAvatar'
import QRProfileButton from '@/components/QRProfileButton'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import Panel from '@/components/v3/Panel'
import { ChipRow } from '@/components/v3/Panel'
import {
  Settings, UserCircle, Pencil, Play, Heart, MessageCircle, MapPin,
  Sparkles, QrCode, Loader2, ImageOff, Star,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { ProfileRowList, accountRows, settingsRows } from './ProfileRows'

// ── V3 Web · Profile / Me — the personal hub ────────────────────────────────
//
// 🚨 WHAT THE REFERENCE ASKED FOR THAT THIS PRODUCT CANNOT HONESTLY RENDER.
//
// Audited against the schema and every API under `src/app/api`. Each of these is OMITTED, and
// the reason is recorded here so the next person working from the same picture does not spend a
// day looking for the endpoint:
//
//   • COVER PHOTO + "Thay ảnh bìa" — `profiles` has no cover column and no upload route accepts
//     one. The hero wears a flat V3 gradient instead: decoration this file draws, not a
//     photograph attributed to the user.
//   • @HANDLE — there is no username column. Identity is `full_name` and an email. A handle
//     minted from the email would be a public identifier the user never chose.
//   • LOCATION — no city/country column anywhere on `profiles`, and profile edit accepts only
//     `full_name`, `bio` and an avatar.
//   • TAPPYAI POINTS, TIERS, PROGRESS BAR — measured: zero occurrences of points, rewards,
//     levels or streaks in the entire codebase. There is no balance to show and no tier to
//     progress toward, so the card is gone rather than zeroed.
//   • "KHOẢNH KHẮC NỔI BẬT" (highlights/stories) — no story, highlight or collection model
//     exists. `favorites` is a flat list of saved places with no cover and no grouping, so
//     dressing it as story rings would invent a curation the user never made.
//   • "HOẠT ĐỘNG GẦN ĐÂY" — the only per-user event log is `user_events`, an append-only
//     TELEMETRY table (`chat_search`, `hide`, `not_interested`, `report`, `auth_signup_completed`
//     …) written by `/api/track` with an open vocabulary and no display copy. Rendering it as
//     "Bạn đã …" would require inventing a human sentence per event type — a presentation layer
//     over analytics, presented to the user as their own history.
//   • "ĐÃ THÍCH" TAB — `review_likes` exists, but the only endpoints over it are "toggle a like"
//     and "who liked THIS post". There is no gated list of the posts I have liked, and reading
//     the table directly would bypass `publishableFilter()` and `stripUnservableMedia` — i.e.
//     render held posts and dead media. Omitted rather than built past the safety boundary.
//   • "DEALS ĐÃ LƯU" / "LƯỢT CHIA SẺ" stats — no saved-deal model, no share counter.
//
// 🚨 WHAT IS REAL IS ALL HERE, AND ALL OF IT IS FETCHED THROUGH THE GATED ROUTES.
// Content comes from `/api/reviews/mine`, `/api/reviews/saved` and `/api/favorites` — the three
// endpoints that already apply the publication gate and strip unservable media. This file adds
// no fetch of its own to `reviews`, and no new API was written for it.
//
// 🚨 EVERY ACCOUNT ROW SURVIVED. `profileRowParity.test.tsx` pins that the guest and signed-in
// screens render the SAME inventory from `ProfileRows` in the same order — the hub keeps both
// panels for exactly that reason, which is also how Planner, Inbox, Smart Tools, Scam Shield and
// Settings stay reachable from here without Profile reimplementing any of them (§11).

interface ReviewCard {
  id: string
  place_name: string | null
  body: string | null
  photos: string[] | null
  thumbnail: string | null
  content_type: string | null
  created_at: string
  rating?: number | null
  like_count?: number | null
  comment_count?: number | null
  view_count?: number | null
}

interface FavoritePlace {
  id: string
  place_id: string | null
  place_name: string | null
  place_address: string | null
  created_at: string
}

type ProfileViewProps = {
  userId: string
  userInfo: { full_name?: string | null; avatar_url?: string | null; email?: string | null }
  firstName: string
  conversationCount: number
  bio: string | null
  joinedAt: string | null
  followerCount: number | null
  followingCount: number | null
  isPremium: boolean
  stats: {
    posts: number
    videos: number
    likes: number
    savedReviews: number
    savedPlaces: number
    conversations: number
  }
  following: { id: string; name: string | null; avatarUrl: string | null }[]
}

const TABS = ['v3.profile.tabPosts', 'v3.profile.tabSaved', 'v3.profile.tabPlaces'] as const

export default function ProfileView({
  userId, userInfo, firstName: rawFirstName, conversationCount,
  bio, joinedAt, followerCount, followingCount, isPremium, stats, following,
}: ProfileViewProps) {
  const { t, locale } = useTranslation()
  // C14 — the server cannot know the language, so it sends the bare name (possibly empty) and the
  // localized fallback word is applied here, where the dictionary is.
  const firstName = rawFirstName || t('home.friend')
  const displayName = userInfo.full_name || firstName

  return (
    <V3Shell
      title={t('v3.panel.profile')}
      subtitle={displayName}
      activeTab="/profile"
      user={{ name: displayName, avatarUrl: userInfo.avatar_url }}
    >
      {/* The two-column desktop hub: content left, personal sidebar right. Below `xl` the
          sidebar stacks under the content rather than shrinking into an unreadable rail. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <ProfileHero
            userId={userId}
            displayName={displayName}
            avatarUrl={userInfo.avatar_url}
            bio={bio}
            isPremium={isPremium}
            followerCount={followerCount}
            followingCount={followingCount}
            likes={stats.likes}
          />
          <ProfileContent />

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <Panel title={t('profile.accountSection')} tone="accent" icon={<UserCircle size={13} />} bodyClassName="p-2">
              <ProfileRowList rows={accountRows()} />
            </Panel>
            <Panel title={t('profile.settingsSection')} tone="violet" icon={<Settings size={13} />} bodyClassName="p-2">
              <ProfileRowList rows={settingsRows()} />
            </Panel>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <InfoCard displayName={displayName} email={userInfo.email} joinedAt={joinedAt} locale={locale} />
          <StatsCard stats={stats} conversationCount={conversationCount} />
          <FollowingCard following={following} />
          <QRCard userId={userId} displayName={displayName} />
        </aside>
      </div>

      <V3Footer />
    </V3Shell>
  )
}

/**
 * The hero.
 *
 * 🚨 THE BANNER IS A GRADIENT, AND IT IS NOT PRETENDING TO BE A PHOTO. There is no cover column,
 * so there is no change-cover control either — an upload button over a field nothing can store
 * is worse than no banner at all.
 *
 * Statistics render only when the server actually sent them. `follower_count` and
 * `following_count` are real trigger-maintained columns; `likes` is the sum of the `like_count`
 * the database keeps on this user's own posts. Nothing is defaulted to 0 to fill the row.
 */
function ProfileHero({
  userId, displayName, avatarUrl, bio, isPremium, followerCount, followingCount, likes,
}: {
  userId: string
  displayName: string
  avatarUrl?: string | null
  bio: string | null
  isPremium: boolean
  followerCount: number | null
  followingCount: number | null
  likes: number
}) {
  const { t } = useTranslation()

  return (
    <section className="v3-panel overflow-hidden" data-profile-hero>
      <p className="px-5 pt-4 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--v3-fg-muted)' }}>
        {t('v3.profile.breadcrumb')}
      </p>

      <div
        className="mt-3 h-24 w-full"
        aria-hidden="true"
        style={{ background: 'linear-gradient(120deg, var(--v3-violet) 0%, var(--v3-accent) 55%, var(--v3-panel-elevated) 100%)', opacity: 0.5 }}
      />

      <div className="px-5 pb-5">
        <div className="-mt-10 flex items-end gap-4">
          <span className="rounded-full p-1" style={{ background: 'var(--v3-panel)' }}>
            <UserAvatar src={avatarUrl} name={displayName} size={76} />
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[20px] font-bold" style={{ color: 'var(--v3-fg)' }}>{displayName}</h2>
              {/* Only on a real active subscription — see the note in page.tsx. */}
              {isPremium && (
                <span
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  style={{ background: 'color-mix(in srgb, var(--v3-violet) 18%, transparent)', color: 'var(--v3-violet)' }}
                >
                  <Sparkles size={10} aria-hidden="true" />
                  {t('v3.profile.premium')}
                </span>
              )}
            </div>
            {bio && (
              <p className="mt-1 max-w-[52ch] text-[13px] leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>
                {bio}
              </p>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            <Link
              href="/profile/edit"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
              style={{ background: 'var(--v3-panel)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg-secondary)' }}
            >
              <Pencil size={13} aria-hidden="true" />
              {t('v3.profile.editProfile')}
            </Link>
            {/* The existing share affordance, reused verbatim: an on-device QR of /users/{id}
                plus the Web Share / copy fallback it already implements. */}
            <QRProfileButton userId={userId} name={displayName} />
          </div>
        </div>

        <dl className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2">
          <Stat value={followingCount} label={t('v3.profile.statFollowing')} />
          <Stat value={followerCount} label={t('v3.profile.statFollowers')} />
          <Stat value={likes} label={t('v3.profile.statLikes')} />
        </dl>
      </div>
    </section>
  )
}

/** One hero statistic. A null value renders NOTHING — never a zero the server did not send. */
function Stat({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null
  return (
    <div data-stat={label}>
      <dt className="text-[16px] font-bold leading-tight" style={{ color: 'var(--v3-fg)' }}>{value.toLocaleString()}</dt>
      <dd className="text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{label}</dd>
    </div>
  )
}

/**
 * The tabbed content area.
 *
 * 🚨 THREE TABS, THREE GATED ENDPOINTS. Each tab is one real dataset behind one real route that
 * already applies the publication gate. There is no fourth tab because there is no fourth gated
 * endpoint — see the omission note at the top of this file for the Liked and Reviews tabs (the
 * latter is the SAME `reviews` table this product calls posts; two tabs over one dataset would
 * be a distinction the model does not make).
 */
function ProfileContent() {
  const { t } = useTranslation()
  const [tab, setTab] = useState(0)
  const [posts, setPosts] = useState<ReviewCard[] | null>(null)
  const [saved, setSaved] = useState<ReviewCard[] | null>(null)
  const [places, setPlaces] = useState<FavoritePlace[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async (index: number) => {
    setFailed(false)
    if ((index === 0 && posts) || (index === 1 && saved) || (index === 2 && places)) return
    setLoading(true)
    try {
      if (index === 0) {
        const r = await fetch('/api/reviews/mine')
        if (!r.ok) throw new Error('load')
        setPosts(((await r.json()).reviews ?? []) as ReviewCard[])
      } else if (index === 1) {
        const r = await fetch('/api/reviews/saved')
        if (!r.ok) throw new Error('load')
        setSaved(((await r.json()).reviews ?? []) as ReviewCard[])
      } else {
        const r = await fetch('/api/favorites')
        if (!r.ok) throw new Error('load')
        setPlaces(((await r.json()).favorites ?? []) as FavoritePlace[])
      }
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [posts, saved, places])

  useEffect(() => { void load(tab) }, [tab, load])

  const rows = tab === 0 ? posts : tab === 1 ? saved : places
  const emptyKey = tab === 0 ? 'v3.profile.emptyPosts' : tab === 1 ? 'v3.profile.emptySaved' : 'v3.profile.emptyPlaces'

  return (
    <section className="v3-panel" data-profile-content>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--v3-border)' }}>
        <ChipRow items={TABS.map((k) => t(k))} activeIndex={tab} onSelect={setTab} />
        <Link
          href="/reviews/new"
          className="inline-flex min-h-[32px] flex-shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
          style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
        >
          {t('v3.profile.postAction')}
        </Link>
      </div>

      <div className="p-4">
        {loading && !rows && (
          <div className="flex items-center justify-center py-14">
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--v3-fg-muted)' }} />
          </div>
        )}

        {failed && <Empty text={t('v3.profile.loadFailed')} />}

        {!loading && !failed && rows && rows.length === 0 && <Empty text={t(emptyKey)} />}

        {!failed && rows && rows.length > 0 && (
          tab === 2
            ? <PlaceList places={rows as FavoritePlace[]} />
            : <ReviewGrid reviews={rows as ReviewCard[]} />
        )}
      </div>
    </section>
  )
}

/**
 * The content grid — three across on desktop, as the reference shows.
 *
 * 🚨 EVERY BADGE IS A REAL COLUMN. `view_count`, `like_count` and `comment_count` are maintained
 * by database triggers and arrive on the payload; each renders only when the row actually carries
 * it. The play badge appears only for `content_type === 'video'`, which is the product's own
 * discriminator — there is no faked video treatment on a photo post.
 */
function ReviewGrid({ reviews }: { reviews: ReviewCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {reviews.map((r) => {
        const image = r.thumbnail || r.photos?.[0] || null
        const isVideo = r.content_type === 'video'
        return (
          <li key={r.id}>
            <Link
              href={`/reviews/${r.id}`}
              data-review={r.id}
              className="v3-tile group block overflow-hidden p-0 focus-visible:outline-none focus-visible:ring-2"
            >
              <span className="relative block aspect-[4/5] w-full overflow-hidden" style={{ background: 'var(--v3-panel-elevated)' }}>
                {image ? (
                  // Review media is arbitrary remote storage, not a configured next/image domain —
                  // the same reason the Explore feed and /profile/posts render it with a plain img.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center" style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true">
                    <ImageOff size={20} />
                  </span>
                )}

                {/* Real engagement, bottom-left, exactly as the reference places it. */}
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-[11px] font-semibold text-white">
                  {isVideo && typeof r.view_count === 'number' && (
                    <span className="inline-flex items-center gap-1">
                      <Play size={11} aria-hidden="true" />{compact(r.view_count)}
                    </span>
                  )}
                  {typeof r.like_count === 'number' && (
                    <span className="inline-flex items-center gap-1">
                      <Heart size={11} aria-hidden="true" />{compact(r.like_count)}
                    </span>
                  )}
                  {typeof r.comment_count === 'number' && (
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={11} aria-hidden="true" />{compact(r.comment_count)}
                    </span>
                  )}
                </span>
              </span>

              <span className="block px-2.5 py-2">
                <span className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: 'var(--v3-fg)' }}>
                    {r.place_name || ''}
                  </span>
                  {typeof r.rating === 'number' && r.rating > 0 && (
                    <span className="inline-flex flex-shrink-0 items-center gap-0.5 text-[11px]" style={{ color: 'var(--v3-amber)' }}>
                      <Star size={10} aria-hidden="true" />{r.rating}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Saved places: a flat list, because `favorites` is a flat list. No cover art is invented for them. */
function PlaceList({ places }: { places: FavoritePlace[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {places.map((p) => (
        <li key={p.id}>
          <div
            data-place={p.id}
            className="flex items-start gap-2.5 rounded-xl border p-3"
            style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)' }}
          >
            <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--v3-accent)' }} aria-hidden="true">
              <MapPin size={14} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-medium" style={{ color: 'var(--v3-fg)' }}>{p.place_name || ''}</span>
              {p.place_address && (
                <span className="block truncate text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>{p.place_address}</span>
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center"
      style={{ borderColor: 'var(--v3-border)', color: 'var(--v3-fg-muted)' }}
    >
      <p className="max-w-[34ch] text-[13px] leading-relaxed">{text}</p>
    </div>
  )
}

/** 1.248 → 1.2K. Presentation only; the underlying number is never altered. */
function compact(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}K`
}

/**
 * Personal information.
 *
 * 🚨 THREE FIELDS, BECAUSE THREE FIELDS EXIST. The reference also listed a username and a phone
 * number; `profiles` has neither column, and profile edit accepts only name, bio and avatar. The
 * email shown is the owner's own, on the owner's own page — it is never rendered for a visitor,
 * because this route returns `GuestProfileView` to anyone who is not signed in.
 */
function InfoCard({
  displayName, email, joinedAt, locale,
}: { displayName: string; email?: string | null; joinedAt: string | null; locale: 'vi' | 'en' }) {
  const { t } = useTranslation()
  return (
    <section className="v3-panel" data-profile-info>
      <header className="v3-panel-header">
        <h2 className="v3-panel-title">{t('v3.profile.infoTitle')}</h2>
        <Link href="/profile/edit" className="v3-seeall hover:underline">{t('v3.profile.infoEdit')}</Link>
      </header>
      <dl className="space-y-2.5 p-4">
        <InfoRow label={t('v3.profile.infoName')} value={displayName} />
        {email && <InfoRow label={t('v3.profile.infoEmail')} value={email} />}
        {joinedAt && (
          <InfoRow
            label={t('v3.profile.infoJoined')}
            value={new Date(joinedAt).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB')}
          />
        )}
      </dl>
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex-shrink-0 text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{label}</dt>
      <dd className="min-w-0 truncate text-[12.5px] font-medium" style={{ color: 'var(--v3-fg)' }}>{value}</dd>
    </div>
  )
}

/**
 * Counts of the user's own things.
 *
 * 🚨 NOT GAMIFICATION. There is no points system, no tier and no badge in this product, so this
 * card counts rows the user actually owns and stops there. The saved-deals and shares-received rows from
 * the reference have no model behind them and are absent rather than zeroed.
 */
function StatsCard({
  stats, conversationCount,
}: { stats: ProfileViewProps['stats']; conversationCount: number }) {
  const { t } = useTranslation()
  const rows: [string, number][] = [
    [t('v3.profile.statPosts'), stats.posts],
    [t('v3.profile.statVideos'), stats.videos],
    [t('v3.profile.statLikes'), stats.likes],
    [t('v3.profile.statSavedPosts'), stats.savedReviews],
    [t('v3.profile.statSavedPlaces'), stats.savedPlaces],
    [t('v3.profile.statConversations'), conversationCount],
  ]
  return (
    <section className="v3-panel" data-profile-stats>
      <header className="v3-panel-header">
        <h2 className="v3-panel-title">{t('v3.profile.statsTitle')}</h2>
      </header>
      <dl className="space-y-2 p-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>{label}</dt>
            <dd className="text-[12.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * Who this user follows.
 *
 * 🚨 "FOLLOWING", NEVER "FRIENDS". `user_follows` stores one direction per row. The reference's
 * card was headed as a friends list with Follow / Following buttons; calling a one-way follow a friendship
 * asserts a mutual relationship the table does not record, and no Follow button appears here
 * because every row in this list is, by construction, already followed.
 */
function FollowingCard({ following }: { following: ProfileViewProps['following'] }) {
  const { t } = useTranslation()
  return (
    <section className="v3-panel" data-profile-following>
      <header className="v3-panel-header">
        <h2 className="v3-panel-title">{t('v3.profile.followingTitle')}</h2>
      </header>
      <div className="p-3">
        {following.length === 0 ? (
          <p className="px-1 py-2 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.profile.followingEmpty')}</p>
        ) : (
          <ul className="space-y-1">
            {following.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/users/${f.id}`}
                  data-following={f.id}
                  className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2"
                >
                  <UserAvatar src={f.avatarUrl} name={f.name || ''} size={30} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: 'var(--v3-fg)' }}>
                    {f.name || ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** The existing QR capability, in the sidebar the reference puts it in. No new code behind it. */
function QRCard({ userId, displayName }: { userId: string; displayName: string }) {
  const { t } = useTranslation()
  return (
    <section className="v3-panel" data-profile-qr>
      <header className="v3-panel-header">
        <span className="v3-panel-icon" style={{ background: 'rgba(139,92,246,0.16)', color: 'var(--v3-violet)' }} aria-hidden="true">
          <QrCode size={13} />
        </span>
        <h2 className="v3-panel-title">{t('v3.profile.qrTitle')}</h2>
      </header>
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.profile.qrHint')}</p>
        <QRProfileButton userId={userId} name={displayName} />
      </div>
    </section>
  )
}
