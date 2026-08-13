// Controller V2 — event sink helpers (FOUNDATION-01 §6).
//
// Event FIELDS are frozen. DELIVERY (persistence, ordering, retry, idempotency)
// is no longer open: Component 8 defines it, and the durable path is the
// transactional outbox in supabase/migrations/20260813_c8_event_outbox.sql
// driven by /api/cron/outbox-drain. See src/lib/controller/outbox.ts.
//
// These sinks are NOT that path. They stay in-process and non-durable — a no-op
// default and an in-memory collector for tests and inspection. An EventSink
// emit is not an outbox publish and carries none of its guarantees.

import type { ControllerEvent, EventSink } from './types'

export function createNoopEventSink(): EventSink {
  return { emit: () => {} }
}

export interface CollectingEventSink extends EventSink {
  readonly events: readonly ControllerEvent[]
  clear(): void
}

export function createCollectingEventSink(): CollectingEventSink {
  const events: ControllerEvent[] = []
  return {
    events,
    emit(e) {
      events.push(e)
    },
    clear() {
      events.length = 0
    },
  }
}
