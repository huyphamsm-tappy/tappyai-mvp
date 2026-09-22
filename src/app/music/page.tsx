'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Flame, Headphones, Mic2, Music, Music2, Sparkles } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import TappyPresence from '@/components/v3/TappyPresence'
import { goBack } from '@/lib/nav/inAppBack'
import { SMART_TOOLS_HREF } from '@/lib/tools/registry'
import type { MusicCategory, MusicTrack } from '@/modules/music'
import {
  useMusic,
  useMusicSearch,
  useMusicCategories,
  getPreviewUrl,
  getCategoryLabel,
  MusicSearchInput,
  MusicCategoryTabs,
  MusicTrackGrid,
} from '@/modules/music'

// Standalone Music Library — browse the catalog by category, search, and play
// a preview. Reuses the Music Module's public hooks + components (the same ones
// the review-soundtrack picker uses); tapping a tile plays/pauses its preview.
//
// ── The redesign (owner's Music Library reference, 2026-09-12) ─────────────
//
// The page went from a phone-width list to the reference's destination: one dark
// frame on the V3 token surface, a centred title bar, a wide search, a blue→violet
// hero with Tappy on the right, the category chips, a "trending" rail and an
// image-led tile grid.
//
// 🔑 SAME HOOKS, SAME AUDIO, SAME ROUTES. `useMusic` / `useMusicSearch` /
// `useMusicCategories` drive exactly what they drove before; the single shared
// `<audio>` is still the only player. What changed is presentation: the list became
// `MusicTrackGrid` (the module's tile grid, same props as the list) and the
// search/tabs took their opt-in `appearance="v3"`.
//
// ── Phase 7 (2026-09-22): the LIBRARY is back; the reuse path is not ──────
//
// F-024 retired this page to a "feature removed" notice along with everything
// music. The owner's decision was narrower: kill "use this sound" (borrowing the
// audio of another user's clip) and the user audio upload, keep the licensed
// library. So this page is the approved redesign again, minus the two things
// that were the reuse path: the `/music/upload` action (UGC "Original Sound")
// and its hero pill. The hooks read `/api/music/*`, which serve library tracks
// only. Back pops in-app history (Smart Tools is the usual parent) instead of
// pushing Home.
//
// 🚨 NOTHING HERE CLAIMS A FEATURE THE MODULE LACKS. The reference shows
// a "my music" action, a "favourites" chip, three mood chips the DB lacks (sleep /
// focus / work) and a search that includes genres. There is no favourites model, the categories are
// whatever `music_categories` holds (six today), and search matches title and
// artist only — so those elements are absent, the chips come from the DB, and the
// search keeps its honest placeholder. The hero pills name four things the module
// actually does: mood categories, in-page preview, review soundtracks, upload.
//
// 🔑 "TRENDING" IS A CATEGORY, NOT A METRIC. The module has no play counts. The
// rail shows the first tiles of the DB category whose slug is `trending`, and
// "see all" simply selects that category — the same action as tapping its chip.
// No category with that slug → no rail.
const TRENDING_SLUG = 'trending'
const TRACKS_ANCHOR = 'music-tracks'

