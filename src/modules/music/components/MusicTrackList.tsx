import { Loader2, AlertCircle, Music2 } from 'lucide-react'
import type { MusicTrack } from '../types/track'
import { MusicPickerRow } from './MusicPickerRow'

interface MusicTrackListProps {
  tracks: MusicTrack[]
  loading: boolean
  error: string | null
  hasMore?: boolean
  onLoadMore?: () => void
  previewingTrackId: string | null
  onSelectTrack: (track: MusicTrack) => void
  onTogglePreview: (track: MusicTrack) => void
}

export function MusicTrackList({
  tracks,
  loading,
  error,
  hasMore,
  onLoadMore,
  previewingTrackId,
  onSelectTrack,
  onTogglePreview,
}: MusicTrackListProps) {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-gray-500 dark:text-gray-400">
        <AlertCircle size={22} className="opacity-60" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (loading && tracks.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-gray-500 dark:text-gray-400">
        <Music2 size={22} className="opacity-60" />
        <p className="text-sm">Không tìm thấy bài hát nào</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {tracks.map((track) => (
        <MusicPickerRow
          key={track.id}
          track={track}
          isPreviewing={previewingTrackId === track.id}
          onSelect={onSelectTrack}
          onTogglePreview={onTogglePreview}
        />
      ))}
      {hasMore && (
        <div className="flex justify-center py-3">
          {loading ? (
            <Loader2 size={18} className="animate-spin text-gray-400" />
          ) : (
            <button
              type="button"
              onClick={onLoadMore}
              className="text-sm font-medium text-primary-500"
            >
              Xem thêm
            </button>
          )}
        </div>
      )}
    </div>
  )
}
