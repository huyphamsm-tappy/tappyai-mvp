'use client'
import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX, Play } from 'lucide-react'

interface VideoPlayerProps {
  url: string
  thumbnail?: string
  sourceType?: string
  sourceUrl?: string
  onWatchProgress?: (seconds: number, completionRate: number) => void
  onDurationKnown?: (d: number) => void
}

export default function VideoPlayer({ url, thumbnail, sourceType = 'upload', sourceUrl, onWatchProgress, onDurationKnown }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const startRef = useRef<number | null>(null)
  const watchedRef = useRef(0)
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('tappy_video_muted') !== 'false'
  })
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

  // Auto-play/pause when scrolling in/out of viewport
  useEffect(() => {
    const video = videoRef.current
    if (!video || sourceType !== 'upload') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          video.play().catch(() => {})
          startRef.current = Date.now()
        } else {
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
    return () => observer.disconnect()
  }, [sourceType, onWatchProgress])

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !muted
    setMuted(next)
    localStorage.setItem('tappy_video_muted', String(!next))
    if (videoRef.current) videoRef.current.muted = next
  }

  const handleTap = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {})
    } else {
      videoRef.current.pause()
      setShowPlayIcon(true)
      setTimeout(() => setShowPlayIcon(false), 800)
    }
  }

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

  // Native upload video
  return (
    <div className="absolute inset-0 bg-black" onClick={handleTap}>
      {thumbnail && !playing && (
        <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <video
        ref={videoRef}
        src={url}
        className="absolute inset-0 w-full h-full object-cover"
        muted={muted}
        playsInline
        loop
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
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
      <button
        onClick={toggleMute}
        className="absolute top-14 right-3 z-30 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm"
      >
        {muted ? <VolumeX size={16} className="text-white" /> : <Volume2 size={16} className="text-white" />}
      </button>
    </div>
  )
}