export default function MusicLibraryPage() {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const { categories } = useMusicCategories()
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const browse = useMusic({ categoryId: activeCategoryId ?? undefined })
  const { query, setQuery, results, loading: searchLoading, error: searchError } = useMusicSearch()

  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const togglePreview = useCallback((track: MusicTrack) => {
    const audio = audioRef.current
    if (!audio) return
    if (previewingTrackId === track.id) {
      audio.pause()
      setPreviewingTrackId(null)
      return
    }
    // Single shared <audio> — swapping src guarantees only one preview plays.
    audio.src = getPreviewUrl(track)
    audio.play().catch(() => {})
    setPreviewingTrackId(track.id)
  }, [previewingTrackId])

  const isSearching = query.trim().length > 0
  const list = isSearching
    ? { tracks: results, loading: searchLoading, error: searchError, hasMore: false, loadMore: undefined }
    : {
        tracks: browse.tracks,
        loading: browse.loading,
        error: browse.error,
        hasMore: browse.hasMore,
        loadMore: browse.loadMore,
      }

  const trendingCategory = categories.find((c) => c.slug === TRENDING_SLUG)
  const activeCategory = activeCategoryId ? categories.find((c) => c.id === activeCategoryId) : undefined
  const showTrendingRail = !isSearching && activeCategoryId === null && !!trendingCategory

  const selectCategoryAndScroll = useCallback((categoryId: string) => {
    setActiveCategoryId(categoryId)
    document.getElementById(TRACKS_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const sectionTitle = isSearching
    ? t('music.sectionResults')
    : activeCategory
      ? getCategoryLabel(activeCategory, locale)
      : t('music.sectionAll')

  return (
    <div className="v3-theme min-h-dvh pb-24">
      <div className="mx-auto w-full max-w-[1240px] px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-6">
        <div className="v3-music-frame flex flex-col gap-6 p-4 sm:gap-7 sm:p-6 lg:gap-8 lg:p-8">
          {/* ── Title bar ──────────────────────────────────────────────────
              Back / title / upload, exactly the three things the old bar had. The
              title is centred between two equal-width wings so it stays centred no
              matter how long the two actions are.

              🚨 BELOW `sm` THE WINGS COLLAPSE TO THEIR ICONS. At 375px the three
              labels side by side truncated the page title (measured at 375px);
              the two actions keep their names for assistive tech via `aria-label`
              and show them again from `sm`, where there is room. */}
          <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <button
              type="button"
              onClick={() => goBack(router, SMART_TOOLS_HREF)}
              aria-label={t('common.back')}
              className="inline-flex h-10 w-10 items-center justify-center whitespace-nowrap rounded-full text-[15px] font-semibold focus:outline-none focus-visible:ring-2 sm:h-auto sm:w-fit sm:justify-start sm:gap-1 sm:py-2 sm:pr-2"
              style={{ color: 'var(--v3-accent)' }}
              data-in-app-back={SMART_TOOLS_HREF}
            >
              <ChevronLeft size={22} aria-hidden="true" />
              <span className="hidden sm:inline">{t('common.back')}</span>
            </button>
            <h1 className="flex items-center gap-2 whitespace-nowrap text-[18px] font-bold tracking-[-0.01em] sm:text-[22px]" style={{ color: 'var(--v3-fg)' }}>
              <Music2 size={20} aria-hidden="true" className="flex-shrink-0" style={{ color: 'var(--v3-violet)' }} />
              {t('music.title')}
            </h1>
            {/* The right wing held the `/music/upload` action (user "Original Sound" upload).
                That is the reuse path and stays withdrawn; an empty wing keeps the title centred. */}
            <span aria-hidden="true" />
          </header>

          {/* ── Search ─────────────────────────────────────────────────── */}
          <div className="mx-auto w-full max-w-[760px]">
            <MusicSearchInput value={query} onChange={setQuery} appearance="v3" />
          </div>

          {/* ── Hero ───────────────────────────────────────────────────── */}
          <section className="v3-music-hero" aria-labelledby="music-hero-title">
            <span className="v3-music-hero-bars" aria-hidden="true" />

            {/* md: copy | character, pills wrapping underneath both. lg: copy | character | pills.
                Below md everything stacks and a SMALL Tappy sits in the top-right corner. */}
            <div className="relative grid gap-6 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:grid-cols-[minmax(0,1.15fr)_auto_minmax(0,0.9fr)] lg:gap-8 lg:p-10">
              {/* Phone-size companion. Below `sm` the headline's second line would run under
                  him, so the copy starts 64px lower and only the short first line shares his
                  band — measured at 375px, where the second headline line is ~250px of a 271px
                  column. From `sm` the column is wide enough and the offset goes. */}
              <div className="absolute right-4 top-4 md:hidden" aria-hidden="true">
                <TappyPresence pose="aitools" size={96} aura="calm" />
              </div>

              <div className="min-w-0 pt-16 sm:pt-0">
                <h2 id="music-hero-title" className="text-[30px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[38px] lg:text-[44px]">
                  {t('music.heroTitle1')}
                  <br />
                  <span className="v3-music-hero-accent">{t('music.heroTitle2')}</span>
                </h2>
                <p className="v3-music-hero-muted mt-4 max-w-[34ch] text-[14.5px] leading-relaxed sm:text-[16px]">
                  {t('music.heroBody')}
                </p>
                <a
                  href={`#${TRACKS_ANCHOR}`}
                  className="v3-music-hero-cta mt-6 inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-[14.5px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {t('music.heroCta')}
                  <ChevronRight size={18} aria-hidden="true" />
                </a>
              </div>

              {/* The character: the owner's `aitools` pose (laptop + music note) is the
                  closest music pose in the library — there is no headphones pose, and
                  the art is the owner's to add, not ours to invent. Hidden below `md`,
                  where the copy needs the width. */}
              {/* `calm`, not `full`: the full aura's orbit swept back under the copy at 1440
                  (owner UAT); calm keeps the bloom on the character and nothing crosses the
                  text. At lg the column hugs the right so he reads as standing beside the
                  pills, as in the reference. */}
              <div className="relative hidden md:flex md:justify-center md:px-4 lg:justify-end lg:pl-2 lg:pr-0" aria-hidden="true">
                {/* The floating notes ride with the character, so they land beside him at
                    every breakpoint instead of over the headline. */}
                <Music className="v3-music-hero-note -left-1 top-0" size={34} />
                <Music2 className="v3-music-hero-note -right-2 top-6" size={26} style={{ color: 'rgba(244,114,182,0.75)' }} />
                <Sparkles className="v3-music-hero-note -right-4 bottom-8" size={22} />
                <TappyPresence pose="aitools" size={170} aura="calm" className="lg:hidden" />
                <TappyPresence pose="aitools" size={240} aura="calm" className="hidden lg:block" />
              </div>

              {/* Below `sm` only the first two pills show — four stacked made the phone hero
                  ~500px tall (owner UAT). Presentation only; the list itself is unchanged. */}
              <ul className="flex flex-wrap gap-2 md:col-span-2 lg:col-span-1 lg:flex-col lg:gap-2.5">
                {HERO_PILLS.map(({ key, icon: Icon, tint }, index) => (
                  <li key={key} className={`v3-music-hero-pill items-center gap-2.5 rounded-2xl px-3.5 py-2 text-[13px] font-medium lg:px-4 lg:py-2.5 lg:text-[14px] ${index >= 2 ? 'hidden sm:inline-flex' : 'inline-flex'}`}>
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tint, color: '#fff' }} aria-hidden="true">
                      <Icon size={14} />
                    </span>
                    {t(key)}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── Category chips ─────────────────────────────────────────── */}
          {!isSearching && (
            <MusicCategoryTabs
              categories={categories}
              activeCategoryId={activeCategoryId}
              onSelect={setActiveCategoryId}
              appearance="v3"
            />
          )}

          {/* ── Trending rail ──────────────────────────────────────────── */}
          {showTrendingRail && trendingCategory && (
            <TrendingRail
              category={trendingCategory}
              previewingTrackId={previewingTrackId}
              onTogglePreview={togglePreview}
              onSeeAll={() => selectCategoryAndScroll(trendingCategory.id)}
            />
          )}

          {/* ── The catalogue ──────────────────────────────────────────── */}
          <section id={TRACKS_ANCHOR} aria-labelledby="music-tracks-title" className="scroll-mt-4">
            <SectionHeading id="music-tracks-title" title={sectionTitle} />
            <MusicTrackGrid
              tracks={list.tracks}
              loading={list.loading}
              error={list.error}
              hasMore={list.hasMore}
              onLoadMore={list.loadMore}
              previewingTrackId={previewingTrackId}
              onTogglePreview={togglePreview}
            />
          </section>
        </div>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- instrumental preview clip */}
      <audio ref={audioRef} onEnded={() => setPreviewingTrackId(null)} className="hidden" />
    </div>
  )
}

/** Three things the module really does — see the page note. Presentation only.
 *  (The fourth, "upload your Original Sound", left with the reuse path.) */
const HERO_PILLS = [
  { key: 'music.pillMoods', icon: Sparkles, tint: '#F59E0B' },
  { key: 'music.pillPreview', icon: Headphones, tint: '#EC4899' },
  { key: 'music.pillSoundtrack', icon: Mic2, tint: '#3B82F6' },
] as const

function SectionHeading({ id, title, icon, action }: { id: string; title: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={id} className="v3-music-section-title flex items-center gap-2 text-[18px] font-bold tracking-[-0.01em] sm:text-[20px]">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  )
}

/**
 * The first row of the `trending` category, with a "see all" that selects it.
 *
 * A child component rather than a second hook in the page so `useMusic` only mounts once the
 * category is known — otherwise it would fetch six unfiltered tracks and then refetch.
 */
function TrendingRail({
  category,
  previewingTrackId,
  onTogglePreview,
  onSeeAll,
}: {
  category: MusicCategory
  previewingTrackId: string | null
  onTogglePreview: (track: MusicTrack) => void
  onSeeAll: () => void
}) {
  const { t, locale } = useTranslation()
  const trending = useMusic({ categoryId: category.id, limit: 6 })
  // An empty or failing category rail is simply absent — the catalogue below still renders.
  if (trending.error || (!trending.loading && trending.tracks.length === 0)) return null

  return (
    <section aria-labelledby="music-trending-title" data-music-trending>
      <SectionHeading
        id="music-trending-title"
        title={getCategoryLabel(category, locale)}
        icon={<Flame size={20} aria-hidden="true" style={{ color: '#F97316' }} />}
        action={
          <button
            type="button"
            onClick={onSeeAll}
            className="v3-music-seeall inline-flex items-center gap-0.5 rounded-full py-1 text-[13.5px] focus:outline-none focus-visible:ring-2"
          >
            {t('music.seeAll')}
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        }
      />
      <MusicTrackGrid
        tracks={trending.tracks}
        loading={trending.loading}
        error={trending.error}
        previewingTrackId={previewingTrackId}
        onTogglePreview={onTogglePreview}
        max={6}
      />
    </section>
  )
}
