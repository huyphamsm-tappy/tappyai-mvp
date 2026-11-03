// ── Wave 2J (J2) · "the retry takes its spend reservation BEFORE the failed primary is closed as unknown" ───────────────────────────────────────────────────────────────────────────────────
//
// The paid-run spend gate refuses every call once a cost is unknown. A model call that fails (thrown error, an error as its first part, an empty stream) is closed as unknown at once by the metering
// layer below the fallback wrapper - before the fallback has had the chance to start its retry - so the retry that would answer the user is refused (review F2). With
// CONSULT_ABORT_ABANDONED_FIRST_PART on, the fallback marks the signal it hands to the primary here; the metering layer then HOLDS the "unknown" of a provider outcome for that call until the fallback has
// started its retry (its reservation is taken synchronously by the call), and the fallback releases it right after. Nothing else is deferred: a call whose signal is not marked, and every
// call with the flag OFF, is closed exactly as before. The reservation is still closed as unknown (the cost stays unknown, the gate still blocks everything after) - only the order changes.

const pending = new WeakMap<AbortSignal, Array<() => void>>()

/** The fallback is about to decide whether to retry: closures offered through {@link deferUntilFallbackDecides} for this signal wait. */
export function ownedByFallback(signal: AbortSignal): void {
  if (!pending.has(signal)) pending.set(signal, [])
}

/** True when the closure was taken over (it runs in {@link fallbackDecided}); false when nobody owns the signal (the caller closes at once, as before). */
export function deferUntilFallbackDecides(signal: AbortSignal | undefined, fn: () => void): boolean {
  const list = signal ? pending.get(signal) : undefined
  if (!list) return false
  list.push(fn)
  return true
}

/** The fallback has started its retry (or decided not to): run every waiting closure, once. Later outcomes of the same signal are no longer deferred. */
export function fallbackDecided(signal: AbortSignal): void {
  const list = pending.get(signal)
  pending.delete(signal)
  if (list) for (const fn of list) fn()
}
