'use client'

import { Music2 } from 'lucide-react'
import { useMusicTrack, getPreviewUrl } from '@/modules/music'
import { musicPlaybackController } from './musicPlaybackController'
import { useMusicPlayback } from './useMusicPlayback'

interface ReviewMusicDiscProps {
  playKey: string
  trackId: string
  startSec: number
  volume: number
}

// The spinning disc in a review's action rail. Only rendered when the review
// actually has an attached soundtrack (the parent guards on r.music), so an
// empty music-note disc never appears. Tapping it toggles that soundtrack
// through the same shared musicPlaybackController the ReviewMusicCard uses —
// one HTMLAudioElement for the whole feed. The disc only spins while playing,
// giving a clear "this is playing" cue.
export default function ReviewMusicDisc({ playKey, trackId, startSec, volume }: ReviewMusicDiscProps) {
  const { track } = useMusicTrack(trackId)
  const playback = useMusicPlayback()
  const isPlaying = playback.playKey === playKey && playback.isPlaying

  function handleToggle() {
    if (!track) return
    if (isPlaying) {
      musicPlaybackController.pause()
      return
    }
    musicPlaybackController.play(playKey, getPreviewUrl(track), startSec, volume, track.durationSec)
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={!track}
      aria-label={isPlaying ? 'Tạm dừng nhạc nền' : 'Phát nhạc nền'}
      className={`w-10 h-10 rounded-full border-2 border-white/30 bg-black/50 flex items-center justify-center transition active:scale-90 disabled:opacity-50 ${isPlaying ? 'animate-spin-slow' : ''}`}
    >
      <Music2 size={16} className="text-white" />
    </button>
  )
}
