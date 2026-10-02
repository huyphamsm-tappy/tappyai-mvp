import { Play, Square } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { MusicTrack } from '../types/track'
import { MusicThumbnail } from './MusicThumbnail'
import { MusicDuration } from './MusicDuration'

interface MusicTrackCardProps {
  track: MusicTrack
  isPreviewing: boolean
  onTogglePreview: (track: MusicTrack) => void
}

/**
 * One track as an image-led tile — the Music Library's card, next to `MusicPickerRow`'s row.
 *
 * 🔑 ONE CONTROL, THE WHOLE CARD. The picker row has two buttons (select + preview) because a
 * picker has two intents. The library has one — hear it — so the entire tile is a single
 * `<button>` that toggles the page's shared preview, and the play glyph in the artwork corner is
 * decoration that mirrors that state. No nested buttons, one tab stop per track, and the
 * accessible name says what pressing it does to THIS track.
 *
 * 🚨 THE ARTWORK BOX IS SQUARE BEFORE THE IMAGE ARRIVES. `aspect-ratio: 1` on the container and
 * a `fill` thumbnail inside it — a slow cover, a broken cover and no cover all occupy the same
 * footprint, so the grid never reflows as pictures land.
 */
export function MusicTrackCard({ track, isPreviewing, onTogglePreview }: MusicTrackCardProps) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={() => onTogglePreview(track)}
      aria-label={t(isPreviewing ? 'music.stopPreview' : 'music.previewTrack', { title: track.title })}
      aria-pressed={isPreviewing}
      data-music-track={track.id}
      data-previewing={isPreviewing || undefined}
      className="v3-music-card group flex w-full flex-col text-left focus:outline-none focus-visible:ring-2"
    >
      <span className="v3-music-card-art relative block w-full overflow-hidden rounded-[14px]" style={{ aspectRatio: '1 / 1' }}>
        <MusicThumbnail coverUrl={track.coverUrl} title={track.title} fill className="rounded-[14px]" />
        <span className="v3-music-card-scrim pointer-events-none absolute inset-0" aria-hidden="true" />
        <span
          className="v3-music-card-play absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          {isPreviewing ? <Square size={14} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
        </span>
        {isPreviewing && (
          <span className="v3-music-card-live absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]">
            {t('music.nowPlaying')}
          </span>
        )}
      </span>

      <span className="mt-3 block min-w-0 px-0.5">
        <span className="v3-music-card-title block truncate text-[14.5px] font-semibold leading-snug md:text-[15px]">
          {track.title}
        </span>
        <span className="v3-music-card-meta mt-0.5 flex items-center gap-1.5 text-[12.5px] leading-snug">
          {track.artist && <span className="truncate">{track.artist}</span>}
          {track.artist && <span aria-hidden="true">·</span>}
          <MusicDuration seconds={track.durationSec} className="flex-shrink-0 tabular-nums" />
        </span>
      </span>
    </button>
  )
}
