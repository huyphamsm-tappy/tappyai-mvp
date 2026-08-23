// ── Deferred delivery ────────────────────────────────────────────────────────
//
// The problem this solves: a log write is a network call, and there is nowhere
// on a request path to put one. Awaiting it before responding would put Cloud
// Logging's latency in front of the user's audio; firing it and returning
// immediately races the platform freezing the instance.
//
// So neither happens on the response path. Events are appended to a
// module-level buffer — a synchronous array push, nothing more — and delivery
// is kicked off at the START of a later request, where it overlaps with work
// the handler was already going to await (a TTS synthesis, a credential
// exchange). The flush is never awaited, so it adds no latency; the handler
// stays alive for its own work, which is what lets the flush finish.
//
// WHAT THIS COSTS, STATED PLAINLY: events buffered by the last request an
// instance serves are lost when that instance goes cold. Measurements taken
// this way are therefore a LOWER BOUND on the true figure, not an exact count.
// For "are we near the 1M character free tier" that is the right trade — an
// under-count never causes a surprise bill — but any total read out of these
// logs must be described as a floor, and the measurement window has to be long
// enough that the loss is proportionally small.
//
// The alternative is `waitUntil`, which needs @vercel/functions; that package
// is not a dependency here and adding one was out of scope for this change.

import type { ObservabilityEvent } from './events'
import { getLogSink } from './sink'
import { loggingEnabled } from './cloudLogging'

/**
 * Bounded so a logging outage cannot become a memory leak. Small on purpose:
 * these are low-rate operational events, and anything that overflows this was
 * never going to be delivered by a serverless instance anyway.
 */
export const MAX_PENDING = 200

let pending: ObservabilityEvent[] = []
let dropped = 0

/**
 * Buffers an event. Synchronous, no I/O, never throws.
 *
 * Safe to call from anywhere on a request path, including a catch block that
 * is already handling a production failure.
 */
export function recordEvent(event: ObservabilityEvent): void {
  try {
    pending.push(event)
    if (pending.length > MAX_PENDING) {
      // Keep the newest: they describe whatever is going wrong right now.
      dropped += pending.length - MAX_PENDING
      pending = pending.slice(pending.length - MAX_PENDING)
    }
  } catch {
    // Recording an event must never be able to break the thing it observes.
  }
}

/** For tests and diagnostics. Never contains event data. */
export function pendingStats(): { buffered: number; dropped: number } {
  return { buffered: pending.length, dropped }
}

/** Test-only reset — module state would otherwise leak between cases. */
export function resetPending(): void {
  pending = []
  dropped = 0
}

/**
 * Delivers everything buffered so far.
 *
 * Returns a promise that NEVER rejects, so a caller may safely ignore it —
 * and product callers should, with `void flushPending(...)`. Awaiting it on a
 * request path would reintroduce exactly the latency this module exists to
 * avoid.
 *
 * `req` matters in production: a deployed Vercel function receives its OIDC
 * token as a per-request header, so a flush without the request has no
 * deployment identity and fails at the first credential leg.
 */
export async function flushPending(
  req?: Pick<Request, 'headers'> | null,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch
): Promise<void> {
  try {
    if (!loggingEnabled(env)) {
      // Drain anyway. If the switch is off, holding events forever would mean
      // the first request after it is turned on ships a pile of stale ones.
      pending = []
      dropped = 0
      return
    }
    if (pending.length === 0) return

    const batch = pending
    pending = []

    const sink = getLogSink(env, req, fetchImpl)
    for (const event of batch) sink.log(event)
    await sink.flush()
  } catch {
    // Delivery is best-effort by construction. A failure here must be
    // invisible to the request that happened to trigger it.
  }
}

// ── TTS counter deltas ───────────────────────────────────────────────────────

interface TtsCounters {
  requests: number
  cacheHits: number
  cacheMisses: number
  charactersSynthesized: number
  errors: number
  totalLatencyMs: number
}

const ZERO: TtsCounters = {
  requests: 0, cacheHits: 0, cacheMisses: 0, charactersSynthesized: 0, errors: 0, totalLatencyMs: 0,
}

let lastReported: TtsCounters = { ...ZERO }

/** Test-only reset. */
export function resetTtsDelta(): void {
  lastReported = { ...ZERO }
}

/**
 * Records the change in the provider's own counters since this instance last
 * reported, and buffers it if anything moved.
 *
 * Deltas rather than snapshots because the counters are per-instance and
 * cumulative: summing snapshots across a fleet double-counts, and taking a
 * maximum under-counts. Deltas sum correctly across every instance and every
 * cold start, which is the only property that makes "characters synthesized
 * this month" answerable at all.
 *
 * A counter that went BACKWARDS means a fresh instance (or a restart), so the
 * delta is the new value itself rather than a negative — a negative would
 * silently subtract from the fleet total.
 */
export function recordTtsMetricsDelta(snapshot: Partial<TtsCounters>): void {
  const current: TtsCounters = {
    requests: snapshot.requests ?? 0,
    cacheHits: snapshot.cacheHits ?? 0,
    cacheMisses: snapshot.cacheMisses ?? 0,
    charactersSynthesized: snapshot.charactersSynthesized ?? 0,
    errors: snapshot.errors ?? 0,
    totalLatencyMs: snapshot.totalLatencyMs ?? 0,
  }

  const delta: TtsCounters = { ...ZERO }
  let moved = false
  for (const key of Object.keys(ZERO) as (keyof TtsCounters)[]) {
    const d = current[key] - lastReported[key]
    delta[key] = d < 0 ? current[key] : d
    if (delta[key] !== 0) moved = true
  }
  lastReported = current

  if (!moved) return
  recordEvent({ type: 'tts_metrics', ...delta })
}
