// ── Cloud Logging sink ───────────────────────────────────────────────────────
//
// Ships the structured events in `events.ts` to Google Cloud Logging over the
// same credential chain the media and voice paths already use:
//
//   Vercel OIDC -> Google STS -> service-account impersonation
//
// There is no service-account key. The impersonated identity is
// `tappyai-logging@…`, which holds `roles/logging.logWriter` and nothing else.
//
// THREE PROPERTIES THIS FILE MUST NEVER LOSE
//
//  1. `log()` performs NO I/O. It appends to an in-memory buffer and returns.
//     Nothing a caller does on the request path can be slowed by logging,
//     because on the request path nothing but an array push happens.
//
//  2. Nothing here throws. Not `log()`, not `flush()`. Observability that can
//     break the thing it observes is worse than no observability — a failed
//     log write must be indistinguishable, from the product's point of view,
//     from a successful one. `flush()` therefore resolves rather than rejects,
//     always.
//
//  3. It is OFF unless explicitly switched on. See `loggingEnabled`.
//
// Deliberately uses the REST API over `fetch` instead of @google-cloud/logging:
// no new dependency, no transitive gRPC stack in a serverless bundle, and fully
// mockable in tests.

import { sanitizePayload, severityOf, type ObservabilityEvent } from './events'

const ENDPOINT = 'https://logging.googleapis.com/v2/entries:write'

/**
 * The narrowest scope that can write a log entry. Deliberately NOT
 * `cloud-platform`: the media SA uses a storage scope and the voice SA uses its
 * own, and that per-identity narrowing is the boundary those separate accounts
 * exist to preserve. Widening this would hand the logging identity reach it has
 * no reason to hold.
 */
export const LOGGING_SCOPE = 'https://www.googleapis.com/auth/logging.write'

/** Per-flush time budget. A stalled logging call must never consume a function's duration. */
export const DEFAULT_FLUSH_TIMEOUT_MS = 5_000

/** Entries per write. Cloud Logging accepts far more; this bounds request size, not throughput. */
export const DEFAULT_MAX_BATCH = 50

/**
 * Hard ceiling on buffered entries.
 *
 * A buffer that grows without limit turns a logging outage into a memory leak,
 * which is a strictly worse failure than losing log lines. On overflow the
 * OLDEST entries are dropped and counted: the newest events are the ones that
 * describe the incident you are actually in.
 */
export const DEFAULT_MAX_BUFFER = 500

/**
 * The kill switch.
 *
 * Enabled ONLY by the exact string 'true'. Every other value — 'false', '1',
 * 'TRUE', empty, or unset — is off.
 *
 * Default-off is the deliberate choice. Merging this code must be a production
 * no-op, so that "deploy the sink" and "start writing logs" are two separately
 * reversible events rather than one. Turning it on is an environment change
 * that takes effect on the next deployment; turning it off again is the same
 * change in reverse, with no code revert and no rebuild.
 *
 * Case-sensitivity is intentional. A silently-accepted 'TRUE' would mean the
 * switch's behaviour depended on how someone typed it into a dashboard.
 */
export function loggingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GCP_LOGGING_ENABLED === 'true'
}

export interface CloudLoggingDeps {
  /** GCP project id that owns the log bucket. */
  projectId: string
  /** Log id within the project, e.g. 'tappyai'. Appears as the log name in Logs Explorer. */
  logId: string
  /**
   * Returns an OAuth2 bearer token for the logging service account.
   * `null` means "no credential available" — the sink then does nothing at all
   * rather than failing per event.
   */
  getAccessToken: (() => Promise<string>) | null
  /** Whether the sink is switched on. Resolved by the caller so tests need no env. */
  enabled: boolean
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
  makeTimeoutSignal?: (ms: number) => AbortSignal
  maxBatch?: number
  maxBuffer?: number
}

