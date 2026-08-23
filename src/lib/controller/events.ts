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

/**
 * What an observability writer receives — K-3.
 *
 * It is the frozen `ControllerEvent` envelope itself, deliberately. FOUNDATION-01
 * §6 froze those fields; inventing a second shape here would create a log schema
 * nothing authoritative defines, and it would drift from the envelope the moment
 * either changed.
 */
export type ObservabilityRecord = ControllerEvent

/** Where an observed event goes. Injectable so the destination is not baked in. */
export type EventObservabilityWriter = (record: ObservabilityRecord) => void

/**
 * The default destination — the platform log.
 *
 * The repo has no logger module, so the convention IS the prefix:
 * `console.warn('[controller][owner] …')`, `console.warn('[controller][auth] …')`,
 * `console.error('[admin][audit] …')`. This follows it and invents no format.
 *
 * `info` rather than `warn`: the existing `warn`/`error` uses all report a
 * problem, and a hub registering is not one. Severity is NOT derived from the
 * event type — that would be a taxonomy no source defines.
 */
function defaultWriter(record: ObservabilityRecord): void {
  console.info('[controller][event]', record)
}

/**
 * K-3 — the production event sink (Owner Decision D-K3, 2026-08-23).
 *
 * Decision F requires "a non-no-op Event Bus" and defines it nowhere; D-K3 sets
 * the bar at the kernel's own `controller.*` lifecycle stream. This is that
 * implementation, and it is deliberately the smallest thing that clears the bar.
 *
 * WHAT IT IS NOT, and why neither is an oversight:
 *
 *   • NOT a second audit trail. Every one of the kernel's seven emit sites is
 *     already paired with an audit write of the same fact. Recording them again
 *     would duplicate all seven inside a hash-chained log.
 *
 *   • NOT the durable path. That is C8's transactional mechanism, whose
 *     publisher is a database object unreachable from this tier by grant, and
 *     which routes to consumers — of which there are none by design.
 *
 * So the semantics are exactly what the module header already claims for
 * in-process sinks: at-most-once, non-durable, unordered, never re-attempted.
 *
 * 🔑 FAILURE ISOLATION IS THE ACCEPTANCE CRITERION, not a nicety. One
 * `buildAdminController()` emits 18 events, and a controller is built on every
 * `/admin` request — so a writer that could throw would take the Controller
 * down eighteen times a page. A throw is caught and reported; it never reaches
 * the caller. This mirrors the discipline the audit writer already applies:
 * "a failed insert can never break the underlying admin action".
 */
export function createObservabilityEventSink(
  write: EventObservabilityWriter = defaultWriter
): EventSink {
  return {
    emit(event) {
      try {
        const result = write(event) as unknown
        // A writer typed as void may still hand back a thenable. Left
        // unattended that becomes an unhandled rejection, which crashes the
        // process on some Node configurations — the exact failure this sink
        // exists to be incapable of causing.
        if (isThenable(result)) result.then(undefined, report)
      } catch (err) {
        report(err)
      }
    },
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | null)?.then === 'function'
}

/** Reported, never rethrown, and never silently dropped. */
function report(err: unknown): void {
  console.error('[controller][event] observability write failed:', err)
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
