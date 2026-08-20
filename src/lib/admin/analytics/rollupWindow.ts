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

/** The longest retention milestone Module 04 measures (`04` §3.3: D1/D7/D30). */
const MAX_RETENTION_OFFSET = 30

/**
 * The COHORT window to recompute on a run whose activity window is
 * `reconcileWindow(vnTodayStr, days)`.
 *
 * A cohort's row changes on any day one of its milestones falls in the
 * reconciled range, so the range has to be walked BACKWARDS by the longest
 * milestone: a cohort from 30 days ago reaches D30 today. Stopping at the
 * activity window would recompute only the newest cohorts, whose D7 and D30 are
 * the ones still unmeasurable — i.e. exactly the rows that never change.
 *
 * The upper bound stays `vnToday` rather than yesterday so a cohort that
 * registered today still gets a row. It carries no measurable rate yet, and an
 * absent row and an empty one are different facts.
 */
export function cohortWindow(vnTodayStr: string, days: number): { from: string; to: string } {
  const { from: activityFrom, to } = reconcileWindow(vnTodayStr, days)
  const d = new Date(`${activityFrom}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - MAX_RETENTION_OFFSET)
  return { from: d.toISOString().slice(0, 10), to }
}