/** Counters for tests and for the dropped-entry report. Never contains event data. */
export interface SinkStats {
  buffered: number
  dropped: number
  written: number
  failedFlushes: number
}

export interface LogSink {
  /** Buffers an event. Synchronous, no I/O, never throws. */
  log(event: ObservabilityEvent): void
  /** Writes buffered events. Never rejects. Safe to call when there is nothing to write. */
  flush(): Promise<void>
  stats(): SinkStats
}

/** A sink that does nothing. Returned when logging is off or has no credential. */
export function createNoopSink(): LogSink {
  return {
    log() {},
    async flush() {},
    stats: () => ({ buffered: 0, dropped: 0, written: 0, failedFlushes: 0 }),
  }
}

interface BufferedEntry {
  severity: string
  timestamp: string
  jsonPayload: Record<string, unknown>
}

export function createCloudLoggingSink(deps: CloudLoggingDeps): LogSink {
  if (!deps.enabled || !deps.getAccessToken) return createNoopSink()

  const doFetch = deps.fetchImpl ?? fetch
  const now = deps.now ?? (() => Date.now())
  const timeoutMs = deps.timeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS
  const makeSignal = deps.makeTimeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms))
  const maxBatch = deps.maxBatch ?? DEFAULT_MAX_BATCH
  const maxBuffer = deps.maxBuffer ?? DEFAULT_MAX_BUFFER

  // `logId` is a path segment; encoding it is what stops a stray '/' from
  // silently retargeting the write at a different log name.
  const logName = `projects/${deps.projectId}/logs/${encodeURIComponent(deps.logId)}`

  let buffer: BufferedEntry[] = []
  let dropped = 0
  let written = 0
  let failedFlushes = 0

  function toEntry(event: ObservabilityEvent): BufferedEntry {
    // PROJECTED, never spread. The union is a compile-time guarantee and this
    // is the runtime one: a field nobody allow-listed cannot reach the wire,
    // even if a call site cast its way past the type.
    return {
      severity: severityOf(event),
      timestamp: new Date(now()).toISOString(),
      jsonPayload: sanitizePayload(event),
    }
  }

  return {
    log(event: ObservabilityEvent) {
      try {
        buffer.push(toEntry(event))
        if (buffer.length > maxBuffer) {
          // Drop from the FRONT: keep the events closest to whatever is going wrong now.
          dropped += buffer.length - maxBuffer
          buffer = buffer.slice(buffer.length - maxBuffer)
        }
      } catch {
        // A logging call must not be able to throw into a product code path,
        // even if something upstream handed us a value that resists cloning.
      }
    },

    async flush() {
      if (buffer.length === 0 && dropped === 0) return

      const batch = buffer.slice(0, maxBatch)
      buffer = buffer.slice(batch.length)

      // Report drops as a first-class event, built HERE rather than through
      // log(), so a flood of drops can never recurse into more buffering.
      if (dropped > 0) {
        batch.push({
          severity: 'WARNING',
          timestamp: new Date(now()).toISOString(),
          jsonPayload: sanitizePayload({
            type: 'system_error', scope: 'observability', code: 'buffer_overflow', dropped,
          }),
        })
        dropped = 0
      }

      try {
        const token = await deps.getAccessToken!()
        const res = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          // partialSuccess: one malformed entry must not discard the whole batch.
          body: JSON.stringify({
            logName,
            resource: { type: 'global' },
            entries: batch,
            partialSuccess: true,
          }),
          signal: makeSignal(timeoutMs),
        })
        if (res.ok) {
          written += batch.length
        } else {
          failedFlushes++
        }
      } catch {
        // Includes credential failure, timeout and network error. Entries are
        // NOT re-queued: a logging outage would otherwise convert every
        // subsequent flush into a retry storm against the same dead endpoint,
        // and the buffer would grow until it hit the drop path anyway.
        failedFlushes++
      }
    },

    stats: () => ({ buffered: buffer.length, dropped, written, failedFlushes }),
  }
}
