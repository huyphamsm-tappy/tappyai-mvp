'use client'

// ── Read Aloud, served by the backend ────────────────────────────────────────
//
// Replaces the browser's speechSynthesis engine with audio synthesized server-side, so every
// platform hears the same Tappy voice instead of whatever voices happen to be installed on the
// device. Deliberately exposes the SAME shape as the old useTTS hook — the UI contract does not
// change, only what produces the sound.
//
// TWO THINGS THIS HOOK NO LONGER DOES, both on purpose:
//
//   It does not detect the language. The server decides, from one implementation, because
//   detectLang() was shaped by two production incidents and three copies would drift.
//
//   It does not choose a voice. The browser must not be able to pick what we pay to synthesize.
//
// WHY AN <audio> ELEMENT IS SIMPLER THAN WHAT IT REPLACES: speechSynthesis has no seek and no
// reliable pause, so the old hook implemented skip/speed by cancelling and re-speaking from a
// character offset, estimating elapsed time from a characters-per-second constant. An audio element
// gives real currentTime, real duration and real playbackRate — the progress bar stops being an
// estimate and starts being the truth.

import { useState, useRef, useCallback, useEffect } from 'react'
import { requestSpeech, audioUrlFromBase64 } from '@/lib/voice/client'
import { stripMarkdownForTTS } from '@/hooks/useTTS'

const SKIP_SECONDS = 10

export function useServerTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [elapsed, setElapsed] = useState(0)
  const [totalSecs, setTotalSecs] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  /** Set when the server cannot speak this language — the UI shows a notice and stays silent. */
  const [unavailableLang, setUnavailableLang] = useState<string | null>(null)
  /** Set when synthesis failed for a retryable reason. Distinct from unavailable. */
  const [failed, setFailed] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /** Tear down audio, its object URL and any in-flight request. Safe to call repeatedly. */
  const teardown = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    const a = audioRef.current
    if (a) {
      a.onended = null; a.ontimeupdate = null; a.onloadedmetadata = null; a.onerror = null
      a.pause()
      a.src = ''
      audioRef.current = null
    }
    // Revoking matters: each reply holds a decoded audio blob, and a long session would otherwise
    // accumulate them for as long as the tab lives.
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    teardown()
    setSpeakingId(null)
    setIsPaused(false)
    setElapsed(0)
    setTotalSecs(0)
    setIsLoading(false)
  }, [teardown])

  /**
   * Speak a message. Language is NOT a parameter — the server decides it.
   * Pressing the button on the message already playing stops it, matching the old behaviour.
   */
  const speak = useCallback(async (msgId: string, rawText: string) => {
    if (speakingId === msgId) { stop(); return }

    stop()
    const text = stripMarkdownForTTS(rawText)
    if (!text) return

    setFailed(false)
    setUnavailableLang(null)
    setIsLoading(true)
    setSpeakingId(msgId)

    const controller = new AbortController()
    abortRef.current = controller

    const result = await requestSpeech({ text, signal: controller.signal })

    // The user pressed stop, or started another message, while this was in flight.
    if (controller.signal.aborted) return

    setIsLoading(false)

    if (result.status === 'cancelled') return
    if (result.status === 'unavailable') {
      // Never substitute another language's voice: show the notice, leave the text on screen.
      setUnavailableLang(result.language)
      setSpeakingId(null)
      return
    }
    if (result.status === 'failed') {
      setFailed(true)
      setSpeakingId(null)
      return
    }

    const url = audioUrlFromBase64(result.audioBase64, result.mimeType)
    urlRef.current = url
    const audio = new Audio(url)
    audio.playbackRate = speed
    audioRef.current = audio

    audio.onloadedmetadata = () => setTotalSecs(Number.isFinite(audio.duration) ? audio.duration : 0)
    audio.ontimeupdate = () => setElapsed(audio.currentTime)
    audio.onended = () => stop()
    audio.onerror = () => { setFailed(true); stop() }

    try {
      await audio.play()
      setIsPaused(false)
    } catch {
      // Autoplay policy or a decode failure. Surfaced rather than left as a silent dead button.
      setFailed(true)
      stop()
    }
  }, [speakingId, speed, stop])

  const togglePause = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) { void a.play(); setIsPaused(false) } else { a.pause(); setIsPaused(true) }
  }, [])

  const seekBy = useCallback((delta: number) => {
    const a = audioRef.current
    if (!a) return
    const next = Math.min(Math.max(a.currentTime + delta, 0), a.duration || 0)
    a.currentTime = next
    setElapsed(next)
  }, [])

  const skipBack = useCallback(() => seekBy(-SKIP_SECONDS), [seekBy])
  const skipForward = useCallback(() => seekBy(SKIP_SECONDS), [seekBy])

  const changeSpeed = useCallback((next: number) => {
    setSpeed(next)
    // Applies immediately to whatever is playing — no re-synthesis, so no extra cost.
    if (audioRef.current) audioRef.current.playbackRate = next
  }, [])

  // Never leave audio playing, a blob URL leaked, or a request in flight after unmount.
  useEffect(() => () => { teardown() }, [teardown])

  return {
    speakingId,
    isPaused,
    speed,
    elapsed,
    totalSecs,
    isLoading,
    unavailableLang,
    clearUnavailableLang: useCallback(() => setUnavailableLang(null), []),
    failed,
    clearFailed: useCallback(() => setFailed(false), []),
    speak,
    togglePause,
    skipBack,
    skipForward,
    changeSpeed,
    stop,
  }
}
