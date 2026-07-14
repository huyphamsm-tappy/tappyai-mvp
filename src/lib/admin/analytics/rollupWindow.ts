// Pure date helper for the analytics-snapshot cron. Dependency-free (no imports)
// so it is unit-testable. Operates on VN calendar-day strings (ADR-008); the
// caller supplies the current VN day via vnToday().

/**
 * The reconciliation window covering the last `days` VN calendar days, inclusive
 * of today — recomputed each run so late-arriving events are reconciled (§8A.4).
 * @param vnTodayStr current VN day, 'YYYY-MM-DD'
 * @param days number of days in the window (>= 1)
 * @returns { from, to } inclusive VN-day bounds, 'YYYY-MM-DD'
 */
export function reconcileWindow(vnTodayStr: string, days: number): { from: string; to: string } {
  const span = Math.max(1, Math.floor(days))
  const to = vnTodayStr
  const d = new Date(`${vnTodayStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (span - 1))
  const from = d.toISOString().slice(0, 10)
  return { from, to }
}
