'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Play } from 'lucide-react'

interface VideoPlayerProps {
  url: string
  thumbnail?: string
  sourceType?: string
  sourceUrl?: string
  // Whether this clip is the one currently in view. Playback is driven by this
  // flag (set by the feed from its exact scroll position) — NOT by a per-video
  // IntersectionObserver, which raced with the feed's own active-slide tracking
  // and left some clips stuck paused after scrolling back and forth.
  active?: boolean
  onWatchProgress?: (seconds: number, completionRate: number) => void
  onDurationKnown?: (d: number) => void
}

// Imperative handle the feed uses to pause/resume on long-press (single tap is
// reserved — the feed's gesture layer owns taps for double-tap-to-like).
export interface VideoPlayerHandle {
  togglePlay: () => void
}

/* ── Global feed audio (TikTok/Reels model) ───────────────────────────────
   Every clip autoplays MUTED — the only mode browsers allow without a gesture.
   Sound "unlocks" on the user's first tap: we unmute + play() the active video
   inside the click handler's call stack. iOS Safari specifically requires play()
   to originate from a click (not touchstart/pointerdown) to allow unmuted
   playback — the old code listened to touchstart which fired first, set the
   flag, and then the click handler early-returned, so the unmute NEVER happened
   on iOS. Now only click triggers the notify, and every click re-notifies (no
   early return) so subsequent taps keep retrying if the first attempt fails.
   After the first successful unmuted play the page gains "audio permission" and
   subsequent clips play with sound automatically. No mute button — sound is
   always on once unlocked (owner's TikTok-style choice). */
let feedAudioUnlocked = false
const audioSubs = new Set<() => void>()
function notifyAudio() { audioSubs.forEach(fn => { try { fn() } catch {} }) }
if (typeof window !== 'undefined') {
  window.addEventListener('click', () => {
    feedAudioUnlocked = true
    notifyAudio()
  }, { capture: true, passive: true } as AddEventListenerOptions)
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { url, thumbnail, sourceType = 'upload', sourceUrl, active = false, onWatchProgress, onDurationKnown },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const startRef = useRef<number | null>(null)
  const watchedRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [showPlayIcon, setShowPlayIcon] = useState(false)
  const userPausedRef = useRef(false) // true only while the user long-pressed to pause
  const activeRef = useRef(active)
  activeRef.current = active
  // Keep watch callback in a ref so the playback effect doesn't restart the
  // video when the parent passes a fresh function identity on re-render.
  const onWatchProgressRef = useRef(onWatchProgress)
  onWatchProgressRef.current = onWatchProgress
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

  // ── Playback, driven purely by `active` ──────────────────────────────────
  // Active → play (always starting muted, so it can NEVER be blocked), retrying
  // until the media is ready, then apply sound. Inactive → pause + bank watch
  // time. Deterministic: the feed says which slide is active; no observer race.
  useEffect(() => {
    const v = videoRef.current
    if (!v || sourceType !== 'upload') return

    if (!active) {
      // Inactive → pause and record how long it was watched.
      v.pause()
      if (startRef.current !== null) {
        watchedRef.current += (Date.now() - startRef.current) / 1000
        startRef.current = null
        if (onWatchProgressRef.current && v.duration > 0) {
          onWatchProgressRef.current(watchedRef.current, Math.min(watchedRef.current / v.duration, 1))
        }
      }
      return
    }

    // Active → a self-healing watchdog. Whatever pauses the clip (iOS blocking
    // an unmute, decode pressure, media not buffered yet, a stray policy pause),
    // this resumes it within 300ms — UNLESS the user long-pressed to pause. This
    // is what makes "some clips stay paused when scrolled to" impossible: the
    // clip cannot stay paused against the user's intent, no matter the cause.
    userPausedRef.current = false
    startRef.current = Date.now()
    let disposed = false

    const ensurePlaying = () => {
      if (disposed || userPausedRef.current || !activeRef.current) return
      if (!v.paused) return
      // If audio is unlocked (page gained permission from a prior click),
      // try playing unmuted. Falls back to muted if the browser rejects.
      v.muted = !feedAudioUnlocked
      v.play().catch(() => {
        if (feedAudioUnlocked) {
          v.muted = true
          v.play().catch(() => {})
        }
      })
    }

    ensurePlaying()
    v.addEventListener('canplay', ensurePlaying)
    v.addEventListener('loadeddata', ensurePlaying)
    const watchdog = setInterval(ensurePlaying, 300)

    return () => {
      disposed = true
      clearInterval(watchdog)
      v.removeEventListener('canplay', ensurePlaying)
      v.removeEventListener('loadeddata', ensurePlaying)
    }
  }, [active, sourceType])

  // React to global audio unlock (click). This callback runs in the click
  // handler's synchronous call stack — the only path iOS Safari honors for
  // unmuting media. Every click re-fires (no early return) so a failed first
  // attempt (e.g. touchstart set the flag but click hadn't fired yet) retries.
  useEffect(() => {
    const onChange = () => {
      const v = videoRef.current
      if (!v || !activeRef.current || !feedAudioUnlocked) return
      if (!v.muted) return
      v.muted = false
      v.play().catch(() => {
        v.muted = true
        v.play().catch(() => {})
      })
    }
    audioSubs.add(onChange)
    return () => { audioSubs.delete(onChange) }
  }, [])

  // Manual pause/resume, driven by the feed's long-press gesture. While the
  // user has paused, the play icon stays up as a cue; resuming hides it.
  const togglePlay = () => {
    const v = videoRef.current
    if (!v || sourceType !== 'upload') return
    if (v.paused) {
      userPausedRef.current = false
      v.play().catch(() => {})
      setShowPlayIcon(false)
    } else {
      userPausedRef.current = true
      v.pause()
      setShowPlayIcon(true)
    }
  }
  useImperativeHandle(ref, () => ({ togglePlay }), [sourceType])

  // If the browser paused the active clip without the user asking (most often
  // iOS rejecting an unmute), assume sound was the culprit and drop back to
  // muted so the watchdog's next tick can resume it and it stays playing.
  const handlePause = () => {
    setPlaying(false)
    const v = videoRef.current
    if (!v) return
    if (activeRef.current && !userPausedRef.current && !v.ended && !v.muted) {
      v.muted = true
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
        muted
        playsInline
        loop
        // preload="auto": the feed only mounts a <video> for the active slide and
        // its immediate neighbours, so at most a few buffer at once — safe for
        // iOS Safari's media-element cap — and neighbours warm up before the swipe.
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={handlePause}
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
    </div>
  )
})

export default VideoPlayer
