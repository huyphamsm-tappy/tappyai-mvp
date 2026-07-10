'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Play, Pause } from 'lucide-react'
import { MusicThumbnail, MusicDuration, useMusicTrack, getPreviewUrl } from '@/modules/music'
import { musicPlaybackController } from './musicPlaybackController'
import { useMusicPlayback } from './useMusicPlayback'

interface ReviewMusicCardProps {
  playKey: string
  trackId: string
  startSec: number
  volume: number
  // When true (this clip is the active slide and it borrowed a sound), the
  // sound auto-plays over the muted video — TikTok reuse. Stops on scroll away.
  active?: boolean
}

// Never owns an Audio element itself — reads shared state via
// useMusicPlayback and emits play/pause intent to musicPlaybackController,
// which owns the single HTMLAudioElement for the whole Reviews feature.
export default function ReviewMusicCard({ playKey, trackId, startSec, volume, active = false }: ReviewMusicCardProps) {
  const { track } = useMusicTrack(trackId)
  const playback = useMusicPlayback()
  const isActive = playback.playKey === playKey
  const isPlaying = isActive && playback.isPlaying
  const progress = isActive ? playback.progress : 0

  // Auto-play the borrowed sound while this clip is the active slide, and stop
  // when it scrolls away — the video is muted for these clips, so the sound is
  // what the viewer hears. Manual pause via the button still works (the effect
  // only re-runs when active/track change, not on a user pause).
  useEffect(() => {
    if (!active || !track) return
    musicPlaybackController.play(playKey, getPreviewUrl(track), startSec, volume, track.durationSec)
    return () => { musicPlaybackController.stopIfActive(playKey) }
  }, [active, track, playKey, startSec, volume])

  // Stop playback if this card leaves the page (unmount from navigation,
  // feed pagination, etc.) — only when it was the one actually playing, so
  // an unrelated card unmounting never interrupts another card's playback.
  useEffect(() => {
    return () => {
      musicPlaybackController.stopIfActive(playKey)
    }
  }, [playKey])

  function handleToggle() {
    if (!track) return
    if (isPlaying) {
      musicPlaybackController.pause()
      return
    }
    musicPlaybackController.play(playKey, getPreviewUrl(track), startSec, volume, track.durationSec)
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-black/40 backdrop-blur-sm px-3 py-2">
      {/* Tapping the label opens the sound page ("use this sound" loop); the
          play button on the right stays a separate control. */}
      <Link href={`/sound/${trackId}`} className="flex min-w-0 flex-1 items-center gap-2.5 active:opacity-80">
        <MusicThumbnail coverUrl={track?.coverUrl ?? null} title={track?.title ?? ''} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">{track?.title ?? 'Đang tải...'}</p>
          {track?.artist && <p className="truncate text-[11px] text-white/60">{track.artist}</p>}
          <div className="mt-1 h-0.5 w-full rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-[width]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </Link>
      {track && <MusicDuration seconds={track.durationSec} className="flex-shrink-0 text-[11px] text-white/60" />}
      <button
        type="button"
        onClick={handleToggle}
        disabled={!track}
        aria-label={isPlaying ? 'Tạm dừng nhạc nền' : 'Phát nhạc nền'}
        className="flex flex-shrink-0 h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white disabled:opacity-50"
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>
    </div>
  )
}
