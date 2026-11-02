'use client'

import { useCallback, useEffect, useRef } from 'react'

// ── Keep the newest message in view — and KEEP it there while the thread grows ──────────────────────────────────────
//
// Owner UAT 2026-10-02 (A1): after «phim nào đang chiếu» the chat showed an almost empty frame with ONE line of the
// answer; the 5 cinema links were below the fold and only F5 fixed it. Measured on the exact thread (390x844, local):
// the scroll container was left 483 px (after the film answer) and 1003 px (after the next question) SHORT of its end.
//
// Cause: the old code called `bottomRef.scrollIntoView({ behavior: 'smooth' })` from an effect that depends on
// `messages` only. Everything that makes the thread taller AFTER the last `messages` change — the action bar, the
// follow-up chips and the AskCard that appear when the stream ends, card photos that load late, the typewriter reveal —
// moved the end away from a scroll that had already been aimed, and a smooth scroll that is re-aimed during an animation
// stops wherever the browser interrupts it. Nothing re-pinned the view, so the new answer sat below the fold.
//
// Here the view stays pinned to the end for as long as the reader has not scrolled away: a ResizeObserver on the
// content (and on the scroll box, for the on-screen keyboard) re-pins after EVERY size change, with an instant scroll.
// A reader who scrolls up to read an older answer is left alone until they come back near the end or send a message.

/** How far from the end still counts as «at the end» (px). */
export const STICK_THRESHOLD_PX = 64

export interface ScrollMetrics { scrollTop: number; scrollHeight: number; clientHeight: number }

/** Distance between the visible bottom and the end of the content (≥ 0). */
export function distanceFromEnd(m: ScrollMetrics): number {
  return Math.max(0, m.scrollHeight - m.scrollTop - m.clientHeight)
}

/** Is the reader close enough to the end that new content should keep following? */
export function isNearEnd(m: ScrollMetrics, threshold: number = STICK_THRESHOLD_PX): boolean {
  return distanceFromEnd(m) <= threshold
}

export function useStickToBottom<S extends HTMLElement = HTMLDivElement, C extends HTMLElement = HTMLDivElement>() {
  const scrollRef = useRef<S>(null)
  const contentRef = useRef<C>(null)
  const pinned = useRef(true)

  const toEnd = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  /** Pin and scroll now (the user just sent a message / a conversation just opened). */
  const pin = useCallback(() => {
    pinned.current = true
    toEnd()
    // The new bubble is laid out a frame later; one more pass lands on the real end.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { if (pinned.current) toEnd() })
  }, [toEnd])

  useEffect(() => {
    const box = scrollRef.current
    if (!box) return
    // Only a scroll the READER makes can unpin: the browser also scrolls on its own (scroll anchoring when content grows above
    // the viewport — measured +480 px on the shopping answer — and the late event of our own scroll). So a scroll event
    // counts only while a wheel / touch / key / pointer gesture is in progress or has just ended (momentum scrolling).
    let lastGesture = 0
    const gesture = () => { lastGesture = Date.now() }
    const GESTURE_MS = 1200
    const onScroll = () => {
      if (Date.now() - lastGesture > GESTURE_MS) return
      pinned.current = isNearEnd(box)
    }
    const events: Array<keyof HTMLElementEventMap> = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown']
    for (const e of events) box.addEventListener(e, gesture, { passive: true })
    box.addEventListener('scroll', onScroll, { passive: true })
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { if (pinned.current) toEnd() })
      ro.observe(box)
      if (contentRef.current) ro.observe(contentRef.current)
    }
    toEnd()
    return () => {
      for (const e of events) box.removeEventListener(e, gesture)
      box.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [toEnd])

  return { scrollRef, contentRef, pin, toEnd, pinned }
}
