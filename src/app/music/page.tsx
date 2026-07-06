'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { MusicTrack } from '@/modules/music'
import {
  useMusic,
  useMusicSearch,
  useMusicCategories,
  getPreviewUrl,
  MusicSearchInput,
  MusicCategoryTabs,
  MusicTrackList,
} from '@/modules/music'

// Standalone Music Library — browse the catalog by category, search, and play
// a preview. Reuses the Music Module's public hooks + components (the same ones
// the review-soundtrack picker uses); tapping a row plays/pauses its preview.
export default function MusicLibraryPage() {
  const router = useRouter()
  const { t } = useTranslation()
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

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <header className="sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur">
        <div className="max-w-lg mx-auto flex items-center px-4 h-14">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1 text-sm font-medium text-primary-500"
          >
            <ChevronLeft size={18} /> {t('music.backHome')}
          </button>
          <h1 className="flex-1 text-center font-semibold text-gray-900 dark:text-white pr-16">
            🎵 {t('music.title')}
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-3">
        <MusicSearchInput value={query} onChange={setQuery} />
        {!isSearching && (
          <MusicCategoryTabs
            categories={categories}
            activeCategoryId={activeCategoryId}
            onSelect={setActiveCategoryId}
          />
        )}
        <MusicTrackList
          tracks={list.tracks}
          loading={list.loading}
          error={list.error}
          hasMore={list.hasMore}
          onLoadMore={list.loadMore}
          previewingTrackId={previewingTrackId}
          onSelectTrack={togglePreview}
          onTogglePreview={togglePreview}
        />
      </main>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- instrumental preview clip */}
      <audio ref={audioRef} onEnded={() => setPreviewingTrackId(null)} className="hidden" />
    </div>
  )
}
