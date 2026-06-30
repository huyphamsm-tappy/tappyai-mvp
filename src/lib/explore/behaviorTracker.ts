const MIN_WATCH_SECONDS = 3 // skip very short glances

export function attachWatchTracker(
  element: HTMLElement,
  reviewId: string,
  videoDuration: number | null = null
): () => void {
  let startTime: number | null = null
  let totalWatched = 0
  let sent = false

  const send = () => {
    if (totalWatched < MIN_WATCH_SECONDS || sent) return
    sent = true
    const completionRate = videoDuration && videoDuration > 0
      ? Math.min(totalWatched / videoDuration, 1)
      : 0
    const payload = JSON.stringify({
      watch_seconds: Math.round(totalWatched),
      completion_rate: Math.round(completionRate * 100) / 100,
    })
    // sendBeacon works on page unload too
    navigator.sendBeacon(`/api/reviews/${reviewId}/interact`, new Blob([payload], { type: 'application/json' }))
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        startTime = Date.now()
        sent = false
      } else {
        if (startTime !== null) {
          totalWatched += (Date.now() - startTime) / 1000
          startTime = null
          send()
        }
      }
    },
    { threshold: 0.5 }
  )

  observer.observe(element)
  window.addEventListener('beforeunload', send)

  return () => {
    observer.disconnect()
    window.removeEventListener('beforeunload', send)
    if (startTime !== null) {
      totalWatched += (Date.now() - startTime) / 1000
      startTime = null
    }
    send()
  }
}
