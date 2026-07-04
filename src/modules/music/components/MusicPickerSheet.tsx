'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MusicTrack } from '../types/track'
import type { MusicSelection } from '../types/selection'
import { useMusic } from '../hooks/useMusic'
import { useMusicSearch } from '../hooks/useMusicSearch'
import { useMusicCategories } from '../hooks/useMusicCategories'
import { getPreviewUrl } from '../services/musicService'
import { MusicPickerHeader } from './MusicPickerHeader'
import { MusicSearchInput } from './MusicSearchInput'
import { MusicCategoryTabs } from './MusicCategoryTabs'
import { MusicTrackList } from './MusicTrackList'
import { MusicSelectionPanel } from './MusicSelectionPanel'

interface MusicPickerSheetProps {
  open: boolean
  onClose: () => void
  onSelect: (selection: MusicSelection) => void
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// The reusable Music Picker bottom sheet. Consuming features (Reviews,
// Explore, Story, ...) render this and only ever receive back a
// { trackId, startSec, volume } MusicSelection — nothing feature-specific
// is attached, and this component never imports any feature.
export function MusicPickerSheet({ open, onClose, onSelect }: MusicPickerSheetProps) {
  const { categories } = useMusicCategories()
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const browse = useMusic({ categoryId: activeCategoryId ?? undefined })
  const { query, setQuery, results, loading: searchLoading, error: searchError } = useMusicSearch()

  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null)
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const stopPreview = useCallback(() => {
    audioRef.current?.pause()
    setPreviewingTrackId(null)
  }, [])

  const handleClose = useCallback(() => {
    stopPreview()
    onClose()
  }, [stopPreview, onClose])

  // Start every open with a clean slate: no leftover selection, search, or
  // playing preview from a previous session.
  useEffect(() => {
    if (!open) return
    setSelectedTrack(null)
    setActiveCategoryId(null)
    setQuery('')
    stopPreview()
  }, [open, setQuery, stopPreview])

  // Focus the sheet when it opens; restore focus to whatever triggered it
  // when it closes.
  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement
      panelRef.current?.focus()
    } else {
      previouslyFocused.current?.focus()
    }
  }, [open])

  // Escape closes the sheet; Tab/Shift+Tab wraps focus within it.
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleClose()
        return
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose])

  function handleTogglePreview(track: MusicTrack) {
    const audio = audioRef.current
    if (!audio) return
    if (previewingTrackId === track.id) {
      audio.pause()
      setPreviewingTrackId(null)
      return
    }
    // Swapping src on the single shared <audio> element is what guarantees
    // only one preview ever plays at a time.
    audio.src = getPreviewUrl(track)
    audio.play().catch(() => {})
    setPreviewingTrackId(track.id)
  }

  function handleSelectTrack(track: MusicTrack) {
    stopPreview()
    setSelectedTrack(track)
  }

  function handleConfirm(selection: MusicSelection) {
    stopPreview()
    onSelect(selection)
    onClose()
  }

  if (!open) return null

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
    <>
      <div
        className="fixed inset-0 z-40 animate-fade-in bg-black/40"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Chọn nhạc nền"
        tabIndex={-1}
        className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[80vh] flex-col rounded-t-3xl bg-white outline-none animate-slide-up dark:bg-gray-900 md:left-1/2 md:w-[420px] md:-translate-x-1/2"
      >
        <div className="flex flex-shrink-0 justify-center py-2">
          <div className="h-1 w-8 rounded-full bg-gray-300 dark:bg-gray-700" />
        </div>

        {selectedTrack ? (
          <div className="overflow-y-auto">
            <MusicSelectionPanel
              track={selectedTrack}
              onBack={() => setSelectedTrack(null)}
              onConfirm={handleConfirm}
            />
          </div>
        ) : (
          <>
            <MusicPickerHeader title="Chọn nhạc nền" onClose={handleClose} />
            <MusicSearchInput value={query} onChange={setQuery} />
            {!isSearching && (
              <MusicCategoryTabs
                categories={categories}
                activeCategoryId={activeCategoryId}
                onSelect={setActiveCategoryId}
              />
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <MusicTrackList
                tracks={list.tracks}
                loading={list.loading}
                error={list.error}
                hasMore={list.hasMore}
                onLoadMore={list.loadMore}
                previewingTrackId={previewingTrackId}
                onSelectTrack={handleSelectTrack}
                onTogglePreview={handleTogglePreview}
              />
            </div>
          </>
        )}
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- instrumental preview clip, no captionable content */}
      <audio ref={audioRef} onEnded={() => setPreviewingTrackId(null)} className="hidden" />
    </>
  )
}
