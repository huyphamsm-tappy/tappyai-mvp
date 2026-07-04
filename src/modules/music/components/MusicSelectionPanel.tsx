import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { MusicTrack } from '../types/track'
import type { MusicSelection } from '../types/selection'
import { createSelection } from '../services/musicService'
import { formatDuration } from '../utils/formatDuration'
import { MusicThumbnail } from './MusicThumbnail'

interface MusicSelectionPanelProps {
  track: MusicTrack
  onBack: () => void
  onConfirm: (selection: MusicSelection) => void
}

const DEFAULT_VOLUME = 1

export function MusicSelectionPanel({ track, onBack, onConfirm }: MusicSelectionPanelProps) {
  const [startSec, setStartSec] = useState(0)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const maxStart = Math.max(0, track.durationSec - 1)

  function handleConfirm() {
    const selection = createSelection(track.id, startSec, volume)
    onConfirm(selection)
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Quay lại danh sách"
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <ChevronLeft size={20} />
        </button>
        <MusicThumbnail coverUrl={track.coverUrl} title={track.title} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{track.title}</p>
          {track.artist && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{track.artist}</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <label htmlFor="music-start-sec">Vị trí bắt đầu</label>
          <span>
            {formatDuration(startSec)} / {formatDuration(track.durationSec)}
          </span>
        </div>
        <input
          id="music-start-sec"
          type="range"
          min={0}
          max={maxStart}
          step={1}
          value={startSec}
          onChange={(e) => setStartSec(Number(e.target.value))}
          className="w-full accent-primary-500"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <label htmlFor="music-volume">Âm lượng</label>
          <span>{Math.round(volume * 100)}%</span>
        </div>
        <input
          id="music-volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-full accent-primary-500"
        />
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        className="w-full rounded-full bg-primary-500 py-3 text-sm font-semibold text-white"
      >
        Chọn nhạc này
      </button>
    </div>
  )
}
