'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import UserAvatar from '@/components/UserAvatar'
import QRProfileButton from '@/components/QRProfileButton'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import Panel from '@/components/v3/Panel'
import {
  Settings, UserCircle, Pencil, Play, Heart, MessageCircle, MapPin, Camera,
  Sparkles, QrCode, Loader2, ImageOff, Star, LayoutGrid, List, ArrowRight,
  Bookmark, Video, Images, type LucideIcon,
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
//   • CHANGE-COVER CONTROL — the cover itself is real since `profiles.cover_url`
//     (`20260915_profile_public_presentation.sql`, uploaded through POST /api/profile), and the
//     hero shows it when the row carries one. Changing it lives on `/profile/edit` and on the
//     owner's Explore profile, the same two places that own the avatar picker; this hub keeps a
//     single edit entry point. With no cover the banner is the V3 gradient — decoration this
//     file draws, not a photograph attributed to the user.
//   • @HANDLE — there is no username column. Identity is `full_name` and an email. A handle
//     minted from the email would be a public identifier the user never chose.
//   • LOCATION / PHONE — no city, country or phone column anywhere on `profiles`, and profile
//     edit accepts only `full_name`, `bio` and an avatar.
//   • TAPPYAI POINTS, TIERS, PROGRESS BAR — measured: zero occurrences of points, rewards,
//     levels or streaks in the entire codebase. There is no balance to show and no tier to
//     progress toward, so the card is gone rather than zeroed.
//   • HIGHLIGHTS / STORY RINGS — no story, highlight or collection model exists. `favorites` is
//     a flat list of saved places with no cover and no grouping, so dressing it as story rings
//     would invent a curation the user never made.
//   • RECENT ACTIVITY — the only per-user event log is `user_events`, an append-only TELEMETRY
//     table written by `/api/track` with an open vocabulary and no display copy. Rendering it as
//     first-person sentences would be a presentation layer over analytics.
//   • "LIKED" TAB — `review_likes` exists, but the only endpoints over it are "toggle a like" and
//     "who liked THIS post". There is no gated list of the posts I have liked, and reading the
//     table directly would bypass `publishableFilter()` and `stripUnservableMedia`.
//   • SAVED-DEALS / SHARES stats, "load more" — no saved-deal model, no share counter, and the
//     content routes return one bounded page with no cursor.
//   • FRIENDS with Follow buttons — `user_follows` is directional; see `FollowingCard`.
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
//
// The skin (2026-09-12) follows the owner's Profile reference: one framed surface, a dominant
// hero, pill tabs, a grid/list switch over the rows already loaded, rounded media cards and
// stacked rail cards. Paint lives in `globals.css` under `.v3-profile-*`.

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
  /** `profiles.cover_url`; absent/null = no cover, the banner stays a gradient. */
  coverUrl?: string | null
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

const TABS: { key: string; icon: LucideIcon }[] = [
  { key: 'v3.profile.tabPosts', icon: Images },
  { key: 'v3.profile.tabSaved', icon: Bookmark },
  { key: 'v3.profile.tabPlaces', icon: MapPin },
]

export default function ProfileView({
  userId, userInfo, firstName: rawFirstName, conversationCount,
  bio, coverUrl, joinedAt, followerCount, followingCount, isPremium, stats, following,
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
      <div className="v3-profile-frame p-4 sm:p-6 lg:p-8">
        {/* Two columns from `xl` up: content left, personal rail right. Below that the rail stacks
            under the content — at 1024 the shell's sidebar is already open, and a 320px rail beside
            it would squeeze the grid into a phone column. */}
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-8">
          <div className="min-w-0 flex-1 space-y-5" data-profile-main>
            <ProfileHero
              userId={userId}
              displayName={displayName}
              avatarUrl={userInfo.avatar_url}
              bio={bio}
              coverUrl={coverUrl ?? null}
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

          <aside className="w-full flex-shrink-0 space-y-4 xl:sticky xl:top-4 xl:w-[320px] xl:self-start" data-profile-rail>
            <InfoCard displayName={displayName} email={userInfo.email} joinedAt={joinedAt} locale={locale} />
            <StatsCard stats={stats} conversationCount={conversationCount} />
            <FollowingCard following={following} />
            <QRCard userId={userId} displayName={displayName} />
          </aside>
        </div>
      </div>

      <V3Footer />
    </V3Shell>
  )
}

/**
 * The hero.
 *
 * 🚨 THE BANNER IS THE USER'S OWN COVER, OR A GRADIENT — never a stock photo pretending to be
 * one. `coverUrl` is `profiles.cover_url`, an object POST /api/profile wrote for this user; when
 * it is null the banner is decoration this file draws. There is no change-cover control HERE: the
 * one camera badge on the page sits on the AVATAR and opens `/profile/edit`, which owns the
 * avatar picker and the cover picker alike.
 *
 * Statistics render only when the server actually sent them. `follower_count` and
 * `following_count` are real trigger-maintained columns; `likes` is the sum of the `like_count`
 * the database keeps on this user's own posts. Nothing is defaulted to 0 to fill the row.
 */
function ProfileHero({
  userId, displayName, avatarUrl, bio, coverUrl, isPremium, followerCount, followingCount, likes,
}: {
  userId: string
  displayName: string
  avatarUrl?: string | null
  bio: string | null
  coverUrl: string | null
  isPremium: boolean
  followerCount: number | null
  followingCount: number | null
  likes: number
}) {
  const { t } = useTranslation()

  return (
    <section className="v3-profile-hero" data-profile-hero aria-labelledby="profile-hero-name">
      <div className="v3-profile-banner relative h-28 w-full overflow-hidden sm:h-36" aria-hidden="true">
        {coverUrl && (
          <>
            <Image src={coverUrl} alt="" fill sizes="(min-width: 1280px) 900px, 100vw" className="object-cover" data-profile-cover />
            {/* Keeps the breadcrumb legible over any photo. */}
            <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-black/25" />
          </>
        )}
        <p className="absolute left-5 top-4 text-[11px] font-medium uppercase tracking-[0.12em] text-white/80">
          {t('v3.profile.breadcrumb')}
        </p>
      </div>

      <div className="px-4 pb-5 sm:px-6">
        {/* The avatar overlaps the banner; the camera badge is the existing change-photo action. */}
        <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
          <div className="relative flex-shrink-0">
            <span className="v3-profile-avatar-plate block">
              <span className="v3-profile-avatar-ring block">
                <UserAvatar src={avatarUrl} name={displayName} size={96} rounded="rounded-full" />
              </span>
            </span>
            <Link
              href="/profile/edit"
              aria-label={t('editProfile.changeAvatar')}
              className="v3-profile-avatar-edit absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full"
            >
              <Camera size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className="hidden flex-shrink-0 items-center gap-2 sm:flex">
            <HeroActions userId={userId} displayName={displayName} />
          </div>
        </div>

        <div className="mt-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id="profile-hero-name" className="truncate text-[22px] font-extrabold leading-tight tracking-[-0.01em] sm:text-[26px]" style={{ color: 'var(--v3-fg)' }}>
              {displayName}
            </h1>
            {/* Only on a real active subscription — see the note in page.tsx. */}
            {isPremium && (
              <span className="v3-profile-premium inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                <Sparkles size={11} aria-hidden="true" />
                {t('v3.profile.premium')}
              </span>
            )}
          </div>
          {bio && (
            <p className="mt-1.5 max-w-[60ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>
              {bio}
            </p>
          )}
        </div>

        <dl className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <Stat value={followingCount} label={t('v3.profile.statFollowing')} />
          <Stat value={followerCount} label={t('v3.profile.statFollowers')} />
          <Stat value={likes} label={t('v3.profile.statLikes')} />
        </dl>

        {/* Below `sm` the actions take their own row so the avatar and the name keep the width. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:hidden">
          <HeroActions userId={userId} displayName={displayName} />
        </div>
      </div>
    </section>
  )
}

/** Edit (primary) + the existing QR/share affordance. Rendered in ONE place per breakpoint. */
function HeroActions({ userId, displayName }: { userId: string; displayName: string }) {
  const { t } = useTranslation()
  return (
    <>
      <Link
        href="/profile/edit"
        className="v3-profile-brand v3-profile-cta inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold"
      >
        <Pencil size={14} aria-hidden="true" />
        {t('v3.profile.editProfile')}
      </Link>
      {/* The existing share affordance, reused verbatim: an on-device QR of /users/{id}
          plus the Web Share / copy fallback it already implements. */}
      <span className="v3-profile-btn inline-flex min-h-[44px] items-center justify-center rounded-xl px-1">
        <QRProfileButton userId={userId} name={displayName} />
      </span>
    </>
  )
}

/** One hero statistic. A null value renders NOTHING — never a zero the server did not send. */
function Stat({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null
  return (
    <div data-stat={label}>
      <dt className="text-[20px] font-extrabold leading-tight tabular-nums" style={{ color: 'var(--v3-fg)' }}>{value.toLocaleString()}</dt>
      <dd className="text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{label}</dd>
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
 *
 * The grid/list switch is PRESENTATION: it re-arranges the rows a tab already holds. It fetches
 * nothing and it is not offered on the Places tab, whose rows have no media to grid.
 */
function ProfileContent() {
  const { t } = useTranslation()
  const [tab, setTab] = useState(0)
  const [view, setView] = useState<'grid' | 'list'>('grid')
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
    <section className="v3-profile-card" data-profile-content aria-label={t('v3.profile.contentTitle')}>
      {/* Below `sm` the tabs take a full row of their own and the toolbar drops beneath them —
          sharing one row squeezed the scroller to a few pixels on a phone. */}
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:px-5" style={{ borderColor: 'var(--v3-border)' }}>
        {/* 🔑 The tabs keep the shared `.v3-chip` class: it is the page's tab contract. */}
        <div className="v3-scroll-x -mx-1 flex w-full min-w-0 gap-2 px-1 sm:w-auto sm:flex-1" role="group" aria-label={t('v3.profile.contentTitle')}>
          {TABS.map((item, i) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={i === tab}
              onClick={() => setTab(i)}
              className={`v3-chip v3-profile-tab flex-shrink-0 ${i === tab ? 'v3-chip-active' : ''}`}
            >
              <item.icon size={15} aria-hidden="true" />
              {t(item.key)}
            </button>
          ))}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-2 sm:justify-end">
          {tab !== 2 && (
            <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--v3-panel)' }} role="group" aria-label={`${t('v3.profile.viewGrid')} / ${t('v3.profile.viewList')}`}>
              <button
                type="button"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
                data-profile-view="grid"
                className="v3-profile-seg inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold"
              >
                <LayoutGrid size={14} aria-hidden="true" />
                <span className="hidden sm:inline">{t('v3.profile.viewGrid')}</span>
                <span className="sr-only sm:hidden">{t('v3.profile.viewGrid')}</span>
              </button>
              <button
                type="button"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
                data-profile-view="list"
                className="v3-profile-seg inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold"
              >
                <List size={14} aria-hidden="true" />
                <span className="hidden sm:inline">{t('v3.profile.viewList')}</span>
                <span className="sr-only sm:hidden">{t('v3.profile.viewList')}</span>
              </button>
            </div>
          )}
          <Link
            href="/reviews/new"
            className="v3-profile-brand v3-profile-cta inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-semibold"
          >
            {t('v3.profile.postAction')}
          </Link>
        </div>
      </div>

      <div className="p-4 sm:p-5">
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
            : view === 'grid'
              ? <ReviewGrid reviews={rows as ReviewCard[]} />
              : <ReviewList reviews={rows as ReviewCard[]} />
        )}
      </div>
    </section>
  )
}

/** The badges a post row actually carries: plays only on a video, likes and comments when present. */
function Engagement({ r, className }: { r: ReviewCard; className: string }) {
  const isVideo = r.content_type === 'video'
  return (
    <span className={className}>
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
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      {reviews.map((r) => {
        const image = r.thumbnail || r.photos?.[0] || null
        const isVideo = r.content_type === 'video'
        return (
          <li key={r.id}>
            <Link
              href={`/reviews/${r.id}`}
              data-review={r.id}
              className="v3-profile-media group block overflow-hidden"
            >
              <span className="relative block aspect-[4/5] w-full overflow-hidden" style={{ background: 'var(--v3-panel-elevated)' }}>
                {image ? (
                  // Review media is arbitrary remote storage, not a configured next/image domain —
                  // the same reason the Explore feed renders it with a plain img.
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
                {isVideo && (
                  <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm" aria-hidden="true">
                    <Video size={13} />
                  </span>
                )}

                {/* Real engagement, bottom-left, exactly as the reference places it. */}
                <Engagement r={r} className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-7 text-[11.5px] font-semibold text-white" />
              </span>

              <span className="block px-2.5 py-2">
                <span className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: 'var(--v3-fg)' }}>
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

/** The same rows as the grid, one per line — thumbnail, name, rating, date, the same real badges. */
function ReviewList({ reviews }: { reviews: ReviewCard[] }) {
  const { locale } = useTranslation()
  return (
    <ul className="space-y-2">
      {reviews.map((r) => {
        const image = r.thumbnail || r.photos?.[0] || null
        const isVideo = r.content_type === 'video'
        return (
          <li key={r.id}>
            <Link href={`/reviews/${r.id}`} data-review={r.id} className="v3-profile-row flex min-h-[64px] items-center gap-3 p-2.5">
              <span className="relative block h-14 w-[72px] flex-shrink-0 overflow-hidden rounded-xl" style={{ background: 'var(--v3-panel-elevated)' }}>
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center" style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true">
                    <ImageOff size={16} />
                  </span>
                )}
                {isVideo && (
                  <span className="absolute inset-0 flex items-center justify-center text-white" aria-hidden="true">
                    <Play size={16} className="drop-shadow" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate text-[13.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{r.place_name || ''}</span>
                  {typeof r.rating === 'number' && r.rating > 0 && (
                    <span className="inline-flex flex-shrink-0 items-center gap-0.5 text-[11px]" style={{ color: 'var(--v3-amber)' }}>
                      <Star size={10} aria-hidden="true" />{r.rating}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>
                  <span>{new Date(r.created_at).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB')}</span>
                  <Engagement r={r} className="inline-flex items-center gap-2.5" />
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
          <div data-place={p.id} className="v3-profile-row flex min-h-[56px] items-start gap-3 p-3">
            <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }} aria-hidden="true">
              <MapPin size={15} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{p.place_name || ''}</span>
              {p.place_address && (
                <span className="block truncate text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{p.place_address}</span>
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
      style={{ borderColor: 'var(--v3-border-strong)', color: 'var(--v3-fg-muted)' }}
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

/** A rail card: title, optional onward link, body. Not `.v3-panel` — the row-inventory tests select that class. */
function RailCard({
  id, title, icon: Icon, action, children,
}: { id: string; title: string; icon?: LucideIcon; action?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="v3-profile-rail-card p-4" {...{ [`data-profile-${id}`]: '' }} aria-labelledby={`profile-${id}-title`}>
      <header className="flex items-center gap-2">
        {Icon && (
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }} aria-hidden="true">
            <Icon size={14} />
          </span>
        )}
        <h2 id={`profile-${id}-title`} className="min-w-0 flex-1 truncate text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>{title}</h2>
        {action && (
          <Link href={action.href} className="v3-profile-seeall inline-flex min-h-[36px] flex-shrink-0 items-center gap-1 text-[12.5px] font-semibold">
            {action.label}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </header>
      <div className="mt-3">{children}</div>
    </section>
  )
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
    <RailCard id="info" title={t('v3.profile.infoTitle')} action={{ href: '/profile/edit', label: t('v3.profile.infoEdit') }}>
      <dl className="space-y-3">
        <InfoRow label={t('v3.profile.infoName')} value={displayName} />
        {email && <InfoRow label={t('v3.profile.infoEmail')} value={email} />}
        {joinedAt && (
          <InfoRow
            label={t('v3.profile.infoJoined')}
            value={new Date(joinedAt).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB')}
          />
        )}
      </dl>
    </RailCard>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex-shrink-0 text-[12.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{label}</dt>
      <dd className="min-w-0 truncate text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{value}</dd>
    </div>
  )
}

/**
 * Counts of the user's own things.
 *
 * 🚨 NOT GAMIFICATION. There is no points system, no tier and no badge in this product, so this
 * card counts rows the user actually owns and stops there. The saved-deals and shares-received
 * rows from the reference have no model behind them and are absent rather than zeroed.
 */
function StatsCard({
  stats, conversationCount,
}: { stats: ProfileViewProps['stats']; conversationCount: number }) {
  const { t } = useTranslation()
  const rows: { label: string; value: number; icon: LucideIcon }[] = [
    { label: t('v3.profile.statPosts'), value: stats.posts, icon: Images },
    { label: t('v3.profile.statVideos'), value: stats.videos, icon: Video },
    { label: t('v3.profile.statLikes'), value: stats.likes, icon: Heart },
    { label: t('v3.profile.statSavedPosts'), value: stats.savedReviews, icon: Bookmark },
    { label: t('v3.profile.statSavedPlaces'), value: stats.savedPlaces, icon: MapPin },
    { label: t('v3.profile.statConversations'), value: conversationCount, icon: MessageCircle },
  ]
  return (
    <RailCard id="stats" title={t('v3.profile.statsTitle')}>
      <dl className="divide-y" style={{ borderColor: 'var(--v3-border)' }}>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 py-2.5" style={{ borderColor: 'var(--v3-border)' }}>
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }} aria-hidden="true">
              <row.icon size={14} />
            </span>
            <dt className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--v3-fg-secondary)' }}>{row.label}</dt>
            <dd className="flex-shrink-0 text-[15px] font-extrabold tabular-nums" style={{ color: 'var(--v3-fg)' }}>{row.value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </RailCard>
  )
}

/**
 * Who this user follows.
 *
 * 🚨 "FOLLOWING", NEVER "FRIENDS". `user_follows` stores one direction per row. The reference's
 * card was headed as a friends list with Follow / Following buttons; calling a one-way follow a
 * friendship asserts a mutual relationship the table does not record, and no Follow button
 * appears here because every row in this list is, by construction, already followed. The
 * onward link is the existing Following / Followers page.
 */
function FollowingCard({ following }: { following: ProfileViewProps['following'] }) {
  const { t } = useTranslation()
  return (
    <RailCard id="following" title={t('v3.profile.followingTitle')} action={{ href: '/social', label: t('v3.profile.seeAll') }}>
      {following.length === 0 ? (
        <p className="px-1 py-1 text-[12.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.profile.followingEmpty')}</p>
      ) : (
        <ul className="space-y-1">
          {following.map((f) => (
            <li key={f.id}>
              <Link
                href={`/users/${f.id}`}
                data-following={f.id}
                className="v3-profile-row flex min-h-[48px] items-center gap-3 px-2 py-1.5"
              >
                <UserAvatar src={f.avatarUrl} name={f.name || ''} size={36} rounded="rounded-full" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                  {f.name || ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  )
}

/**
 * The existing QR capability, in the sidebar the reference puts it in. The button builds the
 * code on demand and shares the profile URL; the download lives on `/profile/qr`, which this
 * card links to. No second encoder, no inline QR.
 */
function QRCard({ userId, displayName }: { userId: string; displayName: string }) {
  const { t } = useTranslation()
  return (
    <RailCard id="qr" title={t('v3.profile.qrTitle')} icon={QrCode}>
      <p className="text-[12.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.profile.qrHint')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="v3-profile-btn inline-flex min-h-[44px] items-center justify-center rounded-xl px-1">
          <QRProfileButton userId={userId} name={displayName} />
        </span>
        <Link href="/profile/qr" className="v3-profile-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13px] font-semibold">
          {t('v3.profile.qrOpen')}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </RailCard>
  )
}
