'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import { Bookmark, MapPin, FileText, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { FavoriteDeleteButton } from './FavoriteDeleteButton'

// ── V3 Web · Saved ──────────────────────────────────────────────────────────
//
// 🚨 TWO ROWS, NOT FIVE, AND THAT IS THE FINDING.
//
// The reference shows Địa điểm · Video · Deals · Sản phẩm · Bài viết. Audited against every
// table and every route in this repo, exactly TWO of those five have a saved data source:
//
//   ✅ ĐỊA ĐIỂM  → `favorites`      (via GET /api/favorites)
//   ✅ BÀI VIẾT  → `review_saves`   (via GET /api/reviews/saved)
//   ❌ DEALS     → measured: zero occurrences of a deal-save table, column, route or handler
//                  anywhere in `src/` or `supabase/`. Nothing can save a deal.
//   ❌ SẢN PHẨM  → there is no product-save model, and `/marketplace` is a RESERVED page that
//                  states it is not built. A saved-products row would count a catalogue that
//                  does not exist yet.
//   ❌ VIDEO     → this one is the trap. Video is not a separate saved dataset: a video is a
//                  `reviews` row whose `content_type` is 'video', and saving one writes the SAME
//                  `review_saves` table as saving a photo post. Listing Video beside Bài viết
//                  would present one dataset as two and count the same saves twice.
//
// 🚨 THE NEAR MISS, RECORDED SO IT IS NOT RE-LITIGATED: `music_saved` IS a real owner-scoped
// table with a real save/unsave route (`/api/sound/[trackId]/save`). It is omitted anyway,
// because there is no endpoint or page that LISTS a user's saved tracks — a row for it would be
// a count leading to a dead end, which §6 forbids. It is the one category that could become real
// with a list endpoint and a destination, and nothing else here is close.
//
// 🚨 THE COUNTS ARE THE LENGTHS OF THE LISTS THEMSELVES. Both numbers come from the very payload
// the destination renders, so the count can never disagree with what opens. That is deliberate:
// a separate `count(*)` over `review_saves` would be LARGER than the list, because
// `/api/reviews/saved` applies `publishableFilter()` and `stripUnservableMedia` — a saved post
// held by moderation is not served, and must not be advertised as available either.
//
// 🚨 NO NEW BACKEND. Same two endpoints the previous page already called, same owner scoping,
// same safety filters, same RLS. This is a restyle plus a real filter, not a data change.

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

export default function SavedView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t, locale } = useTranslation()
  const params = useSearchParams()
  // `?type=` is a real URL, so a category is bookmarkable and the browser Back button works —
  // rather than a tab index that vanishes on reload.
  const view = params.get('type') === 'places' ? 'places' : params.get('type') === 'posts' ? 'posts' : null

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

  return (
    <V3Shell
      title={t('favorites.title')}
      subtitle={loading || error ? undefined : t('favorites.count', { n: String(total) })}
      activeTab="/profile"
      user={user ? { name: user.full_name, avatarUrl: user.avatar_url } : null}
    >
      {/* 🚨 A UTILITY HUB, NOT A DASHBOARD (§12). One centred column, no right rail — Saved is
          deliberately simpler than Profile. */}
      <div className="mx-auto w-full max-w-[560px]">
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
        ) : view === null ? (
          <SavedHub placesCount={favorites.length} postsCount={saved.length} />
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
        ) : (
          <CategoryView title={t('favorites.savedPostsHeading')} empty={saved.length === 0}>
            {saved.map((s) => (
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
                      <FileText size={17} />
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
            ))}
          </CategoryView>
        )}
      </div>

      <V3Footer />
    </V3Shell>
  )
}

/**
 * The hub: one row per REAL saved category.
 *
 * 🚨 ZERO IS SHOWN, NOT HIDDEN (§4). A category with nothing in it still renders its row and its
 * 0 — hiding it would make the page look fuller than the account is, and would also make the row
 * appear and disappear as the user saves their first item.
 */
function SavedHub({ placesCount, postsCount }: { placesCount: number; postsCount: number }) {
  const { t } = useTranslation()
  const rows = [
    { key: 'places', icon: MapPin, label: t('favorites.placesHeading'), count: placesCount, tone: 'var(--v3-accent)' },
    { key: 'posts', icon: FileText, label: t('favorites.savedPostsHeading'), count: postsCount, tone: 'var(--v3-violet)' },
  ]

  return (
    <section className="v3-panel overflow-hidden" data-saved-hub>
      <header className="v3-panel-header">
        <span className="v3-panel-icon" style={{ background: 'rgba(139,92,246,0.16)', color: 'var(--v3-violet)' }} aria-hidden="true">
          <Bookmark size={13} />
        </span>
        {/* The nav already calls this destination "Saved" — the page uses the SAME word rather
            than introducing a second name for one place (§3). */}
        <h2 className="v3-panel-title">{t('favorites.title')}</h2>
      </header>

      <ul>
        {rows.map(({ key, icon: Icon, label, count, tone }, i) => (
          <li key={key} style={i > 0 ? { borderTop: '1px solid var(--v3-border)' } : undefined}>
            <Link
              href={`/profile/favorites?type=${key}`}
              data-saved-category={key}
              className="flex min-h-[64px] items-center gap-3 px-4 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2"
            >
              <span
                aria-hidden="true"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'var(--v3-panel-elevated)', color: tone }}
              >
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium" style={{ color: 'var(--v3-fg)' }}>
                {label}
              </span>
              <span data-saved-count={key} className="flex-shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: 'var(--v3-fg-secondary)' }}>
                {count}
              </span>
              <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--v3-fg-muted)' }} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One category's contents.
 *
 * The back control reuses `favorites.title` — the destination's own name — so returning to the hub
 * needs no new string and reads as "back to Saved".
 */
function CategoryView({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <section className="v3-panel overflow-hidden" data-saved-category-view>
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
