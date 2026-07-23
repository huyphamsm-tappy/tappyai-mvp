'use client'

import Link from 'next/link'
import { MusicThumbnail, MusicDuration, useMusicTrack } from '@/modules/music'

interface ReviewMusicCardProps {
  playKey: string
  trackId: string
  startSec: number
  volume: number
}

// Label + "use this sound" link only. Playback is NOT owned here — the clip's
// audio (its own, or a borrowed attached sound) is played by the hero VideoPlayer,
// the single playback engine shared with the feed. Keeping an independent Audio
// element here would create a second, unsynchronized source, so it was removed.
export default function ReviewMusicCard({ trackId }: ReviewMusicCardProps) {
  const { track } = useMusicTrack(trackId)

  return (
    <Link
      href={`/sound/${trackId}`}
      className="flex items-center gap-2.5 rounded-xl bg-black/40 backdrop-blur-sm px-3 py-2 active:opacity-80"
    >
      <MusicThumbnail coverUrl={track?.coverUrl ?? null} title={track?.title ?? ''} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white">{track?.title ?? 'Đang tải...'}</p>
        {track?.artist && <p className="truncate text-[11px] text-white/60">{track.artist}</p>}
      </div>
      {track && <MusicDuration seconds={track.durationSec} className="flex-shrink-0 text-[11px] text-white/60" />}
    </Link>
  )
}
