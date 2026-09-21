// Lightweight in-app event tracker — the ONE client analytics tracker.
// Batches events and flushes every 10s or when 10 events accumulate.
// Every event carries the shared unified envelope (see envelope.ts) so all
// current and future analytics reuse one schema (Analytics v1.1 §3/§8A).

import { buildEnvelope, type AnalyticsEnvelope } from './envelope'
import { mirrorToGa4 } from '@/lib/analytics/ga4'

// Known event vocabulary (autocomplete hint). The pipeline is forward-compatible:
// any string is accepted and unknown types are tagged server-side, so new events
// (e.g. future auth events) need no change here.
type KnownEventType =
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
  | 'hide'
  | 'not_interested'
  | 'report'
  | 'ask_tappy_place'
  | 'recommendation_click'
  | 'scam_check'
  | 'chat_opened'

export type EventType = KnownEventType | (string & {})

// A queued event = shared envelope + type + properties (stored as `metadata`,
// the existing user_events column). The envelope's event_id is generated at
// creation time so retries/duplicate flushes dedup server-side.
export interface TrackEvent extends AnalyticsEnvelope {
  event_type: EventType
  metadata?: Record<string, unknown>
}

class EventTracker {
  private queue: TrackEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly FLUSH_INTERVAL = 10_000
  private readonly BATCH_SIZE = 10

  track(event_type: EventType, metadata?: Record<string, unknown>) {
    if (typeof window === 'undefined') return
    this.queue.push({ ...buildEnvelope(), event_type, metadata })
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

  // Call on page unload to flush remaining events.
  flushSync() {
    if (!this.queue.length) return
    const events = this.queue.splice(0)
    navigator.sendBeacon('/api/track', JSON.stringify({ events }))
  }
}

// Singleton
export const tracker = typeof window !== 'undefined' ? new EventTracker() : null

export function track(event_type: EventType, metadata?: Record<string, unknown>) {
  tracker?.track(event_type, metadata)
  // GA4 sees an allowlisted projection of the same event (lib/analytics/ga4.ts owns the
  // allowlist). Still the one tracker: there is no second call site anywhere.
  mirrorToGa4(event_type, metadata)
}

/**
 * GA4-ONLY mirror — no user_events row is queued.
 *
 * Used for an event that ALREADY has its own internal record and so must not be
 * written a second time: the commerce handoff (`affiliate_click`) is recorded
 * server-side by the /api/commerce/handoff beacon (CCP event 6), so a `track()`
 * here would be the "second parallel event" we deliberately avoid. GA4 still
 * needs its projection, through the SAME closed taxonomy (GA4_EVENT_MAP) and the
 * same no-PII allowlist — this is the only extra seam, and it calls the same
 * mirrorToGa4, so ga4.ts remains the single gtag emitter.
 */
export function trackGa(event_type: EventType, metadata?: Record<string, unknown>) {
  mirrorToGa4(event_type, metadata)
}
