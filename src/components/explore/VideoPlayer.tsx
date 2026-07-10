'use client'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Volume2, VolumeX, Play } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

interface VideoPlayerProps {
  url: string
  thumbnail?: string
  sourceType?: string
  sourceUrl?: string
  onWatchProgress?: (seconds: number, completionRate: number) => void
  onDurationKnown?: (d: number) => void
}

// Imperative handle the feed uses to pause/resume on long-press (single tap is
// reserved — the feed's gesture layer owns taps for double-tap-to-like).
export interface VideoPlayerHandle {
  togglePlay: () => void
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { url, thumbnail, sourceType = 'upload', sourceUrl, onWatchProgress, onDurationKnown },
  ref
) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const startRef = useRef<number | null>(null)
  const watchedRef = useRef(0)
  const [mutedUI, setMutedUI] = useState(true)
  const mutedRef = useRef(true)
  const unmutingRef = useRef(false)
  const triedUnmuteRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [showPlayIcon, setShowPlayIcon] = useState(false)
  const ytContainerRef = useRef<HTMLDivElement>(null)
  const [ytActive, setYtActive] = useState(false)

  // YouTube embeds only stream while in view — otherwise every mounted card
  // autoplayed its own iframe simultaneously (bandwidth/CPU/battery drain).
  useEffect(() => {
    if (sourceType !== 'youtube') return
    const el = ytContainerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setYtActive(entry.isIntersecting && entry.intersectionRatio >= 0.5),
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [sourceType])

  // Force muted on mount for autoplay (React's muted prop doesn't reliably
  // set the HTML attribute, and the user may have unmuted previously).
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true
      mutedRef.current = true
    }
  }, [])

  // Keep DOM muted in sync after React re-renders (React's hardcoded muted
  // prop resets video.muted=true on every render; fix it back immediately
  // before the browser paints so there's no audio gap).
  useLayoutEffect(() => {
    if (videoRef.current) videoRef.current.muted = mutedRef.current
  })

  const visibleRef = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-play/pause when scrolling in/out of viewport
  useEffect(() => {
    const video = videoRef.current
    if (!video || sourceType !== 'upload') return

    const attemptPlay = () => {
      if (!visibleRef.current || !video.paused) return
      video.play().catch(() => {
        retryTimer.current = setTimeout(attemptPlay, 250)
      })
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting && entry.intersectionRatio >= 0.5
        if (visibleRef.current) {
          if (retryTimer.current) clearTimeout(retryTimer.current)
          attemptPlay()
          startRef.current = Date.now()
        } else if (!video.paused) {
          if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null }
          video.pause()
          if (startRef.current !== null) {
            watchedRef.current += (Date.now() - startRef.current) / 1000
            startRef.current = null
            if (onWatchProgress && video.duration > 0) {
              const completionRate = Math.min(watchedRef.current / video.duration, 1)
              onWatchProgress(watchedRef.current, completionRate)
            }
          }
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(video)
    return () => {
      observer.disconnect()
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [sourceType, onWatchProgress])

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !mutedRef.current
    mutedRef.current = next
    setMutedUI(next)
    localStorage.setItem('tappy_video_muted', String(next))
    if (videoRef.current) videoRef.current.muted = next
  }

  // Manual pause/resume, driven by the feed's long-press gesture. While the
  // user has paused, the play icon stays up as a cue; resuming hides it.
  const togglePlay = () => {
    const v = videoRef.current
    if (!v || sourceType !== 'upload') return
    if (v.paused) {
      v.play().catch(() => {})
      setShowPlayIcon(false)
    } else {
      v.pause()
      setShowPlayIcon(true)
    }
  }
  useImperativeHandle(ref, () => ({ togglePlay }), [sourceType])

  // YouTube: iframe embed with autoplay muted
  if (sourceType === 'youtube') {
    const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)?.[1]
    if (!videoId) return <div className="absolute inset-0 bg-black" />
    const ytThumb = thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
    return (
      <div ref={ytContainerRef} className="absolute inset-0 bg-black">
        <img src={ytThumb} alt="" className={`absolute inset-0 w-full h-full object-cover ${ytActive ? 'opacity-30' : 'opacity-100'}`} />
        {ytActive && (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1`}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
            title="video"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
      </div>
    )
  }

  // TikTok / Facebook: thumbnail preview + external link
  if (sourceType === 'tiktok' || sourceType === 'facebook') {
    const label = sourceType === 'tiktok' ? 'TikTok' : 'Facebook'
    return (
      <div className="absolute inset-0 bg-black flex items-center justify-center">
        {thumbnail && (
          <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative z-10 flex flex-col items-center gap-2"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <Play size={28} className="text-white fill-white" />
            </div>
            <span className="text-white text-sm font-semibold bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
              Xem trên {label}
            </span>
          </a>
        )}
      </div>
    )
  }

  // Native upload video. No tap handler here — the feed's gesture layer owns
  // taps (double-tap = like); pause is via long-press → togglePlay().
  return (
    <div className="absolute inset-0 bg-black">
      {thumbnail && !playing && (
        <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <video
        ref={videoRef}
        src={url}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        playsInline
        loop
        preload="auto"
        onPlay={() => {
          setPlaying(true)
          if (videoRef.current && mutedRef.current && !triedUnmuteRef.current) {
            triedUnmuteRef.current = true
            unmutingRef.current = true
            videoRef.current.muted = false
            mutedRef.current = false
            setMutedUI(false)
          }
        }}
        onPause={() => {
          setPlaying(false)
          if (unmutingRef.current && videoRef.current && visibleRef.current) {
            unmutingRef.current = false
            videoRef.current.muted = true
            mutedRef.current = true
            setMutedUI(true)
            videoRef.current.play().catch(() => {})
            return
          }
          unmutingRef.current = false
        }}
        onLoadedMetadata={e => onDurationKnown?.(e.currentTarget.duration)}
        onError={() => { console.error('[VideoPlayer] playback error:', url); setPlaying(false) }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
      {showPlayIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
            <Play size={28} className="text-white fill-white" />
          </div>
        </div>
      )}
      {/* Autoplay must start muted (browser policy). Make unmuting obvious:
          a labelled "Bật tiếng" pill while muted, a plain icon once on. */}
      <button
        onClick={toggleMute}
        aria-label={mutedUI ? t('video.unmute') : t('video.mute')}
        className="absolute top-14 right-3 z-30 flex items-center gap-1 h-8 rounded-full bg-black/55 backdrop-blur-sm text-white text-xs font-semibold px-2.5"
      >
        {mutedUI ? <><VolumeX size={15} /> {t('video.unmute')}</> : <Volume2 size={15} />}
      </button>
    </div>
  )
})

export default VideoPlayer
