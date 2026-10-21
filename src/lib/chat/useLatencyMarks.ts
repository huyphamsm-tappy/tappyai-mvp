'use client'
// ── C2 · browser-side latency marks (observation only) ───────────────────────────────────────────────────────────────────────────────────────
// The server marks when text LEAVES it (lib/ai/latency/marks.ts); only the browser knows when text is VISIBLE. This hook records, per chat turn:
//   submit → response headers → first visible text (the first render in which the reply shows a non-blank character) → done (stream finished)
//   → reveal finished (the display-only typewriter after a buffered reply, if any).
// Off unless the page is built with NEXT_PUBLIC_C2_LATENCY_MARKS=1 or localStorage.tappy_latency === "1". Marks go to `window.__tappyLatency` (an array a
// Playwright run can read) and one `console.info` JSON line per turn. No message text is stored — only lengths and times.

import { useEffect, useRef } from 'react'

export interface ClientLatencyTurn {
  type: 'tappyai_client_latency'
  /** ms since submit; null = did not happen. */
  headers: number | null
  first_visible_text: number | null
  done: number | null
  reveal_done: number | null
  visible_chars_at_first: number
  visible_chars_final: number
  aborted: boolean
}

/** Pure state machine (unit-tested without React). `now` is injectable. */
export function createClientLatencyTracker(now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  let t0: number | null = null
  let turn: ClientLatencyTurn | null = null
  const rel = (): number => Math.round(now() - (t0 as number))
  return {
    active: () => turn !== null,
    hasVisible: () => turn !== null && turn.first_visible_text !== null,
    /** The turn has finished streaming (done) — used to decide when the record may be closed. */
    isDone: () => turn !== null && turn.done !== null,
    submit() { t0 = now(); turn = { type: 'tappyai_client_latency', headers: null, first_visible_text: null, done: null, reveal_done: null, visible_chars_at_first: 0, visible_chars_final: 0, aborted: false } },
    headers() { if (turn && turn.headers === null) turn.headers = rel() },
    /** Call on every render of the visible reply text. */
    visible(text: string) {
      if (!turn) return
      turn.visible_chars_final = text.length
      if (turn.first_visible_text === null && /\S/.test(text)) { turn.first_visible_text = rel(); turn.visible_chars_at_first = text.length }
    },
    done(aborted = false) { if (turn && turn.done === null) { turn.done = rel(); turn.aborted = aborted } },
    /** Call when the reveal animation (if any) has shown everything. Returns the finished record and resets. */
    finish(): ClientLatencyTurn | null {
      if (!turn) return null
      if (turn.done !== null && turn.reveal_done === null) turn.reveal_done = rel()
      const out = turn
      turn = null; t0 = null
      return out
    },
  }
}

export function clientLatencyMarksEnabled(): boolean {
  try {
    if (process.env.NEXT_PUBLIC_C2_LATENCY_MARKS === '1') return true
    return typeof window !== 'undefined' && window.localStorage.getItem('tappy_latency') === '1'
  } catch { return false }
}

/**
 * @param visibleText   what the user can read right now for the last assistant reply (after smoothing / reveal)
 * @param isLoading     the chat is receiving
 * @param revealing     the display-only reveal animation is still running
 * @returns `onResponse` — call it from useChat's onResponse (response headers arrived)
 */
export function useLatencyMarks(visibleText: string, isLoading: boolean, revealing: boolean): { onResponse: () => void } {
  const tracker = useRef(createClientLatencyTracker())
  const prevLoading = useRef(isLoading)
  const enabled = useRef<boolean | null>(null)
  if (enabled.current === null) enabled.current = clientLatencyMarksEnabled()

  useEffect(() => {
    if (!enabled.current) return
    const t = tracker.current
    if (isLoading && !prevLoading.current) t.submit()
    if (!isLoading && prevLoading.current) t.done()
    prevLoading.current = isLoading
  }, [isLoading])

  // The latest render's loading/revealing, readable from the animation-frame callback below.
  const latest = useRef({ isLoading, revealing })
  latest.current = { isLoading, revealing }
  /**
   * Closes the record once the turn is over (stream done, no reveal running). `force` = even if no text was ever seen (the grace period ran out).
   * The first-visible-text mark is taken one animation frame AFTER the render that shows the text; closing in the very commit that ends the stream would
   * beat it (found in the browser check) — so the record closes when that mark lands, or after a short grace period for a turn that shows no text.
   */
  const tryClose = (force: boolean) => {
    const t = tracker.current
    if (!t.isDone() || latest.current.isLoading || latest.current.revealing) return
    if (!force && !t.hasVisible()) return
    const rec = t.finish()
    if (!rec) return
    try {
      const w = window as unknown as { __tappyLatency?: ClientLatencyTurn[] }
      ;(w.__tappyLatency ??= []).push(rec)
      console.info(JSON.stringify(rec))
    } catch { /* marks only */ }
  }

  useEffect(() => {
    if (!enabled.current) return
    const t = tracker.current
    // Effects run after the browser has committed the render; one frame later the text is on screen.
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => { t.visible(visibleText); tryClose(false) }) : 0
    return () => { if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleText])

  useEffect(() => {
    if (!enabled.current || isLoading || revealing) return
    tryClose(false)
    const timer = setTimeout(() => tryClose(true), 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, revealing])

  return { onResponse: () => { if (enabled.current) tracker.current.headers() } }
}
