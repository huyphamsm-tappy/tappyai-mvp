// The only observability surface application code should import.
//
//   void flushPending(req)                      // early in a handler; never awaited
//   recordEvent({ type: 'tts_request', … })     // no I/O, cannot throw
//
// Two rules cover every call site:
//
//   1. RECORD anywhere, including inside a catch block that is already handling
//      a production failure. Recording is an array push.
//
//   2. FLUSH only at the top of a handler, and never await it. Delivery then
//      overlaps with work the handler was already going to wait for, so it adds
//      no latency to any product request. See pending.ts for what that costs.
//
// Nothing here can throw, and nothing here blocks. If the kill switch is off,
// every call is inert.

export type { LogSink, SinkStats } from './cloudLogging'
export {
  createCloudLoggingSink,
  createNoopSink,
  loggingEnabled,
  LOGGING_SCOPE,
  DEFAULT_FLUSH_TIMEOUT_MS,
  DEFAULT_MAX_BATCH,
  DEFAULT_MAX_BUFFER,
} from './cloudLogging'
export { getLogSink } from './sink'
export * from './events'
export {
  recordEvent,
  flushPending,
  recordTtsMetricsDelta,
  pendingStats,
  resetPending,
  resetTtsDelta,
  MAX_PENDING,
} from './pending'
