'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { pickVoice } from '@/lib/tts/voiceSelection'

const CPS = 13 // approximate chars per second at rate=1

export function stripMarkdownForTTS(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,3}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/gi, '')
    .replace(/\[CTA_BUTTONS\]\{[\s\S]*\}\s*$/gi, '')
    .trim()
}

// Web Speech voices load asynchronously in Chrome: getVoices() is empty on the
// first synchronous call and only fills after the 'voiceschanged' event. Selecting
// a voice synchronously (the old bug) therefore always missed it on first playback.
// Resolve the populated list before choosing a voice.
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    const ready = synth.getVoices()
    if (ready.length > 0) { resolve(ready); return }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve(synth.getVoices())
    }
    synth.addEventListener('voiceschanged', finish, { once: true })
    setTimeout(finish, 1000) // safety net if the event never fires
  })
}

interface TTSState {
  text: string // already-stripped text
  elapsed: number
  speed: number
  speakingId: string | null
  lang: string // detectLang() code for the current utterance
}

export function useTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeedState] = useState(1)
  const [elapsed, setElapsed] = useState(0)
  const [totalSecs, setTotalSecs] = useState(0)
  // Set to the language code when the device has no voice for it — the UI shows a
  // notice and we stay silent (never read with a wrong-language voice).
  const [unavailableLang, setUnavailableLang] = useState<string | null>(null)

  const state = useRef<TTSState>({ text: '', elapsed: 0, speed: 1, speakingId: null, lang: 'vi' })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    timerRef.current = setInterval(() => {
      state.current.elapsed += 1
      setElapsed(state.current.elapsed)
    }, 1000)
  }, [stopTimer])

  const doStop = useCallback(() => {
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    stopTimer()
    state.current.speakingId = null
    state.current.elapsed = 0
    setSpeakingId(null)
    setIsPaused(false)
    setElapsed(0)
    setTotalSecs(0)
  }, [stopTimer])

  const startAt = useCallback(async (msgId: string, rawText: string, startChar: number, spd: number, langCode: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    stopTimer()

    const clean = stripMarkdownForTTS(rawText)
    const slice = clean.substring(startChar)
    if (!slice.trim()) { doStop(); return }

    // Choose the voice BEFORE committing UI state, so we can bail without a
    // half-started "speaking" state if there is no voice for this language.
    const voices = await loadVoices()
    const voice = pickVoice(voices, langCode)
    if (!voice) {
      // No voice for this language on this device — never read it with another
      // language's voice. Surface a notice instead.
      setUnavailableLang(langCode)
      return
    }

    state.current.text = clean
    state.current.speed = spd
    state.current.speakingId = msgId
    state.current.lang = langCode
    state.current.elapsed = Math.floor(startChar / (CPS * spd))

    const estTotal = Math.ceil(clean.length / (CPS * spd))
    setTotalSecs(estTotal)
    setElapsed(state.current.elapsed)
    setSpeakingId(msgId)
    setIsPaused(false)

    const utter = new SpeechSynthesisUtterance(slice)
    utter.voice = voice
    utter.lang = voice.lang
    utter.rate = spd

    utter.onend = () => {
      stopTimer()
      state.current.speakingId = null
      state.current.elapsed = 0
      setSpeakingId(null)
      setIsPaused(false)
      setElapsed(0)
    }
    utter.onerror = () => {
      stopTimer()
      state.current.speakingId = null
      setSpeakingId(null)
      setIsPaused(false)
    }

    window.speechSynthesis.speak(utter)
    // Start timer after a brief delay to sync with actual speech start
    setTimeout(() => {
      if (state.current.speakingId === msgId) startTimer()
    }, 150)
  }, [stopTimer, doStop, startTimer])

  const speak = useCallback((msgId: string, rawText: string, langCode: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (state.current.speakingId === msgId) {
      doStop()
    } else {
      void startAt(msgId, rawText, 0, state.current.speed, langCode)
    }
  }, [doStop, startAt])

  const togglePause = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (isPaused) {
      window.speechSynthesis.resume()
      setIsPaused(false)
      startTimer()
    } else {
      window.speechSynthesis.pause()
      stopTimer()
      setIsPaused(true)
    }
  }, [isPaused, startTimer, stopTimer])

  const skipBack = useCallback(() => {
    const { speakingId: sid, text, elapsed: el, speed: spd, lang } = state.current
    if (!sid) return
    const newChar = Math.max(0, Math.floor((el - 15) * CPS * spd))
    void startAt(sid, text, newChar, spd, lang)
  }, [startAt])

  const skipForward = useCallback(() => {
    const { speakingId: sid, text, elapsed: el, speed: spd, lang } = state.current
    if (!sid) return
    const newChar = Math.min(text.length - 1, Math.floor((el + 15) * CPS * spd))
    void startAt(sid, text, newChar, spd, lang)
  }, [startAt])

  const changeSpeed = useCallback((newSpd: number) => {
    const { speakingId: sid, text, elapsed: el, speed: oldSpd, lang } = state.current
    state.current.speed = newSpd
    setSpeedState(newSpd)
    if (sid) {
      const currentChar = Math.floor(el * CPS * oldSpd)
      void startAt(sid, text, currentChar, newSpd, lang)
    }
  }, [startAt])

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
      stopTimer()
    }
  }, [stopTimer])

  return {
    speakingId,
    isPaused,
    speed,
    elapsed,
    totalSecs,
    unavailableLang,
    clearUnavailableLang: useCallback(() => setUnavailableLang(null), []),
    speak,
    togglePause,
    skipBack,
    skipForward,
    changeSpeed,
    stop: doStop,
  }
}
