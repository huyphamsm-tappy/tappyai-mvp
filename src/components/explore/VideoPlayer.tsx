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
  // TikTok "use this sound": when set, the clip's OWN audio is replaced by this
  // track. The <video> stays muted and a single companion Audio — owned only
  // while this clip is active — plays in its place, mirrored to the video's
  // play/pause/loop. Falls back to the clip's own audio if the track fails to
  // load, so the clip is never silent. Only 'attached' clips pass this; an
  // 'original' clip already IS its own audio and passes nothing.
  soundUrl?: string
  soundVolume?: number
  // True as soon as the review row says the clip borrows a sound (origin ===
  // 'attached'), i.e. BEFORE soundUrl has resolved from the track fetch. The
  // mute decision must key off this, not soundUrl: in the feed the tap that
  // opens a clip unlocks audio first, so deciding by soundUrl let the video
  // start UNMUTED during the fetch gap and it was never re-muted → the clip's
  // own audio played over the borrowed track (the UAT failure). The parent
  // drops this back to false if the track fetch fails, which is the never-
  // silent fallback trigger.
  hasSound?: boolean
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
  { url, thumbnail, sourceType = 'upload', sourceUrl, active = false, onWatchProgress, onDurationKnown, soundUrl, soundVolume = 1, hasSound = false },
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
  // Attached-sound state, read from the video effects without re-running them.
  // hasSound (not soundUrl) drives muting so the video is muted from the very
  // first frame, before the borrowed track's URL has resolved.
  const hasSoundRef = useRef(hasSound)
  hasSoundRef.current = hasSound
  const hadSoundRef = useRef(false) // for the one-shot fetch-failure fallback
  const companionRef = useRef<HTMLAudioElement | null>(null)
  const soundFailedRef = useRef(false)
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
      // Attached-sound INVARIANT, enforced on every tick (not just at play
      // start): while the borrowed track is the intended audio source, the
      // <video> must be muted — even if it is already playing. This closes the
      // race where the video started unmuted before soundUrl resolved and the
      // old play-start-only decision could never re-mute it.
      if (hasSoundRef.current && !soundFailedRef.current && !v.muted) v.muted = true
      if (!v.paused) return
      // A clip with a (working) attached sound keeps its <video> muted — the
      // borrowed track carries the audio from the companion Audio. Otherwise:
      // if audio is unlocked (page gained permission from a prior click), try
      // playing unmuted, falling back to muted if the browser rejects.
      v.muted = hasSoundRef.current && !soundFailedRef.current ? true : !feedAudioUnlocked
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
      // Attached sound replaces the video's audio — keep the <video> muted; the
      // companion effect starts the borrowed track on this same unlock signal.
      if (hasSoundRef.current && !soundFailedRef.current) return
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

  // ── Attached sound (TikTok "use this sound") ─────────────────────────────
  // Only the ACTIVE clip owns an Audio instance — created here, destroyed on
  // deactivate/unmount — so there is never more than one and none leak. The
  // <video> is kept muted (see ensurePlaying) and this single track plays in its
  // place, mirrored to the video's play/pause/loop. If it can't load we flip
  // soundFailedRef and let the video's own audio through, so it's never silent.
  useEffect(() => {
    const v = videoRef.current
    if (!v || sourceType !== 'upload' || !soundUrl || !active) return
    soundFailedRef.current = false
    // The borrowed track owns the audio from this moment — mute the video NOW
    // (don't wait for the watchdog tick) in case it is already playing unmuted.
    v.muted = true
    const audio = new Audio()
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = soundVolume
    audio.src = soundUrl
    companionRef.current = audio

    // If the companion joins while the video is already mid-play (soundUrl
    // resolved after playback started), align to the video's clock instead of
    // starting the track from 0 against a half-played clip.
    const alignToVideo = () => {
      if (isFinite(audio.duration) && audio.duration > 0 && v.currentTime > 0.3) {
        audio.currentTime = v.currentTime % audio.duration
      }
    }
    audio.addEventListener('loadedmetadata', alignToVideo)

    // Silent until the page's audio is unlocked (first tap) — matching a normal
    // clip's muted autoplay; then the sound plays whenever the video is playing.
    const syncPlay = () => {
      if (soundFailedRef.current || !feedAudioUnlocked || v.paused) return
      audio.play().catch(() => {})
    }
    const onPause = () => audio.pause()
    let lastT = 0
    const onTime = () => {
      if (v.currentTime + 0.25 < lastT) audio.currentTime = 0 // video looped → restart sound
      lastT = v.currentTime
      syncPlay() // self-heal if the browser paused the audio
    }
    const onFail = () => {
      soundFailedRef.current = true
      audio.pause()
      // Fall back to the clip's own audio so it is never silent.
      if (feedAudioUnlocked && !userPausedRef.current) v.muted = false
    }
    v.addEventListener('play', syncPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    audio.addEventListener('error', onFail)
    audioSubs.add(syncPlay) // react to the global audio-unlock click
    syncPlay() // the video may already be rolling

    return () => {
      audioSubs.delete(syncPlay)
      v.removeEventListener('play', syncPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('error', onFail)
      audio.removeEventListener('loadedmetadata', alignToVideo)
      audio.pause()
      audio.src = ''
      companionRef.current = null
    }
  }, [active, soundUrl, soundVolume, sourceType])

  // Never-silent fallback: the parent drops hasSound back to false when the
  // borrowed track can't be fetched at all (useMusicTrack finished with no
  // track). One-shot unmute of the video's own audio — same try-unmuted /
  // fall-back-muted pattern as the unlock handler, so iOS can't fight it.
  useEffect(() => {
    if (hasSound) { hadSoundRef.current = true; return }
    if (!hadSoundRef.current) return
    hadSoundRef.current = false
    const v = videoRef.current
    if (v && activeRef.current && feedAudioUnlocked && !userPausedRef.current) {
      v.muted = false
      v.play().catch(() => {
        v.muted = true
        v.play().catch(() => {})
      })
    }
  }, [hasSound])

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
