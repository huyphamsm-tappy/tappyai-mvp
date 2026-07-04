import type { MusicTrack } from '../types/track'
import { MusicThumbnail } from './MusicThumbnail'
import { MusicDuration } from './MusicDuration'

interface MusicRowProps {
  track: MusicTrack
  onClick?: (track: MusicTrack) => void
}

export function MusicRow({ track, onClick }: MusicRowProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(track)}
      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
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
  )
}
