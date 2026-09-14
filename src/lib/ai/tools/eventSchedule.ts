import { providerOwning } from '@/lib/ccp'
import type { CommerceFacts } from '@/lib/ccp'
import { safeGetText } from '@/lib/security/safeFetch'

// ── The stated schedule of an EVENT page (Final local live UAT, 14 Sep 2026) ──
//
// A ticket platform keeps past events online, and the index does not always
// say when an event was: "Chương trình âm nhạc thính phòng" (July 2023) was
// offered for a September 2026 request with no date anywhere in its title or
// snippet. The event page itself states the schedule (`"startDate"` /
// `"endDate"` in its structured data), so the tool layer reads it — a bounded,
// read-only GET of a page on a registry allow-listed host, no login, nothing
// submitted — and hands the result to the Commerce Link as `facts.schedule`
// (source `merchant_page`). A past event is refused; a page that states no
// date is not judged (and carries no schedule fact). This is the first use of
// the provider-agnostic facts contract; nothing here is Ticketbox-specific
// beyond the allow-list that lets the fetch happen.

export type FetchTextFn = (url: string) => Promise<string | null>
const MAX_BYTES = 300_000
const TIMEOUT_MS = 4_000
const STOP_AT = /"endDate"\s*:\s*"[^"]+"|<\/head>/i

export async function fetchEventPageText(url: string): Promise<string | null> {
  if (!providerOwning(url)) return null // only a registry merchant's page is ever read
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await safeGetText(url, ctl.signal, { maxBytes: MAX_BYTES, stopAt: STOP_AT })
    return res.text
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface StatedSchedule { start: string; end: string | null }

/** The `startDate` / `endDate` an event page states in its structured data, or null when it states none. */
export function statedScheduleOf(html: string | null | undefined): StatedSchedule | null {
  if (!html) return null
  const start = html.match(/"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/)?.[1]
  const end = html.match(/"endDate"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/)?.[1]
  if (!start || Number.isNaN(Date.parse(start))) return null
  return { start, end: end && !Number.isNaN(Date.parse(end)) ? end : null }
}

/** True when the event is over: its end (or, without one, its start) is before today. */
export function scheduleIsPast(s: StatedSchedule, now: Date): boolean {
  const last = Date.parse(s.end ?? s.start)
  return last < Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
}

/** The facts a stated schedule yields for a Commerce Link (source: the merchant page, read today). */
export function scheduleFacts(s: StatedSchedule, now: Date): CommerceFacts {
  return {
    source: 'merchant_page',
    retrievedAt: now.toISOString(),
    expiresAt: s.end ?? s.start,
    freshnessType: 'near_realtime',
    schedule: { date: s.start.slice(0, 10), ...(s.start.length > 10 ? { time: s.start.slice(11, 16) } : {}) },
  }
}
