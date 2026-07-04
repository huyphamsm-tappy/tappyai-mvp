import { Play, Square } from 'lucide-react'
import type { MusicTrack } from '../types/track'
import { MusicThumbnail } from './MusicThumbnail'
import { MusicDuration } from './MusicDuration'

interface MusicPickerRowProps {
  track: MusicTrack
  isPreviewing: boolean
  onSelect: (track: MusicTrack) => void
  onTogglePreview: (track: MusicTrack) => void
}

export function MusicPickerRow({ track, isPreviewing, onSelect, onTogglePreview }: MusicPickerRowProps) {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <button
        type="button"
        onClick={() => onSelect(track)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <MusicThumbnail coverUrl={track.coverUrl} title={track.title} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{track.title}</p>
          {track.artist && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{track.artist}</p>
          )}
        </div>
        <MusicDuration seconds={track.durationSec} className="flex-shrink-0 text-xs text-gray-400" />
      </button>
      <button
        type="button"
        onClick={() => onTogglePreview(track)}
        aria-label={isPreviewing ? `Dừng nghe thử ${track.title}` : `Nghe thử ${track.title}`}
        aria-pressed={isPreviewing}
        className="flex-shrink-0 rounded-full bg-primary-500 p-2 text-white"
      >
        {isPreviewing ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      </button>
    </div>
  )
}
