// Controller V2 — event sink helpers (FOUNDATION-01 §6).
// Event FIELDS are frozen; DELIVERY (persistence/ordering/retry/idempotency) is
// OPEN and deferred to Component 8 (Event Bus). These helpers provide a no-op
// default and an in-memory collector for tests/inspection.

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
