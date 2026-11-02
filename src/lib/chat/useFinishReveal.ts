'use client'
// ── CONSULTATIVE_IN_AGENT — a finished reply is REVEALED progressively (display only) ───────────────────────────────────────────────
//
// The agent's reply is buffered on the server: every guard runs, then the settled text is sent once. The client used to show it at once.
// With the flag on the server marks the response `x-tappy-reveal: 1`; when the stream finishes, this hook shows the settled text from the
// start, a few characters per frame, until all of it is visible. NOTHING about the text changes (same bytes, same guards, same saved
// message) — only how fast the already-approved text appears. It never runs when:
//   · the server did not ask for it (flag off, or CONSULT_REVEAL=off on the server);
//   · the user prefers reduced motion (prefers-reduced-motion: reduce);
//   · the user turned it off (localStorage tappy_reveal = "off");
//   · the reply is short (< MIN_CHARS) or was loaded from history rather than just streamed.

import { useEffect, useRef, useState } from 'react'

export const MIN_CHARS = 60
/** Target frames for a reveal at 60 fps (≈ 2.5 s); long replies are not slower than this. */
export const REVEAL_FRAMES = 150

export function revealDisabledByUser(): boolean {
  try {
    if (typeof window === 'undefined') return true
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true
    return window.localStorage.getItem('tappy_reveal') === 'off'
  } catch { return false }
}

/** How many characters to add per frame so a reply of `len` characters finishes in about REVEAL_FRAMES frames (at least 3). */
export const revealStep = (len: number): number => Math.max(3, Math.ceil(len / REVEAL_FRAMES))

/**
 * @param target   the full, settled visible text of the last assistant reply
 * @param loading  the chat is still receiving (true → false marks "just finished")
 * @param enabled  the server asked for the reveal on this response
 * @param safeEnd  maps a character count to a markdown-safe cut point (never splits a link / bold / code span)
 */
export function useFinishReveal(target: string, loading: boolean, enabled: boolean, safeEnd: (t: string, end: number) => number): { text: string; revealing: boolean } {
  const [n, setN] = useState<number | null>(null)
  const prevLoading = useRef(loading)
  const targetRef = useRef(target)
  targetRef.current = target

  useEffect(() => {
    const justFinished = prevLoading.current && !loading
    prevLoading.current = loading
    if (!justFinished || !enabled || targetRef.current.length < MIN_CHARS || revealDisabledByUser()) return
    let raf = 0
    let alive = true
    let shown = 0
    setN(0)
    const tick = () => {
      if (!alive) return
      const tgt = targetRef.current
      shown = Math.min(tgt.length, shown + revealStep(tgt.length))
      const end = shown >= tgt.length ? tgt.length : safeEnd(tgt, shown)
      if (end >= tgt.length) { setN(null); return }
      setN(end)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { alive = false; cancelAnimationFrame(raf) }
  }, [loading, enabled, safeEnd])

  return n === null ? { text: target, revealing: false } : { text: target.slice(0, n), revealing: true }
}
