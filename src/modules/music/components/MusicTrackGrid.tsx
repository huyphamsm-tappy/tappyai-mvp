import { Loader2, AlertCircle, Music2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { MusicTrack } from '../types/track'
import { MusicTrackCard } from './MusicTrackCard'

interface MusicTrackGridProps {
  tracks: MusicTrack[]
  loading: boolean
  error: string | null
  hasMore?: boolean
  onLoadMore?: () => void
  previewingTrackId: string | null
  onTogglePreview: (track: MusicTrack) => void
  /** Cap the rendered tracks (the trending rail shows one row's worth). */
  max?: number
}

/**
 * `MusicTrackList`'s states and pagination, rendered as `MusicTrackCard` tiles.
 *
 * Same contract as the list — `tracks / loading / error / hasMore / onLoadMore` straight from
 * `useMusic` / `useMusicSearch` — so the Library page swapped its list for this grid without
 * touching a hook. The picker sheet keeps the list; a bottom sheet has no room for tiles.
 *
 * 🚨 THE GRID STEPS 2 → 3 → 4 → 5 → 6. Two up at 375px keeps the cover a real picture (~150px)
 * rather than a stamp; six across at 1440 is the reference's row. Column widths come from the
 * grid alone — nothing here sets a pixel width, so nothing can push the page sideways.
 */
export function MusicTrackGrid({
  tracks,
  loading,
  error,
  hasMore,
  onLoadMore,
  previewingTrackId,
  onTogglePreview,
  max,
}: MusicTrackGridProps) {
  const { t } = useTranslation()

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-12" style={{ color: 'var(--v3-fg-muted)' }}>
        <AlertCircle size={22} className="opacity-70" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (loading && tracks.length === 0) {
    return (
      <div className="flex justify-center py-12" aria-busy="true">
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--v3-fg-muted)' }} />
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12" style={{ color: 'var(--v3-fg-muted)' }}>
        <Music2 size={22} className="opacity-70" />
        <p className="text-sm">{t('music.emptyTracks')}</p>
      </div>
    )
  }

  const shown = max ? tracks.slice(0, max) : tracks

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {shown.map((track) => (
          <MusicTrackCard
            key={track.id}
            track={track}
            isPreviewing={previewingTrackId === track.id}
            onTogglePreview={onTogglePreview}
          />
        ))}
      </div>
      {!max && hasMore && (
        <div className="flex justify-center pt-6">
          {loading ? (
            <Loader2 size={18} className="animate-spin" style={{ color: 'var(--v3-fg-muted)' }} />
          ) : (
            <button
              type="button"
              onClick={onLoadMore}
              className="v3-chip v3-music-chip focus:outline-none focus-visible:ring-2"
            >
              {t('music.loadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
