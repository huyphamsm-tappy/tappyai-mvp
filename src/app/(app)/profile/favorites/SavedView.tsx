'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ComponentProps, ReactNode } from 'react'
import type Header from '@/components/Header'
import {
  Bookmark, MapPin, FileText, ChevronRight, ChevronLeft, Loader2, LayoutGrid, PlayCircle,
  Compass, Sparkles, type LucideIcon,
} from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import { TappyMascot } from '@/components/TappyMascot'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { FavoriteDeleteButton } from './FavoriteDeleteButton'

// ── V3 Web · Saved — drawn to the owner reference of 2026-09-28 ─────────────
//
// Hero ("Đã lưu" · "Những điều bạn yêu thích 💙" · mascot) with the filter chips, two count cards,
// and — when nothing is saved — one empty-state card whose CTA opens Explore.
//
// 🚨 TWO COUNTS, NOT MORE, AND THAT IS STILL THE FINDING. Audited against every table and route:
//
//   ✅ ĐỊA ĐIỂM  → `favorites`      (via GET /api/favorites)
//   ✅ BÀI VIẾT  → `review_saves`   (via GET /api/reviews/saved)
//   ◐ VIDEO     → NOT a separate dataset: a video is a `reviews` row with `content_type`
//                  'video', saved into the SAME `review_saves` table. The reference's Video chip
//                  is therefore a FILTER over the saved posts already fetched — it has no count
//                  card of its own, because a Video count beside the Bài viết count would describe
//                  the same saves twice.
//   ❌ DEALS / BỘ SƯU TẬP → no deal-save model and no collection model exist anywhere in `src/`
//                  or `supabase/`. The reference's chips are drawn DISABLED with a "coming soon"
//                  mark, never linked: a chip that opened an empty list would claim a save
//                  feature that does not exist.
//
// 🚨 `music_saved` is real but has no LIST endpoint, so it has no chip or card (§6: no dead ends).
//
// 🚨 THE COUNTS ARE THE LENGTHS OF THE LISTS THEMSELVES — the very payload the destination
// renders — so a saved post withheld by `publishableFilter()` / `stripUnservableMedia` is neither
// listed nor advertised. NO NEW BACKEND: same two gated endpoints, same RLS.

interface Favorite {
  id: string
  place_id: string
  place_name: string
  place_address: string
  place_type: string
  created_at: string
}

interface SavedReview {
  id: string
  place_name: string | null
  body: string | null
  photos: string[] | null
  thumbnail: string | null
  content_type: string | null
  saved_at: string
}

type View = 'all' | 'places' | 'posts' | 'videos'

const TYPE_EMOJI: Record<string, string> = {
  food: '🍜', spa: '💆', hotel: '🏨', travel: '✈️',
  shopping: '🛍️', entertainment: '🎉', cafe: '☕',
}

