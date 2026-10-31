// ── The answer stream's own deadline (review 02/11) ─────────────────────────────────────────────────────────────────────────────────────
//
// 01/11 the route's maxDuration became 300 s for the Deep Research turn, and the comment said every other turn still ends by
// TURN_DEADLINE_MS (110 s). The answer stream only had the client's signal, so a Think / Auto turn of 8 Responses steps could run (and
// bill) until 300 s. The stream now also ends at the turn's deadline: whichever comes first, the client leaving or the deadline.
// Pure.

/** The client's signal, or the turn's deadline (counted from the turn's start), whichever fires first. */
export function turnSignal(client: AbortSignal | undefined, startedAt: number, deadlineMs: number, now: number = Date.now()): AbortSignal {
  const left = Math.max(1, startedAt + deadlineMs - now)
  const deadline = AbortSignal.timeout(left)
  return client ? AbortSignal.any([client, deadline]) : deadline
}
