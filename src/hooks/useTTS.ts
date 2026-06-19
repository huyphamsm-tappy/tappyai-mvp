'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

const CPS = 13 // approximate chars per second at rate=1 for vi-VN

export function stripMarkdownForTTS(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,3}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/gi, '')
    .trim()
}

interface TTSState {
  text: string   // already-stripped text
  elapsed: number
  speed: number
  speakingId: string | null
}

export function useTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeedState] = useState(1)
  const [elapsed, setElapsed] = useState(0)
  const [totalSecs, setTotalSecs] = useState(0)

  const state = useRef<TTSState>({ text: '', elapsed: 0, speed: 1, speakingId: null })
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

  const startAt = useCallback((msgId: string, rawText: string, startChar: number, spd: number) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    stopTimer()

    const clean = stripMarkdownForTTS(rawText)
    const slice = clean.substring(startChar)
    if (!slice.trim()) { doStop(); return }

    state.current.text = clean
    state.current.speed = spd
    state.current.speakingId = msgId
    state.current.elapsed = Math.floor(startChar / (CPS * spd))

    const estTotal = Math.ceil(clean.length / (CPS * spd))
    setTotalSecs(estTotal)
    setElapsed(state.current.elapsed)
    setSpeakingId(msgId)
    setIsPaused(false)

    const utter = new SpeechSynthesisUtterance(slice)
    utter.lang = 'vi-VN'
    utter.rate = spd

    const voices = window.speechSynthesis.getVoices()
    const viVoice = voices.find(v => v.lang.startsWith('vi'))
    if (viVoice) utter.voice = viVoice

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

  const speak = useCallback((msgId: string, rawText: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (state.current.speakingId === msgId) {
      doStop()
    } else {
      startAt(msgId, rawText, 0, state.current.speed)
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
    const { speakingId: sid, text, elapsed: el, speed: spd } = state.current
    if (!sid) return
    const newChar = Math.max(0, Math.floor((el - 15) * CPS * spd))
    startAt(sid, text, newChar, spd)
  }, [startAt])

  const skipForward = useCallback(() => {
    const { speakingId: sid, text, elapsed: el, speed: spd } = state.current
    if (!sid) return
    const newChar = Math.min(text.length - 1, Math.floor((el + 15) * CPS * spd))
    startAt(sid, text, newChar, spd)
  }, [startAt])

  const changeSpeed = useCallback((newSpd: number) => {
    const { speakingId: sid, text, elapsed: el, speed: oldSpd } = state.current
    state.current.speed = newSpd
    setSpeedState(newSpd)
    if (sid) {
      const currentChar = Math.floor(el * CPS * oldSpd)
      startAt(sid, text, currentChar, newSpd)
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
    speak,
    togglePause,
    skipBack,
    skipForward,
    changeSpeed,
    stop: doStop,
  }
}
