// Lightweight in-app event tracker
// Batches events and flushes every 10s or when 10 events accumulate

export type EventType =
  | 'page_view'
  | 'page_time'
  | 'chat_search'
  | 'category_click'
  | 'place_save'
  | 'place_click'
  | 'review_view'
  | 'deal_click'
  | 'feature_use'
  | 'review_search'
  | 'review_like'
  | 'review_share'
  | 'review_post'

export interface TrackEvent {
  event_type: EventType
  metadata?: Record<string, unknown>
}

class EventTracker {
  private queue: TrackEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly FLUSH_INTERVAL = 10_000
  private readonly BATCH_SIZE = 10

  track(event: TrackEvent) {
    // Only track in browser
    if (typeof window === 'undefined') return
    this.queue.push(event)
    if (this.queue.length >= this.BATCH_SIZE) {
      this.flush()
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL)
    }
  }

  private async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (!this.queue.length) return
    const events = this.queue.splice(0)
    try {
      await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        keepalive: true, // survives page unload
      })
    } catch { /* silent fail — tracking is best-effort */ }
  }

  // Call on page unload to flush remaining events
  flushSync() {
    if (!this.queue.length) return
    const events = this.queue.splice(0)
    navigator.sendBeacon('/api/track', JSON.stringify({ events }))
  }
}

// Singleton
export const tracker = typeof window !== 'undefined' ? new EventTracker() : null

export function track(event_type: EventType, metadata?: Record<string, unknown>) {
  tracker?.track({ event_type, metadata })
}
