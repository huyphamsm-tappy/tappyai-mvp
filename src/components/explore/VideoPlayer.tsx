'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Volume2, VolumeX, Play } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

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
   Reliability first: every clip autoplays MUTED — the only mode browsers allow
   without a user gesture — so playback NEVER depends on the audio policy and a
   clip can never get stuck paused waiting for permission. Sound is a separate
   global layer: it "unlocks" on the user's very first interaction (any tap or
   scroll), and from then on the active clip plays with sound. We never unmute a
   clip before that gesture, which is exactly what used to make iOS Safari pause
   the video. One shared state across all clips → sound is consistent feed-wide. */
let feedSoundOn = true // user preference: default sound ON
let feedAudioUnlocked = false // a real user gesture has happened this session
const audioSubs = new Set<() => void>()
function notifyAudio() { audioSubs.forEach(fn => { try { fn() } catch { /* subscriber gone */ } }) }
function unlockFeedAudio() {
  if (feedAudioUnlocked) return
  feedAudioUnlocked = true
  notifyAudio()
}
function setFeedSoundOn(on: boolean) {
  feedSoundOn = on
  try { localStorage.setItem('tappy_video_muted', on ? 'false' : 'true') } catch { /* private mode */ }
  notifyAudio()
}
if (typeof window !== 'undefined') {
  try { feedSoundOn = localStorage.getItem('tappy_video_muted') !== 'true' } catch { /* private mode */ }
  const opts = { capture: true, passive: true } as AddEventListenerOptions
  const h = () => unlockFeedAudio()
  window.addEventListener('pointerdown', h, opts)
  window.addEventListener('touchstart', h, opts)
  window.addEventListener('click', h, opts)
  window.addEventListener('keydown', h, opts)
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { url, thumbnail, sourceType = 'upload', sourceUrl, active = false, onWatchProgress, onDurationKnown },
  ref
) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const startRef = useRef<number | null>(null)
  const watchedRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [showPlayIcon, setShowPlayIcon] = useState(false)
  // Icon reflects the ACTUAL muted state of the element (starts muted for
  // autoplay), not the preference — so it never shows "sound on" while silent.
  const [mutedUI, setMutedUI] = useState(true)
  const userPausedRef = useRef(false) // true only while the user long-pressed to pause
  const activeRef = useRef(active)
  activeRef.current = active
  // Keep watch callback in a ref so the playback effect doesn't restart the
  // video when the parent passes a fresh function identity on re-render.
  const onWatchProgressRef = useRef(onWatchProgress)
  onWatchProgressRef.current = onWatchProgress
  const ytContainerRef = useRef<HTMLDivElement>(null)
  const [ytActive, setYtActive] = useState(false)

  // Push the current global sound state onto this clip. Only unmutes when the
  // user has interacted (feedAudioUnlocked) AND wants sound AND this is the
  // active clip — otherwise stays muted. Never breaks playback.
  const applySound = () => {
    const v = videoRef.current
    if (!v) return
    const wantSound = feedSoundOn && feedAudioUnlocked && activeRef.current
    v.muted = !wantSound
    setMutedUI(v.muted)
  }

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
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | null = null

    if (active) {
      userPausedRef.current = false
      const play = () => {
        if (cancelled || !activeRef.current || userPausedRef.current) return
        v.muted = true // guaranteed-allowed start; applySound may unmute after
        v.play().then(() => {
          if (!cancelled) applySound()
        }).catch(() => {
          // Not buffered yet or a transient block — try again shortly. `canplay`
          // also re-fires play() below once the media has data.
          retry = setTimeout(play, 200)
        })
      }
      play()
      v.addEventListener('canplay', play)
      startRef.current = Date.now()
      return () => {
        cancelled = true
        if (retry) clearTimeout(retry)
        v.removeEventListener('canplay', play)
      }
    }

    // Inactive → pause and record how long it was watched.
    v.pause()
    if (startRef.current !== null) {
      watchedRef.current += (Date.now() - startRef.current) / 1000
      startRef.current = null
      if (onWatchProgressRef.current && v.duration > 0) {
        onWatchProgressRef.current(watchedRef.current, Math.min(watchedRef.current / v.duration, 1))
      }
    }
  }, [active, sourceType])

  // React to global audio changes: first-gesture unlock, or the sound toggle on
  // any clip. Only the active clip actually makes noise.
  useEffect(() => {
    const onChange = () => { if (activeRef.current) applySound() }
    audioSubs.add(onChange)
    return () => { audioSubs.delete(onChange) }
  }, [])

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    unlockFeedAudio() // this IS a user gesture — unmuting from here always works
    setFeedSoundOn(!feedSoundOn) // notifies every clip; active one (re)applies
    applySound()
  }

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

  // Safety net: if the browser paused us for any reason OTHER than the user's
  // own long-press (e.g. a stray unmute on an old iOS) while we're still the
  // active clip, recover to guaranteed muted playback rather than sit frozen.
  const handlePause = () => {
    setPlaying(false)
    const v = videoRef.current
    if (!v) return
    if (activeRef.current && !userPausedRef.current && !v.ended && v.readyState >= 2) {
      v.muted = true
      setMutedUI(true)
      v.play().catch(() => {})
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
      {/* Sound starts muted for autoplay, then unlocks on the user's first tap.
          The pill makes it obvious: "Bật tiếng" while muted, a plain icon once on. */}
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
