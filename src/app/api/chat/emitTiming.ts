// ── Client-emit timing (Phase-0 instrumentation) ─────────────────────────────
//
// A byte-identical pass-through that times the CLIENT-emit side of the response
// — the half `onFinish` cannot see. `onFinish` fires when the model finishes
// generating; but on a buffered (place/shopping/hotel) turn the reply is
// withheld until the enrichment tail runs, so the first byte the user actually
// sees leaves the server LATER than `onFinish`. This transform observes that
// moment from the only vantage that can: the bytes on their way out.
//
// It changes nothing on the wire. `0:` is the data-stream text frame; the first
// one is the first useful content the client can render (TTUA). `onComplete`
// fires exactly once, when the source finishes normally (not on client abort —
// matching the existing record, which is skipped when generation is cancelled).

export interface ClientEmitTiming {
  /** t0 → first `0:` text frame reaching the client (TTUA). null if the turn emitted no text. */
  ttuaMs: number | null
  /** t0 → the response stream closing (final byte out, T10). */
  finalMs: number
}

/**
 * @param startTime  the request's t0 (`Date.now()` at handler entry)
 * @param now        clock, injectable for tests
 * @param onComplete called once on normal close with the emit-side marks
 */
export function timeClientEmit(
  startTime: number,
  now: () => number,
  onComplete: (t: ClientEmitTiming) => void,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  let ttuaMs: number | null = null
  // Only the tail of the previous chunk is retained, enough to catch a `0:` (or
  // its preceding newline) split across a chunk boundary — never accumulating
  // the response, so no content is buffered or inspectable beyond two characters.
  let carry = ''
  let completed = false

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (ttuaMs === null) {
        const text = carry + decoder.decode(chunk, { stream: true })
        // A text frame is a line beginning `0:` — at the very start of the
        // stream or immediately after a newline.
        if (/(^|\n)0:/.test(text)) ttuaMs = now() - startTime
        carry = text.slice(-2)
      }
      controller.enqueue(chunk) // unchanged bytes
    },
    flush() {
      if (completed) return
      completed = true
      onComplete({ ttuaMs, finalMs: now() - startTime })
    },
  })
}