function formatDate(d: string, locale: 'vi' | 'en') {
  return new Date(d).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

/** Unchanged from the previous page — the saved place opens the same service view it always did. */
function buildServiceUrl(f: Favorite) {
  const slug = f.place_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'place'
  const params = new URLSearchParams({
    name: f.place_name,
    ...(f.place_address && { address: f.place_address }),
    ...(f.place_type && { type: f.place_type }),
    placeId: f.place_id,
  })
  return `/service/${slug}?${params.toString()}`
}

function readView(type: string | null): View {
  return type === 'places' || type === 'posts' || type === 'videos' ? type : 'all'
}

export default function SavedView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t, locale } = useTranslation()
  const params = useSearchParams()
  // `?type=` is a real URL, so a filter is bookmarkable and the browser Back button works.
  const view = readView(params.get('type'))

  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [saved, setSaved] = useState<SavedReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    // Saved library (MFS 4.11) = Favorites (places, a preference signal) + saved reviews
    // (a reference/bookmark), fetched together and shown as two kinds under one home.
    Promise.all([
      fetch('/api/favorites').then(r => { if (!r.ok) throw new Error('fav'); return r.json() }),
      fetch('/api/reviews/saved').then(r => { if (!r.ok) throw new Error('saved'); return r.json() }),
    ])
      .then(([fav, sv]) => { setFavorites(fav.favorites || []); setSaved(sv.reviews || []) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  function handleDeleted(placeId: string) {
    setFavorites(prev => prev.filter(f => f.place_id !== placeId))
  }

  const total = favorites.length + saved.length
  const videos = saved.filter((s) => s.content_type === 'video')

  const renderPosts = (list: SavedReview[]) => list.map((s) => (
    <li key={s.id} data-saved-post={s.id}>
      <Link href={`/reviews/${s.id}`} className="flex items-center gap-3 p-3">
        {s.thumbnail || s.photos?.[0] ? (
          // Review media is arbitrary remote storage, not a configured next/image domain
          // — the same reason the previous page and the Explore feed use a plain img.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={s.thumbnail || s.photos![0]}
            alt=""
            loading="lazy"
            className="h-12 w-12 flex-shrink-0 rounded-xl object-cover"
            style={{ background: 'var(--v3-panel-elevated)' }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-violet)' }}
          >
            {s.content_type === 'video' ? <PlayCircle size={17} /> : <FileText size={17} />}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium" style={{ color: 'var(--v3-fg)' }}>
            {s.place_name || t('favorites.postFallback')}
          </span>
          {s.body && (
            <span className="line-clamp-2 block text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{s.body}</span>
          )}
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('favorites.savedAt', { date: formatDate(s.saved_at, locale) })}
          </span>
        </span>
      </Link>
    </li>
  ))

  return (
    <V3Shell
      title={t('favorites.title')}
      subtitle={loading || error ? undefined : t('favorites.count', { n: String(total) })}
      activeTab="/profile"
      user={user ? { name: user.full_name, avatarUrl: user.avatar_url } : null}
    >
      <div className="mx-auto w-full max-w-[1180px] space-y-4">
        <SavedHero view={view} />

        {error ? (
          <div
            className="rounded-2xl border border-dashed px-6 py-10 text-center"
            style={{ borderColor: 'var(--v3-border)', color: 'var(--v3-fg-muted)' }}
          >
            <p className="text-[13px] font-semibold" style={{ color: 'var(--v3-fg-secondary)' }}>{t('favorites.loadError')}</p>
            <p className="mt-1 text-[12px]">{t('favorites.loadErrorHint')}</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--v3-fg-muted)' }} />
          </div>
        ) : view === 'all' ? (
          <>
            <SavedHub placesCount={favorites.length} postsCount={saved.length} />
            {total === 0 && <SavedEmpty />}
          </>
        ) : view === 'places' ? (
          <CategoryView title={t('favorites.placesHeading')} empty={favorites.length === 0}>
            {favorites.map((f) => (
              <li key={f.id} data-saved-place={f.place_id} className="flex items-center gap-2 pr-2">
                <Link href={buildServiceUrl(f)} className="flex min-w-0 flex-1 items-center gap-3 p-3">
                  <span className="flex-shrink-0 text-xl" aria-hidden="true">{TYPE_EMOJI[f.place_type] || '📍'}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium" style={{ color: 'var(--v3-fg)' }}>{f.place_name}</span>
                    {f.place_address && (
                      <span className="block truncate text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{f.place_address}</span>
                    )}
                    <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
                      {t('favorites.savedAt', { date: formatDate(f.created_at, locale) })}
                    </span>
                  </span>
                </Link>
                {/* The existing delete control, reused — un-saving still goes through the same route. */}
                <FavoriteDeleteButton placeId={f.place_id} onDeleted={() => handleDeleted(f.place_id)} />
              </li>
            ))}
          </CategoryView>
        ) : view === 'posts' ? (
          <CategoryView title={t('favorites.savedPostsHeading')} empty={saved.length === 0}>
            {renderPosts(saved)}
          </CategoryView>
        ) : (
          <CategoryView title={t('favorites.videosHeading')} empty={videos.length === 0}>
            {renderPosts(videos)}
          </CategoryView>
        )}
      </div>

      <V3Footer />
    </V3Shell>
  )
}

/**
 * The hero card: label, title, subtitle, the filter chips, and the reading-otter mascot on the
 * right (a local `/public/tappy` pose — no remote art).
 */
function SavedHero({ view }: { view: View }) {
  const { t } = useTranslation()
  return (
    <section
      data-saved-hero
      aria-labelledby="saved-hero-title"
      className="relative overflow-hidden rounded-3xl border p-5 sm:p-7"
      style={{
        borderColor: 'var(--v3-border)',
        background: 'radial-gradient(120% 140% at 85% 20%, rgba(51,145,255,0.22), transparent 55%), linear-gradient(135deg, rgba(15,30,70,0.9), var(--v3-panel))',
      }}
    >
      <div className="relative z-[1] max-w-[640px]">
        <p className="flex items-center gap-2 text-[15px] font-bold" style={{ color: 'var(--v3-accent)' }}>
          <Bookmark size={18} fill="currentColor" aria-hidden="true" />
          {t('favorites.title')}
        </p>
        <h2 id="saved-hero-title" className="mt-2 text-[24px] font-extrabold leading-tight sm:text-[32px]" style={{ color: 'var(--v3-fg)' }}>
          {t('favorites.hero.title')}
        </h2>
        <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed sm:text-[15px]" style={{ color: 'var(--v3-fg-secondary)' }}>
          {t('favorites.hero.subtitle')}
        </p>
        <SavedFilters view={view} />
      </div>

      <div className="pointer-events-none absolute bottom-0 right-2 hidden items-end md:flex lg:right-6" aria-hidden="true">
        <Sparkles size={22} className="mb-24 mr-1" style={{ color: '#FBBF24' }} />
        <TappyMascot pose="reading" size={190} className="h-[190px] w-[190px]" />
        <p
          className="mb-20 ml-1 hidden w-[120px] -rotate-12 text-[20px] font-semibold italic leading-tight lg:block"
          style={{ color: '#93C5FD', fontFamily: 'cursive' }}
        >
          {t('favorites.hero.tagline')}
        </p>
      </div>
    </section>
  )
}

type Chip = { key: string; icon: LucideIcon; labelKey: string; view?: View }

// Order and icons follow the reference. `view` absent = no data source → disabled chip.
const CHIPS: Chip[] = [
  { key: 'all', icon: LayoutGrid, labelKey: 'favorites.filter.all', view: 'all' },
  { key: 'places', icon: MapPin, labelKey: 'favorites.filter.places', view: 'places' },
  { key: 'posts', icon: FileText, labelKey: 'favorites.filter.posts', view: 'posts' },
  { key: 'videos', icon: PlayCircle, labelKey: 'favorites.filter.videos', view: 'videos' },
  // Deals and Bộ sưu tập (in the reference) are hidden until something can be saved there (owner 2026-09-28).
]

function SavedFilters({ view }: { view: View }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('favorites.filter.aria')} data-saved-filters className="v3-scroll-x -mx-1 mt-5 flex gap-2 px-1 pb-1 md:flex-wrap md:pr-40 lg:pr-56">
      {CHIPS.map(({ key, icon: Icon, labelKey, view: target }) => {
        if (!target) {
          return (
            <span
              key={key}
              data-saved-chip={key}
              aria-disabled="true"
              title={t('favorites.filter.soon')}
              className="flex min-h-[40px] flex-shrink-0 cursor-not-allowed items-center gap-2 rounded-full px-4 text-[13px] opacity-50"
              style={{ color: 'var(--v3-fg-secondary)' }}
            >
              <Icon size={16} aria-hidden="true" />
              {t(labelKey)}
              <span className="rounded-full px-1.5 py-px text-[9.5px] font-semibold uppercase" style={{ background: 'var(--v3-panel-elevated)' }}>
                {t('favorites.filter.soon')}
              </span>
            </span>
          )
        }
        const active = target === view
        return (
          <Link
            key={key}
            href={target === 'all' ? '/profile/favorites' : `/profile/favorites?type=${target}`}
            data-saved-chip={key}
            aria-current={active ? 'page' : undefined}
            className="flex min-h-[40px] flex-shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-colors hover:bg-white/5"
            style={active
              ? { borderColor: 'var(--v3-accent)', color: 'var(--v3-fg)', background: 'rgba(51,145,255,0.12)' }
              : { borderColor: 'transparent', color: 'var(--v3-fg-secondary)' }}
          >
            <Icon size={16} aria-hidden="true" style={active ? { color: 'var(--v3-accent)' } : undefined} />
            {t(labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * The two count cards — one per REAL saved dataset.
 *
 * 🚨 ZERO IS SHOWN, NOT HIDDEN (§4). A category with nothing in it still renders its card and its
 * 0 — hiding it would make the page look fuller than the account is.
 */
function SavedHub({ placesCount, postsCount }: { placesCount: number; postsCount: number }) {
  const { t } = useTranslation()
  const cards = [
    {
      key: 'places', icon: MapPin, label: t('favorites.placesHeading'), desc: t('favorites.card.placesDesc'),
      unit: t('favorites.unit.places'), count: placesCount, tile: '#1D6FE0',
    },
    {
      key: 'posts', icon: FileText, label: t('favorites.savedPostsHeading'), desc: t('favorites.card.postsDesc'),
      unit: t('favorites.unit.posts'), count: postsCount, tile: '#6D4FD8',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-saved-hub>
      {cards.map(({ key, icon: Icon, label, desc, unit, count, tile }) => (
        <Link
          key={key}
          href={`/profile/favorites?type=${key}`}
          data-saved-category={key}
          className="v3-panel relative flex min-h-[120px] items-center gap-4 overflow-hidden p-5 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2"
        >
          <Icon
            size={96}
            strokeWidth={1}
            aria-hidden="true"
            className="pointer-events-none absolute right-24 top-1/2 -translate-y-1/2"
            style={{ color: 'rgba(255,255,255,0.05)' }}
          />
          <span
            aria-hidden="true"
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: tile }}
          >
            <Icon size={22} />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-[16px] font-bold" style={{ color: 'var(--v3-fg)' }}>{label}</span>
            <span className="mt-1 block text-[12.5px] leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>{desc}</span>
          </span>
          <span className="relative flex flex-shrink-0 flex-col items-center">
            <span data-saved-count={key} className="text-[30px] font-extrabold leading-none tabular-nums" style={{ color: 'var(--v3-fg)' }}>
              {count}
            </span>
            <span className="mt-1.5 text-[12.5px]" style={{ color: 'var(--v3-fg-secondary)' }}>{unit}</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" className="relative flex-shrink-0" style={{ color: 'var(--v3-fg-secondary)' }} />
        </Link>
      ))}
    </div>
  )
}

/** Nothing saved at all: one card, one real discovery route (Explore = `/reviews`). */
function SavedEmpty() {
  const { t } = useTranslation()
  return (
    <section data-saved-empty aria-labelledby="saved-empty-title" className="v3-panel flex flex-col items-center px-6 py-10 text-center sm:py-12">
      <div className="relative">
        <Sparkles size={14} aria-hidden="true" className="absolute -left-10 top-8" style={{ color: '#93C5FD' }} />
        <Sparkles size={12} aria-hidden="true" className="absolute -right-9 top-3" style={{ color: '#93C5FD' }} />
        <span
          aria-hidden="true"
          className="flex h-20 w-20 items-center justify-center rounded-2xl"
          style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-accent)' }}
        >
          <Bookmark size={34} fill="currentColor" />
        </span>
      </div>
      <h3 id="saved-empty-title" className="mt-5 text-[20px] font-bold" style={{ color: 'var(--v3-fg)' }}>
        {t('favorites.hub.emptyTitle')}
      </h3>
      <p className="mx-auto mt-2 max-w-[60ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>
        {t('favorites.hub.emptyHint')}
      </p>
      <Link
        href="/reviews"
        data-saved-explore
        className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-full px-7 text-[15px] font-semibold transition-opacity hover:opacity-90"
        style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
      >
        <Compass size={18} aria-hidden="true" />
        {t('favorites.exploreCta')}
      </Link>
    </section>
  )
}

/**
 * One category's contents.
 *
 * The back control reuses `favorites.title` — the destination's own name — so returning to the hub
 * needs no new string and reads as "back to Saved".
 */
function CategoryView({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <section className="v3-panel mx-auto w-full max-w-[720px] overflow-hidden" data-saved-category-view>
      <header className="v3-panel-header">
        <Link href="/profile/favorites" className="flex items-center gap-1 text-[12px] hover:underline" style={{ color: 'var(--v3-accent)' }}>
          <ChevronLeft size={14} aria-hidden="true" />
          {t('favorites.title')}
        </Link>
        <h2 className="v3-panel-title">{title}</h2>
      </header>

      {empty ? (
        <div className="px-6 py-12 text-center" style={{ color: 'var(--v3-fg-muted)' }}>
          <p className="text-[13px] font-medium" style={{ color: 'var(--v3-fg-secondary)' }}>{t('favorites.empty')}</p>
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[12px] leading-relaxed">{t('favorites.emptyHint')}</p>
          {/* A real discovery route, not a fabricated recommendation (§7). */}
          <Link
            href="/reviews"
            className="mt-4 inline-flex min-h-[36px] items-center rounded-full px-4 text-[12.5px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
          >
            {t('favorites.exploreCta')}
          </Link>
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--v3-border)' }}>{children}</ul>
      )}
    </section>
  )
}
