'use client'

import { Music2 } from 'lucide-react'
import { MusicThumbnail, MusicDuration, useMusicTrack, attributionLine } from '@/modules/music'

interface ReviewMusicCardProps {
  playKey: string
  trackId: string
  startSec: number
  volume: number
}

// The credit for a clip's LIBRARY soundtrack: cover, title, "artist · licence",
// duration, and the source page when one is recorded (CC-BY asks for the link).
//
// 🚨 What this is NOT any more: the "use this sound" card. It used to link to
// `/sound/<trackId>` — the page that let another user take this audio — and that
// path is withdrawn (F-024). Nothing here starts a reuse; it only says whose music
// is playing, which is the licence's condition.
//
// Playback is NOT owned here — the clip's audio (its own, or the attached library
// track) is played by the hero VideoPlayer, the single playback engine shared with
// the feed. An independent Audio element here would be a second, unsynchronised
// source, so there is none.
//
// A track the library no longer serves (removed, or never a library row) resolves
// to null: the card then renders nothing rather than a credit it cannot vouch for.
export default function ReviewMusicCard({ trackId }: ReviewMusicCardProps) {
  const { track } = useMusicTrack(trackId)
  if (!track) return null
  const credit = attributionLine(track)
  const body = (
    <>
      <MusicThumbnail coverUrl={track.coverUrl} title={track.title} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white">{track.title}</p>
        {credit && <p className="truncate text-[11px] text-white/60">{credit}</p>}
      </div>
      <MusicDuration seconds={track.durationSec} className="flex-shrink-0 text-[11px] text-white/60" />
    </>
  )
  const className = 'flex items-center gap-2.5 rounded-xl bg-black/40 backdrop-blur-sm px-3 py-2'
  return track.sourceUrl ? (
    <a href={track.sourceUrl} target="_blank" rel="noopener noreferrer" className={`${className} active:opacity-80`} data-review-music={track.id}>
      {body}
    </a>
  ) : (
    <div className={className} data-review-music={track.id}>{body}</div>
  )
}

/**
 * The one-line credit under a feed clip's caption — "♪ Title · Artist · CC-BY".
 * Same rule as the card: the library's row or nothing.
 */
export function ReviewMusicCredit({ trackId }: { trackId: string }) {
  const { track } = useMusicTrack(trackId)
  if (!track) return null
  const credit = attributionLine(track)
  return (
    <p className="mt-1 flex items-center gap-1 truncate text-[11.5px] text-white/70" data-review-music-credit={track.id}>
      <Music2 size={12} aria-hidden="true" className="flex-shrink-0" />
      <span className="truncate">{credit ? `${track.title} · ${credit}` : track.title}</span>
    </p>
  )
}
