'use client'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** The element's width in CSS pixels, kept current (ResizeObserver, with a window-resize fallback). 0 until measured. */
export function useElementWidth(ref: RefObject<HTMLElement | null>, override?: number): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || override !== undefined) return
    const read = () => setWidth(el.getBoundingClientRect().width)
    read()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(read)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [ref, override])
  return override ?? width
}

/**
 * The playing position of a <video>, in milliseconds. Follows `timeupdate` (fires a few times a second) and, while playing, every animation frame, so a layer
 * appears and disappears on its start and end rather than up to 250 ms late. Cheap: it only sets state when the millisecond value changed.
 */
export function useVideoTimeMs(video: RefObject<HTMLVideoElement | null>): number {
  const [ms, setMs] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    const el = video.current
    if (!el) return
    const read = () => setMs(Math.round(el.currentTime * 1000))
    const loop = () => { read(); raf.current = requestAnimationFrame(loop) }
    const play = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(loop) }
    const stop = () => { cancelAnimationFrame(raf.current); read() }
    read()
    for (const ev of ['timeupdate', 'seeked', 'loadedmetadata']) el.addEventListener(ev, read)
    el.addEventListener('play', play)
    el.addEventListener('pause', stop)
    el.addEventListener('ended', stop)
    if (!el.paused) play()
    return () => {
      cancelAnimationFrame(raf.current)
      for (const ev of ['timeupdate', 'seeked', 'loadedmetadata']) el.removeEventListener(ev, read)
      el.removeEventListener('play', play)
      el.removeEventListener('pause', stop)
      el.removeEventListener('ended', stop)
    }
  }, [video])
  return ms
}
