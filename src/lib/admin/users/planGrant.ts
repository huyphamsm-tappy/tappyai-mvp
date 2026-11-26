// Pure helpers for the admin "Cấp gói" screen (owner 26/11/2026).

/** `months` calendar months from `from`, clamped to the end of a shorter month (31 Jan + 1 month = 28/29 Feb). UTC, so the result does not depend on the server's zone. */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d
}

/** A grant "with no expiry" is stored as a date this many years away; anything past `LIFETIME_THRESHOLD_YEARS` from now is shown as no expiry. */
export const LIFETIME_THRESHOLD_YEARS = 50
export function isLifetimeEnd(endsAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!endsAt) return false
  const t = new Date(endsAt).getTime()
  return Number.isFinite(t) && t - now.getTime() > LIFETIME_THRESHOLD_YEARS * 365 * 86_400_000
}
